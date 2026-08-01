/**
 * @file app.js
 * @description Main Application Bootstrap Entry Point for IPTV Player.
 * Initializes WASM Engine, Security, IPTV Core, EPG Engine, Stream Engine, and UI Controller.
 * Binds DOM event handlers, modal workflows, playlist managers, and CORS proxy toggles.
 * 
 * @module MainApp
 * @version 0.1.0
 * @author Armature.TN
 * @license Dual License: GNU AGPL-3.0 or Commercial License (SPDX: AGPL-3.0-or-later OR Commercial)
 */

import { SecurityController } from './security.js';
import { WASMEngine } from './wasm-engine.js';
import { StreamEngine } from './stream-engine.js';
import { IPTVCore } from './iptv-core.js';
import { EPGEngine } from './epg-engine.js';
import { UIController } from './ui-controller.js';
import { TVRemoteManager } from './tv-remote.js';
import { initTauriIntegration, setupTauriWindowListeners } from './tauri-bridge.js';

/**
 * Main Application Coordinator Class.
 */
class Application {
    /** @type {WASMEngine} */
    wasmEngine;

    /** @type {IPTVCore} */
    iptvCore;

    /** @type {EPGEngine} */
    epgEngine;

    /** @type {StreamEngine} */
    streamEngine;

    /** @type {UIController} */
    uiController;

    /** @type {TVRemoteManager} */
    tvRemoteManager;

    /** @type {Object|null} Active channel object */
    activeChannel = null;

    /** @type {string} Active category name */
    activeCategory = 'All';

    /** @type {boolean} Cors proxy toggle */
    useCorsProxy = localStorage.getItem('tellyx_use_cors_proxy') === 'true';

    /** @type {string} Custom CORS Proxy URL prefix */
    customProxyUrl = localStorage.getItem('tellyx_custom_proxy') || '';

    /** @type {boolean} Security token protection toggle */
    useProxyToken = localStorage.getItem('tellyx_use_proxy_token') === 'true';

    /** @type {string} Custom CORS Proxy Security Token */
    proxyToken = localStorage.getItem('tellyx_proxy_token') || '';

    /** @type {string} Active content type filter: 'live' | 'movie' | 'series' */
    activeType = 'live';

    /** @type {string} Active sorting mode */
    sortMode = 'default';

    /** @type {boolean} Parental controls locked state */
    isParentalUnlocked = false;

    /** @type {string} Parental PIN */
    parentalPin = '0000';

    /** @type {number|null} Recording interval timer */
    recTimerInterval = null;

    /** @type {boolean} Multi-screen active state */
    isMultiViewActive = false;

    /** @type {number} Target quad slot index (0-3) */
    activeQuadSlotIndex = 0;

    /** @type {Array<Object|null>} Channels loaded in quad slots */
    quadSlots = [null, null, null, null];

    /**
     * Returns the active CORS proxy prefix URL if enabled.
     * @returns {string}
     */
    getEffectiveProxyUrl() {
        if (!this.useCorsProxy) return '';
        return this.customProxyUrl.trim() || SecurityController.DEFAULT_CORS_PROXY;
    }

    /**
     * Returns the active proxy security token if enabled.
     * @returns {string}
     */
    getEffectiveProxyToken() {
        if (!this.useCorsProxy || !this.useProxyToken) return '';
        return this.proxyToken.trim();
    }

    /**
     * Bootstraps the IPTV player stack.
     * @async
     */
    async init() {
        console.log('[App] Initializing IPTV Player Engine...');

        // Restore saved theme (default to tellyx_red)
        const savedTheme = localStorage.getItem('iptv_theme_v1') || 'tellyx_red';
        document.documentElement.setAttribute('data-theme', savedTheme);
        const themeSelect = document.getElementById('themeSelect');
        if (themeSelect) themeSelect.value = savedTheme;

        // Restore parental pin
        const savedPin = localStorage.getItem('iptv_pin_v1');
        if (savedPin) this.parentalPin = savedPin;

        // Restore sort mode
        this.sortMode = localStorage.getItem('tellyx_sort_mode') || 'default';
        const sortSelect = document.getElementById('sortChannelsSelect') || document.getElementById('sortSelect');
        if (sortSelect) sortSelect.value = this.sortMode;
        const epgSortSelect = document.getElementById('epgSortSelect');
        if (epgSortSelect) epgSortSelect.value = this.sortMode;

        // Restore active content type mode (live, movie, series) and active category
        this.activeType = localStorage.getItem('tellyx_last_active_type') || 'live';
        this.activeCategory = localStorage.getItem(`tellyx_last_category_${this.activeType}`) || localStorage.getItem('tellyx_last_category') || 'All';

        // Restore aspect ratio
        const savedRatio = localStorage.getItem('tellyx_aspect_ratio');
        if (savedRatio) {
            const aspectRatioSelect = document.getElementById('aspectRatioSelect');
            if (aspectRatioSelect) aspectRatioSelect.value = savedRatio;
        }

        // 1. Initialize WASM Engine
        this.wasmEngine = new WASMEngine();
        const wasmOk = await this.wasmEngine.init();

        // 2. Initialize Repositories and Engines
        this.iptvCore = new IPTVCore();
        await this.iptvCore.initDB();
        this.epgEngine = new EPGEngine();

        // 3. Initialize Stream Engine with video DOM element
        const videoEl = document.getElementById('videoPlayer');
        const canvasEl = document.getElementById('audioCanvas');
        this.streamEngine = new StreamEngine(videoEl, canvasEl);

        // 4. Initialize UI Controller with callbacks
        this.uiController = new UIController({
            onSelectChannel: (channel) => this.playChannel(channel),
            onToggleFavorite: (channelId) => {
                const fav = this.iptvCore.toggleFavorite(channelId);
                this.uiController.showToast(fav ? 'Added to Favorites' : 'Removed from Favorites', 'info');
                this.renderUI();
            },
            onOpenChannelEpg: () => this.openCurrentChannelEpg()
        });

        // Update WASM Badge
        this.uiController.updateWASMBadge(wasmOk);
        this.uiController.setParentalUnlocked(this.isParentalUnlocked);

        // 5. Initialize TiviMate TV Remote & D-Pad Engine
        this.tvRemoteManager = new TVRemoteManager(this);

        // 6. Initialize Tauri Embedded Runtime Check & UI Binding
        initTauriIntegration(this.uiController);

        // 6. Bind UI Event Listeners (Search, Modals, Forms, Themes, DVR)
        this.bindEvents();

        // 7. Initial UI Render
        this.renderUI();

        // 7. Check if user has an active connection already set up
        const hasActiveConnection = localStorage.getItem('tellyx_connection_active');
        const hasChannels = this.iptvCore.totalChannels > 0;

        const dismissSplashAndProceed = () => {
            const splashEl = document.getElementById('startupSplashScreen');
            if (splashEl) {
                splashEl.classList.add('splash-hide');
                setTimeout(() => {
                    splashEl.classList.add('hidden');
                }, 750);
            }

            if (!hasActiveConnection && !hasChannels) {
                setTimeout(() => {
                    this.uiController.toggleModal('playlistModal');
                    this.uiController.showToast('Welcome to TellyX! Please connect your IPTV provider or M3U playlist.', 'info');
                }, 300);
            } else {
                this.autoPlayLastOrFirstContent();
            }
        };

        // 8. Legal Disclaimer Check on Startup Splash Screen (First Run)
        const isLegalAgreed = localStorage.getItem('tellyx_legal_agreed') === 'true';
        const disclaimerBox = document.getElementById('splashLegalDisclaimer');

        if (isLegalAgreed) {
            // Already agreed: Dismiss Startup Splash Screen smoothly
            setTimeout(() => {
                dismissSplashAndProceed();
            }, 1200);
        } else {
            // First run: Display Legal Disclaimer on Splash Screen under logo and text
            if (disclaimerBox) {
                disclaimerBox.classList.remove('hidden');
            }

            const btnAgree = document.getElementById('btnAgreeLegal');
            const btnDisagree = document.getElementById('btnDisagreeLegal');

            if (btnAgree) {
                btnAgree.onclick = () => {
                    localStorage.setItem('tellyx_legal_agreed', 'true');
                    this.uiController.showToast('Legal Disclaimer Agreed', 'success');
                    dismissSplashAndProceed();
                };
            }

            if (btnDisagree) {
                btnDisagree.onclick = () => {
                    // Attempt to close window
                    try {
                        window.close();
                    } catch (e) {
                        console.warn('[App] window.close() blocked or restricted by browser', e);
                    }

                    // Display terms declined view on splash screen
                    if (disclaimerBox) {
                        disclaimerBox.innerHTML = `
                            <div class="text-center py-4 space-y-3">
                                <div class="w-12 h-12 rounded-full bg-black/20 flex items-center justify-center mx-auto text-black font-black text-xl">✕</div>
                                <h3 class="font-black text-base text-black uppercase tracking-wider">Disclaimer Declined</h3>
                                <p class="text-xs text-black/90 font-medium leading-relaxed">
                                    You must accept the legal disclaimer to use TellyX. The window was requested to close.
                                </p>
                                <button id="btnRetryLegal" class="mt-2 px-4 py-2.5 bg-black text-rose-500 hover:bg-black/80 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer">
                                    Review & Accept Terms
                                </button>
                            </div>
                        `;
                        document.getElementById('btnRetryLegal')?.addEventListener('click', () => {
                            window.location.reload();
                        });
                    }
                };
            }
        }

        // Telemetry stats update loop
        setInterval(() => {
            if (this.streamEngine) {
                const stats = this.streamEngine.getStats();
                this.uiController.updateStatsOverlay(stats);
            }
        }, 1000);

        console.log('[App] TellyX Engine initialization complete.');
    }

    /**
     * Updates content type filter button styles (Live TV, Movies, Series).
     * @param {string} [selectedType=this.activeType]
     */
    updateTypeButtonsUI(selectedType = this.activeType) {
        const btnLive = document.getElementById('typeLiveTv');
        const btnMovies = document.getElementById('typeMovies');
        const btnSeries = document.getElementById('typeSeries');

        [btnLive, btnMovies, btnSeries].forEach(b => {
            if (!b) return;
            const bId = b.id.toLowerCase();
            if ((selectedType === 'live' && bId.includes('live')) ||
                (selectedType === 'movie' && bId.includes('movie')) ||
                (selectedType === 'series' && bId.includes('serie'))) {
                b.className = 'px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 text-white cursor-pointer transition-all flex items-center sm:space-x-1.5';
            } else {
                b.className = 'px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-400 hover:text-white cursor-pointer transition-all flex items-center sm:space-x-1.5';
            }
        });
    }

    /**
     * Switches active content type mode (live, movie, series) and restores last category/item.
     * @param {string} selected - 'live' | 'movie' | 'series'
     */
    switchContentTypeMode(selected) {
        this.activeType = selected;
        localStorage.setItem('tellyx_last_active_type', selected);

        const savedCat = localStorage.getItem(`tellyx_last_category_${selected}`);
        if (savedCat) {
            this.activeCategory = savedCat;
        } else {
            this.activeCategory = 'All';
        }

        this.updateTypeButtonsUI(selected);
        this.renderUI();

        // Only auto-play live TV channels when switching to Live TV. Movies & Series must NOT auto load content.
        if (selected === 'live') {
            this.autoPlayLastOrFirstLiveChannel();
        }
    }

    /**
     * Auto-plays the last Live TV channel watched if available, or the first Live TV channel on the list.
     */
    autoPlayLastOrFirstLiveChannel() {
        this.autoPlayLastOrFirstContent();
    }

    /**
     * Auto-plays the last item watched for Live TV mode, or falls back to the first available channel in the playlist/category.
     * Skipped entirely when switching to Movies or Series.
     */
    autoPlayLastOrFirstContent() {
        const type = this.activeType || 'live';
        if (type === 'movie' || type === 'series') {
            return; // No auto-load for movies or series
        }

        const hideAdult = this.uiController.isParentalLocked();

        let modeChannels = this.iptvCore.getChannels('All', '', hideAdult, type);

        if (!modeChannels || modeChannels.length === 0) {
            modeChannels = this.iptvCore.getChannels('All', '', hideAdult, 'all');
        }

        if (!modeChannels || modeChannels.length === 0) {
            console.log(`[App] No channels/media available in playlist for mode: ${type}`);
            return;
        }

        let targetChannel = null;

        let storageKey = 'tellyx_last_watched_live_channel';
        if (type === 'movie') storageKey = 'tellyx_last_watched_movie';
        else if (type === 'series') storageKey = 'tellyx_last_watched_series';

        const savedLast = localStorage.getItem(storageKey) || localStorage.getItem('tellyx_last_watched_channel');

        if (savedLast) {
            try {
                const parsed = JSON.parse(savedLast);
                if (parsed) {
                    targetChannel = modeChannels.find(ch => 
                        (parsed.id && ch.id === parsed.id) || 
                        (parsed.url && ch.url === parsed.url) ||
                        (parsed.name && ch.name === parsed.name && ch.group === parsed.group)
                    );
                }
            } catch (err) {
                console.warn('[App] Error reading saved last item:', err);
            }
        }

        if (!targetChannel) {
            const history = this.iptvCore.getChannels('Recently Watched', '', hideAdult, type);
            if (history && history.length > 0) {
                const lastHistoryItem = history[0];
                targetChannel = modeChannels.find(ch => ch.id === lastHistoryItem.id || ch.url === lastHistoryItem.url);
            }
        }

        if (!targetChannel && this.activeCategory !== 'All') {
            const catChannels = this.iptvCore.getChannels(this.activeCategory, '', hideAdult, type);
            if (catChannels && catChannels.length > 0) {
                targetChannel = catChannels[0];
            }
        }

        if (!targetChannel) {
            targetChannel = modeChannels[0];
        }

        if (targetChannel) {
            console.log(`[App] Auto-resuming ${type} item on app start/switch:`, targetChannel.name);
            this.playChannel(targetChannel);
        }
    }

    /**
     * Plays a target channel stream or opens series modal if series selected.
     * 
     * @async
     * @param {Object} channel - Channel object record.
     */
    async playChannel(channel) {
        if (!channel) return;

        // Intercept TV Series show selection to open Seasons & Episodes Modal
        if (channel.type === 'series' && (channel.seriesId || (channel.id && channel.id.startsWith('xtream_series_')))) {
            this.openSeriesModal(channel);
            return;
        }

        // Intercept VOD Movie selection to open Movie Metadata Modal
        if (channel.type === 'movie' && (channel.vodId || channel.streamId || (channel.id && channel.id.startsWith('xtream_vod_')))) {
            this.openMovieModal(channel);
            return;
        }

        this.playDirectStream(channel);
    }

    /**
     * Directly loads and plays a stream URL into the video engine.
     * 
     * @async
     * @param {Object} channel - Channel object record.
     */
    async playDirectStream(channel) {
        if (!channel || !channel.url) {
            console.warn('[App] Selected channel or stream URL is empty/missing.', channel);
            this.uiController.showToast('Channel stream URL is missing', 'warning');
            return;
        }

        this.activeChannel = channel;
        this.iptvCore.addToHistory(channel);

        const itemType = channel.type || this.activeType || 'live';
        try {
            const payload = JSON.stringify({
                id: channel.id,
                name: channel.name,
                url: channel.url,
                group: channel.group,
                tvgId: channel.tvgId || '',
                type: itemType
            });
            if (itemType === 'movie') {
                localStorage.setItem('tellyx_last_watched_movie', payload);
            } else if (itemType === 'series') {
                localStorage.setItem('tellyx_last_watched_series', payload);
            } else {
                localStorage.setItem('tellyx_last_watched_live_channel', payload);
            }
            localStorage.setItem('tellyx_last_watched_channel', payload);
        } catch (e) {
            console.warn('[App] Could not save last watched item:', e);
        }

        const currentProg = this.epgEngine.getCurrentProgram(channel.tvgId || channel.id, channel.name);
        const isFav = this.iptvCore.isFavorite(channel.id);
        this.uiController.updateActiveHeader(channel, currentProg, isFav);

        if (this.isMultiViewActive) {
            const slotIdx = this.activeQuadSlotIndex;
            this.quadSlots[slotIdx] = channel;

            this.updateMultiScreenLayout();
            this.uiController.showToast(`Loaded "${channel.name}" into Screen ${slotIdx + 1}`, 'success');
            this.renderUI();
            return;
        }

        try {
            await this.streamEngine.loadStream(channel.url, this.useCorsProxy, this.getEffectiveProxyUrl(), this.getEffectiveProxyToken());
            this.streamEngine.updateMediaSession({
                title: channel.name,
                group: channel.group || channel.categoryName || 'Live IPTV',
                logo: channel.tvgLogo || channel.logo
            });
            const ratioSelect = document.getElementById('aspectRatioSelect');
            if (ratioSelect && ratioSelect.value) {
                this.streamEngine.setAspectRatio(ratioSelect.value);
            }
            if (!this.quadSlots[0]) this.quadSlots[0] = channel;
            this.uiController.showToast(`Playing: ${channel.name}`, 'success');
        } catch (err) {
            console.error('[App] Playback error:', err);
            this.uiController.showToast(`Playback Notice: ${err.message || 'Stream Buffering'}`, 'warning');
        }
    }

    /**
     * Fetches details, seasons, and episode listings for a given Xtream series entry.
     * 
     * @param {Object} seriesChannel 
     * @returns {Promise<Object>}
     */
    async fetchSeriesInfo(seriesChannel) {
        let server = seriesChannel.xtreamServer;
        let user = seriesChannel.xtreamUser;
        let pass = seriesChannel.xtreamPass;
        let sId = seriesChannel.seriesId;

        if ((!server || !user || !pass) && seriesChannel.providerId) {
            const provider = this.iptvCore.getProvider(seriesChannel.providerId);
            if (provider && provider.type === 'xtream') {
                server = provider.server;
                user = provider.user;
                pass = provider.pass;
            }
        }

        if (!sId && seriesChannel.id && seriesChannel.id.startsWith('xtream_series_')) {
            sId = seriesChannel.id.replace('xtream_series_', '');
        }

        if (!server || !user || !pass || !sId) {
            throw new Error('Series ID or Xtream server credentials missing');
        }

        const cleanServer = SecurityController.normalizeServerUrl(server);
        const apiUrl = `${cleanServer}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&action=get_series_info&series_id=${encodeURIComponent(sId)}`;
        const res = await SecurityController.fetchWithFallback(apiUrl, this.useCorsProxy, this.getEffectiveProxyUrl(), this.getEffectiveProxyToken());
        if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
        const data = await res.json();
        return {
            info: data.info || {},
            episodes: data.episodes || {},
            seasons: data.seasons || [],
            server: cleanServer,
            user,
            pass
        };
    }

    /**
     * Opens the TV Series Seasons & Episodes Modal and populates seasons and episodes.
     * 
     * @param {Object} seriesChannel 
     */
    async openSeriesModal(seriesChannel) {
        const modal = document.getElementById('seriesModal');
        if (!modal) return;

        this.uiController.toggleModal('seriesModal');

        const loadingEl = document.getElementById('seriesModalLoading');
        const errorEl = document.getElementById('seriesModalError');
        const contentEl = document.getElementById('seriesModalContent');
        const titleEl = document.getElementById('seriesModalTitle');
        const catEl = document.getElementById('seriesModalCategory');

        if (titleEl) titleEl.textContent = seriesChannel.name || 'TV Series';
        if (catEl) catEl.textContent = seriesChannel.group || 'TV Series';

        if (loadingEl) loadingEl.classList.remove('hidden');
        if (errorEl) errorEl.classList.add('hidden');
        if (contentEl) contentEl.classList.add('hidden');

        const fallbackBtn = document.getElementById('btnSeriesPlayFallback');
        if (fallbackBtn) {
            fallbackBtn.onclick = () => {
                this.uiController.toggleModal('seriesModal');
                this.playDirectStream(seriesChannel);
            };
        }

        try {
            const seriesData = await this.fetchSeriesInfo(seriesChannel);
            if (!seriesData || !seriesData.episodes || Object.keys(seriesData.episodes).length === 0) {
                throw new Error('No seasons or episodes returned by server.');
            }

            if (loadingEl) loadingEl.classList.add('hidden');
            if (contentEl) contentEl.classList.remove('hidden');

            const info = seriesData.info || {};
            const posterEl = document.getElementById('seriesModalPoster');
            const headerTitleEl = document.getElementById('seriesModalHeaderTitle');
            const yearEl = document.getElementById('seriesModalYear');
            const genreEl = document.getElementById('seriesModalGenre');
            const ratingEl = document.getElementById('seriesModalRating');
            const plotEl = document.getElementById('seriesModalPlot');

            if (posterEl) posterEl.src = info.cover || seriesChannel.logo || 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=300&q=80';
            if (headerTitleEl) headerTitleEl.textContent = info.name || seriesChannel.name;
            if (yearEl) yearEl.textContent = info.releaseDate || info.year || 'N/A';
            if (genreEl) genreEl.textContent = info.genre || 'Series';
            if (ratingEl) ratingEl.textContent = info.rating ? `★ ${info.rating}` : '★ N/A';
            if (plotEl) plotEl.textContent = info.plot || info.description || 'No overview available for this series.';

            const seasonsContainer = document.getElementById('seriesSeasonsContainer');
            const episodesContainer = document.getElementById('seriesEpisodesContainer');
            const episodesHeader = document.getElementById('seriesEpisodesHeader');
            const episodesCount = document.getElementById('seriesEpisodesCount');

            if (seasonsContainer) seasonsContainer.innerHTML = '';
            if (episodesContainer) episodesContainer.innerHTML = '';

            const episodesObj = seriesData.episodes;
            const seasonKeys = Object.keys(episodesObj).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

            const renderSeasonEpisodes = (seasonKey) => {
                if (seasonsContainer) {
                    Array.from(seasonsContainer.children).forEach(btn => {
                        const isSelected = btn.dataset.seasonKey === String(seasonKey);
                        btn.className = isSelected
                            ? 'px-4 py-2 bg-rose-600 text-white font-bold text-xs rounded-xl cursor-pointer shrink-0 transition-all shadow-md shadow-rose-900/30'
                            : 'px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl cursor-pointer shrink-0 transition-all border border-slate-700/50';
                    });
                }

                const rawEpList = episodesObj[seasonKey] || [];
                const epList = Array.isArray(rawEpList) ? rawEpList : Object.values(rawEpList);

                if (episodesHeader) episodesHeader.textContent = `Season ${seasonKey} Episodes`;
                if (episodesCount) episodesCount.textContent = `${epList.length} Episode${epList.length === 1 ? '' : 's'}`;

                if (episodesContainer) {
                    episodesContainer.innerHTML = '';
                    if (epList.length === 0) {
                        episodesContainer.innerHTML = `<div class="col-span-full py-6 text-center text-xs text-slate-400">No episodes found for Season ${seasonKey}.</div>`;
                        return;
                    }

                    epList.forEach(ep => {
                        const epNum = ep.episode_num || ep.episode || '1';
                        const epTitle = ep.title || ep.name || `Episode ${epNum}`;
                        const epExt = ep.container_extension || 'mp4';
                        const epStreamUrl = ep.direct_source || `${seriesData.server}/series/${seriesData.user}/${seriesData.pass}/${ep.id}.${epExt}`;
                        const epCover = ep.info?.movie_image || info.cover || seriesChannel.logo || '';

                        const card = document.createElement('div');
                        card.className = 'bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 hover:border-rose-500/50 rounded-xl p-3 flex flex-col justify-between space-y-3 transition-all group cursor-pointer shadow-md';
                        
                        card.innerHTML = `
                            <div class="flex items-start space-x-3">
                                <div class="w-16 h-12 bg-slate-900 rounded-lg border border-slate-700/50 overflow-hidden shrink-0 relative flex items-center justify-center">
                                    ${epCover ? `<img src="${SecurityController.escapeHTML(epCover)}" alt="Ep" class="w-full h-full object-cover" onerror="this.onerror=null; this.style.display='none';">` : ''}
                                    <div class="absolute inset-0 bg-slate-950/40 group-hover:bg-rose-950/30 transition-colors flex items-center justify-center">
                                        <div class="w-7 h-7 rounded-full bg-rose-600/90 text-white flex items-center justify-center shadow-md transform group-hover:scale-110 transition-transform">
                                            <svg class="w-3.5 h-3.5 fill-current ml-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                        </div>
                                    </div>
                                </div>
                                <div class="min-w-0 flex-1">
                                    <div class="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Episode ${epNum}</div>
                                    <h5 class="text-xs font-semibold text-white group-hover:text-rose-300 transition-colors truncate" title="${SecurityController.escapeHTML(epTitle)}">${SecurityController.escapeHTML(epTitle)}</h5>
                                    ${ep.info?.duration ? `<div class="text-[10px] text-slate-400 font-mono mt-0.5">${SecurityController.escapeHTML(ep.info.duration)}</div>` : ''}
                                </div>
                            </div>
                            <button class="w-full py-1.5 bg-rose-600/20 group-hover:bg-rose-600 text-rose-300 group-hover:text-white font-bold rounded-lg text-xs transition-colors flex items-center justify-center space-x-1.5">
                                <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                <span>Play Episode ${epNum}</span>
                            </button>
                        `;

                        card.onclick = () => {
                            const epChannel = {
                                id: `xtream_ep_${ep.id}`,
                                name: `${info.name || seriesChannel.name} - S${String(seasonKey).padStart(2, '0')}E${String(epNum).padStart(2, '0')} - ${epTitle}`,
                                url: epStreamUrl,
                                logo: epCover,
                                group: seriesChannel.group || 'TV Series',
                                type: 'series'
                            };
                            this.uiController.toggleModal('seriesModal');
                            this.playDirectStream(epChannel);
                        };

                        episodesContainer.appendChild(card);
                    });
                }
            };

            seasonKeys.forEach((sKey) => {
                const btn = document.createElement('button');
                btn.dataset.seasonKey = String(sKey);
                btn.textContent = `Season ${sKey}`;
                btn.onclick = () => renderSeasonEpisodes(sKey);
                seasonsContainer.appendChild(btn);
            });

            if (seasonKeys.length > 0) {
                renderSeasonEpisodes(seasonKeys[0]);
            }

        } catch (err) {
            console.error('[SeriesModal] Error fetching series info:', err);
            if (loadingEl) loadingEl.classList.add('hidden');
            if (errorEl) {
                errorEl.classList.remove('hidden');
                const msgEl = document.getElementById('seriesModalErrorMsg');
                if (msgEl) msgEl.textContent = `Could not load seasons: ${err.message || 'Server error'}`;
            }
        }
    }

    /**
     * Fetches VOD movie metadata (poster, plot, cast, director, rating) from Xtream Codes API.
     * 
     * @param {Object} movieChannel 
     * @returns {Promise<Object>}
     */
    async fetchVodInfo(movieChannel) {
        let server = movieChannel.xtreamServer;
        let user = movieChannel.xtreamUser;
        let pass = movieChannel.xtreamPass;
        let vId = movieChannel.vodId || movieChannel.streamId;

        if ((!server || !user || !pass) && movieChannel.providerId) {
            const provider = this.iptvCore.getProvider(movieChannel.providerId);
            if (provider && provider.type === 'xtream') {
                server = provider.server;
                user = provider.user;
                pass = provider.pass;
            }
        }

        if (!vId && movieChannel.id && movieChannel.id.startsWith('xtream_vod_')) {
            vId = movieChannel.id.replace('xtream_vod_', '');
        }

        if (!server || !user || !pass || !vId) {
            throw new Error('VOD ID or Xtream server credentials missing');
        }

        const cleanServer = SecurityController.normalizeServerUrl(server);
        const apiUrl = `${cleanServer}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&action=get_vod_info&vod_id=${encodeURIComponent(vId)}`;
        const res = await SecurityController.fetchWithFallback(apiUrl, this.useCorsProxy, this.getEffectiveProxyUrl(), this.getEffectiveProxyToken());
        if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
        const data = await res.json();
        return {
            info: data.info || {},
            movieData: data.movie_data || {},
            server: cleanServer,
            user,
            pass
        };
    }

    /**
     * Opens VOD Movie Details modal with metadata, plot, cast, and play button.
     * 
     * @param {Object} movieChannel 
     */
    async openMovieModal(movieChannel) {
        const modal = document.getElementById('movieModal');
        if (!modal) return;

        this.uiController.toggleModal('movieModal');

        const loadingEl = document.getElementById('movieModalLoading');
        const contentEl = document.getElementById('movieModalContent');
        const titleEl = document.getElementById('movieModalTitle');
        const catEl = document.getElementById('movieModalCategory');

        if (titleEl) titleEl.textContent = movieChannel.name || 'Movie Details';
        if (catEl) catEl.textContent = movieChannel.group || 'VOD Movie';

        if (loadingEl) loadingEl.classList.remove('hidden');
        if (contentEl) contentEl.classList.add('hidden');

        const playBtn = document.getElementById('btnPlayMovieNow');
        if (playBtn) {
            playBtn.onclick = () => {
                this.uiController.toggleModal('movieModal');
                this.playDirectStream(movieChannel);
            };
        }

        try {
            const vodData = await this.fetchVodInfo(movieChannel);
            const info = vodData.info || {};

            if (loadingEl) loadingEl.classList.add('hidden');
            if (contentEl) contentEl.classList.remove('hidden');

            const posterEl = document.getElementById('movieModalPoster');
            const headerTitleEl = document.getElementById('movieModalHeaderTitle');
            const yearEl = document.getElementById('movieModalYear');
            const genreEl = document.getElementById('movieModalGenre');
            const ratingEl = document.getElementById('movieModalRating');
            const durationEl = document.getElementById('movieModalDuration');
            const directorEl = document.getElementById('movieModalDirector');
            const castEl = document.getElementById('movieModalCast');
            const plotEl = document.getElementById('movieModalPlot');

            if (posterEl) posterEl.src = info.movie_image || movieChannel.logo || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=300&q=80';
            if (headerTitleEl) headerTitleEl.textContent = info.name || movieChannel.name;
            if (yearEl) yearEl.textContent = info.releasedate || info.year || 'N/A';
            if (genreEl) genreEl.textContent = info.genre || movieChannel.group || 'Movie';
            if (ratingEl) ratingEl.textContent = info.rating ? `★ ${info.rating}` : '★ N/A';
            if (durationEl) durationEl.textContent = info.duration ? info.duration : (info.duration_secs ? `${Math.round(info.duration_secs / 60)}m` : 'N/A');
            if (directorEl) directorEl.textContent = info.director || 'N/A';
            if (castEl) castEl.textContent = info.cast || 'N/A';
            if (plotEl) plotEl.textContent = info.plot || info.description || 'No plot summary available for this movie.';

        } catch (err) {
            console.warn('[MovieModal] Could not fetch detailed VOD info, displaying basic channel info:', err);
            if (loadingEl) loadingEl.classList.add('hidden');
            if (contentEl) contentEl.classList.remove('hidden');

            const posterEl = document.getElementById('movieModalPoster');
            const headerTitleEl = document.getElementById('movieModalHeaderTitle');
            if (posterEl) posterEl.src = movieChannel.logo || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=300&q=80';
            if (headerTitleEl) headerTitleEl.textContent = movieChannel.name;
        }
    }

    /**
     * Fetches user subscription details & server info from Xtream Codes API.
     * 
     * @param {string} serverUrl 
     * @param {string} user 
     * @param {string} pass 
     * @returns {Promise<Object|null>}
     */
    async fetchXtreamUserInfo(serverUrl, user, pass) {
        try {
            const cleanServer = SecurityController.normalizeServerUrl(serverUrl);
            const apiUrl = `${cleanServer}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;
            const res = await SecurityController.fetchWithFallback(apiUrl, this.useCorsProxy, this.getEffectiveProxyUrl(), this.getEffectiveProxyToken());
            if (!res.ok) return null;
            const data = await res.json();

            if (data.user_info) {
                const u = data.user_info;
                let expStr = 'Unlimited';
                if (u.exp_date && u.exp_date !== 'null' && u.exp_date !== 'Unlimited') {
                    const ts = parseInt(u.exp_date, 10);
                    if (!isNaN(ts) && ts > 0) {
                        expStr = new Date(ts * 1000).toLocaleDateString();
                    } else {
                        expStr = String(u.exp_date);
                    }
                }
                return {
                    status: u.status || 'Active',
                    expDate: expStr,
                    maxCons: u.max_connections || '1',
                    activeCons: u.active_cons || '0',
                    isTrial: u.is_trial === '1' || u.is_trial === 1,
                    auth: u.auth === 1 || u.auth === '1'
                };
            }
            return null;
        } catch (e) {
            console.warn('[Xtream] Could not fetch user account info:', e);
            return null;
        }
    }

    /**
     * Plays the next channel in the current category/filter list.
     */
    playNextChannel() {
        const query = document.getElementById('searchInput')?.value || '';
        const hideAdult = this.uiController.isParentalLocked();
        const channels = this.iptvCore.getFilteredChannels(this.activeCategory, query, hideAdult, this.activeType, this.sortMode);
        if (channels && channels.length > 0) {
            const currentIndex = channels.findIndex(ch => ch.id === this.activeChannel?.id);
            const nextIndex = currentIndex < channels.length - 1 ? currentIndex + 1 : 0;
            if (channels[nextIndex]) {
                this.playChannel(channels[nextIndex]);
            }
        }
    }

    /**
     * Plays the previous channel in the current category/filter list.
     */
    playPreviousChannel() {
        const query = document.getElementById('searchInput')?.value || '';
        const hideAdult = this.uiController.isParentalLocked();
        const channels = this.iptvCore.getFilteredChannels(this.activeCategory, query, hideAdult, this.activeType, this.sortMode);
        if (channels && channels.length > 0) {
            const currentIndex = channels.findIndex(ch => ch.id === this.activeChannel?.id);
            const prevIndex = currentIndex > 0 ? currentIndex - 1 : channels.length - 1;
            if (channels[prevIndex]) {
                this.playChannel(channels[prevIndex]);
            }
        }
    }

    /**
     * Dynamically adjusts multi-screen grid layout (1, 2, 3, or 4 screens) based on pinned channels.
     */
    updateMultiScreenLayout() {
        // Collect explicitly pinned non-null channels
        const pinned = this.quadSlots.filter(Boolean);

        // Determine channels to display in multi-screen mode
        let channelsToDisplay = [];
        if (pinned.length > 0) {
            channelsToDisplay = pinned;
        } else if (this.activeChannel) {
            channelsToDisplay = [this.activeChannel];
        }

        // Active screens count is 1, 2, 3, or 4
        const count = Math.min(4, Math.max(1, channelsToDisplay.length));

        // Update header title in multiViewContainer
        const headerTitle = document.getElementById('multiViewHeaderTitle');
        if (headerTitle) {
            const titles = {
                1: '1-Screen View',
                2: '2-Screen Dual View',
                3: '3-Screen Multi View',
                4: '2x2 Quad View'
            };
            headerTitle.textContent = titles[count] || 'Multi-Screen View';
        }

        // Update toggle button title on player control bar
        const toggleBtn = document.getElementById('btnToggleMultiView');
        if (toggleBtn) {
            const titles = {
                1: '1-Screen View',
                2: '2-Screen Dual View',
                3: '3-Screen Multi View',
                4: '2x2 Quad View'
            };
            toggleBtn.title = `Toggle Multi-Screen (${titles[count] || 'Multi-Screen'})`;
        }

        // Update multiViewGrid CSS grid classes
        const grid = document.getElementById('multiViewGrid');
        if (grid) {
            const gridClasses = {
                1: 'flex-1 min-h-0 h-full w-full grid grid-cols-1 grid-rows-1 gap-1.5 p-1.5 bg-slate-950 overflow-hidden',
                2: 'flex-1 min-h-0 h-full w-full grid grid-cols-2 grid-rows-1 gap-1.5 p-1.5 bg-slate-950 overflow-hidden',
                3: 'flex-1 min-h-0 h-full w-full grid grid-cols-2 grid-rows-2 gap-1.5 p-1.5 bg-slate-950 overflow-hidden',
                4: 'flex-1 min-h-0 h-full w-full grid grid-cols-2 grid-rows-2 gap-1.5 p-1.5 bg-slate-950 overflow-hidden'
            };
            grid.className = gridClasses[count] || gridClasses[4];
        }

        // Update slot boxes visibility, titles, and video streams
        for (let i = 0; i < 4; i++) {
            const slotBox = document.querySelector(`.quad-slot-box[data-slot-index="${i}"]`);
            const video = document.getElementById(`multiVideo${i + 1}`);
            const titleEl = document.getElementById(`slotTitle${i}`);

            if (i < count) {
                if (slotBox) {
                    slotBox.classList.remove('hidden');
                    if (count === 3 && i === 2) {
                        slotBox.classList.add('col-span-2');
                    } else {
                        slotBox.classList.remove('col-span-2');
                    }
                }
                const ch = channelsToDisplay[i];
                if (ch) {
                    if (video) {
                        const proxiedUrl = this.useCorsProxy ? SecurityController.buildProxyURL(ch.url, this.getEffectiveProxyUrl()) : ch.url;
                        if (video.src !== proxiedUrl) {
                            video.src = proxiedUrl;
                        }
                        if (this.isMultiViewActive) {
                            video.play().catch(() => {});
                        }
                    }
                    if (titleEl) titleEl.textContent = ch.name;
                } else {
                    if (titleEl) titleEl.textContent = 'Empty';
                }
            } else {
                if (slotBox) {
                    slotBox.classList.add('hidden');
                    slotBox.classList.remove('col-span-2');
                }
                if (video) {
                    video.pause();
                    video.removeAttribute('src');
                    video.load();
                }
            }
        }

        if (this.activeQuadSlotIndex >= count) {
            this.highlightActiveQuadSlot(0);
        } else {
            this.highlightActiveQuadSlot(this.activeQuadSlotIndex);
        }

        this.updatePinButtonState();
    }

    /**
     * Switches between Single View and Multi-Screen View.
     * @param {'single'|'quad'} mode 
     */
    switchViewMode(mode) {
        const single = document.getElementById('singlePlayerContainer');
        const quad = document.getElementById('multiViewContainer');
        if (!single || !quad) return;

        if (mode === 'quad') {
            this.isMultiViewActive = true;
            single.classList.add('hidden');
            quad.classList.remove('hidden');

            this.streamEngine.setMuted(true);
            this.updateMultiScreenLayout();
            this.highlightActiveQuadSlot(this.activeQuadSlotIndex);
            this.uiController.showToast(`Multi-Screen View Active (Audio: Screen ${this.activeQuadSlotIndex + 1})`, 'info');
        } else {
            this.isMultiViewActive = false;
            quad.classList.add('hidden');
            single.classList.remove('hidden');

            for (let i = 1; i <= 4; i++) {
                const video = document.getElementById(`multiVideo${i}`);
                if (video) {
                    video.pause();
                    video.muted = true;
                }
            }

            this.streamEngine.setMuted(false);

            const targetChannel = this.quadSlots[this.activeQuadSlotIndex] || this.activeChannel;
            if (targetChannel) {
                this.playChannel(targetChannel);
            }

            this.uiController.showToast('Returned to Single View', 'info');
        }
    }

    /**
     * Highlights target quad slot index, updates indicator, and routes audio strictly to the focused stream.
     * @param {number} index 0..3
     */
    highlightActiveQuadSlot(index) {
        this.activeQuadSlotIndex = index;
        const slotBoxes = document.querySelectorAll('.quad-slot-box');
        slotBoxes.forEach((box, i) => {
            if (i === index) {
                box.classList.add('border-2', 'border-rose-500', 'shadow-md');
                box.classList.remove('border-slate-800');
            } else {
                box.classList.remove('border-2', 'border-rose-500', 'shadow-md');
                box.classList.add('border-slate-800');
            }
        });

        const activeSlotIndicator = document.getElementById('activeSlotIndicator');
        if (activeSlotIndicator) {
            activeSlotIndicator.textContent = `Target: Screen ${index + 1}`;
        }

        // Route sound strictly to the stream on focus in multi-screen mode
        if (this.isMultiViewActive) {
            this.streamEngine.setMuted(true);

            for (let i = 0; i < 4; i++) {
                const video = document.getElementById(`multiVideo${i + 1}`);
                if (video) {
                    if (i === index) {
                        video.muted = false;
                        video.volume = 1.0;
                    } else {
                        video.muted = true;
                    }
                }

                const audioBtn = document.querySelector(`.btn-audio-slot[data-audio-slot="${i}"]`);
                if (audioBtn) {
                    if (i === index) {
                        audioBtn.classList.add('bg-emerald-600', 'text-white', 'ring-1', 'ring-emerald-400');
                        audioBtn.classList.remove('bg-slate-900/90', 'text-slate-400');
                        audioBtn.title = `Audio Active for Screen ${i + 1}`;
                    } else {
                        audioBtn.classList.remove('bg-emerald-600', 'ring-1', 'ring-emerald-400');
                        audioBtn.classList.add('bg-slate-900/90', 'text-slate-400');
                        audioBtn.title = `Enable Audio for Screen ${i + 1}`;
                    }
                }
            }
        }
    }

    /**
     * Pins active single player channel to specified quad slot or prompts slot selection if full.
     * @param {number} [slotIndex] 0..3
     */
    pinChannelToSlot(slotIndex) {
        if (!this.activeChannel) {
            this.uiController.showToast('No active channel to pin', 'warning');
            return;
        }

        const channel = this.activeChannel;
        // Check if channel is already pinned
        if (this.isChannelPinned(channel)) {
            this.uiController.showToast(`"${channel.name}" is already pinned`, 'info');
            return;
        }

        const occupiedCount = this.quadSlots.filter(Boolean).length;

        if (slotIndex !== undefined && slotIndex >= 0 && slotIndex < 4) {
            const prevChannel = this.quadSlots[slotIndex];
            this.quadSlots[slotIndex] = channel;
            this.updateMultiScreenLayout();
            if (prevChannel) {
                this.uiController.showToast(`Replaced Screen ${slotIndex + 1} with "${channel.name}"`, 'success');
            } else {
                this.uiController.showToast(`Pinned "${channel.name}" to Screen ${slotIndex + 1}`, 'success');
            }
        } else {
            if (occupiedCount >= 4) {
                const pinSlotMenu = document.getElementById('pinSlotMenu');
                if (pinSlotMenu) {
                    pinSlotMenu.classList.remove('hidden');
                    this.updatePinButtonState();
                }
                this.uiController.showToast('All 4 slots occupied. Select a slot to replace.', 'info');
                return;
            }

            const emptyIdx = this.quadSlots.findIndex(s => s === null);
            const targetIdx = emptyIdx !== -1 ? emptyIdx : 0;
            this.quadSlots[targetIdx] = channel;
            this.updateMultiScreenLayout();
            this.uiController.showToast(`Pinned "${channel.name}" to Screen ${targetIdx + 1}`, 'success');
        }
    }

    /**
     * Checks if a channel is currently pinned in any quad slot.
     * @param {Object} [channel] 
     * @returns {boolean}
     */
    isChannelPinned(channel = this.activeChannel) {
        if (!channel) return false;
        return this.quadSlots.some(s => s && (s.id === channel.id || s.url === channel.url));
    }

    /**
     * Unpins a channel from all quad slots where it is loaded.
     * @param {Object} [channel] 
     */
    unpinChannel(channel = this.activeChannel) {
        if (!channel) return;
        let unpinnedCount = 0;
        this.quadSlots.forEach((slot, idx) => {
            if (slot && (slot.id === channel.id || slot.url === channel.url)) {
                this.quadSlots[idx] = null;
                unpinnedCount++;
            }
        });

        if (unpinnedCount > 0) {
            this.uiController.showToast(`Unpinned "${channel.name}" from Multi-Screen`, 'info');
        } else {
            this.uiController.showToast(`Channel "${channel.name}" is not pinned`, 'warning');
        }

        this.updateMultiScreenLayout();
    }

    /**
     * Updates the Pin/Unpin button UI according to active channel's pinned state.
     */
    updatePinButtonState() {
        const btnPin = document.getElementById('btnPinToMulti');
        const pinSlotMenu = document.getElementById('pinSlotMenu');
        if (!btnPin) return;

        const isPinned = this.isChannelPinned(this.activeChannel);
        const occupiedCount = this.quadSlots.filter(Boolean).length;

        if (isPinned) {
            btnPin.innerHTML = `
                <svg class="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 17v5m-3.5-9.5L7 11V6l2-2h6l2 2v5l-1.5 1.5M7 11h10M3 3l18 18"></path></svg>
            `;
            btnPin.className = "p-2 rounded-xl bg-slate-900/90 border border-rose-500/50 text-rose-400 hover:bg-rose-950/60 hover:text-rose-300 cursor-pointer transition-all shadow-md shadow-rose-950/20";
            btnPin.title = "Unpin active channel from Multi-Screen";
        } else {
            btnPin.innerHTML = `
                <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 17v5m-3.5-9.5L7 11V6l2-2h6l2 2v5l-1.5 1.5M7 11h10"></path></svg>
            `;
            btnPin.className = "p-2 rounded-xl bg-slate-900/90 border border-slate-700/80 text-amber-400 hover:bg-amber-950/60 hover:text-amber-300 cursor-pointer transition-all";
            btnPin.title = occupiedCount >= 4 ? "Multi-Screen Full - Select Slot to Replace" : "Pin Active Channel to Multi-Screen Slot";
        }

        if (pinSlotMenu) {
            const menuHeader = document.getElementById('pinSlotMenuHeader');
            if (menuHeader) {
                if (occupiedCount >= 4 && !isPinned) {
                    menuHeader.textContent = "All 4 Slots Full - Select Slot To Replace:";
                    menuHeader.className = "text-[10px] font-bold text-amber-400 uppercase tracking-wider px-2 py-1 border-b border-slate-800";
                } else {
                    menuHeader.textContent = "Pin Channel To Slot:";
                    menuHeader.className = "text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1 border-b border-slate-800";
                }
            }

            const buttons = pinSlotMenu.querySelectorAll('.btn-pin-slot');
            buttons.forEach((btn) => {
                const slotIdx = parseInt(btn.dataset.pinSlot || '0', 10);
                const slotChannel = this.quadSlots[slotIdx];
                const slotNameSpan = btn.querySelector('span:first-child');
                const slotTagSpan = btn.querySelector('span:last-child');
                
                if (this.activeChannel && slotChannel && (slotChannel.id === this.activeChannel.id || slotChannel.url === this.activeChannel.url)) {
                    if (slotNameSpan) slotNameSpan.textContent = `Screen ${slotIdx + 1} (Pinned)`;
                    if (slotTagSpan) {
                        slotTagSpan.textContent = 'Unpin';
                        slotTagSpan.className = 'text-[9px] text-rose-400 font-bold uppercase';
                    }
                } else {
                    if (slotNameSpan) slotNameSpan.textContent = `Screen ${slotIdx + 1}${slotIdx === 0 ? ' (Main)' : ''}`;
                    if (slotTagSpan) {
                        if (occupiedCount >= 4 && !isPinned) {
                            slotTagSpan.textContent = slotChannel ? `Replace (${slotChannel.name})` : `Slot ${slotIdx + 1}`;
                            slotTagSpan.className = 'text-[9px] text-amber-400 font-bold truncate max-w-[110px]';
                        } else {
                            slotTagSpan.textContent = slotChannel ? slotChannel.name : `Slot ${slotIdx + 1}`;
                            slotTagSpan.className = 'text-[9px] text-amber-400 font-mono truncate max-w-[90px]';
                        }
                    }
                }
            });
        }
    }

    /**
     * Updates Play/Pause button icons.
     * @param {boolean} isPaused 
     */
    updatePlayPauseIcons(isPaused) {
        const iconPlay = document.getElementById('iconPlay');
        const iconPause = document.getElementById('iconPause');
        if (iconPlay && iconPause) {
            if (isPaused) {
                iconPlay.classList.remove('hidden');
                iconPause.classList.add('hidden');
            } else {
                iconPlay.classList.add('hidden');
                iconPause.classList.remove('hidden');
            }
        }
    }

    /**
     * Updates Mute/Volume button icons and popup controls.
     * @param {boolean} isMuted 
     */
    updateAudioIcons(isMuted) {
        const iconMute = document.getElementById('iconMute');
        const iconVolume = document.getElementById('iconVolume');
        const volumePercent = document.getElementById('volumePercent');
        const btnPopupMute = document.getElementById('btnPopupMute');
        const volumeSlider = document.getElementById('volumeSlider');

        const currentVol = this.streamEngine ? this.streamEngine.volume : 1;
        const effectiveMuted = isMuted || currentVol === 0;

        const popupIconMute = document.getElementById('popupIconMute');
        const popupIconVolume = document.getElementById('popupIconVolume');

        if (iconMute && iconVolume) {
            if (effectiveMuted) {
                iconMute.classList.remove('hidden');
                iconVolume.classList.add('hidden');
            } else {
                iconMute.classList.add('hidden');
                iconVolume.classList.remove('hidden');
            }
        }

        if (popupIconMute && popupIconVolume) {
            if (effectiveMuted) {
                popupIconMute.classList.remove('hidden');
                popupIconVolume.classList.add('hidden');
            } else {
                popupIconMute.classList.add('hidden');
                popupIconVolume.classList.remove('hidden');
            }
        }

        if (volumePercent) {
            const displayVol = effectiveMuted ? 0 : currentVol;
            volumePercent.textContent = `${Math.round(displayVol * 100)}%`;
        }

        if (volumeSlider && document.activeElement !== volumeSlider) {
            volumeSlider.value = effectiveMuted ? '0' : currentVol.toString();
        }

        if (btnPopupMute) {
            btnPopupMute.title = effectiveMuted ? 'Unmute Audio' : 'Mute Audio';
            btnPopupMute.setAttribute('aria-label', effectiveMuted ? 'Unmute Audio' : 'Mute Audio');
        }
    }

    /**
     * Formats seconds into MM:SS or HH:MM:SS format string.
     * @param {number} sec 
     * @returns {string}
     */
    formatTimeSec(sec) {
        if (isNaN(sec) || !isFinite(sec) || sec < 0) return '00:00';
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        if (h > 0) {
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    /**
     * Refreshes category pills and channel grid cards.
     */
    renderUI() {
        let categories = this.iptvCore.getCategories(this.activeType);
        const searchInput = document.getElementById('searchInput');
        const query = searchInput ? searchInput.value : '';

        const hideAdult = this.uiController.isParentalLocked();

        if (query && query.trim()) {
            const searchRes = this.iptvCore.searchCategoriesAndChannels(query, hideAdult, this.activeType);

            // Render category pills with channel counts when searching
            const matchingCats = searchRes.categories;
            categories = [
                { name: 'All', count: searchRes.channels.length },
                ...matchingCats
            ];

            // If activeCategory is not in matching categories and not 'All' / 'Favorites' / 'Recently Watched', fall back to 'All'
            if (this.activeCategory !== 'All' && this.activeCategory !== 'Favorites' && this.activeCategory !== 'Recently Watched') {
                const matchesCurrentCat = matchingCats.some(c => c.name === this.activeCategory);
                if (!matchesCurrentCat) {
                    this.activeCategory = 'All';
                }
            }

            // Render search dropdown overlay
            this.uiController.renderSearchDropdown(
                searchRes.categories,
                searchRes.channels,
                (catName) => {
                    this.activeCategory = catName;
                    try {
                        localStorage.setItem(`tellyx_last_category_${this.activeType}`, catName);
                        localStorage.setItem('tellyx_last_category', catName);
                    } catch (e) {
                        console.warn('[App] Error saving last category:', e);
                    }
                    this.renderUI();
                },
                (channel) => {
                    this.playChannel(channel);
                }
            );
        } else {
            this.uiController.renderSearchDropdown([], [], () => {}, () => {});
        }

        const filteredChannels = this.iptvCore.getChannels(this.activeCategory, query, hideAdult, this.activeType, this.sortMode);

        this.uiController.renderCategories(categories, this.activeCategory, (cat) => {
            this.activeCategory = cat;
            try {
                localStorage.setItem(`tellyx_last_category_${this.activeType}`, cat);
                localStorage.setItem('tellyx_last_category', cat);
            } catch (e) {
                console.warn('[App] Error saving last category:', e);
            }
            this.renderUI();
        });

        this.uiController.renderChannels(
            filteredChannels,
            (id) => this.iptvCore.isFavorite(id),
            (tvgId, name) => this.epgEngine.getCurrentProgram(tvgId, name),
            this.activeChannel ? this.activeChannel.id : null
        );

        this.uiController.updateTotalChannelsBadge(this.iptvCore.totalChannels);

        // Update active type badge in top header
        const typeBadge = document.getElementById('activeTypeBadge');
        if (typeBadge) {
            const labels = { live: 'Live TV Mode', movie: 'VOD Movies Mode', series: 'TV Series Mode' };
            typeBadge.textContent = labels[this.activeType] || 'Live TV Mode';
        }

        // Toggle EPG button visibility in header (only show for Live TV channels)
        const isLiveMode = this.activeType === 'live';
        const btnOpenEPG = document.getElementById('btnOpenEPG');
        if (btnOpenEPG) {
            btnOpenEPG.classList.toggle('hidden', !isLiveMode);
        }
        const btnPlayerEPG = document.getElementById('btnPlayerEPG');
        if (btnPlayerEPG) {
            btnPlayerEPG.classList.toggle('hidden', !isLiveMode);
        }

        // Update Pin/Unpin button state according to active channel
        this.updatePinButtonState();

        // Update Now Playing banner favorite icon button state
        if (this.activeChannel) {
            this.uiController.updateNowPlayingFavState(this.iptvCore.isFavorite(this.activeChannel.id));
        }

        // Synchronize EPG controls and pre-render EPG matrix for the current category ONLY if EPG modal is currently visible
        if (isLiveMode) {
            this.populateEpgControls();
            const epgModal = document.getElementById('epgModal');
            if (epgModal && !epgModal.classList.contains('hidden')) {
                this.renderEPGGrid(false);
            }
        }
    }

    /**
     * Fetches Live Streams, VOD Movies, Series, and Category Mappings from Xtream Codes API.
     * Falls back to M3U_Plus (get.php) if player_api.php yields no streams.
     * 
     * @param {string} serverUrl - Cleaned server URL
     * @param {string} user - Xtream username
     * @param {string} pass - Xtream password
     * @returns {Promise<Array<Object>>} Combined list of channels with category & type metadata.
     */
    async fetchXtreamChannels(serverUrl, user, pass) {
        const cleanServer = SecurityController.normalizeServerUrl(serverUrl);
        const safeFetchJson = async (action) => {
            try {
                const targetUrl = `${cleanServer}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&action=${action}`;
                const res = await SecurityController.fetchWithFallback(targetUrl, this.useCorsProxy, this.getEffectiveProxyUrl(), this.getEffectiveProxyToken());
                if (!res.ok) return [];
                const data = await res.json();
                return Array.isArray(data) ? data : [];
            } catch (e) {
                console.warn(`[Xtream] Action ${action} fetch notice:`, e);
                return [];
            }
        };

        // Parallel fetch of categories and stream collections
        const [liveCats, vodCats, seriesCats, liveStreams, vodStreams, seriesStreams] = await Promise.all([
            safeFetchJson('get_live_categories'),
            safeFetchJson('get_vod_categories'),
            safeFetchJson('get_series_categories'),
            safeFetchJson('get_live_streams'),
            safeFetchJson('get_vod_streams'),
            safeFetchJson('get_series')
        ]);

        // Category maps: category_id -> category_name
        const liveCatMap = {};
        liveCats.forEach(c => {
            if (c && c.category_id && c.category_name) liveCatMap[String(c.category_id)] = c.category_name;
        });

        const vodCatMap = {};
        vodCats.forEach(c => {
            if (c && c.category_id && c.category_name) vodCatMap[String(c.category_id)] = c.category_name;
        });

        const seriesCatMap = {};
        seriesCats.forEach(c => {
            if (c && c.category_id && c.category_name) seriesCatMap[String(c.category_id)] = c.category_name;
        });

        // 1. Live TV
        const liveChannels = liveStreams.map(item => {
            const catName = liveCatMap[String(item.category_id)] || item.category_name || 'Xtream Live';
            const ext = item.container_extension || 'm3u8';
            return {
                id: `xtream_live_${item.stream_id}`,
                streamId: item.stream_id,
                name: item.name || 'Live Channel',
                group: catName,
                url: `${cleanServer}/live/${user}/${pass}/${item.stream_id}.${ext}`,
                logo: item.stream_icon || '',
                tvgId: item.epg_channel_id || '',
                type: 'live',
                xtreamServer: cleanServer,
                xtreamUser: user,
                xtreamPass: pass
            };
        });

        // 2. VOD Movies
        const vodChannels = vodStreams.map(item => {
            const catName = vodCatMap[String(item.category_id)] || item.category_name || 'VOD Movies';
            const ext = item.container_extension || 'mp4';
            return {
                id: `xtream_vod_${item.stream_id}`,
                vodId: item.stream_id,
                streamId: item.stream_id,
                name: item.name || 'Movie',
                group: catName,
                url: `${cleanServer}/movie/${user}/${pass}/${item.stream_id}.${ext}`,
                logo: item.stream_icon || '',
                type: 'movie',
                xtreamServer: cleanServer,
                xtreamUser: user,
                xtreamPass: pass
            };
        });

        // 3. Series
        const seriesChannels = seriesStreams.map(item => {
            const catName = seriesCatMap[String(item.category_id)] || item.category_name || 'TV Series';
            const sId = item.series_id || item.stream_id;
            const ext = item.container_extension || 'mp4';
            return {
                id: `xtream_series_${sId}`,
                seriesId: sId,
                name: item.name || 'Series',
                group: catName,
                url: `${cleanServer}/series/${user}/${pass}/${sId}.${ext}`,
                logo: item.cover || item.stream_icon || '',
                type: 'series',
                xtreamServer: cleanServer,
                xtreamUser: user,
                xtreamPass: pass
            };
        });

        let result = [...liveChannels, ...vodChannels, ...seriesChannels];

        // Fallback to M3U_Plus (get.php) if JSON API returned 0 items
        if (result.length === 0) {
            console.log('[Xtream] JSON API returned 0 items. Falling back to M3U_Plus (get.php)...');
            const m3uUrl = `${cleanServer}/get.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&type=m3u_plus`;
            const res = await SecurityController.fetchWithFallback(m3uUrl, this.useCorsProxy, this.getEffectiveProxyUrl(), this.getEffectiveProxyToken());
            if (!res.ok) throw new Error(`Xtream connection error (HTTP ${res.status})`);
            const text = await res.text();
            result = this.iptvCore.parseM3U(text);
        }

        return result;
    }

    /**
     * Binds DOM interactive controls, themes, quad view, DVR, and form handlers.
     */
    bindEvents() {
        // Theme switching handler
        document.getElementById('themeSelect')?.addEventListener('change', (e) => {
            const theme = e.target.value;
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('iptv_theme_v1', theme);
            this.uiController.showToast(`Applied Theme: ${theme.toUpperCase()}`, 'success');
        });

        // Content Type Switcher (Live TV, Movies, Series)
        const btnLive = document.getElementById('typeLiveTv');
        const btnMovies = document.getElementById('typeMovies');
        const btnSeries = document.getElementById('typeSeries');

        this.updateTypeButtonsUI();

        btnLive?.addEventListener('click', () => this.switchContentTypeMode('live'));
        btnMovies?.addEventListener('click', () => this.switchContentTypeMode('movie'));
        btnSeries?.addEventListener('click', () => this.switchContentTypeMode('series'));

        document.getElementById('btnHeaderOpenPlaylist')?.addEventListener('click', () => {
            this.uiController.toggleModal('playlistModal');
        });

        // Playlist Modal Tab Switcher
        const tabM3u = document.getElementById('tabM3u');
        const tabXtream = document.getElementById('tabXtream');
        const tabFile = document.getElementById('tabFile');
        const paneM3u = document.getElementById('paneM3u');
        const paneXtream = document.getElementById('paneXtream');
        const paneFile = document.getElementById('paneFile');

        const switchPlaylistTab = (tab) => {
            [paneM3u, paneXtream, paneFile].forEach(p => p?.classList.add('hidden'));
            [tabM3u, tabXtream, tabFile].forEach(t => {
                if (t) t.className = 'flex-1 py-1.5 text-xs font-semibold text-slate-400 hover:text-white rounded-lg cursor-pointer transition-all';
            });

            if (tab === 'm3u') {
                paneM3u?.classList.remove('hidden');
                if (tabM3u) tabM3u.className = 'flex-1 py-1.5 text-xs font-semibold text-white bg-rose-600 rounded-lg cursor-pointer transition-all';
            } else if (tab === 'xtream') {
                paneXtream?.classList.remove('hidden');
                if (tabXtream) tabXtream.className = 'flex-1 py-1.5 text-xs font-semibold text-white bg-rose-600 rounded-lg cursor-pointer transition-all';
            } else if (tab === 'file') {
                paneFile?.classList.remove('hidden');
                if (tabFile) tabFile.className = 'flex-1 py-1.5 text-xs font-semibold text-white bg-rose-600 rounded-lg cursor-pointer transition-all';
            }
        };

        tabM3u?.addEventListener('click', () => switchPlaylistTab('m3u'));
        tabXtream?.addEventListener('click', () => switchPlaylistTab('xtream'));
        tabFile?.addEventListener('click', () => switchPlaylistTab('file'));

        // Sort Selector
        const sortSelect = document.getElementById('sortChannelsSelect') || document.getElementById('sortSelect');
        sortSelect?.addEventListener('change', (e) => {
            this.sortMode = e.target.value;
            localStorage.setItem('tellyx_sort_mode', this.sortMode);
            const epgSortSelect = document.getElementById('epgSortSelect');
            if (epgSortSelect) epgSortSelect.value = this.sortMode;
            this.renderUI();
            const epgModal = document.getElementById('epgModal');
            if (epgModal && !epgModal.classList.contains('hidden')) {
                this.renderEPGGrid(true);
            }
            this.uiController.showToast(`Sorted by: ${e.target.value.replace('favorites', 'Favorites First').replace('name', 'Name (A-Z)').replace('group', 'Group Title').replace('default', 'Default Order')}`, 'info');
        });

        // Search Input listeners
        const searchInput = document.getElementById('searchInput');
        const btnClearSearch = document.getElementById('btnClearSearch');
        const searchResultsDropdown = document.getElementById('searchResultsDropdown');

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const val = searchInput.value;
                const epgSearchInput = document.getElementById('epgSearchInput');
                if (epgSearchInput) {
                    epgSearchInput.value = val;
                    const epgBtnClearSearch = document.getElementById('epgBtnClearSearch');
                    if (epgBtnClearSearch) epgBtnClearSearch.classList.toggle('hidden', !val);
                }
                this.renderUI();
                const epgModal = document.getElementById('epgModal');
                if (epgModal && !epgModal.classList.contains('hidden')) {
                    this.renderEPGGrid(true);
                }
            });
            searchInput.addEventListener('focus', () => {
                if (searchInput.value.trim().length > 0) {
                    this.renderUI();
                }
            });
        }

        if (btnClearSearch) {
            btnClearSearch.addEventListener('click', () => {
                if (searchInput) {
                    searchInput.value = '';
                    const epgSearchInput = document.getElementById('epgSearchInput');
                    if (epgSearchInput) {
                        epgSearchInput.value = '';
                        const epgBtnClearSearch = document.getElementById('epgBtnClearSearch');
                        if (epgBtnClearSearch) epgBtnClearSearch.classList.add('hidden');
                    }
                    this.renderUI();
                    const epgModal = document.getElementById('epgModal');
                    if (epgModal && !epgModal.classList.contains('hidden')) {
                        this.renderEPGGrid(true);
                    }
                    searchInput.focus();
                }
            });
        }

        // Close search dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (searchResultsDropdown && !searchResultsDropdown.contains(e.target) && e.target !== searchInput) {
                searchResultsDropdown.classList.add('hidden');
            }
        });

        // Modal triggers & handlers
        document.getElementById('btnToggleTvRemote')?.addEventListener('click', () => {
            this.tvRemoteManager?.toggleVirtualRemote();
        });

        document.getElementById('btnOpenPlaylistFromSettings')?.addEventListener('click', () => {
            this.uiController.toggleModal('settingsModal');
            this.uiController.toggleModal('playlistModal');
        });
        document.getElementById('btnClosePlaylist')?.addEventListener('click', () => this.uiController.toggleModal('playlistModal'));

        const openEpgHandler = () => {
            this.uiController.toggleModal('epgModal');
            this.populateEpgControls();
            requestAnimationFrame(() => {
                this.renderEPGGrid(true);
            });
        };
        document.getElementById('btnOpenEPG')?.addEventListener('click', openEpgHandler);
        document.getElementById('btnPlayerEPG')?.addEventListener('click', openEpgHandler);
        document.getElementById('btnCloseEPG')?.addEventListener('click', () => this.uiController.toggleModal('epgModal'));

        // EPG Modal controls (Category, Sort, Search with bi-directional main screen binding)
        document.getElementById('epgCategorySelect')?.addEventListener('change', (e) => {
            const selectedCat = e.target.value;
            this.activeCategory = selectedCat;
            try {
                localStorage.setItem(`tellyx_last_category_${this.activeType}`, selectedCat);
                localStorage.setItem('tellyx_last_category', selectedCat);
            } catch (err) {
                console.warn('[App] Error saving last category:', err);
            }
            this.renderUI();
            this.renderEPGGrid(true);
        });

        document.getElementById('epgSortSelect')?.addEventListener('change', (e) => {
            const selectedSort = e.target.value;
            this.sortMode = selectedSort;
            localStorage.setItem('tellyx_sort_mode', selectedSort);
            if (sortSelect) sortSelect.value = selectedSort;
            this.renderUI();
            this.renderEPGGrid(true);
        });

        const epgSearchInput = document.getElementById('epgSearchInput');
        const epgBtnClearSearch = document.getElementById('epgBtnClearSearch');
        let epgSearchDebounce = null;
        epgSearchInput?.addEventListener('input', () => {
            const val = epgSearchInput.value;
            if (epgBtnClearSearch) epgBtnClearSearch.classList.toggle('hidden', !val);

            if (searchInput) {
                searchInput.value = val;
                if (btnClearSearch) btnClearSearch.classList.toggle('hidden', !val);
            }

            if (epgSearchDebounce) clearTimeout(epgSearchDebounce);
            epgSearchDebounce = setTimeout(() => {
                this.renderUI();
                this.renderEPGGrid(true);
            }, 150);
        });

        epgBtnClearSearch?.addEventListener('click', () => {
            if (epgSearchInput) {
                epgSearchInput.value = '';
                if (epgBtnClearSearch) epgBtnClearSearch.classList.add('hidden');

                if (searchInput) {
                    searchInput.value = '';
                    if (btnClearSearch) btnClearSearch.classList.add('hidden');
                }

                this.renderUI();
                this.renderEPGGrid(true);
            }
        });

        const openSettingsHandler = () => {
            this.refreshProvidersList();
            this.uiController.toggleModal('settingsModal');
        };
        document.getElementById('btnOpenSettings')?.addEventListener('click', openSettingsHandler);
        document.getElementById('btnCorsNoticeOpenSettings')?.addEventListener('click', openSettingsHandler);
        document.getElementById('btnCloseSettings')?.addEventListener('click', () => this.uiController.toggleModal('settingsModal'));
        document.getElementById('btnOpenHelp')?.addEventListener('click', () => this.uiController.toggleModal('helpModal'));
        document.getElementById('btnCloseHelp')?.addEventListener('click', () => this.uiController.toggleModal('helpModal'));
        document.getElementById('btnCloseProgModal')?.addEventListener('click', () => this.uiController.toggleModal('programModal'));
        document.getElementById('btnCloseChannelEpg')?.addEventListener('click', () => this.uiController.toggleModal('channelEpgModal'));
        document.getElementById('btnCloseSeriesModal')?.addEventListener('click', () => this.uiController.toggleModal('seriesModal'));

        // Parental Control Modal Trigger & Handlers
        document.getElementById('btnParentalModal')?.addEventListener('click', () => {
            this.uiController.updateParentalUI(this.isParentalUnlocked);
            this.uiController.toggleModal('parentalModal');
        });
        document.getElementById('btnCloseParental')?.addEventListener('click', () => {
            this.uiController.toggleModal('parentalModal');
        });

        // Parental PIN Unlock / Lock Form Submit
        document.getElementById('formParentalUnlock')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const pinInput = document.getElementById('parentalPinInput');
            const pinError = document.getElementById('parentalPinError');
            const enteredPin = pinInput ? pinInput.value.trim() : '';

            if (this.isParentalUnlocked) {
                // Currently unlocked -> lock it
                this.isParentalUnlocked = false;
                this.uiController.setParentalUnlocked(false);
                this.uiController.showToast('Parental Controls Locked (Adult Content Hidden)', 'info');
                this.uiController.toggleModal('parentalModal');
                this.renderUI();
            } else {
                // Currently locked -> attempt unlock
                if (enteredPin === this.parentalPin) {
                    this.isParentalUnlocked = true;
                    this.uiController.setParentalUnlocked(true);
                    this.uiController.showToast('Parental Controls Unlocked', 'success');
                    this.uiController.toggleModal('parentalModal');
                    this.renderUI();
                } else {
                    if (pinError) pinError.textContent = 'Incorrect Security PIN! (Default: 0000)';
                }
            }
        });

        // Parental PIN Change Form Submit
        document.getElementById('formChangeParentalPin')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const currentPinInput = document.getElementById('currentPinInput');
            const newPinInput = document.getElementById('newPinInput');
            const msgEl = document.getElementById('changePinMsg');

            const currentVal = currentPinInput ? currentPinInput.value.trim() : '';
            const newVal = newPinInput ? newPinInput.value.trim() : '';

            if (currentVal !== this.parentalPin) {
                if (msgEl) {
                    msgEl.textContent = 'Current PIN is incorrect.';
                    msgEl.className = 'text-xs font-medium text-rose-400 min-h-[1rem]';
                }
                return;
            }

            if (!newVal || newVal.length < 4) {
                if (msgEl) {
                    msgEl.textContent = 'New PIN must be at least 4 digits.';
                    msgEl.className = 'text-xs font-medium text-rose-400 min-h-[1rem]';
                }
                return;
            }

            this.parentalPin = newVal;
            localStorage.setItem('iptv_pin_v1', newVal);

            if (currentPinInput) currentPinInput.value = '';
            if (newPinInput) newPinInput.value = '';

            if (msgEl) {
                msgEl.textContent = 'Security PIN updated successfully!';
                msgEl.className = 'text-xs font-medium text-emerald-400 min-h-[1rem]';
            }
            this.uiController.showToast('Parental PIN updated successfully', 'success');
        });

        // Service Worker Registration for PWA Web App capability
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js').then((reg) => {
                    console.log('[TellyX PWA] Service Worker registered successfully:', reg.scope);
                }).catch((err) => {
                    console.warn('[TellyX PWA] Service Worker registration failed:', err);
                });
            });
        }

        // PWA & Native App Installation Prompt Handler
        let deferredPrompt = null;
        const btnInstallPwa = document.getElementById('btnInstallPwa');

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
        });

        // Platform Detection Helper for PWA & Native Install Proposal
        const detectPlatform = () => {
            const ua = navigator.userAgent || '';
            const platform = navigator.platform || '';

            if (/Win/i.test(platform) || /Windows/i.test(ua)) {
                return {
                    name: 'Windows 10 / 11 (64-bit)',
                    downloadUrl: 'https://github.com/armature-tn/tellyx/releases/download/v0.1.0/TellyX_x64-setup.nsis.zip',
                    btnText: 'Download Native Windows App (.exe)',
                    iconSvg: `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M0 3.449L9.75 2.1v9.451H0m10.95-9.6L24 0v11.4H10.95M0 12.6h9.75v9.451L0 20.701M10.95 12.6H24V24l-13.05-1.801"/></svg>`
                };
            } else if (/Mac/i.test(platform) || /Macintosh|Mac OS X/i.test(ua)) {
                if (/iPhone|iPad|iPod/i.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
                    return {
                        name: 'iOS / iPadOS (iPhone & iPad)',
                        downloadUrl: 'index.html#downloads',
                        btnText: 'View iOS PWA Instructions',
                        iconSvg: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>`
                    };
                }
                return {
                    name: 'macOS Monterey / Sonoma / Sequoia',
                    downloadUrl: 'https://github.com/armature-tn/tellyx/releases/download/v0.1.0/TellyX_0.1.0_aarch64.app.tar.gz',
                    btnText: 'Download Native macOS App (.app)',
                    iconSvg: `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.32c.68-.82 1.13-1.98.99-3.12-1 .04-2.21.67-2.91 1.49-.62.72-1.16 1.89-.99 3.01 1.12.09 2.23-.56 2.91-1.38z"/></svg>`
                };
            } else if (/Android/i.test(ua)) {
                return {
                    name: 'Android (Phone, Tablet & Android TV)',
                    downloadUrl: 'https://github.com/armature-tn/tellyx/releases/download/v0.1.0/app-universal-release.apk',
                    btnText: 'Download Native Android APK',
                    iconSvg: `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993s-.4482.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993s-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592c.1235-.2137.0503-.4874-.1634-.6109-.2137-.1235-.4874-.0503-.6109.1634l-2.0287 3.5135c-1.543-.7036-3.298-1.0963-5.1758-1.0963-1.8778 0-3.6328.3927-5.1758 1.0963l-2.0287-3.5135c-.1235-.2137-.3972-.2869-.6109-.1634-.2137.1235-.2869.3972-.1634.6109l1.9973 3.4592c-3.1364 1.7061-5.263 4.8879-5.4674 8.6006h23.104c-.2044-3.7127-2.331-6.8945-5.4674-8.6006"/></svg>`
                };
            } else if (/Linux/i.test(platform) || /Linux/i.test(ua)) {
                return {
                    name: 'Linux (Ubuntu, Debian, Fedora, Arch)',
                    downloadUrl: 'https://github.com/armature-tn/tellyx/releases/download/v0.1.0/TellyX_0.1.0_amd64.AppImage.tar.gz',
                    btnText: 'Download Native Linux AppImage',
                    iconSvg: `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14.5a1.5 1.5 0 1 1-1.5-1.5 1.5 1.5 0 0 1 1.5 1.5zm1.5-5.5a2.5 2.5 0 0 0-5 0v1a1 1 0 0 0 2 0v-1a.5.5 0 0 1 1 0 .5.5 0 0 1-.5.5 1 1 0 0 0-1 1v1a1 1 0 0 0 2 0v-.5a2.5 2.5 0 0 0 1.5-2z"/></svg>`
                };
            }

            return {
                name: 'Desktop & Mobile Native Apps',
                downloadUrl: 'index.html#downloads',
                btnText: 'Download Native App',
                iconSvg: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>`
            };
        };

        const openInstallModal = () => {
            const platformInfo = detectPlatform();
            const pwaPlatformName = document.getElementById('pwaPlatformName');
            const pwaNativeIcon = document.getElementById('pwaNativeIcon');
            const btnNativeText = document.getElementById('btnNativeText');
            const btnDownloadNativeFromPwa = document.getElementById('btnDownloadNativeFromPwa');

            if (pwaPlatformName) pwaPlatformName.textContent = `Detected OS: ${platformInfo.name}`;
            if (pwaNativeIcon) pwaNativeIcon.innerHTML = platformInfo.iconSvg;
            if (btnNativeText) btnNativeText.textContent = platformInfo.btnText;
            if (btnDownloadNativeFromPwa) btnDownloadNativeFromPwa.href = platformInfo.downloadUrl;

            this.uiController.toggleModal('installModal');
        };

        btnInstallPwa?.addEventListener('click', openInstallModal);
        document.getElementById('btnCloseInstallModal')?.addEventListener('click', () => {
            this.uiController.toggleModal('installModal');
        });

        document.getElementById('btnProceedPwaInstall')?.addEventListener('click', async () => {
            this.uiController.toggleModal('installModal');
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    this.uiController.showToast('TellyX Web App installed successfully!', 'success');
                }
                deferredPrompt = null;
            } else {
                const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
                if (isIOS) {
                    this.uiController.showToast('iOS Safari: Tap Share button ➔ "Add to Home Screen"', 'info');
                } else {
                    this.uiController.showToast('Desktop/Chrome: Click 3-dots menu ➔ Save & Share ➔ Install TellyX', 'info');
                }
            }
        });

        window.addEventListener('appinstalled', () => {
            this.uiController.showToast('TellyX is now installed as a Web App', 'success');
        });

        // Close modals when clicking on dark backdrop
        ['playlistModal', 'epgModal', 'programModal', 'channelEpgModal', 'settingsModal', 'parentalModal', 'helpModal', 'editProviderModal', 'confirmModal', 'castModal', 'installModal'].forEach(modalId => {
            const modal = document.getElementById(modalId);
            modal?.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.uiController.toggleModal(modalId);
                }
            });
        });

        // Global Escape key listener to close active modals
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                ['playlistModal', 'epgModal', 'programModal', 'channelEpgModal', 'settingsModal', 'parentalModal', 'helpModal', 'editProviderModal', 'confirmModal', 'castModal', 'installModal'].forEach(modalId => {
                    const modal = document.getElementById(modalId);
                    if (modal && !modal.classList.contains('hidden')) {
                        this.uiController.toggleModal(modalId);
                    }
                });
            }
        });

        // Video Player Element & Audio Controls
        const videoEl = document.getElementById('videoPlayer');

        // Auto Switch Stream to Picture-in-Picture (PiP) when App is Minimized/Tab Hidden
        this._autoPipActive = false;

        // Synchronize PiP UI Button & State across main and multi-view video elements
        const syncPipUI = () => {
            const isPip = this.streamEngine ? this.streamEngine.isPictureInPictureActive() : Boolean(document.pictureInPictureElement);
            if (!isPip) {
                this._autoPipActive = false;
            }
            this.uiController?.updatePipButtonState(isPip, this.streamEngine ? this.streamEngine.isPictureInPictureSupported() : true);
        };

        const attachPipListeners = (v) => {
            if (!v) return;
            v.addEventListener('enterpictureinpicture', syncPipUI);
            v.addEventListener('leavepictureinpicture', syncPipUI);
            v.addEventListener('webkitpresentationmodechanged', syncPipUI);
        };

        attachPipListeners(document.getElementById('videoPlayer'));
        for (let i = 1; i <= 4; i++) {
            attachPipListeners(document.getElementById(`multiVideo${i}`));
        }

        // Initialize PiP button state on boot
        setTimeout(() => {
            if (this.streamEngine && this.uiController) {
                this.uiController.updatePipButtonState(this.streamEngine.isPictureInPictureActive(), this.streamEngine.isPictureInPictureSupported());
            }
        }, 100);

        const handleAppMinimize = async () => {
            if (!this.streamEngine) return;

            // Trigger PiP whenever stream is actively playing or channel is loaded and not explicitly user-paused.
            // Works whether the player is currently in Fullscreen mode or standard layout.
            const isStreamActive = this.streamEngine.isPlaying() || (!this.streamEngine.isUserPaused() && this.streamEngine.hasActiveMedia());

            if (isStreamActive) {
                if (!this.streamEngine.isPictureInPictureActive()) {
                    const v = document.getElementById('videoPlayer');
                    if (v) {
                        v.disablePictureInPicture = false;
                        v.autoPictureInPicture = true;
                        v.setAttribute('autopictureinpicture', '');
                        v.setAttribute('playsinline', '');
                        v.setAttribute('webkit-playsinline', '');
                    }

                    // Strictly request OS Native Picture-in-Picture on minimize (allowInAppFallback: false).
                    const res = await this.streamEngine.enterPictureInPicture({ allowInAppFallback: false });
                    if (res && res.success && res.isNativeOsPip) {
                        this._autoPipActive = true;
                        syncPipUI();
                        console.log('[TellyX App] App minimized: Switched stream to native OS Picture-in-Picture.');
                    }
                }
            }
        };

        const handleAppRestore = async () => {
            if (this._autoPipActive && this.streamEngine && this.streamEngine.isPictureInPictureActive()) {
                await this.streamEngine.exitPictureInPicture();
                this._autoPipActive = false;
                syncPipUI();
                console.log('[TellyX App] App restored: Exited Picture-in-Picture.');
            }
        };

        // Trigger auto OS Picture-in-Picture when application/tab is hidden or minimized
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' || document.hidden) {
                handleAppMinimize();
            } else if (document.visibilityState === 'visible') {
                handleAppRestore();
            }
        });

        window.addEventListener('blur', () => {
            if (document.visibilityState === 'hidden' || document.hidden) {
                handleAppMinimize();
            }
        });

        window.addEventListener('focus', () => {
            if (document.visibilityState === 'visible') {
                handleAppRestore();
            }
        });

        window.addEventListener('pagehide', handleAppMinimize);

        setupTauriWindowListeners({
            onMinimize: () => {
                handleAppMinimize();
            },
            onRestore: () => {
                handleAppRestore();
            }
        });

        const unmuteBanner = document.getElementById('btnUnmuteBanner');
        const btnPlayPause = document.getElementById('btnPlayPause');
        const btnToggleMute = document.getElementById('btnToggleMute');
        const volumeSlider = document.getElementById('volumeSlider');
        const seekBar = document.getElementById('seekBar');

        // Unmute Banner Floating Button Click
        unmuteBanner?.addEventListener('click', () => {
            this.streamEngine.setMuted(false);
            this.streamEngine.setVolume(1.0);
            if (volumeSlider) volumeSlider.value = '1';
            unmuteBanner.classList.add('hidden');
            this.updateAudioIcons(false);
            this.uiController.showToast('Audio Unmuted', 'success');
        });

        // Click on Video Screen to Unmute or Play/Pause & Double-Click for Fullscreen
        if (videoEl) {
            videoEl.addEventListener('click', () => {
                if (videoEl.muted) {
                    this.streamEngine.setMuted(false);
                    if (unmuteBanner) unmuteBanner.classList.add('hidden');
                    this.updateAudioIcons(false);
                    this.uiController.showToast('Audio Unmuted', 'success');
                } else {
                    const isPaused = this.streamEngine.togglePlayPause();
                    this.updatePlayPauseIcons(isPaused);
                }
            });

            videoEl.addEventListener('dblclick', () => {
                this.toggleFullscreen();
            });

            videoEl.addEventListener('volumechange', () => {
                const isMuted = videoEl.muted || videoEl.volume === 0;
                this.updateAudioIcons(isMuted);
                if (!videoEl.muted && unmuteBanner) {
                    unmuteBanner.classList.add('hidden');
                }
            });

            videoEl.addEventListener('play', () => this.updatePlayPauseIcons(false));
            videoEl.addEventListener('pause', () => this.updatePlayPauseIcons(true));

            videoEl.addEventListener('playing', () => {
                if (videoEl.muted && unmuteBanner) {
                    unmuteBanner.classList.remove('hidden');
                }
            });

            videoEl.addEventListener('timeupdate', () => {
                const currDisplay = document.getElementById('currentTimeDisplay');
                const durDisplay = document.getElementById('durationDisplay');
                const isVodItem = this.activeType === 'movie' || this.activeType === 'series' || this.activeChannel?.type === 'movie' || this.activeChannel?.type === 'series';

                if (videoEl.duration && isFinite(videoEl.duration) && videoEl.duration > 0) {
                    const pct = (videoEl.currentTime / videoEl.duration) * 100;
                    if (seekBar) seekBar.value = pct;
                    if (currDisplay) currDisplay.textContent = this.formatTimeSec(videoEl.currentTime);
                    if (durDisplay) {
                        durDisplay.textContent = this.formatTimeSec(videoEl.duration);
                        durDisplay.className = 'text-[10px] sm:text-[11px] font-mono font-semibold text-rose-400 w-10 sm:w-12 text-left';
                        durDisplay.title = '';
                    }
                } else if (isVodItem) {
                    if (currDisplay) currDisplay.textContent = this.formatTimeSec(videoEl.currentTime);
                    if (durDisplay) {
                        durDisplay.textContent = '--:--';
                        durDisplay.className = 'text-[10px] sm:text-[11px] font-mono font-semibold text-slate-400 w-10 sm:w-12 text-left';
                        durDisplay.title = '';
                    }
                } else if (this.streamEngine) {
                    const range = this.streamEngine.getSeekableRange();
                    if (range && range.length > 2) {
                        const currentOffset = videoEl.currentTime - range.start;
                        const pct = Math.min(100, Math.max(0, (currentOffset / range.length) * 100));
                        if (seekBar) seekBar.value = pct;

                        const diffFromLive = Math.max(0, Math.round(range.end - videoEl.currentTime));

                        if (diffFromLive <= 3) {
                            if (currDisplay) currDisplay.textContent = this.formatTimeSec(videoEl.currentTime);
                            if (durDisplay) {
                                durDisplay.textContent = 'LIVE';
                                durDisplay.className = 'text-[10px] sm:text-[11px] font-mono font-bold text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/30 cursor-pointer animate-pulse shrink-0';
                                durDisplay.title = 'Playing Live. Click to sync.';
                            }
                        } else {
                            if (currDisplay) currDisplay.textContent = '-' + this.formatTimeSec(diffFromLive);
                            if (durDisplay) {
                                durDisplay.textContent = 'GO LIVE ▶';
                                durDisplay.className = 'text-[10px] sm:text-[11px] font-mono font-bold text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/40 cursor-pointer hover:bg-amber-500/30 transition-all shrink-0';
                                durDisplay.title = 'Timeshift active. Click to return to Live broadcast.';
                            }
                        }
                    } else {
                        if (seekBar) seekBar.value = 100;
                        if (currDisplay) currDisplay.textContent = this.formatTimeSec(videoEl.currentTime);
                        if (durDisplay) {
                            durDisplay.textContent = 'LIVE';
                            durDisplay.className = 'text-[10px] sm:text-[11px] font-mono font-bold text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/30 cursor-pointer animate-pulse shrink-0';
                            durDisplay.title = 'LIVE Broadcast';
                        }
                    }
                }
            });
        }

        // Play/Pause Button
        btnPlayPause?.addEventListener('click', () => {
            const isPaused = this.streamEngine.togglePlayPause();
            this.updatePlayPauseIcons(isPaused);
        });

        // Speaker Icon Button: Toggle Vertical Volume Slider Popup
        const volumePopup = document.getElementById('volumePopup');
        const btnPopupMute = document.getElementById('btnPopupMute');

        const positionVolumePopup = () => {
            if (volumePopup && btnToggleMute) {
                const btnRect = btnToggleMute.getBoundingClientRect();
                const parentRect = volumePopup.parentElement.getBoundingClientRect();
                const left = btnRect.left - parentRect.left + (btnRect.width / 2);
                const bottom = parentRect.bottom - btnRect.top + 10;
                volumePopup.style.left = `${left}px`;
                volumePopup.style.bottom = `${bottom}px`;
                volumePopup.style.transform = 'translateX(-50%)';
            }
        };

        btnToggleMute?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (volumePopup) {
                const isHidden = volumePopup.classList.contains('hidden');
                volumePopup.classList.toggle('hidden');
                if (isHidden) {
                    positionVolumePopup();
                    this.updateAudioIcons(this.streamEngine ? this.streamEngine.isMuted : false);
                }
            }
        });

        window.addEventListener('resize', () => {
            if (volumePopup && !volumePopup.classList.contains('hidden')) {
                positionVolumePopup();
            }
        });

        // Close Volume Popup when clicking outside
        document.addEventListener('click', (e) => {
            if (volumePopup && !volumePopup.classList.contains('hidden')) {
                if (!volumePopup.contains(e.target) && !btnToggleMute?.contains(e.target)) {
                    volumePopup.classList.add('hidden');
                }
            }
        });

        // Popup Mute/Unmute Button
        btnPopupMute?.addEventListener('click', (e) => {
            e.stopPropagation();
            const currentlyMuted = this.streamEngine ? this.streamEngine.isMuted : false;
            const newMuteState = !currentlyMuted;
            if (newMuteState) {
                this.streamEngine.setMuted(true);
                if (unmuteBanner) unmuteBanner.classList.remove('hidden');
            } else {
                this.streamEngine.setMuted(false);
                if (this.streamEngine.volume === 0) {
                    this.streamEngine.setVolume(1.0);
                }
                if (unmuteBanner) unmuteBanner.classList.add('hidden');
            }
            this.updateAudioIcons(newMuteState);
            this.uiController.showToast(newMuteState ? 'Muted' : 'Unmuted', 'info');
        });

        // Volume Slider (100% to 0% / Mute)
        volumeSlider?.addEventListener('input', (e) => {
            const vol = parseFloat(e.target.value);
            if (vol === 0) {
                this.streamEngine.setMuted(true);
            } else {
                this.streamEngine.setVolume(vol);
                this.streamEngine.setMuted(false);
                if (unmuteBanner) unmuteBanner.classList.add('hidden');
            }
            this.updateAudioIcons(vol === 0);
        });

        // Seek Bar & Timeshift Controls
        seekBar?.addEventListener('input', (e) => {
            if (!videoEl) return;
            const val = parseFloat(e.target.value);
            if (videoEl.duration && isFinite(videoEl.duration) && videoEl.duration > 0) {
                const targetTime = (val / 100) * videoEl.duration;
                this.streamEngine.seek(targetTime);
            } else if (this.streamEngine) {
                const range = this.streamEngine.getSeekableRange();
                if (range && range.length > 1) {
                    const targetTime = range.start + (val / 100) * range.length;
                    this.streamEngine.seek(targetTime);
                }
            }
        });

        // Click "LIVE" or "GO LIVE ▶" badge to jump directly back to Live transmission
        const durationDisplay = document.getElementById('durationDisplay');
        durationDisplay?.addEventListener('click', () => {
            if (this.streamEngine) {
                this.streamEngine.seekToLive();
                this.uiController.showToast('Synced to Live broadcast', 'info');
            }
        });

        // Pin/Unpin to Multi-Screen Button & Dropdown Menu
        const btnPinToMulti = document.getElementById('btnPinToMulti');
        const pinSlotMenu = document.getElementById('pinSlotMenu');

        btnPinToMulti?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!this.activeChannel) {
                this.uiController.showToast('No active channel selected to pin', 'warning');
                return;
            }
            if (this.isChannelPinned(this.activeChannel)) {
                this.unpinChannel(this.activeChannel);
                pinSlotMenu?.classList.add('hidden');
            } else {
                const occupiedCount = this.quadSlots.filter(Boolean).length;
                if (occupiedCount >= 4) {
                    if (pinSlotMenu) {
                        const isHidden = pinSlotMenu.classList.contains('hidden');
                        pinSlotMenu.classList.toggle('hidden');
                        if (isHidden) {
                            this.updatePinButtonState();
                            this.uiController.showToast('All 4 slots occupied. Select a slot to replace.', 'info');
                        }
                    }
                } else {
                    this.pinChannelToSlot();
                    pinSlotMenu?.classList.add('hidden');
                }
            }
        });

        document.querySelectorAll('.btn-pin-slot').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const slotIdx = parseInt(btn.dataset.pinSlot || '0', 10);
                const slotChannel = this.quadSlots[slotIdx];
                if (this.activeChannel && slotChannel && (slotChannel.id === this.activeChannel.id || slotChannel.url === this.activeChannel.url)) {
                    // Unpin from this specific slot
                    this.quadSlots[slotIdx] = null;
                    const video = document.getElementById(`multiVideo${slotIdx + 1}`);
                    const titleEl = document.getElementById(`slotTitle${slotIdx}`);
                    if (video) {
                        video.pause();
                        video.removeAttribute('src');
                        video.load();
                    }
                    if (titleEl) titleEl.textContent = 'Empty';
                    this.uiController.showToast(`Unpinned "${this.activeChannel.name}" from Screen ${slotIdx + 1}`, 'info');
                    this.updatePinButtonState();
                } else {
                    this.pinChannelToSlot(slotIdx);
                }
                pinSlotMenu?.classList.add('hidden');
            });
        });

        // Close Pin Menu on outside click
        document.addEventListener('click', (e) => {
            if (pinSlotMenu && !pinSlotMenu.contains(e.target) && e.target !== btnPinToMulti) {
                pinSlotMenu.classList.add('hidden');
            }
        });

        // Exit Multi-Screen Button (Return to Single View)
        document.getElementById('btnExitMultiView')?.addEventListener('click', () => {
            this.switchViewMode('single');
        });

        // Multi-Screen Quad View Toggle (handles both ID btnToggleMultiView and btnToggleQuadView)
        const toggleQuadHandler = () => {
            this.switchViewMode(this.isMultiViewActive ? 'single' : 'quad');
        };
        document.getElementById('btnToggleMultiView')?.addEventListener('click', toggleQuadHandler);
        document.getElementById('btnToggleQuadView')?.addEventListener('click', toggleQuadHandler);

        // Quad Slot Interactivity (Select slot target, Expand slot to single player, Toggle Slot Audio)
        document.querySelectorAll('.quad-slot-box').forEach(slotBox => {
            const slotIdx = parseInt(slotBox.dataset.slotIndex || '0', 10);

            // Click slot box to highlight as target for channel selection
            slotBox.addEventListener('click', () => {
                this.highlightActiveQuadSlot(slotIdx);
            });

            // Double-click slot box to expand immediately to Single Player
            slotBox.addEventListener('dblclick', () => {
                this.highlightActiveQuadSlot(slotIdx);
                this.switchViewMode('single');
            });
        });

        // Expand slot to Single Player buttons
        document.querySelectorAll('.btn-expand-slot').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const slotIdx = parseInt(btn.dataset.expandSlot || '0', 10);
                this.highlightActiveQuadSlot(slotIdx);
                this.switchViewMode('single');
            });
        });

        // Slot Audio toggle buttons
        document.querySelectorAll('.btn-audio-slot').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const slotIdx = parseInt(btn.dataset.audioSlot || '0', 10);
                this.highlightActiveQuadSlot(slotIdx);
                this.uiController.showToast(`Audio enabled for Screen ${slotIdx + 1}`, 'success');
            });
        });

        // DVR Live Recording Button (handles both ID btnRecordStream and btnStartRecord)
        const dvrHandler = () => {
            const recBadge = document.getElementById('recBadge');
            const recTimer = document.getElementById('recTimer');

            if (this.streamEngine.isRecording()) {
                const channelName = this.activeChannel ? this.activeChannel.name : 'Stream';
                this.streamEngine.stopRecording(channelName, (recData) => {
                    this.openSaveRecordingModal(recData);
                });
                if (recBadge) recBadge.classList.add('hidden');
                if (this.recTimerInterval) clearInterval(this.recTimerInterval);
            } else {
                const started = this.streamEngine.startRecording();
                if (started) {
                    if (recBadge) recBadge.classList.remove('hidden');
                    this.uiController.showToast('DVR Stream Recording Started...', 'info');

                    if (this.recTimerInterval) clearInterval(this.recTimerInterval);
                    this.recTimerInterval = setInterval(() => {
                        const elapsed = this.streamEngine.getRecordingDuration();
                        const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
                        const s = String(elapsed % 60).padStart(2, '0');
                        if (recTimer) recTimer.textContent = `REC ${m}:${s}`;
                    }, 1000);
                }
            }
        };
        document.getElementById('btnRecordStream')?.addEventListener('click', dvrHandler);
        document.getElementById('btnStartRecord')?.addEventListener('click', dvrHandler);

        this.setupSaveRecordingModalListeners();

        // Audio Spectrum Visualizer Toggle Button Handler
        const visualizerHandler = () => {
            const isActive = this.streamEngine.toggleAudioVisualizer();
            const btnVis = document.getElementById('btnToggleVisualizer');
            if (btnVis) {
                btnVis.classList.toggle('bg-rose-600', isActive);
                btnVis.classList.toggle('text-white', isActive);
                btnVis.classList.toggle('bg-slate-900/90', !isActive);
                btnVis.classList.toggle('text-rose-400', !isActive);
            }
            this.uiController.showToast(isActive ? 'Audio Spectrum Visualizer Enabled' : 'Audio Spectrum Visualizer Disabled', 'info');
        };
        document.getElementById('btnToggleVisualizer')?.addEventListener('click', visualizerHandler);

        // Picture-in-Picture Toggle
        document.getElementById('btnTogglePip')?.addEventListener('click', async () => {
            const res = await this.streamEngine.togglePictureInPicture();
            this.uiController.updatePipButtonState(res.isPip, this.streamEngine.isPictureInPictureSupported());
            this.uiController.showToast(res.message, res.success ? 'info' : 'warning');
        });

        // Screen Casting / Remote Playback / AirPlay / TV Casting Dialog
        const btnCast = document.getElementById('btnCastStream');
        if (btnCast) {
            btnCast.classList.remove('hidden');

            const openCastDialog = async () => {
                const activeCh = this.activeChannel;
                const videoEl = document.getElementById('videoPlayer');
                const streamUrl = activeCh?.url || (videoEl ? (videoEl.currentSrc || videoEl.src) : '') || '';

                const castTitle = document.getElementById('castChannelTitle');
                const castGroup = document.getElementById('castChannelGroup');
                const castUrlInput = document.getElementById('inputCastStreamUrl');
                const castQr = document.getElementById('castQrImg');

                if (castTitle) castTitle.textContent = activeCh ? activeCh.name : 'Live Stream Player';
                if (castGroup) castGroup.textContent = activeCh ? (activeCh.group || 'Live TV') : 'TellyX IPTV';
                if (castUrlInput) castUrlInput.value = streamUrl;
                if (castQr && streamUrl) {
                    castQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(streamUrl)}`;
                }

                // Open modal
                this.uiController.toggleModal('castModal');

                // Attempt native trigger if possible
                const outcome = await this.streamEngine.triggerCast('auto');
                if (outcome === 'airplay') {
                    this.uiController.showToast('Opening AirPlay Target Picker...', 'info');
                } else if (outcome === 'remote') {
                    this.uiController.showToast('Connecting to Remote Cast Receiver...', 'info');
                } else if (outcome === 'presentation') {
                    this.uiController.showToast('Connecting to Wireless Display...', 'info');
                } else if (outcome === 'screenshare') {
                    this.uiController.showToast('Screen Sharing Active', 'info');
                }
            };

            btnCast.addEventListener('click', openCastDialog);

            // Modal Controls & Methods
            document.getElementById('btnCloseCast')?.addEventListener('click', () => {
                this.uiController.toggleModal('castModal');
            });

            document.getElementById('btnCastModalAirPlay')?.addEventListener('click', async () => {
                const res = await this.streamEngine.triggerCast('airplay');
                if (res === 'airplay') {
                    this.uiController.showToast('AirPlay device selector triggered', 'info');
                } else {
                    this.uiController.showToast('AirPlay requires Safari on iOS or macOS', 'warning');
                }
            });

            document.getElementById('btnCastModalGoogle')?.addEventListener('click', async () => {
                const res = await this.streamEngine.triggerCast('google');
                if (res === 'remote') {
                    this.uiController.showToast('Connecting to Google Cast / Chromecast...', 'info');
                } else if (res === 'notfound') {
                    this.uiController.showToast('No Chromecast devices found on local network', 'warning');
                } else if (res === 'canceled') {
                    this.uiController.showToast('Cast connection canceled', 'info');
                } else {
                    this.uiController.showToast('Use Chrome or Edge for Google Cast / Chromecast support', 'warning');
                }
            });

            document.getElementById('btnCastModalScreen')?.addEventListener('click', async () => {
                const res = await this.streamEngine.triggerCast('screenshare');
                if (res === 'screenshare') {
                    this.uiController.showToast('Screen mirroring active', 'success');
                } else if (res === 'canceled') {
                    this.uiController.showToast('Screen share canceled', 'info');
                } else {
                    this.uiController.showToast('Screen capture is not permitted on this browser', 'warning');
                }
            });

            document.getElementById('btnCastModalNewTab')?.addEventListener('click', () => {
                const input = document.getElementById('inputCastStreamUrl');
                const target = input?.value || window.location.href;
                window.open(target, '_blank');
                this.uiController.showToast('Opened stream in standalone tab', 'info');
            });

            document.getElementById('btnCopyCastUrl')?.addEventListener('click', () => {
                const input = document.getElementById('inputCastStreamUrl');
                if (input && input.value) {
                    navigator.clipboard.writeText(input.value).then(() => {
                        this.uiController.showToast('Stream URL copied to clipboard!', 'success');
                    }).catch(() => {
                        input.select();
                        document.execCommand('copy');
                        this.uiController.showToast('Stream URL copied!', 'success');
                    });
                }
            });

            document.getElementById('btnLaunchVlc')?.addEventListener('click', () => {
                const input = document.getElementById('inputCastStreamUrl');
                if (input && input.value) {
                    window.open(`vlc://${input.value}`, '_self');
                    this.uiController.showToast('Opening stream in VLC Player...', 'info');
                }
            });
        }

        // Fullscreen Toggle
        document.getElementById('btnToggleFullscreen')?.addEventListener('click', () => {
            this.toggleFullscreen();
        });

        // Keyboard Shortcuts (Space: Play/Pause, M: Mute, F: Fullscreen, P: PiP, S: Stats, G: EPG, Arrows: Prev/Next Channel)
        document.addEventListener('keydown', (e) => {
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
                return; // ignore typing in form fields
            }

            const unmuteBanner = document.getElementById('unmuteBanner');

            if (e.code === 'Space') {
                e.preventDefault();
                const isPaused = this.streamEngine.togglePlayPause();
                this.updatePlayPauseIcons(isPaused);
                this.uiController.showToast(isPaused ? 'Playback Paused' : 'Playing Stream', 'info');
            } else if (e.key === 'm' || e.key === 'M') {
                e.preventDefault();
                const isMuted = this.streamEngine.toggleMute();
                if (!isMuted && unmuteBanner) unmuteBanner.classList.add('hidden');
                this.updateAudioIcons(isMuted);
                this.uiController.showToast(isMuted ? 'Muted' : 'Unmuted', 'info');
            } else if (e.key === 'f' || e.key === 'F') {
                e.preventDefault();
                this.toggleFullscreen();
            } else if (e.key === 'p' || e.key === 'P') {
                e.preventDefault();
                this.streamEngine.togglePictureInPicture().then(res => {
                    this.uiController.updatePipButtonState(res.isPip, this.streamEngine.isPictureInPictureSupported());
                    this.uiController.showToast(res.message, res.success ? 'info' : 'warning');
                });
            } else if (e.key === 'v' || e.key === 'V') {
                e.preventDefault();
                const isActive = this.streamEngine.toggleAudioVisualizer();
                const btnVis = document.getElementById('btnToggleVisualizer');
                if (btnVis) {
                    btnVis.classList.toggle('bg-rose-600', isActive);
                    btnVis.classList.toggle('text-white', isActive);
                    btnVis.classList.toggle('bg-slate-900/90', !isActive);
                    btnVis.classList.toggle('text-rose-400', !isActive);
                }
                this.uiController.showToast(isActive ? 'Audio Spectrum Visualizer Enabled' : 'Audio Spectrum Visualizer Disabled', 'info');
            } else if (e.key === 's' || e.key === 'S') {
                e.preventDefault();
                this.uiController.toggleStatsOverlay();
            } else if (e.key === 'g' || e.key === 'G') {
                e.preventDefault();
                if (this.activeType === 'live') {
                    const epgModal = document.getElementById('epgModal');
                    if (epgModal && epgModal.classList.contains('hidden')) {
                        openEpgHandler();
                    } else {
                        this.uiController.toggleModal('epgModal');
                    }
                }
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                const videoEl = document.getElementById('videoPlayer');
                if (videoEl) {
                    const delta = e.key === 'ArrowLeft' ? -10 : 10;
                    this.streamEngine.seek(videoEl.currentTime + delta);
                    this.uiController.showToast(delta < 0 ? 'Rewind 10s' : 'Forward 10s', 'info');
                }
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                if (e.key === 'ArrowUp') {
                    this.playPreviousChannel();
                } else {
                    this.playNextChannel();
                }
            }
        });

        // Aspect Ratio Selector
        document.getElementById('aspectRatioSelect')?.addEventListener('change', (e) => {
            this.streamEngine.setAspectRatio(e.target.value);
            this.uiController.showToast(`Aspect Ratio: ${e.target.value}`, 'info');
        });

        // CORS Proxy Toggle & Custom Proxy Input & Security Token Protection
        const proxyToggle = document.getElementById('corsProxyToggle');
        const proxyContainer = document.getElementById('customProxyContainer');
        const proxyInput = document.getElementById('customProxyInput');

        const proxyTokenToggle = document.getElementById('proxyTokenToggle');
        const proxyTokenContainer = document.getElementById('proxyTokenContainer');
        const proxyTokenInput = document.getElementById('proxyTokenInput');
        const btnToggleProxyTokenVisibility = document.getElementById('btnToggleProxyTokenVisibility');

        if (proxyToggle) {
            proxyToggle.checked = this.useCorsProxy;
            if (proxyContainer) proxyContainer.classList.toggle('hidden', !this.useCorsProxy);

            proxyToggle.addEventListener('change', (e) => {
                this.useCorsProxy = e.target.checked;
                localStorage.setItem('tellyx_use_cors_proxy', this.useCorsProxy ? 'true' : 'false');
                if (proxyContainer) proxyContainer.classList.toggle('hidden', !this.useCorsProxy);
                this.uiController.showToast(this.useCorsProxy ? 'CORS Proxy Enabled' : 'CORS Proxy Disabled', 'warning');
                if (this.activeChannel) this.playChannel(this.activeChannel);
            });
        }

        if (proxyInput) {
            proxyInput.value = this.customProxyUrl;
            proxyInput.addEventListener('input', (e) => {
                this.customProxyUrl = e.target.value.trim();
                localStorage.setItem('tellyx_custom_proxy', this.customProxyUrl);
                if (this.useCorsProxy && this.activeChannel) {
                    this.playChannel(this.activeChannel);
                }
            });
        }

        if (proxyTokenToggle) {
            proxyTokenToggle.checked = this.useProxyToken;
            if (proxyTokenContainer) proxyTokenContainer.classList.toggle('hidden', !this.useProxyToken);

            proxyTokenToggle.addEventListener('change', (e) => {
                this.useProxyToken = e.target.checked;
                localStorage.setItem('tellyx_use_proxy_token', this.useProxyToken ? 'true' : 'false');
                if (proxyTokenContainer) proxyTokenContainer.classList.toggle('hidden', !this.useProxyToken);
                this.uiController.showToast(this.useProxyToken ? 'Security Token Protection Enabled' : 'Security Token Protection Disabled', 'info');
                if (this.useCorsProxy && this.activeChannel) {
                    this.playChannel(this.activeChannel);
                }
            });
        }

        if (proxyTokenInput) {
            proxyTokenInput.value = this.proxyToken;
            proxyTokenInput.addEventListener('input', (e) => {
                this.proxyToken = e.target.value.trim();
                localStorage.setItem('tellyx_proxy_token', this.proxyToken);
                if (this.useCorsProxy && this.useProxyToken && this.activeChannel) {
                    this.playChannel(this.activeChannel);
                }
            });
        }

        if (btnToggleProxyTokenVisibility && proxyTokenInput) {
            btnToggleProxyTokenVisibility.addEventListener('click', () => {
                const isPass = proxyTokenInput.type === 'password';
                proxyTokenInput.type = isPass ? 'text' : 'password';
            });
        }

        // Load Xtream Codes API Form
        document.getElementById('formXtream')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const server = document.getElementById('xtreamServer')?.value.trim();
            const user = document.getElementById('xtreamUser')?.value.trim();
            const pass = document.getElementById('xtreamPass')?.value.trim();

            if (!server || !user || !pass) {
                this.uiController.showToast('Please enter complete Xtream credentials.', 'error');
                return;
            }

            try {
                this.uiController.showToast('Connecting to Xtream Codes Server...', 'info');
                const cleanServer = SecurityController.normalizeServerUrl(server);
                const [xtreamChannels, userInfo] = await Promise.all([
                    this.fetchXtreamChannels(cleanServer, user, pass),
                    this.fetchXtreamUserInfo(cleanServer, user, pass)
                ]);

                if (xtreamChannels && xtreamChannels.length > 0) {
                    let host = 'Xtream Server';
                    try { host = new URL(cleanServer).hostname; } catch (ex) {}
                    const provider = {
                        id: `prov_xtream_${Date.now()}`,
                        type: 'xtream',
                        name: `Xtream (${host})`,
                        server: cleanServer,
                        user: user,
                        pass: pass,
                        accountInfo: userInfo,
                        active: true
                    };

                    this.iptvCore.addChannelsForProvider(provider, xtreamChannels, true);
                    localStorage.setItem('tellyx_connection_active', 'true');

                    const liveCount = xtreamChannels.filter(c => c.type === 'live').length;
                    const vodCount = xtreamChannels.filter(c => c.type === 'movie').length;
                    const seriesCount = xtreamChannels.filter(c => c.type === 'series').length;

                    this.uiController.showToast(`Imported ${xtreamChannels.length} items (${liveCount} Live, ${vodCount} Movies, ${seriesCount} Series) from Xtream!`, 'success');
                    this.uiController.toggleModal('playlistModal');
                    this.renderUI();
                    this.refreshProvidersList();
                    this.autoPlayLastOrFirstLiveChannel();
                } else {
                    throw new Error('No channels or streams returned from server.');
                }
            } catch (err) {
                this.uiController.showToast(`Xtream Import Notice: ${err.message || 'Connection Error'}`, 'error');
            }
        });

        // Load M3U URL Form
        document.getElementById('formM3uUrl')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = document.getElementById('inputM3uUrl');
            const url = input ? input.value.trim() : '';

            if (!url) return;

            try {
                this.uiController.showToast('Fetching M3U Playlist...', 'info');
                const targetUrl = this.useCorsProxy ? SecurityController.buildProxyURL(url, this.getEffectiveProxyUrl(), this.getEffectiveProxyToken()) : url;
                const res = await fetch(targetUrl);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const text = await res.text();
                const channels = this.iptvCore.parseM3U(text);

                let host = 'Remote Playlist';
                try { host = new URL(url).hostname; } catch (ex) {}
                const provider = {
                    id: `prov_m3u_${Date.now()}`,
                    type: 'm3u_url',
                    name: `M3U (${host})`,
                    url: url,
                    active: true
                };

                this.iptvCore.addChannelsForProvider(provider, channels, true);
                localStorage.setItem('iptv_m3u_url', url);
                localStorage.setItem('tellyx_connection_active', 'true');
                this.uiController.showToast(`Loaded ${channels.length} channels!`, 'success');
                this.uiController.toggleModal('playlistModal');
                this.renderUI();
                this.refreshProvidersList();
                this.autoPlayLastOrFirstLiveChannel();
            } catch (err) {
                this.uiController.showToast(`Failed to load playlist: ${err.message}`, 'error');
            }
        });

        // File Drag & Drop / Upload
        const fileInput = document.getElementById('inputM3uFile');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (event) => {
                    const text = event.target.result;
                    const channels = this.iptvCore.parseM3U(text);

                    const provider = {
                        id: `prov_file_${Date.now()}`,
                        type: 'm3u_file',
                        name: `File: ${file.name}`,
                        fileName: file.name,
                        active: true
                    };

                    this.iptvCore.addChannelsForProvider(provider, channels, true);
                    localStorage.setItem('tellyx_connection_active', 'true');
                    this.uiController.showToast(`Imported ${channels.length} channels from file!`, 'success');
                    this.uiController.toggleModal('playlistModal');
                    this.renderUI();
                    this.refreshProvidersList();
                    this.autoPlayLastOrFirstLiveChannel();
                };
                reader.readAsText(file);
            });
        }

        // Edit Provider Form Handler
        document.getElementById('formEditProvider')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('editProviderId')?.value;
            const name = document.getElementById('editProviderName')?.value.trim();

            const provider = this.iptvCore.getProvider(id);
            if (!provider) return;

            provider.name = name;

            if (provider.type === 'xtream') {
                const serverInput = document.getElementById('editXtreamServer');
                const userInput = document.getElementById('editXtreamUser');
                const passInput = document.getElementById('editXtreamPass');

                if (serverInput) provider.server = serverInput.value.trim().replace(/\/$/, '');
                if (userInput) provider.user = userInput.value.trim();
                if (passInput) provider.pass = passInput.value.trim();
            } else if (provider.type === 'm3u_url' || provider.url || provider.id === 'prov_legacy_m3u') {
                const urlInput = document.getElementById('editM3uUrl');
                if (urlInput) {
                    provider.url = urlInput.value.trim();
                    localStorage.setItem('iptv_m3u_url', provider.url);
                }
            }

            this.iptvCore.saveProvider(provider);
            this.uiController.toggleModal('editProviderModal');
            this.uiController.showToast(`Updated provider "${name}". Re-syncing streams...`, 'info');
            await this.syncProvider(id);
        });

        document.getElementById('btnCloseEditProvider')?.addEventListener('click', () => {
            this.uiController.toggleModal('editProviderModal');
        });
        document.getElementById('btnCancelEditProvider')?.addEventListener('click', () => {
            this.uiController.toggleModal('editProviderModal');
        });

        // Clear Loaded Streams
        document.getElementById('btnResetDefaults')?.addEventListener('click', () => {
            this.uiController.showConfirm({
                title: 'Reset & Clear Storage',
                message: 'Clear all loaded channels and reset playlist/provider storage?',
                okText: 'Reset Data',
                onConfirm: () => {
                    this.iptvCore.resetToDefaults();
                    localStorage.removeItem('tellyx_connection_active');
                    localStorage.removeItem('tellyx_last_watched_live_channel');
                    if (this.streamEngine) this.streamEngine.stop();
                    this.activeChannel = null;
                    this.renderUI();
                    this.refreshProvidersList();
                    this.uiController.showToast('All channel and provider data cleared.', 'info');
                }
            });
        });

        // Benchmark Test Button in Settings
        document.getElementById('btnRunBenchmark')?.addEventListener('click', () => {
            const btn = document.getElementById('btnRunBenchmark');
            if (btn) btn.textContent = 'Running WASM Benchmark...';
            setTimeout(() => {
                const metrics = this.wasmEngine.runPerformanceBenchmark();
                if (btn) btn.textContent = 'Run WASM Benchmark Test';
                const status = metrics.wasmActive ? 'WASM Active' : 'JS Fallback';
                this.uiController.showToast(`Benchmark (${status}): ${metrics.throughputMBs} MB/s throughput (${metrics.executionTimeMs}ms for 3.2MB total data)`, 'success');
            }, 50);
        });
    }

    /**
     * Opens channel-specific EPG program schedule dialog.
     */
    openCurrentChannelEpg() {
        const channel = this.activeChannel;
        if (!channel) {
            this.uiController.showToast('Select a channel to view its EPG schedule', 'info');
            return;
        }

        const modalTitle = document.getElementById('channelEpgTitle');
        const modalGroup = document.getElementById('channelEpgGroup');
        const modalLogo = document.getElementById('channelEpgLogo');
        const modalLogoFallback = document.getElementById('channelEpgLogoFallback');
        const listContainer = document.getElementById('channelEpgList');

        if (modalTitle) modalTitle.textContent = channel.name;
        if (modalGroup) modalGroup.textContent = channel.group || 'Live TV';

        if (modalLogo) {
            if (channel.logo) {
                modalLogo.src = channel.logo;
                modalLogo.classList.remove('hidden');
                if (modalLogoFallback) modalLogoFallback.classList.add('hidden');
            } else {
                modalLogo.classList.add('hidden');
                if (modalLogoFallback) modalLogoFallback.classList.remove('hidden');
            }
        }

        const schedule = this.epgEngine.getScheduleForChannel(channel.tvgId || channel.id, channel.name);
        const now = new Date();

        if (listContainer) {
            if (!schedule || schedule.length === 0) {
                listContainer.innerHTML = `<div class="p-8 text-center text-sm font-medium text-slate-400 bg-slate-950/40 rounded-xl border border-slate-800/60">No EPG available for this channel.</div>`;
            } else {
                listContainer.innerHTML = schedule.map(prog => {
                    const isLive = now >= prog.startTime && now <= prog.endTime;
                    const formatTime = (d) => d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                    const startTimeStr = formatTime(prog.startTime);
                    const endTimeStr = formatTime(prog.endTime);

                    let progressPct = 0;
                    if (isLive) {
                        const totalMs = prog.endTime.getTime() - prog.startTime.getTime();
                        const elapsedMs = now.getTime() - prog.startTime.getTime();
                        progressPct = Math.min(100, Math.max(0, Math.round((elapsedMs / totalMs) * 100)));
                    }

                    return `
                        <div class="p-3.5 rounded-xl ${isLive ? 'bg-rose-950/40 border border-rose-500/50 shadow-lg shadow-rose-950/30' : 'bg-slate-950/60 border border-slate-800/80'} transition-all hover:border-slate-700">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center space-x-2">
                                    <span class="text-xs font-mono font-bold ${isLive ? 'text-rose-400' : 'text-slate-400'}">${startTimeStr} - ${endTimeStr}</span>
                                    ${prog.category ? `<span class="text-[9px] font-bold text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/60">${prog.category}</span>` : ''}
                                </div>
                                ${isLive ? `<span class="inline-flex items-center text-[10px] font-bold text-rose-400 bg-rose-500/20 px-2 py-0.5 rounded-full border border-rose-500/30"><span class="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping mr-1"></span> LIVE NOW</span>` : ''}
                            </div>
                            <h4 class="text-sm font-bold text-white mt-1.5">${prog.title}</h4>
                            ${prog.desc ? `<p class="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">${prog.desc}</p>` : ''}
                            ${isLive ? `
                                <div class="w-full bg-slate-800 rounded-full h-1.5 mt-2.5 overflow-hidden border border-slate-700/60">
                                    <div class="bg-gradient-to-r from-rose-500 to-amber-500 h-full rounded-full transition-all duration-300" style="width: ${progressPct}%"></div>
                                </div>
                            ` : ''}
                        </div>
                    `;
                }).join('');
            }
        }

        this.uiController.toggleModal('channelEpgModal');
    }

    /**
     * Populates category select, sort mode, and search inside EPG Modal.
     */
    populateEpgControls() {
        const epgCatSelect = document.getElementById('epgCategorySelect');
        if (epgCatSelect) {
            const categories = this.iptvCore.getCategories('live');
            epgCatSelect.innerHTML = categories.map(cat => {
                const catName = typeof cat === 'object' ? cat.name : cat;
                return `<option value="${catName}">${catName}</option>`;
            }).join('');

            const currentCat = this.activeCategory || 'All';
            const hasCat = categories.some(c => (typeof c === 'object' ? c.name : c) === currentCat);
            epgCatSelect.value = hasCat ? currentCat : 'All';
        }

        const epgSortSelect = document.getElementById('epgSortSelect');
        if (epgSortSelect) {
            epgSortSelect.value = this.sortMode || 'default';
        }

        const epgSearchInput = document.getElementById('epgSearchInput');
        const epgBtnClearSearch = document.getElementById('epgBtnClearSearch');
        if (epgSearchInput && epgSearchInput.value !== '') {
            // Keep user input if actively searching inside modal
        } else if (epgSearchInput) {
            epgSearchInput.value = '';
            if (epgBtnClearSearch) epgBtnClearSearch.classList.add('hidden');
        }
    }

    /**
     * Renders Horizontal EPG Matrix inside the EPG Modal with lazy loading.
     * @param {boolean} [resetScroll=true]
     */
    renderEPGGrid(resetScroll = true) {
        const grid = document.getElementById('epgGrid');
        if (!grid) return;

        const hideAdult = this.uiController.isParentalLocked();
        const selectedCategory = document.getElementById('epgCategorySelect')?.value || this.activeCategory || 'All';
        const selectedSort = document.getElementById('epgSortSelect')?.value || this.sortMode || 'default';
        const query = document.getElementById('epgSearchInput')?.value || '';

        const channels = this.iptvCore.getChannels(selectedCategory, query, hideAdult, 'live', selectedSort);
        const activeChannelId = this.activeChannel ? this.activeChannel.id : null;

        const isAppend = !resetScroll;

        if (resetScroll) {
            this.epgLimit = 30;
            if (activeChannelId) {
                const activeIdx = channels.findIndex(c => c.id === activeChannelId);
                if (activeIdx !== -1 && activeIdx >= this.epgLimit) {
                    this.epgLimit = Math.max(30, Math.ceil((activeIdx + 1) / 30) * 30);
                }
            }
        }

        this.epgChannels = channels;

        this.epgEngine.renderMatrixGrid(
            grid,
            channels,
            (channelId) => {
                const target = channels.find(c => c.id === channelId);
                if (target) {
                    this.playChannel(target);
                    this.uiController.toggleModal('epgModal');
                }
            },
            activeChannelId,
            this.epgLimit,
            () => {
                if (this.epgLimit < channels.length) {
                    this.epgLimit += 30;
                    this.renderEPGGrid(false);
                }
            },
            resetScroll, // shouldScrollActive ONLY on initial resetScroll
            isAppend, // append batch mode instead of full rebuild
            selectedCategory,
            query
        );

        if (!this.epgScrollListenerAttached) {
            this.epgScrollListenerAttached = true;
            let isEpgLoadingMore = false;

            grid.addEventListener('scroll', () => {
                if (isEpgLoadingMore) return;
                if (grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 300) {
                    if (this.epgChannels && this.epgLimit < this.epgChannels.length) {
                        isEpgLoadingMore = true;
                        this.epgLimit += 30;
                        this.renderEPGGrid(false);
                        setTimeout(() => {
                            isEpgLoadingMore = false;
                        }, 100);
                    }
                }
            });
        }
    }

    /**
     * Re-renders the connected IPTV providers list in the Settings Modal.
     */
    refreshProvidersList() {
        const providers = this.iptvCore.getProviders();
        this.uiController.renderProvidersList(providers, {
            onSync: (id) => this.syncProvider(id),
            onEdit: (id) => this.openEditProviderModal(id),
            onDelete: (id) => this.deleteProvider(id)
        });
    }

    /**
     * Re-fetches live channels for a given provider connection.
     * @param {string} id - Provider ID.
     */
    async syncProvider(id) {
        const provider = this.iptvCore.getProvider(id);
        if (!provider) return;

        if (provider.type === 'xtream') {
            try {
                this.uiController.showToast(`Syncing ${provider.name}...`, 'info');
                const cleanServer = SecurityController.normalizeServerUrl(provider.server || '');
                const [xtreamChannels, userInfo] = await Promise.all([
                    this.fetchXtreamChannels(cleanServer, provider.user, provider.pass),
                    this.fetchXtreamUserInfo(cleanServer, provider.user, provider.pass)
                ]);

                if (userInfo) {
                    provider.accountInfo = userInfo;
                }

                if (xtreamChannels && xtreamChannels.length > 0) {
                    this.iptvCore.addChannelsForProvider(provider, xtreamChannels, true);
                    const liveCount = xtreamChannels.filter(c => c.type === 'live').length;
                    const vodCount = xtreamChannels.filter(c => c.type === 'movie').length;
                    const seriesCount = xtreamChannels.filter(c => c.type === 'series').length;
                    this.uiController.showToast(`Re-synced ${xtreamChannels.length} items (${liveCount} Live, ${vodCount} Movies, ${seriesCount} Series) for ${provider.name}!`, 'success');
                    this.renderUI();
                    this.refreshProvidersList();
                } else {
                    throw new Error('No streams returned from server');
                }
            } catch (err) {
                this.uiController.showToast(`Sync failed: ${err.message}`, 'error');
            }
        } else if (provider.type === 'm3u_url') {
            try {
                this.uiController.showToast(`Syncing ${provider.name}...`, 'info');
                const targetUrl = this.useCorsProxy ? SecurityController.buildProxyURL(provider.url, this.getEffectiveProxyUrl(), this.getEffectiveProxyToken()) : provider.url;
                const res = await fetch(targetUrl);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const text = await res.text();
                const channels = this.iptvCore.parseM3U(text);
                this.iptvCore.addChannelsForProvider(provider, channels, true);
                this.uiController.showToast(`Re-synced ${channels.length} channels for ${provider.name}!`, 'success');
                this.renderUI();
                this.refreshProvidersList();
            } catch (err) {
                this.uiController.showToast(`Sync failed: ${err.message}`, 'error');
            }
        } else if (provider.type === 'm3u_file') {
            this.uiController.showToast(`Local file provider. Upload an updated M3U file via Add Provider.`, 'warning');
        }
    }

    /**
     * Opens the Edit/Modify Provider Modal populated with provider details.
     * @param {string} id - Provider ID.
     */
    openEditProviderModal(id) {
        const provider = this.iptvCore.getProvider(id);
        if (!provider) return;

        const editIdInput = document.getElementById('editProviderId');
        const editNameInput = document.getElementById('editProviderName');

        if (editIdInput) editIdInput.value = provider.id;
        if (editNameInput) editNameInput.value = provider.name || '';

        const xtreamFields = document.getElementById('editXtreamFields');
        const m3uFields = document.getElementById('editM3uFields');

        if (provider.type === 'xtream') {
            if (xtreamFields) xtreamFields.classList.remove('hidden');
            if (m3uFields) m3uFields.classList.add('hidden');
            const editServer = document.getElementById('editXtreamServer');
            const editUser = document.getElementById('editXtreamUser');
            const editPass = document.getElementById('editXtreamPass');
            if (editServer) editServer.value = provider.server || '';
            if (editUser) editUser.value = provider.user || '';
            if (editPass) editPass.value = provider.pass || '';
        } else if (provider.type === 'm3u_url' || provider.url || provider.id === 'prov_legacy_m3u') {
            if (xtreamFields) xtreamFields.classList.add('hidden');
            if (m3uFields) m3uFields.classList.remove('hidden');
            const editUrl = document.getElementById('editM3uUrl');
            if (editUrl) editUrl.value = provider.url || localStorage.getItem('iptv_m3u_url') || '';
        } else {
            if (xtreamFields) xtreamFields.classList.add('hidden');
            if (m3uFields) m3uFields.classList.add('hidden');
        }

        this.uiController.toggleModal('editProviderModal');
    }

    /**
     * Deletes a provider connection and removes its associated channels.
     * @param {string} id - Provider ID.
     */
    deleteProvider(id) {
        const provider = this.iptvCore.getProvider(id);
        if (!provider) return;

        this.uiController.showConfirm({
            title: 'Delete IPTV Provider',
            message: `Are you sure you want to delete "${provider.name}" and remove all its channels?`,
            okText: 'Delete Provider',
            onConfirm: () => {
                this.iptvCore.deleteProvider(id);
                this.uiController.showToast(`Deleted provider "${provider.name}".`, 'info');
                this.renderUI();
                this.refreshProvidersList();
            }
        });
    }

    /**
     * Centralized Fullscreen toggle supporting HTML5 Fullscreen API, Tauri Native Fullscreen, and CSS Viewport Fallback.
     */
    toggleFullscreen() {
        const container = document.getElementById('singlePlayerContainer') || document.documentElement;
        const isFS = !!(
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement ||
            container?.classList.contains('is-fullscreen')
        );

        if (!isFS) {
            container?.classList.add('is-fullscreen');
            if (container?.requestFullscreen) {
                container.requestFullscreen().catch(() => {});
            } else if (container?.webkitRequestFullscreen) {
                container.webkitRequestFullscreen();
            }
            if (window.__TAURI__?.window?.getCurrentWindow) {
                try {
                    window.__TAURI__.window.getCurrentWindow().setFullscreen(true).catch(() => {});
                } catch (e) {}
            }
        } else {
            container?.classList.remove('is-fullscreen', 'controls-hidden');
            if (document.exitFullscreen) {
                document.exitFullscreen().catch(() => {});
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
            if (window.__TAURI__?.window?.getCurrentWindow) {
                try {
                    window.__TAURI__.window.getCurrentWindow().setFullscreen(false).catch(() => {});
                } catch (e) {}
            }
        }
    }

    /**
     * Opens the Save Recording modal prompt for choosing file name & saving recorded video stream.
     * @param {Object} recData - { durationSec, blob, url, defaultFileName }
     */
    openSaveRecordingModal(recData) {
        if (!recData) return;
        this.activeRecordingData = recData;

        const modal = document.getElementById('saveRecordingModal');
        const previewPlayer = document.getElementById('recordingPreviewPlayer');
        const durationBadge = document.getElementById('recordingDurationBadge');
        const fileNameInput = document.getElementById('recordingFileNameInput');

        if (previewPlayer) {
            previewPlayer.src = recData.url;
        }
        if (durationBadge) {
            durationBadge.textContent = `${recData.durationSec}s recorded`;
        }
        if (fileNameInput) {
            fileNameInput.value = recData.defaultFileName;
        }
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    /**
     * Binds event listeners for saveRecordingModal dialog controls.
     */
    setupSaveRecordingModalListeners() {
        const modal = document.getElementById('saveRecordingModal');
        const btnClose = document.getElementById('btnCloseRecordingModal');
        const btnCancel = document.getElementById('btnCancelSaveRecording');
        const btnConfirm = document.getElementById('btnConfirmSaveRecording');
        const previewPlayer = document.getElementById('recordingPreviewPlayer');

        const closeModal = () => {
            if (modal) modal.classList.add('hidden');
            if (previewPlayer) {
                previewPlayer.pause();
                previewPlayer.src = '';
            }
        };

        btnClose?.addEventListener('click', closeModal);
        btnCancel?.addEventListener('click', closeModal);

        btnConfirm?.addEventListener('click', async () => {
            if (!this.activeRecordingData) {
                closeModal();
                return;
            }

            const { url, blob, defaultFileName } = this.activeRecordingData;
            const inputEl = document.getElementById('recordingFileNameInput');
            let userFileName = (inputEl?.value || defaultFileName).trim().replace(/[^a-z0-9_-]/gi, '_');
            if (!userFileName) userFileName = defaultFileName;
            const fullFileName = `${userFileName}.webm`;

            // 1. Modern HTML5 File System Access API (Android Chrome & modern WebViews)
            if (typeof window.showSaveFilePicker === 'function') {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: fullFileName,
                        types: [{
                            description: 'WebM Video Recording',
                            accept: { 'video/webm': ['.webm'] }
                        }]
                    });
                    const writable = await handle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    this.uiController.showToast(`Recording saved successfully`, 'success');
                    closeModal();
                    return;
                } catch (err) {
                    if (err && err.name === 'AbortError') {
                        // User explicitly canceled the folder/file picker
                        return;
                    }
                    console.warn('[App] showSaveFilePicker fallback:', err);
                }
            }

            // 2. Try native Tauri save dialog if available (Desktop / Mobile Tauri runtime)
            const tauriSave = window.__TAURI__?.dialog?.save || window.__TAURI_PLUGIN_DIALOG__?.save || window.__TAURI__?.plugin?.dialog?.save;
            if (tauriSave) {
                try {
                    const savePath = await tauriSave({
                        defaultPath: fullFileName,
                        filters: [{ name: 'WebM Video', extensions: ['webm'] }]
                    });
                    if (savePath) {
                        const writeFn = window.__TAURI__?.fs?.writeBinaryFile || window.__TAURI_PLUGIN_FS__?.writeBinaryFile || window.__TAURI__?.plugin?.fs?.writeBinaryFile;
                        if (writeFn) {
                            const buffer = await blob.arrayBuffer();
                            await writeFn(savePath, new Uint8Array(buffer));
                            this.uiController.showToast(`Recording saved to chosen path`, 'success');
                            closeModal();
                            return;
                        }
                    } else {
                        // User canceled save dialog
                        return;
                    }
                } catch (err) {
                    console.warn('[App] Native Tauri save dialog notice:', err);
                }
            }

            // 3. Fallback: Browser auto-download anchor link
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = fullFileName;
            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                document.body.removeChild(a);
            }, 1000);

            this.uiController.showToast(`DVR Recording file saved: ${fullFileName}`, 'success');
            closeModal();
        });
    }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
    const app = new Application();
    app.init();
});
