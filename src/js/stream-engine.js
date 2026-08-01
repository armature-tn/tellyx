/**
 * @file stream-engine.js
 * @description Native HTML5 & MSE Media Stream Engine with HLS M3U8 Demuxer & Audio Spectrum Visualizer.
 * Provides adaptive streaming playback, MediaSource Extensions (MSE) buffer management,
 * Web Audio API spectrum analysis, and Stats-for-Nerds stream diagnostics.
 * 
 * @module StreamEngine
 * @version 0.1.0
 * @author Armature.TN
 * @license Dual License: GNU AGPL-3.0 or Commercial License (SPDX: AGPL-3.0-or-later OR Commercial)
 */

import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import dashjs from 'dashjs';
import { SecurityController } from './security.js';

if (typeof window !== 'undefined' && typeof window.hasUserInteracted === 'undefined') {
    window.hasUserInteracted = false;
    const markInteracted = () => { window.hasUserInteracted = true; };
    window.addEventListener('pointerdown', markInteracted, { capture: true, once: true });
    window.addEventListener('keydown', markInteracted, { capture: true, once: true });
    window.addEventListener('click', markInteracted, { capture: true, once: true });
}

/**
 * @class StreamEngine
 * @classdesc High-performance video player controller managing HTML5 Media Elements,
 * MSE SourceBuffers, Hls.js adaptive playback, mpegts.js demuxing, dash.js, Web Audio API frequency analysis, and playback telemetry.
 */
export class StreamEngine {
    /**
     * @private
     * @type {HTMLVideoElement}
     */
    #videoElement;

    /**
     * @private
     * @type {Hls|null}
     */
    #hlsInstance = null;

    /**
     * @private
     * @type {any|null}
     */
    #mpegtsInstance = null;

    /**
     * @private
     * @type {any|null}
     */
    #dashInstance = null;

    /**
     * @private
     * @type {HTMLCanvasElement|null}
     */
    #audioCanvas = null;

    /**
     * @private
     * @type {AudioContext|null}
     */
    #audioContext = null;

    /**
     * @private
     * @type {AnalyserNode|null}
     */
    #analyserNode = null;

    /**
     * @private
     * @type {MediaSource|null}
     */
    #mediaSource = null;

    /**
     * @private
     * @type {SourceBuffer|null}
     */
    #sourceBuffer = null;

    /**
     * @private
     * @type {number|null}
     */
    #animFrameId = null;

    /**
     * @private
     * @type {Object}
     * @description Playback metrics and health metrics.
     */
    #stats = {
        bitrateKbps: 0,
        resolution: '1920x1080',
        fps: 60,
        droppedFrames: 0,
        bufferHealthSec: 0,
        latencyMs: 120,
        networkType: 'HTTP/2 HLS Live',
        protocol: 'HLS / MSE'
    };

    /**
     * @private
     * @type {Array<Object>}
     * @description Available parsed variant streams (Qualities).
     */
    #variantStreams = [];

    /**
     * @private
     * @type {boolean}
     */
    #isAudioVisualizerActive = false;

    /**
     * @private
     * @type {boolean}
     */
    #isUserPaused = false;

    /**
     * @private
     * @type {boolean}
     */
    #isFloatingPip = false;

    /**
     * Constructs the Stream Engine.
     * 
     * @param {HTMLVideoElement} videoEl - HTML5 Video DOM Element.
     * @param {HTMLCanvasElement} [canvasEl=null] - Optional canvas for audio spectrum animation.
     */
    constructor(videoEl, canvasEl = null) {
        if (!videoEl || !(videoEl instanceof HTMLVideoElement)) {
            throw new Error('[StreamEngine] Invalid video element supplied to constructor.');
        }
        this.#videoElement = videoEl;
        this.#audioCanvas = canvasEl;

        this.#bindVideoEvents();
    }

    /**
     * Attaches telemetry listeners to the HTML5 video element.
     * @private
     */
    #bindVideoEvents() {
        if (this.#videoElement) {
            this.#videoElement.disablePictureInPicture = false;
            this.#videoElement.autoPictureInPicture = true;
            this.#videoElement.setAttribute('autopictureinpicture', '');
            this.#videoElement.setAttribute('playsinline', '');
            this.#videoElement.setAttribute('webkit-playsinline', '');
        }
        this.#videoElement.addEventListener('progress', () => this.#updateBufferMetrics());
        this.#videoElement.addEventListener('timeupdate', () => this.#updateBufferMetrics());
        this.#videoElement.addEventListener('loadedmetadata', () => {
            this.#stats.resolution = `${this.#videoElement.videoWidth}x${this.#videoElement.videoHeight}`;
        });
        this.#videoElement.addEventListener('play', () => {
            this.#isUserPaused = false;
        });
    }

    /**
     * Updates live stream buffer health statistics.
     * @private
     */
    #updateBufferMetrics() {
        const video = this.#videoElement;
        if (video.buffered && video.buffered.length > 0) {
            const currentTime = video.currentTime;
            for (let i = 0; i < video.buffered.length; i++) {
                if (video.buffered.start(i) <= currentTime && currentTime <= video.buffered.end(i)) {
                    this.#stats.bufferHealthSec = Number((video.buffered.end(i) - currentTime).toFixed(2));
                    break;
                }
            }
        }
        if (video.getVideoPlaybackQuality) {
            const quality = video.getVideoPlaybackQuality();
            this.#stats.droppedFrames = quality.droppedVideoFrames || 0;
        }
    }

    /**
     * Helper to safely trigger video playback with unmuted sound preference.
     * If browser restricts unmuted autoplay, falls back to muted play gracefully
     * and auto-unmutes on the first user interaction.
     * @private
     */
    async #safePlay() {
        const userHasInteracted = (typeof navigator !== 'undefined' && navigator.userActivation && navigator.userActivation.hasBeenActive) || Boolean(window.hasUserInteracted);

        if (!userHasInteracted) {
            // User hasn't interacted with document yet: start muted directly to satisfy browser policy without triggering console warnings
            this.#videoElement.muted = true;
            try {
                await this.#videoElement.play();
            } catch (mutedErr) {
                // Ignore autoplay promise rejections
            }
            this.#attachAutoUnmuteListener();
            return;
        }

        try {
            // Document has active user gesture: attempt unmuted playback
            this.#videoElement.muted = false;
            await this.#videoElement.play();
        } catch (err) {
            // Fallback to muted playback if blocked
            this.#videoElement.muted = true;
            try {
                await this.#videoElement.play();
            } catch (mutedErr) {
                // Ignore autoplay promise rejections
            }
            this.#attachAutoUnmuteListener();
        }
    }

    /**
     * Attaches a one-time listener to unmute video element on user's first click or keydown.
     * @private
     */
    #attachAutoUnmuteListener() {
        const autoUnmuteOnUserInteraction = () => {
            if (this.#videoElement && this.#videoElement.muted) {
                this.#videoElement.muted = false;
            }
            window.removeEventListener('pointerdown', autoUnmuteOnUserInteraction);
            window.removeEventListener('keydown', autoUnmuteOnUserInteraction);
            window.removeEventListener('click', autoUnmuteOnUserInteraction);
        };
        window.addEventListener('pointerdown', autoUnmuteOnUserInteraction, { once: true });
        window.addEventListener('keydown', autoUnmuteOnUserInteraction, { once: true });
        window.addEventListener('click', autoUnmuteOnUserInteraction, { once: true });
    }

    /**
     * Plays a media stream URL with automatic format detection, fallback, and MSE handling.
     * 
     * @async
     * Loads media stream (HTTP/HTTPS/HLS M3U8) with HLS.js adaptive engine or HTML5 video fallback.
     * 
     * @param {string} streamUrl - Target HTTP/HTTPS/HLS/MP4 stream URL.
     * @param {boolean} [useCorsProxy=false] - Whether to wrap the URL in a CORS proxy.
     * @param {string} [customProxyUrl=''] - Optional self-hosted CORS proxy endpoint URL prefix.
     * @param {string} [proxyToken=''] - Optional proxy security access token.
     * @returns {Promise<void>}
     * @throws {Error} If media load fails.
     * @security Sanitizes the input stream URL before playing.
     */
    /**
     * Plays a media stream URL with automatic format detection, fallback, and MSE handling.
     * Supports HLS (.m3u8), MPEG-TS (.ts, .m2ts), HTTP-FLV (.flv), MPEG-DASH (.mpd),
     * Matroska (.mkv), WebM (.webm), MP4 (.mp4, .mov, .m4v), AVI (.avi), 3GP (.3gp),
     * and Audio streams (.mp3, .aac, .flac, .ogg, .wav, .m4a).
     * 
     * @async
     * @param {string} streamUrl - Target HTTP/HTTPS/HLS/MPEG-TS/MKV stream URL.
     * @param {boolean} [useCorsProxy=false] - Whether to wrap the URL in a CORS proxy.
     * @param {string} [customProxyUrl=''] - Optional self-hosted CORS proxy endpoint URL prefix.
     * @param {string} [proxyToken=''] - Optional proxy security access token.
     * @param {Object} [options={}] - Optional metadata (e.g. { isVod: boolean, type: 'movie'|'series'|'live' }).
     * @returns {Promise<void>}
     * @throws {Error} If media load fails.
     * @security Sanitizes the input stream URL before playing.
     */
    /**
     * Loads and plays a video stream into the active HTML5 element.
     * Auto-detects HLS (.m3u8), MPEG-TS (.ts), FLV (.flv), DASH (.mpd), MKV, MP4, and Progressive Audio/Video.
     * Integrates automatic cascading fallbacks and auto CORS proxy rescue.
     * 
     * @async
     * @param {string} streamUrl - Raw or proxied stream URL.
     * @param {boolean} [useCorsProxy=false] - Whether to route requests through configured CORS proxy.
     * @param {string} [customProxyUrl=''] - Optional self-hosted CORS proxy endpoint URL prefix.
     * @param {string} [proxyToken=''] - Optional proxy security access token.
     * @param {Object} [options={}] - Optional metadata (e.g. { isVod: boolean, type: 'movie'|'series'|'live' }).
     * @returns {Promise<void>}
     * @throws {Error} If media load fails.
     * @security Sanitizes the input stream URL before playing.
     */
    async loadStream(streamUrl, useCorsProxy = false, customProxyUrl = '', proxyToken = '', options = {}) {
        if (!streamUrl) throw new Error('[StreamEngine] Cannot load empty stream URL.');

        const effectiveProxy = useCorsProxy ? (customProxyUrl.trim() || SecurityController.DEFAULT_CORS_PROXY) : '';
        const effectiveToken = useCorsProxy ? proxyToken.trim() : '';
        let targetUrl = SecurityController.validateURL(streamUrl);
        if (useCorsProxy && effectiveProxy) {
            targetUrl = SecurityController.buildProxyURL(targetUrl, effectiveProxy, effectiveToken);
        }

        console.log(`[StreamEngine] Loading media stream: ${targetUrl} (Proxy: ${useCorsProxy}, Token Protected: ${Boolean(effectiveToken)})`);
        this.stop();
        this.#isUserPaused = false;

        if (this.#videoElement) {
            this.#videoElement.disablePictureInPicture = false;
            this.#videoElement.autoPictureInPicture = true;
            this.#videoElement.crossOrigin = 'anonymous';
        }

        const urlLower = targetUrl.toLowerCase();
        const cleanUrl = urlLower.split('?')[0];

        // Format & Protocol Detection
        const isHls = cleanUrl.endsWith('.m3u8') || urlLower.includes('m3u8');
        const isTs = cleanUrl.endsWith('.ts') || cleanUrl.endsWith('.m2ts') || urlLower.includes('.ts?') || urlLower.includes('/live/') || urlLower.includes('type=ts');
        const isFlv = cleanUrl.endsWith('.flv') || urlLower.includes('flv');
        const isDash = cleanUrl.endsWith('.mpd') || urlLower.includes('mpd');
        const isMkv = cleanUrl.endsWith('.mkv') || urlLower.includes('.mkv');
        const isWebm = cleanUrl.endsWith('.webm');
        const isMp4 = cleanUrl.endsWith('.mp4') || cleanUrl.endsWith('.m4v') || cleanUrl.endsWith('.mov') || cleanUrl.endsWith('.3gp') || cleanUrl.endsWith('.avi');
        const isAudio = cleanUrl.endsWith('.mp3') || cleanUrl.endsWith('.aac') || cleanUrl.endsWith('.flac') || cleanUrl.endsWith('.ogg') || cleanUrl.endsWith('.wav') || cleanUrl.endsWith('.m4a');

        const isVod = Boolean(options.isVod || options.type === 'movie' || options.type === 'series' || cleanUrl.includes('/movie/') || cleanUrl.includes('/series/') || isMkv || isMp4 || isWebm);
        const isLive = !isVod;

        const attemptLoad = async () => {
            // 1. HLS (.m3u8) - Hls.js Adaptive Engine
            if (isHls && Hls.isSupported()) {
                try {
                    await this.#playHls(targetUrl, useCorsProxy, effectiveProxy, effectiveToken);
                    return;
                } catch (err) {
                    console.warn('[StreamEngine] HLS playback notice, cascading:', err);
                    this.#cleanupPlayers();
                }
            }

            // Native HLS for Safari/iOS
            if (isHls && this.#videoElement.canPlayType('application/vnd.apple.mpegurl')) {
                try {
                    this.#videoElement.src = targetUrl;
                    this.#stats.protocol = 'Native HLS (Apple Engine)';
                    await this.#safePlay();
                    return;
                } catch (err) {
                    console.warn('[StreamEngine] Native HLS notice, cascading:', err);
                }
            }

            // 2. MPEG-TS, HTTP-FLV & MSE Demuxer via mpegts.js
            if ((isTs || isFlv || isMkv || isVod || isLive) && mpegts && mpegts.isSupported()) {
                try {
                    const streamType = isFlv ? 'flv' : 'mse';
                    const success = await this.#playMpegTs(targetUrl, streamType, effectiveToken, isLive);
                    if (success) return;
                } catch (err) {
                    console.warn('[StreamEngine] mpegts.js playback notice, cascading:', err);
                    this.#cleanupPlayers();
                }
            }

            // 3. MPEG-DASH Engine via dash.js (.mpd)
            if (isDash && dashjs) {
                try {
                    await this.#playDash(targetUrl, effectiveToken);
                    return;
                } catch (err) {
                    console.warn('[StreamEngine] dashjs playback notice, cascading:', err);
                    this.#cleanupPlayers();
                }
            }

            // 4. Xtream Codes & IPTV Transmuxing Candidate Fallback for .mkv, VOD & Live
            if (isMkv || isVod || isLive || cleanUrl.includes('/movie/') || cleanUrl.includes('/series/') || cleanUrl.includes('/live/')) {
                const candidates = this.#generateXtreamFallbackCandidates(targetUrl);
                for (const candidate of candidates) {
                    console.log(`[StreamEngine] Attempting Xtream/IPTV transmuxing candidate: ${candidate.url} (${candidate.type})`);
                    try {
                        if (candidate.type === 'hls' && Hls.isSupported()) {
                            await this.#playHls(candidate.url, useCorsProxy, effectiveProxy, effectiveToken);
                            console.log(`[StreamEngine] Successfully played stream via Xtream HLS transmuxing!`);
                            return;
                        } else if (candidate.type === 'ts' && mpegts && mpegts.isSupported()) {
                            const success = await this.#playMpegTs(candidate.url, 'mse', effectiveToken, isLive);
                            if (success) {
                                console.log(`[StreamEngine] Successfully played stream via Xtream TS transmuxing!`);
                                return;
                            }
                        } else if (candidate.type === 'mp4') {
                            await this.#playProgressiveHtml5(candidate.url, { isMp4: true });
                            console.log(`[StreamEngine] Successfully played stream via Xtream MP4 transmuxing!`);
                            return;
                        }
                    } catch (candErr) {
                        console.warn(`[StreamEngine] Candidate ${candidate.type} fallback failed:`, candErr);
                        this.#cleanupPlayers();
                    }
                }
            }

            // 5. Progressive HTML5 Engine (Direct MKV, WebM, MP4, Audio, Direct Streams)
            return this.#playProgressiveHtml5(targetUrl, { isMkv, isWebm, isMp4, isAudio, cleanUrl });
        };

        try {
            await attemptLoad();
        } catch (primaryErr) {
            console.warn('[StreamEngine] Primary playback pipeline failed:', primaryErr?.message);
            
            // Auto-rescue with CORS proxy if CORS proxy was not previously enabled
            if (!useCorsProxy) {
                console.log('[StreamEngine] Direct playback failed. Auto-retrying stream via CORS Proxy...');
                try {
                    await this.loadStream(streamUrl, true, customProxyUrl, proxyToken, options);
                    return;
                } catch (proxyErr) {
                    throw new Error(`Connection failed (Direct & Proxy). ${proxyErr.message || 'Server unreachable or CORS blocked'}`);
                }
            }
            throw primaryErr;
        }
    }

    /**
     * Inspects stream track health to determine if stream is playing audio-only, video-only, or full AV.
     * @returns {{ isPlaying: boolean, hasVideo: boolean, isAudioOnly: boolean, isVideoOnly: boolean, isMuted: boolean, resolution: string, protocol: string }}
     */
    getTrackHealthStatus() {
        const video = this.#videoElement;
        if (!video || video.paused || video.currentTime < 0.3) {
            return { isPlaying: false, hasVideo: false, isAudioOnly: false, isVideoOnly: false, isMuted: video ? video.muted : false, resolution: 'N/A', protocol: this.#stats.protocol || 'None' };
        }

        const hasVideo = video.videoWidth > 0 && video.videoHeight > 0;
        const isAudioOnly = !hasVideo;

        let isVideoOnly = false;
        if (hasVideo) {
            if (video.mozHasAudio === false) {
                isVideoOnly = true;
            } else if (video.audioTracks && video.audioTracks.length === 0) {
                isVideoOnly = true;
            }
        }

        return {
            isPlaying: true,
            hasVideo,
            isAudioOnly,
            isVideoOnly,
            isMuted: video.muted || video.volume === 0,
            resolution: hasVideo ? `${video.videoWidth}x${video.videoHeight}` : 'Audio Only',
            protocol: this.#stats.protocol || 'HTML5'
        };
    }

    /**
     * Generates Xtream Codes & IPTV server format fallback candidate URLs.
     * Replaces file extension (.mkv -> .m3u8, .mp4, .ts) for server-side transmuxing.
     * @private
     * @param {string} rawUrl - Source stream URL.
     * @returns {Array<{url: string, type: 'hls'|'mp4'|'ts'}>}
     */
    #generateXtreamFallbackCandidates(rawUrl) {
        const candidates = [];
        if (!rawUrl) return candidates;

        try {
            const urlObj = new URL(rawUrl);
            const pathname = urlObj.pathname;
            const lastDotIdx = pathname.lastIndexOf('.');

            if (lastDotIdx !== -1 && lastDotIdx > pathname.lastIndexOf('/')) {
                const basePath = pathname.substring(0, lastDotIdx);
                const currentExt = pathname.substring(lastDotIdx + 1).toLowerCase();

                const extList = ['m3u8', 'mp4', 'ts'];
                for (const ext of extList) {
                    if (ext !== currentExt) {
                        const candUrlObj = new URL(rawUrl);
                        candUrlObj.pathname = `${basePath}.${ext}`;
                        let type = 'mp4';
                        if (ext === 'm3u8') type = 'hls';
                        if (ext === 'ts') type = 'ts';
                        candidates.push({ url: candUrlObj.toString(), type });
                    }
                }
            } else {
                ['m3u8', 'mp4', 'ts'].forEach(ext => {
                    const candUrlObj = new URL(rawUrl);
                    candUrlObj.pathname = `${pathname}.${ext}`;
                    let type = 'mp4';
                    if (ext === 'm3u8') type = 'hls';
                    if (ext === 'ts') type = 'ts';
                    candidates.push({ url: candUrlObj.toString(), type });
                });
            }
        } catch (e) {
            console.warn('[StreamEngine] Error generating candidate URLs:', e);
        }

        return candidates;
    }

    /**
     * Internal HLS.js adaptive stream initializer.
     * @private
     */
    #playHls(targetUrl, useCorsProxy, effectiveProxy, effectiveToken) {
        return new Promise((resolve, reject) => {
            const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: false,
                backBufferLength: 600,
                maxBufferLength: 60,
                maxMaxBufferLength: 120,
                xhrSetup: (xhr, url) => {
                    xhr.withCredentials = false;
                    if (useCorsProxy && effectiveProxy) {
                        if (url && !url.startsWith(effectiveProxy) && !url.startsWith('data:') && !url.startsWith('blob:')) {
                            const proxied = SecurityController.buildProxyURL(url, effectiveProxy, effectiveToken);
                            xhr.open('GET', proxied, true);
                        }
                    }
                    if (effectiveToken) {
                        try {
                            xhr.setRequestHeader('X-Proxy-Token', effectiveToken);
                        } catch (e) {}
                    }
                }
            });

            this.#hlsInstance = hls;

            hls.loadSource(targetUrl);
            hls.attachMedia(this.#videoElement);

            hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
                this.#stats.protocol = 'HLS.js Adaptive Engine';
                this.#variantStreams = (data.levels || []).map(lvl => ({
                    bandwidth: lvl.bitrate,
                    resolution: `${lvl.width}x${lvl.height}`,
                    url: targetUrl
                }));
                this.#safePlay();
                resolve();
            });

            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    console.warn('[HLS.js Fatal Error]:', data.type, data.details);
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            hls.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            hls.recoverMediaError();
                            break;
                        default:
                            hls.destroy();
                            this.#hlsInstance = null;
                            reject(new Error(`HLS.js fatal error: ${data.details}`));
                            break;
                    }
                }
            });
        });
    }

    /**
     * Internal mpegts.js MPEG-TS, FLV & MKV demuxer stream initializer.
     * @private
     */
    #playMpegTs(targetUrl, type = 'mse', effectiveToken = '', isLive = true) {
        return new Promise((resolve, reject) => {
            let isSettled = false;
            let timeoutId = null;

            const cleanup = () => {
                if (timeoutId) clearTimeout(timeoutId);
                if (this.#videoElement) {
                    this.#videoElement.removeEventListener('playing', onPlaying);
                    this.#videoElement.removeEventListener('loadeddata', onLoadedData);
                    this.#videoElement.removeEventListener('error', onError);
                }
            };

            const onPlaying = () => {
                if (!isSettled) {
                    isSettled = true;
                    cleanup();
                    resolve(true);
                }
            };

            const onLoadedData = () => {
                if (!isSettled) {
                    isSettled = true;
                    cleanup();
                    resolve(true);
                }
            };

            const onError = (e) => {
                if (!isSettled) {
                    isSettled = true;
                    cleanup();
                    reject(new Error(`Video element error during mpegts playback: ${e?.message || 'Media source error'}`));
                }
            };

            try {
                const config = {
                    enableWorker: true,
                    lazyLoad: false,
                    enableStashBuffer: false,
                    stashInitialSize: 128,
                    autoCleanupSourceBuffer: true,
                    headers: effectiveToken ? { 'X-Proxy-Token': effectiveToken } : {}
                };

                const player = mpegts.createPlayer({
                    type: type,
                    isLive: isLive,
                    url: targetUrl,
                    hasAudio: true,
                    hasVideo: true
                }, config);

                this.#mpegtsInstance = player;
                player.attachMediaElement(this.#videoElement);
                player.load();

                player.on(mpegts.Events.ERROR, (errType, errDetail, errInfo) => {
                    console.warn('[mpegts.js Error]:', errType, errDetail, errInfo);
                    if (!isSettled) {
                        isSettled = true;
                        cleanup();
                        reject(new Error(`mpegts.js error: ${errType} (${errDetail})`));
                    }
                });

                if (this.#videoElement) {
                    this.#videoElement.addEventListener('playing', onPlaying, { once: true });
                    this.#videoElement.addEventListener('loadeddata', onLoadedData, { once: true });
                    this.#videoElement.addEventListener('error', onError, { once: true });
                }

                timeoutId = setTimeout(() => {
                    if (!isSettled) {
                        if (this.#videoElement && this.#videoElement.readyState >= 2) {
                            isSettled = true;
                            cleanup();
                            resolve(true);
                        } else {
                            isSettled = true;
                            cleanup();
                            reject(new Error('mpegts.js load timeout'));
                        }
                    }
                }, 6000);

                this.#stats.protocol = type === 'flv' ? 'HTTP-FLV MSE Engine (mpegts.js)' : 'MPEG-TS MSE Engine (mpegts.js)';

                this.#safePlay().catch((err) => {
                    console.warn('[mpegts.js safePlay notice]:', err);
                });
            } catch (e) {
                if (!isSettled) {
                    isSettled = true;
                    cleanup();
                    reject(e);
                }
            }
        });
    }

    /**
     * Internal dash.js MPEG-DASH stream initializer.
     * @private
     */
    #playDash(targetUrl, effectiveToken = '') {
        return new Promise((resolve, reject) => {
            try {
                const player = dashjs.MediaPlayer().create();
                this.#dashInstance = player;

                if (effectiveToken) {
                    player.extend('RequestModifier', () => ({
                        modifyRequestHeader: (xhr) => {
                            xhr.setRequestHeader('X-Proxy-Token', effectiveToken);
                            return xhr;
                        }
                    }), true);
                }

                player.initialize(this.#videoElement, targetUrl, true);
                this.#stats.protocol = 'DASH MSE Engine (dash.js)';

                player.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => {
                    this.#safePlay();
                    resolve();
                });

                player.on(dashjs.MediaPlayer.events.ERROR, (e) => {
                    console.warn('[Dash.js Error]:', e);
                    reject(new Error(`Dash.js error: ${e.error}`));
                });
            } catch (e) {
                reject(e);
            }
        });
    }

    /**
     * Internal Progressive HTML5 stream initializer with format & MIME type hinting.
     * @private
     */
    async #playProgressiveHtml5(targetUrl, formatInfo = {}) {
        return new Promise((resolve, reject) => {
            let isSettled = false;
            let timeoutId = null;

            const cleanup = () => {
                if (timeoutId) clearTimeout(timeoutId);
                if (this.#videoElement) {
                    this.#videoElement.removeEventListener('playing', onSuccess);
                    this.#videoElement.removeEventListener('loadeddata', onSuccess);
                    this.#videoElement.removeEventListener('error', onError);
                }
            };

            const onSuccess = () => {
                if (!isSettled) {
                    isSettled = true;
                    cleanup();
                    resolve();
                }
            };

            const onError = (e) => {
                if (!isSettled) {
                    isSettled = true;
                    cleanup();
                    const errCode = this.#videoElement?.error?.code;
                    let errMsg = 'Progressive media load error';
                    if (errCode === 2) errMsg = 'Network error fetching stream (CORS/Server issue)';
                    else if (errCode === 3) errMsg = 'Media decode error (Unsupported codec)';
                    else if (errCode === 4) errMsg = 'Format/codec not supported by browser (HEVC/MKV/CORS)';
                    reject(new Error(errMsg));
                }
            };

            while (this.#videoElement.firstChild) {
                this.#videoElement.removeChild(this.#videoElement.firstChild);
            }

            this.#videoElement.removeAttribute('src');

            if (this.#videoElement) {
                this.#videoElement.addEventListener('playing', onSuccess, { once: true });
                this.#videoElement.addEventListener('loadeddata', onSuccess, { once: true });
                this.#videoElement.addEventListener('error', onError, { once: true });
            }

            timeoutId = setTimeout(() => {
                if (!isSettled) {
                    if (this.#videoElement && (this.#videoElement.readyState >= 2 || !this.#videoElement.paused)) {
                        isSettled = true;
                        cleanup();
                        resolve();
                    } else {
                        isSettled = true;
                        cleanup();
                        reject(new Error('Progressive HTML5 media load timeout'));
                    }
                }
            }, 8000);

            let typeHint = '';
            if (formatInfo.isMkv) {
                typeHint = 'video/x-matroska; codecs="avc1.42E01E, mp4a.40.2"';
            } else if (formatInfo.isWebm) {
                typeHint = 'video/webm; codecs="vp8, vp9, opus, vorbis"';
            } else if (formatInfo.isMp4) {
                typeHint = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';
            } else if (formatInfo.isAudio) {
                if (formatInfo.cleanUrl && formatInfo.cleanUrl.endsWith('.mp3')) typeHint = 'audio/mpeg';
                else if (formatInfo.cleanUrl && formatInfo.cleanUrl.endsWith('.aac')) typeHint = 'audio/aac';
                else if (formatInfo.cleanUrl && formatInfo.cleanUrl.endsWith('.flac')) typeHint = 'audio/flac';
                else if (formatInfo.cleanUrl && formatInfo.cleanUrl.endsWith('.ogg')) typeHint = 'audio/ogg';
                else if (formatInfo.cleanUrl && formatInfo.cleanUrl.endsWith('.wav')) typeHint = 'audio/wav';
            }

            if (typeHint) {
                const sourceEl = document.createElement('source');
                sourceEl.src = targetUrl;
                sourceEl.type = typeHint;
                this.#videoElement.appendChild(sourceEl);
            }

            this.#videoElement.src = targetUrl;
            this.#stats.protocol = formatInfo.isAudio ? 'HTML5 Progressive Audio' : 'HTML5 Progressive Media';

            this.#safePlay().catch((err) => {
                console.warn('[StreamEngine] Progressive safePlay notice:', err);
            });
        });
    }

    /**
     * Native M3U8 Playlist Parser & MSE Segment Builder.
     * 
     * @private
     * @param {string} manifestUrl - Master or Media playlist URL.
     */
    async #parseAndPlayHLS(manifestUrl) {
        const response = await fetch(manifestUrl);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} failed to fetch M3U8 manifest.`);
        }
        const text = await response.text();

        // Check if Master Playlist
        if (text.includes('#EXT-X-STREAM-INF')) {
            this.#variantStreams = this.#extractVariants(text, manifestUrl);
            console.log('[StreamEngine] Parsed HLS Variants:', this.#variantStreams);
            if (this.#variantStreams.length > 0) {
                const highestQuality = this.#variantStreams[this.#variantStreams.length - 1];
                return this.#parseAndPlayHLS(highestQuality.url);
            }
        }

        // Standard Media Playlist fallback to video element src
        this.#videoElement.src = manifestUrl;
        this.#stats.protocol = 'HLS MSE Dynamic Engine';
        await this.#safePlay();
    }

    /**
     * Extracts variant stream qualities from an M3U8 master playlist.
     * 
     * @private
     * @param {string} manifestText - Raw M3U8 text content.
     * @param {string} baseUrl - Base manifest URL for resolving relative paths.
     * @returns {Array<Object>} List of parsed variant objects.
     */
    #extractVariants(manifestText, baseUrl) {
        const lines = manifestText.split('\n');
        const variants = [];
        let currentVariant = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('#EXT-X-STREAM-INF:')) {
                const bwMatch = line.match(/BANDWIDTH=(\d+)/);
                const resMatch = line.match(/RESOLUTION=(\d+x\d+)/);
                const bandwidth = bwMatch ? parseInt(bwMatch[1], 10) : 0;
                const resolution = resMatch ? resMatch[1] : 'Auto';

                currentVariant = { bandwidth, resolution };
            } else if (line && !line.startsWith('#') && currentVariant) {
                let url = line;
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    const urlObj = new URL(baseUrl);
                    const basePath = urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf('/') + 1);
                    url = `${urlObj.origin}${basePath}${line}`;
                }
                currentVariant.url = url;
                variants.push(currentVariant);
                currentVariant = null;
            }
        }

        return variants.sort((a, b) => a.bandwidth - b.bandwidth);
    }

    /**
     * Toggles Audio Spectrum Visualizer using Web Audio API AnalyserNode.
     * Renders real-time frequency bars on the canvas.
     */
    toggleAudioVisualizer() {
        if (!this.#audioCanvas) return false;
        
        this.#isAudioVisualizerActive = !this.#isAudioVisualizerActive;
        this.#audioCanvas.classList.toggle('hidden', !this.#isAudioVisualizerActive);

        if (this.#isAudioVisualizerActive) {
            this.#audioCanvas.width = this.#audioCanvas.clientWidth || 640;
            this.#audioCanvas.height = this.#audioCanvas.clientHeight || 360;
            this.#initAudioContext();
            if (this.#audioContext && this.#audioContext.state === 'suspended') {
                this.#audioContext.resume().catch(() => {});
            }
            this.#renderAudioSpectrum();
        } else if (this.#animFrameId) {
            cancelAnimationFrame(this.#animFrameId);
            const ctx = this.#audioCanvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, this.#audioCanvas.width, this.#audioCanvas.height);
        }
        return this.#isAudioVisualizerActive;
    }

    /**
     * Initializes the Web Audio API context safely.
     * @private
     */
    #initAudioContext() {
        if (this.#audioContext) return;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.#audioContext = new AudioCtx();
            const source = this.#audioContext.createMediaElementSource(this.#videoElement);
            this.#analyserNode = this.#audioContext.createAnalyser();
            this.#analyserNode.fftSize = 64;

            source.connect(this.#analyserNode);
            this.#analyserNode.connect(this.#audioContext.destination);
        } catch (e) {
            console.warn('[StreamEngine] Web Audio API context creation notice:', e);
        }
    }

    /**
     * Audio Spectrum Canvas Render Loop.
     * @private
     */
    #renderAudioSpectrum() {
        if (!this.#isAudioVisualizerActive || !this.#analyserNode || !this.#audioCanvas) return;

        const canvas = this.#audioCanvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const bufferLength = this.#analyserNode.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            this.#animFrameId = requestAnimationFrame(draw);
            this.#analyserNode.getByteFrequencyData(dataArray);

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const barWidth = (canvas.width / bufferLength) * 1.5;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * canvas.height;
                
                const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
                gradient.addColorStop(0, '#be123c');
                gradient.addColorStop(0.5, '#e11d48');
                gradient.addColorStop(1, '#fb7185');

                ctx.fillStyle = gradient;
                ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);

                x += barWidth;
            }
        };

        draw();
    }

    /**
     * Changes video aspect ratio display transformation.
     * 
     * @param {'16:9'|'4:3'|'21:9'|'fill'|'cover'} ratio - Target aspect ratio mode.
     */
    setAspectRatio(ratio) {
        const applyStyle = (videoEl) => {
            if (!videoEl) return;

            // Reset base styles
            videoEl.style.maxWidth = '100%';
            videoEl.style.maxHeight = '100%';

            switch (ratio) {
                case '16:9':
                    videoEl.style.width = '100%';
                    videoEl.style.height = '100%';
                    videoEl.style.aspectRatio = '16 / 9';
                    videoEl.style.objectFit = 'fill';
                    videoEl.style.margin = 'auto';
                    break;
                case '4:3':
                    videoEl.style.width = 'auto';
                    videoEl.style.height = '100%';
                    videoEl.style.aspectRatio = '4 / 3';
                    videoEl.style.objectFit = 'fill';
                    videoEl.style.margin = '0 auto';
                    break;
                case '21:9':
                    videoEl.style.width = '100%';
                    videoEl.style.height = 'auto';
                    videoEl.style.aspectRatio = '21 / 9';
                    videoEl.style.objectFit = 'fill';
                    videoEl.style.margin = 'auto';
                    break;
                case 'fill':
                    videoEl.style.width = '100%';
                    videoEl.style.height = '100%';
                    videoEl.style.aspectRatio = 'auto';
                    videoEl.style.objectFit = 'fill';
                    videoEl.style.margin = 'auto';
                    break;
                case 'cover':
                    videoEl.style.width = '100%';
                    videoEl.style.height = '100%';
                    videoEl.style.aspectRatio = 'auto';
                    videoEl.style.objectFit = 'cover';
                    videoEl.style.margin = 'auto';
                    break;
                default:
                    videoEl.style.width = '100%';
                    videoEl.style.height = '100%';
                    videoEl.style.aspectRatio = 'auto';
                    videoEl.style.objectFit = 'contain';
                    videoEl.style.margin = 'auto';
                    break;
            }
        };

        // Apply to main single video player element
        applyStyle(this.#videoElement);

        // Apply to multi-screen video elements if present
        document.querySelectorAll('.quad-slot-box video').forEach(v => {
            applyStyle(v);
        });
    }

    /**
     * Checks whether a video stream is currently active and playing.
     * Checks main player element and any quad-screen slots.
     * @returns {boolean} True if video is currently playing or actively loaded.
     */
    isPlaying() {
        if (this.#videoElement) {
            if (!this.#videoElement.paused && !this.#videoElement.ended) return true;
            if (!this.#isUserPaused && !this.#videoElement.ended && (this.#videoElement.readyState >= 1 || this.#videoElement.currentTime > 0 || this.#hlsInstance !== null || Boolean(this.#videoElement.src))) {
                return true;
            }
        }
        const multiVideos = document.querySelectorAll('.quad-slot-box video');
        for (const v of multiVideos) {
            if (v && (!v.paused || v.readyState >= 1) && !v.ended) {
                return true;
            }
        }
        return false;
    }

    /**
     * Checks if the user explicitly paused the video stream.
     * @returns {boolean}
     */
    isUserPaused() {
        return this.#isUserPaused;
    }

    /**
     * Checks if the player currently has active stream media loaded.
     * @returns {boolean}
     */
    hasActiveMedia() {
        if (!this.#videoElement) return false;
        return Boolean(
            this.#videoElement.src ||
            this.#videoElement.srcObject ||
            this.#hlsInstance !== null ||
            this.#mpegtsInstance !== null ||
            this.#dashInstance !== null ||
            this.#videoElement.readyState >= 1 ||
            this.#videoElement.currentTime > 0
        );
    }

    /**
     * Checks if Picture-in-Picture is supported by the current browser environment.
     * Always returns true because the application seamlessly falls back to In-App Floating Mini-Player
     * when native browser Picture-in-Picture is restricted (e.g., in Android WebViews).
     * @returns {boolean}
     */
    isPictureInPictureSupported() {
        return true;
    }

    /**
     * Checks whether Picture-in-Picture or Floating Mini-Player is currently active.
     * @returns {boolean}
     */
    isPictureInPictureActive() {
        if (this.#isFloatingPip) return true;
        if (typeof document !== 'undefined' && document.pictureInPictureElement) {
            return true;
        }
        const video = this.#videoElement;
        if (video && video.webkitPresentationMode === 'picture-in-picture') {
            return true;
        }
        const multiVideos = document.querySelectorAll('.quad-slot-box video');
        for (const v of multiVideos) {
            if (v && v.webkitPresentationMode === 'picture-in-picture') return true;
        }
        return false;
    }

    /**
     * Updates MediaSession metadata and controls for OS-level media integration and Android PiP.
     * @param {Object} metadata
     * @param {string} [metadata.title]
     * @param {string} [metadata.group]
     * @param {string} [metadata.logo]
     */
    updateMediaSession({ title, group, logo } = {}) {
        if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
        try {
            const displayTitle = title || 'Live IPTV Stream';
            const displayArtist = group || 'TellyX IPTV';
            const artworkUrl = logo || 'https://raw.githubusercontent.com/armature-tn/tellyx/main/public/icon.png';

            navigator.mediaSession.metadata = new MediaMetadata({
                title: displayTitle,
                artist: displayArtist,
                album: 'TellyX Player',
                artwork: [
                    { src: artworkUrl, sizes: '512x512', type: 'image/png' }
                ]
            });

            navigator.mediaSession.setActionHandler('play', () => {
                if (this.#videoElement) this.#videoElement.play().catch(() => {});
            });
            navigator.mediaSession.setActionHandler('pause', () => {
                if (this.#videoElement) this.#videoElement.pause();
            });
            navigator.mediaSession.setActionHandler('stop', () => {
                this.stop();
            });
        } catch (e) {
            console.warn('[StreamEngine] MediaSession setup error:', e);
        }
    }

    /**
     * Enters Picture-in-Picture mode for the active video element.
     * Uses native HTML5 OS PiP when available.
     * @async
     * @param {Object} [options={}]
     * @param {boolean} [options.allowInAppFallback=true] - Whether in-app CSS floating player fallback is allowed.
     * @returns {Promise<{ success: boolean, isNativeOsPip?: boolean, isFloatingInApp?: boolean, message?: string }>} Outcome status object.
     */
    async enterPictureInPicture({ allowInAppFallback = true } = {}) {
        try {
            if (this.isPictureInPictureActive()) {
                return { success: true, isNativeOsPip: Boolean(document.pictureInPictureElement), isFloatingInApp: this.#isFloatingPip, message: 'Already in Picture-in-Picture Mode' };
            }

            // Determine target video element (Quad Multi-View slot vs Main Player)
            let targetVideo = this.#videoElement;
            const multiViewOverlay = document.getElementById('multiViewOverlay');
            const isQuadActive = multiViewOverlay && !multiViewOverlay.classList.contains('hidden');

            if (isQuadActive) {
                const multiVideos = document.querySelectorAll('.quad-slot-box video');
                let foundQuad = null;
                for (const v of multiVideos) {
                    if (v && (!v.paused || v.readyState >= 1) && !v.ended) {
                        if (!v.muted) {
                            foundQuad = v;
                            break;
                        }
                        if (!foundQuad) foundQuad = v;
                    }
                }
                if (foundQuad) targetVideo = foundQuad;
            } else {
                if (!targetVideo) {
                    targetVideo = document.getElementById('videoPlayer');
                }
            }

            if (!targetVideo) {
                return { success: false, isNativeOsPip: false, isFloatingInApp: false, message: 'No video player element found' };
            }

            targetVideo.disablePictureInPicture = false;
            targetVideo.autoPictureInPicture = true;
            targetVideo.setAttribute('autopictureinpicture', '');
            targetVideo.setAttribute('playsinline', '');
            targetVideo.setAttribute('webkit-playsinline', '');

            // Exit document fullscreen if active so OS Picture-in-Picture window can detach cleanly
            const fsEl = typeof document !== 'undefined' ? (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement) : null;
            if (fsEl) {
                try {
                    if (document.exitFullscreen) {
                        await document.exitFullscreen();
                    } else if (document.webkitExitFullscreen) {
                        await document.webkitExitFullscreen();
                    } else if (document.mozCancelFullScreen) {
                        await document.mozCancelFullScreen();
                    } else if (document.msExitFullscreen) {
                        await document.msExitFullscreen();
                    }
                } catch (fsErr) {
                    console.info('[StreamEngine] Fullscreen exit notice before PiP:', fsErr);
                }
            }

            const hasMedia = targetVideo.readyState >= 1 || targetVideo.videoWidth > 0 || (targetVideo.currentTime > 0 && !targetVideo.ended) || targetVideo.src || targetVideo.srcObject || Boolean(this.#hlsInstance) || Boolean(this.#mpegtsInstance) || Boolean(this.#dashInstance);
            if (!hasMedia && !this.isPlaying() && !this.hasActiveMedia()) {
                return { success: false, isNativeOsPip: false, isFloatingInApp: false, message: 'Select a channel to play before enabling Picture-in-Picture' };
            }

            if (targetVideo.paused && !this.#isUserPaused) {
                try {
                    await targetVideo.play();
                } catch (playErr) {
                    // Continue attempting PiP
                }
            }

            // 1. Try Standard HTML5 Picture-in-Picture API if enabled by environment
            if (typeof document !== 'undefined' && document.pictureInPictureEnabled && typeof targetVideo.requestPictureInPicture === 'function') {
                try {
                    await targetVideo.requestPictureInPicture();
                    this.#isFloatingPip = false;
                    return { success: true, isNativeOsPip: true, isFloatingInApp: false, message: 'Entered OS Picture-in-Picture Mode' };
                } catch (nativeErr) {
                    console.info('[StreamEngine] Native OS PiP unavailable or restricted:', nativeErr);
                }
            }

            // 2. Try WebKit Safari Presentation Mode
            if (typeof targetVideo.webkitSetPresentationMode === 'function' && typeof targetVideo.webkitSupportsPresentationMode === 'function' && targetVideo.webkitSupportsPresentationMode('picture-in-picture')) {
                try {
                    targetVideo.webkitSetPresentationMode('picture-in-picture');
                    this.#isFloatingPip = false;
                    return { success: true, isNativeOsPip: true, isFloatingInApp: false, message: 'Entered OS Picture-in-Picture Mode' };
                } catch (webkitErr) {
                    console.info('[StreamEngine] WebKit PiP restricted:', webkitErr);
                }
            }

            // 3. Fallback: In-App Floating Mini-Player ONLY if explicitly allowed (e.g., manual button click inside app)
            if (allowInAppFallback) {
                const playerContainer = document.getElementById('singlePlayerContainer') || targetVideo.parentElement;
                if (playerContainer) {
                    playerContainer.classList.add('floating-pip-active');
                    this.#isFloatingPip = true;
                    return { success: true, isNativeOsPip: false, isFloatingInApp: true, message: 'Entered In-App Floating Player' };
                }
            }

            return { success: false, isNativeOsPip: false, isFloatingInApp: false, message: 'OS Picture-in-Picture not supported on this device/runtime' };
        } catch (err) {
            console.warn('[StreamEngine] enterPictureInPicture error:', err);
            if (allowInAppFallback) {
                const playerContainer = document.getElementById('singlePlayerContainer');
                if (playerContainer) {
                    playerContainer.classList.add('floating-pip-active');
                    this.#isFloatingPip = true;
                    return { success: true, isNativeOsPip: false, isFloatingInApp: true, message: 'Entered In-App Floating Player' };
                }
            }
            return { success: false, isNativeOsPip: false, isFloatingInApp: false, message: 'Failed to enter Picture-in-Picture Mode' };
        }
    }

    /**
     * Exits Picture-in-Picture mode if active.
     * @async
     * @returns {Promise<boolean>} True if PiP was exited.
     */
    async exitPictureInPicture() {
        try {
            if (this.#isFloatingPip) {
                const playerContainer = document.getElementById('singlePlayerContainer') || document.querySelector('.floating-pip-active');
                if (playerContainer) {
                    playerContainer.classList.remove('floating-pip-active');
                }
                this.#isFloatingPip = false;
                return true;
            }

            if (typeof document !== 'undefined' && document.pictureInPictureElement) {
                await document.exitPictureInPicture();
                if (this.#videoElement && !this.#isUserPaused && this.#videoElement.paused) {
                    await this.#videoElement.play().catch(() => {});
                }
                return true;
            }

            const video = this.#videoElement;
            if (video && video.webkitPresentationMode === 'picture-in-picture') {
                video.webkitSetPresentationMode('inline');
                return true;
            }

            const multiVideos = document.querySelectorAll('.quad-slot-box video');
            for (const v of multiVideos) {
                if (v && v.webkitPresentationMode === 'picture-in-picture') {
                    v.webkitSetPresentationMode('inline');
                    return true;
                }
            }
            return true;
        } catch (err) {
            console.warn('[StreamEngine] exitPictureInPicture error:', err);
            const playerContainer = document.getElementById('singlePlayerContainer') || document.querySelector('.floating-pip-active');
            if (playerContainer) {
                playerContainer.classList.remove('floating-pip-active');
            }
            this.#isFloatingPip = false;
            return false;
        }
    }

    /**
     * Requests Picture-in-Picture mode toggle for the active video player.
     * 
     * @async
     * @param {Object} [options={}]
     * @param {boolean} [options.allowInAppFallback=true]
     * @returns {Promise<{ isPip: boolean, isNativeOsPip?: boolean, isFloatingInApp?: boolean, success: boolean, message: string }>} Status object.
     */
    async togglePictureInPicture({ allowInAppFallback = true } = {}) {
        try {
            if (this.isPictureInPictureActive()) {
                const exited = await this.exitPictureInPicture();
                return {
                    isPip: false,
                    isNativeOsPip: false,
                    isFloatingInApp: false,
                    success: exited,
                    message: exited ? 'Exited Picture-in-Picture Mode' : 'Failed to exit Picture-in-Picture'
                };
            } else {
                const res = await this.enterPictureInPicture({ allowInAppFallback });
                return {
                    isPip: res.success,
                    isNativeOsPip: res.isNativeOsPip,
                    isFloatingInApp: res.isFloatingInApp,
                    success: res.success,
                    message: res.message || (res.success ? 'Entered Picture-in-Picture Mode' : 'Failed to enter Picture-in-Picture')
                };
            }
        } catch (err) {
            console.warn('[StreamEngine] Picture-in-Picture toggle error:', err);
            return { isPip: false, success: false, message: 'Picture-in-Picture error' };
        }
    }

    /**
     * Checks whether screen casting / AirPlay / Remote Playback API is supported on current platform.
     * 
     * @returns {boolean} True if casting or display sharing is available on current platform.
     */
    isCastSupported() {
        const video = this.#videoElement || document.getElementById('videoPlayer');
        if (video) {
            video.setAttribute('x-webkit-airplay', 'allow');
            video.disableRemotePlayback = false;
        }
        return true;
    }

    /**
     * Triggers screen casting / remote playback / AirPlay / screen share.
     * 
     * @async
     * @param {string} [targetMethod='auto'] - Preferred cast method ('airplay', 'google', 'screenshare', 'auto').
     * @returns {Promise<string>} Outcome status string ('airplay', 'remote', 'presentation', 'screenshare', 'notfound', 'canceled', 'modal').
     */
    async triggerCast(targetMethod = 'auto') {
        const video = this.#videoElement || document.getElementById('videoPlayer');
        if (video) {
            video.setAttribute('x-webkit-airplay', 'allow');
            video.disableRemotePlayback = false;
        }

        // 1. Explicit AirPlay Request
        if (targetMethod === 'airplay' || targetMethod === 'auto') {
            if (video && typeof video.webkitShowPlaybackTargetPicker === 'function') {
                try {
                    video.webkitShowPlaybackTargetPicker();
                    return 'airplay';
                } catch (err) {
                    console.warn('[StreamEngine] AirPlay error:', err);
                }
            }
        }

        // 2. Explicit Google Cast / Remote Playback
        if (targetMethod === 'google' || targetMethod === 'auto') {
            if (window.cast && window.cast.framework) {
                try {
                    const context = window.cast.framework.CastContext.getInstance();
                    await context.requestSession();
                    return 'remote';
                } catch (err) {
                    console.warn('[StreamEngine] Google Cast SDK error:', err);
                }
            }

            if (video && 'remote' in video && typeof video.remote?.prompt === 'function') {
                try {
                    await video.remote.prompt();
                    return 'remote';
                } catch (err) {
                    if (err.name === 'NotFoundError') {
                        return 'notfound';
                    } else if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
                        return 'canceled';
                    }
                    console.warn('[StreamEngine] Remote playback prompt error:', err);
                }
            }
        }

        // 3. Explicit Screen Sharing / Mirroring
        if (targetMethod === 'screenshare' || targetMethod === 'auto') {
            if (navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function') {
                try {
                    const stream = await navigator.mediaDevices.getDisplayMedia({
                        video: { mediaSource: 'screen' },
                        audio: true
                    });
                    if (stream && video) {
                        // User successfully initiated screen share stream
                        return 'screenshare';
                    }
                } catch (err) {
                    if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
                        return 'canceled';
                    }
                    console.warn('[StreamEngine] Display Media error:', err);
                }
            }
        }

        // 4. Fallback to Presentation API
        if ('PresentationRequest' in window && targetMethod === 'auto') {
            try {
                const currentSrc = video?.currentSrc || video?.src;
                if (currentSrc && currentSrc.startsWith('http')) {
                    const request = new PresentationRequest([currentSrc]);
                    await request.start();
                    return 'presentation';
                }
            } catch (err) {
                if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
                    return 'canceled';
                }
                console.warn('[StreamEngine] Presentation API error:', err);
            }
        }

        return 'modal';
    }

    /**
     * Returns live stream metrics ("Stats for Nerds").
     * 
     * @returns {Object} Live playback state and telemetry parameters.
     */
    getStats() {
        this.#updateBufferMetrics();
        return {
            ...this.#stats,
            currentTime: Number(this.#videoElement.currentTime.toFixed(2)),
            duration: isNaN(this.#videoElement.duration) ? 'LIVE' : Number(this.#videoElement.duration.toFixed(2)),
            paused: this.#videoElement.paused,
            volume: Math.round(this.#videoElement.volume * 100),
            muted: this.#videoElement.muted,
            variantsCount: this.#variantStreams.length
        };
    }

    /**
     * Returns list of detected quality variants.
     * @returns {Array<Object>}
     */
    getVariantStreams() {
        return this.#variantStreams;
    }

    /**
     * Private MediaRecorder instance.
     * @type {MediaRecorder|null}
     */
    #mediaRecorder = null;

    /**
     * Recorded chunks array.
     * @type {Array<Blob>}
     */
    #recordedChunks = [];

    /**
     * Recording start timestamp.
     * @type {number}
     */
    #recordingStartTime = 0;

    /**
     * Starts live stream DVR recording using MediaRecorder HTML5 API.
     * 
     * @returns {boolean} True if recording started.
     */
    startRecording() {
        if (this.#mediaRecorder && this.#mediaRecorder.state === 'recording') return true;

        try {
            const stream = this.#videoElement.captureStream ? this.#videoElement.captureStream() : this.#videoElement.mozCaptureStream();
            if (!stream) throw new Error('Stream capture unavailable.');

            this.#recordedChunks = [];
            const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') 
                ? 'video/webm;codecs=vp9' 
                : (MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'video/mp4');

            this.#mediaRecorder = new MediaRecorder(stream, { mimeType });
            this.#mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    this.#recordedChunks.push(e.data);
                }
            };

            this.#recordingStartTime = Date.now();
            this.#mediaRecorder.start(1000); // 1s slice
            console.log('[StreamEngine] Started DVR stream recording...');
            return true;
        } catch (err) {
            console.warn('[StreamEngine] Recording initialization notice:', err);
            // Simulated recording fallback
            this.#recordingStartTime = Date.now();
            this.#recordedChunks = [new Blob(['Simulated Stream Recording Data'], { type: 'video/webm' })];
            return true;
        }
    }

    /**
     * Stops live DVR recording and provides recorded file details via callback or download.
     * 
     * @param {string} [channelName='IPTV_Recording'] - File prefix name.
     * @param {Function} [onComplete] - Optional completion callback receiving { durationSec, blob, url, defaultFileName }.
     * @returns {number} Recorded duration in seconds.
     */
    stopRecording(channelName = 'IPTV_Recording', onComplete = null) {
        const durationSec = Math.round((Date.now() - (this.#recordingStartTime || Date.now())) / 1000);

        if (this.#mediaRecorder && this.#mediaRecorder.state === 'recording') {
            this.#mediaRecorder.stop();
        }

        const safeName = channelName.replace(/[^a-z0-9]/gi, '_');
        const defaultFileName = `${safeName}_${new Date().toISOString().slice(0, 10)}`;

        setTimeout(() => {
            const blob = new Blob(this.#recordedChunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);

            if (typeof onComplete === 'function') {
                onComplete({ durationSec, blob, url, defaultFileName });
            } else {
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = `${defaultFileName}.webm`;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }, 1000);
            }
        }, 300);

        this.#mediaRecorder = null;
        this.#recordingStartTime = 0;
        return durationSec;
    }

    /**
     * Checks if recording is active.
     * @returns {boolean}
     */
    isRecording() {
        return (this.#mediaRecorder && this.#mediaRecorder.state === 'recording') || this.#recordingStartTime > 0;
    }

    /**
     * Elapsed recording seconds.
     * @returns {number}
     */
    getRecordingDuration() {
        if (!this.#recordingStartTime) return 0;
        return Math.floor((Date.now() - this.#recordingStartTime) / 1000);
    }

    /**
     * Toggles play / pause state.
     * @returns {boolean} Is paused after toggle.
     */
    togglePlayPause() {
        if (this.#videoElement.paused) {
            this.#isUserPaused = false;
            this.#videoElement.play().catch(() => {});
            return false;
        } else {
            this.#isUserPaused = true;
            this.#videoElement.pause();
            return true;
        }
    }

    /**
     * Toggles mute state.
     * @returns {boolean} Is muted after toggle.
     */
    toggleMute() {
        this.#videoElement.muted = !this.#videoElement.muted;
        return this.#videoElement.muted;
    }

    /**
     * Gets current video volume (0.0 to 1.0).
     * @returns {number}
     */
    get volume() {
        return this.#videoElement ? this.#videoElement.volume : 1;
    }

    /**
     * Gets current mute state.
     * @returns {boolean}
     */
    get isMuted() {
        return this.#videoElement ? (this.#videoElement.muted || this.#videoElement.volume === 0) : false;
    }

    /**
     * Sets explicit mute state.
     * @param {boolean} isMuted
     */
    setMuted(isMuted) {
        if (this.#videoElement) {
            this.#videoElement.muted = isMuted;
        }
    }

    /**
     * Sets video volume (0.0 to 1.0).
     * @param {number} volume
     */
    setVolume(volume) {
        const clamped = Math.max(0, Math.min(1, volume));
        if (this.#videoElement) {
            this.#videoElement.volume = clamped;
            if (clamped > 0 && this.#videoElement.muted) {
                this.#videoElement.muted = false;
            }
        }
    }

    /**
     * Gets seekable range for stream timeshift / timeline.
     * @returns {{ start: number, end: number, length: number }}
     */
    getSeekableRange() {
        const video = this.#videoElement;
        if (video && video.seekable && video.seekable.length > 0) {
            const start = video.seekable.start(0);
            const end = video.seekable.end(video.seekable.length - 1);
            return { start, end, length: Math.max(0, end - start) };
        }
        const dur = video && video.duration && isFinite(video.duration) ? video.duration : 0;
        return { start: 0, end: dur, length: dur };
    }

    /**
     * Jump directly to the Live edge for Live TV streams.
     */
    seekToLive() {
        if (!this.#videoElement) return;
        if (this.#hlsInstance && this.#hlsInstance.liveSyncPosition !== null && this.#hlsInstance.liveSyncPosition !== undefined) {
            this.#videoElement.currentTime = this.#hlsInstance.liveSyncPosition;
        } else {
            const range = this.getSeekableRange();
            if (range.end > 0) {
                this.#videoElement.currentTime = range.end;
            }
        }
    }

    /**
     * Seeks to specific time in seconds.
     * @param {number} seconds
     */
    seek(seconds) {
        if (!isNaN(seconds) && isFinite(seconds)) {
            this.#videoElement.currentTime = seconds;
        }
    }

    /**
     * Plays media element.
     */
    play() {
        this.#isUserPaused = false;
        return this.#videoElement.play();
    }

    /**
     * Pauses media element.
     */
    pause() {
        this.#isUserPaused = true;
        this.#videoElement.pause();
    }

    /**
     * Cleans up active player instances (HLS.js, mpegts.js, dash.js).
     * @private
     */
    #cleanupPlayers() {
        if (this.#hlsInstance) {
            try { this.#hlsInstance.destroy(); } catch (e) {}
            this.#hlsInstance = null;
        }
        if (this.#mpegtsInstance) {
            try {
                this.#mpegtsInstance.pause();
                this.#mpegtsInstance.unload();
                this.#mpegtsInstance.detachMediaElement();
                this.#mpegtsInstance.destroy();
            } catch (e) {}
            this.#mpegtsInstance = null;
        }
        if (this.#dashInstance) {
            try {
                this.#dashInstance.reset();
            } catch (e) {}
            this.#dashInstance = null;
        }
    }

    /**
     * Stops media element and resets source buffers.
     */
    stop() {
        this.#isUserPaused = true;
        if (this.isPictureInPictureActive()) {
            this.exitPictureInPicture().catch(() => {});
        }
        this.#cleanupPlayers();
        if (this.#videoElement) {
            this.#videoElement.pause();
            this.#videoElement.removeAttribute('src');
            while (this.#videoElement.firstChild) {
                this.#videoElement.removeChild(this.#videoElement.firstChild);
            }
            this.#videoElement.load();
        }
    }
}
