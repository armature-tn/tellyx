/**
 * @file security.js
 * @description Hardened Security Module for IPTV Player.
 * Provides XSS prevention, strict URL validation, input sanitization,
 * payload verification, and cryptographic helpers for local data encryption.
 * 
 * @module Security
 * @version 0.1.0
 * @author Armature.TN
 * @license Dual License: GNU AGPL-3.0 or Commercial License (SPDX: AGPL-3.0-or-later OR Commercial)
 */

/**
 * @class SecurityController
 * @classdesc Central security utility class enforcing strict input validation,
 * DOM sanitization, and cryptographic functions.
 */
export class SecurityController {
    /**
     * @private
     * @type {RegExp}
     * @description Allowed URL protocols for streaming and media assets.
     */
    static #ALLOWED_PROTOCOLS = /^(https?:|data:|blob:|rtmp:|rtsp:|udp:|m3u8:)/i;

    /**
     * @private
     * @type {RegExp}
     * @description Forbidden inline script patterns or event handlers.
     */
    static #DANGEROUS_PATTERNS = /javascript:|data:text\/html|<script|on\w+=/i;

    /**
     * Converts raw text into safe HTML text by escaping special XML/HTML entities.
     * Prevents Reflected and Stored Cross-Site Scripting (XSS) attacks.
     * 
     * @param {string} str - Raw untrusted input string.
     * @returns {string} Safe HTML-escaped string.
     * @complexity O(N) where N is the length of the string.
     * @security Prevents HTML injection in channel labels, program descriptions, and metadata.
     */
    /**
     * Converts HTML-encoded entities back into raw plain text strings.
     * Prevents double/triple escaping and ensures clean string search matching.
     * 
     * @param {string} str - HTML-escaped input string.
     * @returns {string} Plain text unescaped string.
     */
    static unescapeHTML(str) {
        if (typeof str !== 'string') return '';
        return str
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&#096;/g, "`");
    }

    /**
     * Converts raw text into safe HTML text by escaping special XML/HTML entities.
     * Prevents Reflected and Stored Cross-Site Scripting (XSS) attacks.
     * 
     * @param {string} str - Raw untrusted input string.
     * @returns {string} Safe HTML-escaped string.
     * @complexity O(N) where N is the length of the string.
     * @security Prevents HTML injection in channel labels, program descriptions, and metadata.
     */
    static escapeHTML(str) {
        if (typeof str !== 'string') return '';
        // First unescape any existing entities to prevent double-escaping (&amp;amp;)
        const clean = this.unescapeHTML(str);
        return clean
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
            .replace(/`/g, '&#096;');
    }

    /**
     * Normalizes a server URL string ensuring it has an explicit scheme (http:// or https://)
     * and strips endpoint paths (like get.php, player_api.php) and trailing slashes.
     * 
     * @param {string} url - Untrusted server URL input
     * @returns {string} Clean normalized server base URL (e.g., http://192.168.1.10:8080)
     */
    static normalizeServerUrl(url) {
        if (!url || typeof url !== 'string') return '';
        let trimmed = url.trim();
        if (!trimmed) return '';

        if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
            trimmed = 'http://' + trimmed;
        }

        try {
            const parsed = new URL(trimmed);
            return `${parsed.protocol}//${parsed.host}`.replace(/\/$/, '');
        } catch (e) {
            // Fallback stripping if URL object constructor fails
            return trimmed
                .replace(/\/(get|player_api|xmltv)\.php.*$/i, '')
                .replace(/\/$/, '');
        }
    }

    /**
     * Parses an Xtream server input string or full playlist link to extract base server URL,
     * username, and password if provided in URL parameters.
     * 
     * @param {string} input - Server URL or full get.php link
     * @returns {{ server: string, user: string, pass: string }}
     */
    static parseXtreamInput(input) {
        if (!input || typeof input !== 'string') return { server: '', user: '', pass: '' };
        let trimmed = input.trim();
        if (!trimmed) return { server: '', user: '', pass: '' };

        if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
            trimmed = 'http://' + trimmed;
        }

        let user = '';
        let pass = '';
        let server = '';

        try {
            const parsed = new URL(trimmed);
            server = `${parsed.protocol}//${parsed.host}`;
            const params = parsed.searchParams;
            user = params.get('username') || params.get('user') || '';
            pass = params.get('password') || params.get('pass') || '';
        } catch (e) {
            server = trimmed;
        }

        return {
            server: this.normalizeServerUrl(server),
            user: user ? user.trim() : '',
            pass: pass ? pass.trim() : ''
        };
    }

    /**
     * Validates and sanitizes a media or asset URL against security policies.
     * 
     * @param {string} rawUrl - Untrusted URL string.
     * @param {string} [fallback=''] - Safe fallback URL if validation fails.
     * @returns {string} Sanitized URL or fallback.
     * @throws {Error} Logs a warning if an invalid protocol is detected.
     */
    static validateURL(rawUrl, fallback = '') {
        if (!rawUrl || typeof rawUrl !== 'string') return fallback;
        let trimmed = rawUrl.trim();

        // Detect dangerous pseudo-protocols
        if (this.#DANGEROUS_PATTERNS.test(trimmed)) {
            console.warn('[Security] Dangerous pattern blocked in URL:', trimmed);
            return fallback;
        }

        // Auto-prepend http:// if host:port or host/path is given without protocol scheme
        if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) && !trimmed.startsWith('/') && !trimmed.startsWith('./') && !trimmed.startsWith('data:') && !trimmed.startsWith('blob:')) {
            trimmed = 'http://' + trimmed;
        }

        try {
            // Attempt standard URL parse
            const parsed = new URL(trimmed, window.location.origin);
            if (this.#ALLOWED_PROTOCOLS.test(parsed.protocol)) {
                return parsed.href;
            }
        } catch (e) {
            // If relative or custom format, perform regex scheme verification
            if (trimmed.startsWith('/') || trimmed.startsWith('./')) {
                return trimmed;
            }
        }

        console.warn('[Security] Untrusted URL scheme rejected:', rawUrl);
        return fallback;
    }

    /**
     * Deeply sanitizes a channel record object.
     * 
     * @param {Object} channel - Untrusted raw channel data object.
     * @param {string} channel.name - Channel title.
     * @param {string} channel.url - Stream URL.
     * @param {string} [channel.logo] - Channel logo image URL.
     * @param {string} [channel.group] - Group category.
     * @returns {Object} Cleaned, secure channel object.
     */
    static sanitizeChannel(channel) {
        if (!channel || typeof channel !== 'object') {
            return { name: 'Unknown Channel', url: '', logo: '', group: 'General', id: 'chan_' + Math.random().toString(36).substring(2), type: 'live', providerId: null };
        }

        const safeUrl = this.validateURL(channel.url, '');
        const safeLogo = this.validateURL(channel.logo, '');

        // Unescape entities to store clean plain text strings in memory and database.
        // UI rendering components call SecurityController.escapeHTML() when creating HTML templates.
        const cleanName = this.unescapeHTML(String(channel.name || 'Untitled Stream')).trim();
        const cleanGroup = this.unescapeHTML(String(channel.group || 'General')).trim();
        const cleanTvgId = this.unescapeHTML(String(channel.tvgId || '')).trim();
        const cleanTvgName = this.unescapeHTML(String(channel.tvgName || '')).trim();

        let detectedType = channel.type;
        if (!detectedType) {
            const urlLower = safeUrl.toLowerCase();
            const groupLower = cleanGroup.toLowerCase();
            if (urlLower.includes('/movie/') || /(vod|movie|film|cinema)/i.test(groupLower)) {
                detectedType = 'movie';
            } else if (urlLower.includes('/series/') || /(series|saison|season|show)/i.test(groupLower)) {
                detectedType = 'series';
            } else {
                detectedType = 'live';
            }
        }

        return {
            id: String(channel.id || 'chan_' + Math.random().toString(36).substr(2, 9)),
            name: cleanName,
            url: safeUrl,
            logo: safeLogo,
            group: cleanGroup,
            tvgId: cleanTvgId,
            tvgName: cleanTvgName,
            httpUserAgent: channel.httpUserAgent ? String(channel.httpUserAgent) : null,
            isAdult: Boolean(channel.isAdult || /(adult|18\+|xxx|erotic|porn)/i.test(cleanGroup || cleanName)),
            type: detectedType,
            providerId: channel.providerId || null,
            seriesId: channel.seriesId ? String(channel.seriesId) : null,
            vodId: channel.vodId ? String(channel.vodId) : (channel.streamId ? String(channel.streamId) : null),
            streamId: channel.streamId ? String(channel.streamId) : null,
            xtreamServer: channel.xtreamServer ? String(channel.xtreamServer) : null,
            xtreamUser: channel.xtreamUser ? String(channel.xtreamUser) : null,
            xtreamPass: channel.xtreamPass ? String(channel.xtreamPass) : null
        };
    }

    /**
     * Applies a simple XOR stream cipher for encrypting sensitive local data
     * such as parental control settings or user credentials stored in local storage.
     * 
     * @param {string} input - Plaintext or ciphertext string.
     * @param {string} [key='IPTV_SECURE_WASM_KEY_2026'] - Cryptographic cipher key.
     * @returns {string} Hex-encoded ciphertext or decoded plaintext.
     * @security Provides basic obfuscation against local data inspection.
     */
    static xorCipher(input, key = 'IPTV_SECURE_WASM_KEY_2026') {
        if (!input) return '';
        let result = '';
        for (let i = 0; i < input.length; i++) {
            const charCode = input.charCodeAt(i) ^ key.charCodeAt(i % key.length);
            result += String.fromCharCode(charCode);
        }
        return result;
    }

    /**
     * Hashes a parental control PIN using a SHA-256 web crypto buffer or fallback digest.
     * 
     * @param {string} pin - 4 to 8 digit user PIN.
     * @returns {Promise<string>} SHA-256 hash representation in hexadecimal.
     */
    static async hashPIN(pin) {
        const encoder = new TextEncoder();
        const data = encoder.encode(pin + '_SALT_IPTV_2026');
        if (window.crypto && window.crypto.subtle) {
            const buffer = await window.crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(buffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }
        // Fallback simple bit shift hash for legacy environments
        let hash = 0;
        for (let i = 0; i < pin.length; i++) {
            hash = (hash << 5) - hash + pin.charCodeAt(i);
            hash |= 0;
        }
        return hash.toString(16);
    }

    /**
     * Default CORS Proxy URL prefix used when proxy is enabled without a custom endpoint.
     * @type {string}
     */
    static DEFAULT_CORS_PROXY = 'https://corsproxy.io/?url=';

    /**
     * Constructs a proxy wrapped URL if a custom or default proxy service prefix is specified.
     * 
     * @param {string} targetUrl - Original HTTP/HTTPS stream URL.
     * @param {string} [proxyService=''] - Custom CORS Proxy endpoint prefix.
     * @param {string} [proxyToken=''] - Optional security token for authenticated CORS proxies.
     * @returns {string} Proxy-enabled or direct URL.
     */
    static buildProxyURL(targetUrl, proxyService = '', proxyToken = '') {
        if (!targetUrl) return '';
        if (targetUrl.startsWith('data:') || targetUrl.startsWith('blob:')) {
            return targetUrl;
        }
        if (!proxyService || typeof proxyService !== 'string') {
            return targetUrl;
        }
        let prefix = proxyService.trim();
        if (!prefix) {
            return targetUrl;
        }

        if (proxyToken && typeof proxyToken === 'string' && proxyToken.trim()) {
            const cleanToken = proxyToken.trim();
            if (!prefix.includes('token=') && !prefix.includes('key=') && !prefix.includes('secret=') && !prefix.includes('auth=')) {
                if (prefix.includes('?url')) {
                    prefix = prefix.replace('?url', `?token=${encodeURIComponent(cleanToken)}&url`);
                } else if (prefix.includes('?')) {
                    prefix += `&token=${encodeURIComponent(cleanToken)}`;
                } else {
                    prefix += `?token=${encodeURIComponent(cleanToken)}`;
                }
            }
        }

        if (prefix.includes('?url') && !prefix.endsWith('=')) {
            prefix += '=';
        }
        if (targetUrl.startsWith(prefix)) {
            return targetUrl;
        }
        return `${prefix}${encodeURIComponent(targetUrl)}`;
    }

    /**
     * Executes a fetch request with automatic fallback to CORS proxy if direct fetch
     * encounters network errors, cleartext traffic restriction, or CORS failures.
     * 
     * @param {string} targetUrl - Target request URL
     * @param {boolean} [useProxy=false] - Whether CORS proxy is explicitly enabled
     * @param {string} [customProxyUrl=''] - Optional custom proxy URL
     * @param {string} [proxyToken=''] - Optional proxy token
     * @param {Object} [fetchOptions={}] - Fetch API options
     * @returns {Promise<Response>} Fetch Response object
     */
    static async fetchWithFallback(targetUrl, useProxy = false, customProxyUrl = '', proxyToken = '', fetchOptions = {}) {
        const cleanUrl = this.validateURL(targetUrl);
        if (!cleanUrl) throw new Error('[Security] Invalid URL for fetch');

        const effectiveProxy = customProxyUrl.trim() || this.DEFAULT_CORS_PROXY;
        const primaryUrl = useProxy ? this.buildProxyURL(cleanUrl, effectiveProxy, proxyToken) : cleanUrl;

        try {
            const res = await fetch(primaryUrl, fetchOptions);
            if (res.ok) return res;

            // If primary direct fetch failed with non-OK status and proxy wasn't explicitly used
            if (!useProxy && primaryUrl === cleanUrl) {
                const fallbackUrl = this.buildProxyURL(cleanUrl, effectiveProxy, proxyToken);
                console.log(`[Security] Direct fetch returned HTTP ${res.status}. Retrying via proxy fallback: ${fallbackUrl}`);
                const fallbackRes = await fetch(fallbackUrl, fetchOptions);
                if (fallbackRes.ok) return fallbackRes;
            }
            return res;
        } catch (err) {
            console.warn(`[Security] Primary fetch error for ${primaryUrl}:`, err.message || err);
            // If primary direct network fetch threw an exception (e.g. CORS, Cleartext, or SSL error)
            if (!useProxy && primaryUrl === cleanUrl) {
                try {
                    const fallbackUrl = this.buildProxyURL(cleanUrl, effectiveProxy, proxyToken);
                    console.log(`[Security] Direct fetch failed. Retrying via CORS proxy fallback: ${fallbackUrl}`);
                    return await fetch(fallbackUrl, fetchOptions);
                } catch (proxyErr) {
                    console.warn('[Security] Proxy fallback attempt also failed:', proxyErr.message || proxyErr);
                }
            }
            throw err;
        }
    }
}
