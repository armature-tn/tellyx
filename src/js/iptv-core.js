/**
 * @file iptv-core.js
 * @description IPTV Core Manager - M3U/M3U8 Playlist Parser & Channel Repository.
 * Handles line-by-line M3U parsing, Xtream Codes API integration, preloaded public streams,
 * category grouping, IndexedDB/localStorage channel persistence, and search filters.
 * 
 * @module IPTVCore
 * @version 0.1.0
 * @author Armature.TN
 * @license Dual License: GNU AGPL-3.0 or Commercial License (SPDX: AGPL-3.0-or-later OR Commercial)
 */

import { SecurityController } from './security.js';

/**
 * @class IPTVCore
 * @classdesc Central repository for loading, parsing, storing, and organizing IPTV streams.
 */
export class IPTVCore {
    /**
     * @private
     * @type {Array<Object>}
     * @description In-memory store of all loaded channel objects.
     */
    #channels = [];

    /**
     * @private
     * @type {Array<Object>}
     * @description In-memory store of registered IPTV provider connections.
     */
    #providers = [];

    /**
     * @private
     * @type {Set<string>}
     * @description Set of favorite channel IDs.
     */
    #favorites = new Set();

    /**
     * @private
     * @type {Array<Object>}
     * @description Recently watched channels queue.
     */
    #recentHistory = [];

    /**
     * @private
     * @type {string}
     */
    #activeCategory = 'All';

    /**
     * @private
     * @type {boolean}
     * @description Tracks if the full channel array exceeded localStorage quota.
     */
    #channelsQuotaExceeded = false;

    /**
     * @private
     * @type {IDBDatabase|null}
     * @description IndexedDB instance reference.
     */
    #db = null;

    /**
     * @readonly
     * @type {Array<Object>}
     * @description Preloaded streams array (empty to allow user custom playlists only).
     */
    static PRELOADED_STREAMS = [];

    /**
     * Initializes the IPTV core repository from local storage and IndexedDB.
     */
    constructor() {
        this.#loadFromStorage();
        this.initDB();
    }

    /**
     * Initializes IndexedDB storage for persistent channel storage without size limits.
     * @returns {Promise<boolean>}
     */
    async initDB() {
        if (typeof window === 'undefined' || !window.indexedDB) return false;

        return new Promise((resolve) => {
            try {
                const request = window.indexedDB.open('TellyX_IPTV_DB', 1);

                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('channels')) {
                        const store = db.createObjectStore('channels', { keyPath: 'id' });
                        store.createIndex('providerId', 'providerId', { unique: false });
                        store.createIndex('type', 'type', { unique: false });
                        store.createIndex('group', 'group', { unique: false });
                    }
                };

                request.onsuccess = async (e) => {
                    this.#db = e.target.result;
                    await this.#loadFromIndexedDB();
                    resolve(true);
                };

                request.onerror = (e) => {
                    console.warn('[IPTVCore] IndexedDB open error:', e);
                    resolve(false);
                };
            } catch (err) {
                console.warn('[IPTVCore] IndexedDB setup exception:', err);
                resolve(false);
            }
        });
    }

    /**
     * Loads channels from IndexedDB into memory.
     * @private
     */
    async #loadFromIndexedDB() {
        if (!this.#db) return;

        return new Promise((resolve) => {
            try {
                const tx = this.#db.transaction('channels', 'readonly');
                const store = tx.objectStore('channels');
                const req = store.getAll();

                req.onsuccess = () => {
                    const idbChannels = req.result || [];
                    if (idbChannels.length > 0) {
                        this.#channels = idbChannels
                            .map(ch => SecurityController.sanitizeChannel(ch))
                            .filter(ch => ch && ch.url && !ch.id?.startsWith('preload_'));
                        console.log(`[IPTVCore] Successfully loaded ${this.#channels.length} channels from IndexedDB.`);
                    }
                    resolve();
                };

                req.onerror = () => {
                    console.warn('[IPTVCore] Failed to load channels from IndexedDB');
                    resolve();
                };
            } catch (err) {
                console.warn('[IPTVCore] IndexedDB transaction error:', err);
                resolve();
            }
        });
    }

    /**
     * Persists channels into IndexedDB object store.
     * @private
     */
    async #saveToIndexedDB() {
        if (!this.#db) return;

        return new Promise((resolve) => {
            try {
                const tx = this.#db.transaction('channels', 'readwrite');
                const store = tx.objectStore('channels');

                store.clear();

                for (const ch of this.#channels) {
                    if (ch && ch.id) {
                        store.put(ch);
                    }
                }

                tx.oncomplete = () => {
                    resolve();
                };

                tx.onerror = (e) => {
                    console.warn('[IPTVCore] Failed to save channels to IndexedDB:', e);
                    resolve();
                };
            } catch (err) {
                console.warn('[IPTVCore] IndexedDB save error:', err);
                resolve();
            }
        });
    }

    /**
     * Loads persisted playlist channels, favorites, and history from local storage.
     * @private
     */
    #loadFromStorage() {
        try {
            const savedFavorites = localStorage.getItem('iptv_favorites_v1');
            if (savedFavorites) {
                this.#favorites = new Set(JSON.parse(savedFavorites));
            }

            const savedChannels = localStorage.getItem('iptv_channels_v1');
            if (savedChannels) {
                const parsed = JSON.parse(savedChannels);
                // Filter out any legacy preloaded streams if saved in previous session
                this.#channels = parsed
                    .map(ch => SecurityController.sanitizeChannel(ch))
                    .filter(ch => ch && ch.url && !ch.id?.startsWith('preload_'));
            } else {
                this.#channels = [];
            }

            const savedHistory = localStorage.getItem('iptv_history_v1');
            if (savedHistory) {
                this.#recentHistory = JSON.parse(savedHistory)
                    .map(ch => SecurityController.sanitizeChannel(ch))
                    .filter(ch => ch && ch.url && !ch.id?.startsWith('preload_'));
            }

            const savedProviders = localStorage.getItem('tellyx_providers_v1');
            if (savedProviders) {
                this.#providers = JSON.parse(savedProviders);
            } else {
                this.#providers = [];
            }

            // Synthesize default providers if none exist but channels do
            if (this.#providers.length === 0 && this.#channels.length > 0) {
                const xtreamChannels = this.#channels.filter(c => c.id?.startsWith('xtream_'));
                if (xtreamChannels.length > 0) {
                    const p1 = {
                        id: 'prov_legacy_xtream',
                        type: 'xtream',
                        name: 'Xtream Codes Connection',
                        channelCount: xtreamChannels.length,
                        lastSync: new Date().toISOString(),
                        active: true
                    };
                    xtreamChannels.forEach(c => c.providerId = p1.id);
                    this.#providers.push(p1);
                }
                const otherChannels = this.#channels.filter(c => !c.id?.startsWith('xtream_'));
                if (otherChannels.length > 0) {
                    const savedM3uUrl = localStorage.getItem('iptv_m3u_url') || '';
                    const p2 = {
                        id: 'prov_legacy_m3u',
                        type: 'm3u_url',
                        name: 'Loaded M3U Playlist',
                        url: savedM3uUrl,
                        channelCount: otherChannels.length,
                        lastSync: new Date().toISOString(),
                        active: true
                    };
                    otherChannels.forEach(c => c.providerId = p2.id);
                    this.#providers.push(p2);
                }
                this.saveToStorage();
            }
        } catch (e) {
            console.warn('[IPTVCore] Local storage read notice:', e);
            this.#channels = [];
            this.#providers = [];
        }
    }

    /**
     * Persists channel state, favorites, history, and providers to browser storage.
     * Isolates each key in its own try/catch block so quota limits on heavy channel lists
     * never block persisting favorites, history, or provider connections.
     * 
     * @param {Object} [options={}]
     * @param {boolean} [options.forceChannels=false] - Force attempting to save channels even if previously hit quota.
     */
    saveToStorage(options = {}) {
        const { forceChannels = false } = options;

        // 1. Always save Favorites
        try {
            localStorage.setItem('iptv_favorites_v1', JSON.stringify(Array.from(this.#favorites)));
        } catch (err) {
            // Ignore quota error for favorites
        }

        // 2. Always save Recent History
        try {
            localStorage.setItem('iptv_history_v1', JSON.stringify(this.#recentHistory));
        } catch (err) {
            // Ignore quota error for history
        }

        // 3. Always save Providers metadata
        try {
            localStorage.setItem('tellyx_providers_v1', JSON.stringify(this.#providers));
        } catch (err) {
            // Ignore quota error for providers
        }

        // 4. Always save full channels dataset to IndexedDB
        this.#saveToIndexedDB();

        // 5. Save Channels list to localStorage with full metadata preservation & quota guarding
        if (!this.#channelsQuotaExceeded || forceChannels) {
            try {
                // If channel list is very large (> 1500 items), save a compact representation (first 1000 items with ALL metadata)
                if (this.#channels.length > 1500) {
                    this.#channelsQuotaExceeded = true;
                    const sample = this.#channels.slice(0, 1000).map(c => ({
                        id: c.id,
                        name: c.name,
                        url: c.url,
                        logo: c.logo,
                        group: c.group,
                        type: c.type,
                        tvgId: c.tvgId,
                        tvgName: c.tvgName,
                        providerId: c.providerId,
                        seriesId: c.seriesId,
                        vodId: c.vodId,
                        streamId: c.streamId,
                        xtreamServer: c.xtreamServer,
                        xtreamUser: c.xtreamUser,
                        xtreamPass: c.xtreamPass
                    }));
                    localStorage.setItem('iptv_channels_v1', JSON.stringify(sample));
                    return;
                }

                localStorage.setItem('iptv_channels_v1', JSON.stringify(this.#channels));
                this.#channelsQuotaExceeded = false;
            } catch (e) {
                this.#channelsQuotaExceeded = true;
                try {
                    // Fallback to storing up to 300 essential channels with full metadata
                    const compact = this.#channels.slice(0, 300).map(c => ({
                        id: c.id,
                        name: c.name,
                        url: c.url,
                        logo: c.logo,
                        group: c.group,
                        type: c.type,
                        tvgId: c.tvgId,
                        tvgName: c.tvgName,
                        providerId: c.providerId,
                        seriesId: c.seriesId,
                        vodId: c.vodId,
                        streamId: c.streamId,
                        xtreamServer: c.xtreamServer,
                        xtreamUser: c.xtreamUser,
                        xtreamPass: c.xtreamPass
                    }));
                    localStorage.setItem('iptv_channels_v1', JSON.stringify(compact));
                } catch (fallbackErr) {
                    // Browser storage full: channels remain safely in IndexedDB and memory
                }
            }
        }
    }

    /**
     * Parses an M3U / M3U8 playlist plain text content line-by-line into channel objects.
     * 
     * @param {string} m3uText - Raw M3U string content.
     * @returns {Array<Object>} List of newly parsed sanitized channel objects.
     * @complexity O(N) where N is the number of lines.
     * @security Sanitizes tags and channel metadata.
     */
    parseM3U(m3uText) {
        if (!m3uText || typeof m3uText !== 'string') return [];

        const lines = m3uText.split(/\r?\n/);
        const parsed = [];
        let currentMeta = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            if (line.startsWith('#EXTINF:')) {
                currentMeta = this.#parseEXTINF(line);
            } else if (!line.startsWith('#')) {
                if (currentMeta) {
                    currentMeta.url = line;
                    parsed.push(SecurityController.sanitizeChannel(currentMeta));
                    currentMeta = null;
                } else {
                    // Raw stream line without metadata
                    parsed.push(SecurityController.sanitizeChannel({
                        name: `Channel ${parsed.length + 1}`,
                        url: line,
                        group: 'Uncategorized'
                    }));
                }
            }
        }

        console.log(`[IPTVCore] Successfully parsed ${parsed.length} channels from M3U input.`);
        return parsed;
    }

    /**
     * Parses a single #EXTINF header line.
     * @private
     * @param {string} headerLine - Line starting with #EXTINF:
     * @returns {Object} Extracted attribute key-value mapping.
     */
    #parseEXTINF(headerLine) {
        const result = {
            id: 'chan_' + Math.random().toString(36).substring(2, 9),
            name: '',
            logo: '',
            group: 'General',
            tvgId: '',
            tvgName: ''
        };

        // Extract channel title after last comma
        const commaIdx = headerLine.lastIndexOf(',');
        if (commaIdx !== -1) {
            result.name = headerLine.substring(commaIdx + 1).trim();
        }

        // Extract attributes
        const tvgIdMatch = headerLine.match(/tvg-id="([^"]*)"/i);
        if (tvgIdMatch) result.tvgId = tvgIdMatch[1];

        const tvgNameMatch = headerLine.match(/tvg-name="([^"]*)"/i);
        if (tvgNameMatch) result.tvgName = tvgNameMatch[1];

        const logoMatch = headerLine.match(/tvg-logo="([^"]*)"/i);
        if (logoMatch) result.logo = logoMatch[1];

        const groupMatch = headerLine.match(/group-title="([^"]*)"/i);
        if (groupMatch) result.group = groupMatch[1];

        return result;
    }

    /**
     * Imports Xtream Codes IPTV API credentials.
     * 
     * @async
     * @param {string} serverUrl - Server domain and port (e.g. http://iptv.provider:8080)
     * @param {string} username - Xtream username
     * @param {string} password - Xtream password
     * @returns {Promise<Array<Object>>} Parsed channels.
     */
    async importXtreamCodes(serverUrl, username, password) {
        const cleanServer = SecurityController.normalizeServerUrl(serverUrl);
        const m3uPlusUrl = `${cleanServer}/get.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&type=m3u_plus`;

        console.log('[IPTVCore] Requesting Xtream Codes playlist stream:', m3uPlusUrl);
        const response = await SecurityController.fetchWithFallback(m3uPlusUrl);
        if (!response.ok) {
            throw new Error(`Xtream Codes authentication failed with HTTP status ${response.status}`);
        }
        const text = await response.text();
        const channels = this.parseM3U(text);
        this.addChannels(channels, true);
        return channels;
    }

    /**
     * Sets or appends channels to the core repository.
     * 
     * @param {Array<Object>} newChannels - List of channel objects.
     * @param {boolean} [replace=false] - If true, replaces existing channel list.
     */
    addChannels(newChannels, replace = false) {
        const sanitized = (newChannels || [])
            .map(ch => SecurityController.sanitizeChannel(ch))
            .filter(ch => ch && ch.url);
        if (replace) {
            this.#channels = sanitized;
        } else {
            this.#channels = [...this.#channels, ...sanitized];
        }
        this.saveToStorage({ forceChannels: true });
    }

    /**
     * Toggles a channel's favorite status.
     * 
     * @param {string} channelId - Channel ID.
     * @returns {boolean} True if now favorited, false if removed.
     */
    toggleFavorite(channelId) {
        if (this.#favorites.has(channelId)) {
            this.#favorites.delete(channelId);
            this.saveToStorage();
            return false;
        } else {
            this.#favorites.add(channelId);
            this.saveToStorage();
            return true;
        }
    }

    /**
     * Checks if a channel is favorited.
     * @param {string} channelId
     * @returns {boolean}
     */
    isFavorite(channelId) {
        return this.#favorites.has(channelId);
    }

    /**
     * Adds a channel to the recently played history.
     * @param {Object} channel 
     */
    addToHistory(channel) {
        this.#recentHistory = this.#recentHistory.filter(c => c.id !== channel.id);
        this.#recentHistory.unshift(channel);
        if (this.#recentHistory.length > 20) {
            this.#recentHistory.pop();
        }
        this.saveToStorage();
    }

    /**
     * Returns list of unique categories/groups across all loaded channels.
     * 
     * @returns {Array<string>} Group names array.
     */
    /**
     * Gets list of distinct categories for loaded channels.
     * 
     * @param {string} [type='live'] - Optional content type filter ('live', 'movie', 'series', 'all')
     * @returns {Array<string>} Group names array.
     */
    getCategories(type = 'live') {
        const categories = new Set(['All', 'Favorites', 'Recently Watched']);
        this.#channels.forEach(ch => {
            if (type && type !== 'all' && (ch.type || 'live') !== type) return;
            if (ch.group) categories.add(ch.group);
        });
        return Array.from(categories);
    }

    /**
     * Searches both categories and channels matching a search query.
     * 
     * @param {string} searchQuery - Search term.
     * @param {boolean} [hideAdult=true] - Whether to filter out adult channels.
     * @param {string} [type='live'] - Content type filter.
     * @returns {{ categories: Array<{ name: string, count: number }>, channels: Array<Object> }}
     */
    searchCategoriesAndChannels(searchQuery = '', hideAdult = true, type = 'live') {
        if (!searchQuery || !searchQuery.trim()) {
            return { categories: [], channels: [] };
        }

        const query = searchQuery.toLowerCase().trim();
        let channels = [...this.#channels];

        if (hideAdult) {
            channels = channels.filter(ch => !ch.isAdult && !/adult|18\+|xxx/i.test(ch.group || '') && !/adult|18\+|xxx/i.test(ch.name || ''));
        }

        if (type && type !== 'all') {
            channels = channels.filter(ch => (ch.type || 'live') === type);
        }

        channels = channels.filter(ch => ch && ch.url);

        // Matching channels
        const matchingChannels = channels.filter(ch => 
            (ch.name && ch.name.toLowerCase().includes(query)) || 
            (ch.group && ch.group.toLowerCase().includes(query)) ||
            (ch.tvgId && ch.tvgId.toLowerCase().includes(query))
        );

        // Matching categories
        const categoryCounts = {};
        channels.forEach(ch => {
            if (!ch.group) return;
            const groupLower = ch.group.toLowerCase();
            const chNameLower = (ch.name || '').toLowerCase();

            if (groupLower.includes(query) || chNameLower.includes(query)) {
                categoryCounts[ch.group] = (categoryCounts[ch.group] || 0) + 1;
            }
        });

        const matchingCategories = Object.keys(categoryCounts).map(catName => ({
            name: catName,
            count: categoryCounts[catName]
        }));

        return {
            categories: matchingCategories,
            channels: matchingChannels
        };
    }

    /**
     * Gets filtered channel list based on category, search query, content type, and sorting.
     * 
     * @param {string} [category='All'] - Active category filter.
     * @param {string} [searchQuery=''] - Search term.
     * @param {boolean} [hideAdult=false] - Whether to filter out adult channels.
     * @param {string} [type='live'] - 'live' | 'movie' | 'series'
     * @param {string} [sortMode='default'] - 'default' | 'name' | 'group' | 'favorites'
     * @returns {Array<Object>} Filtered list of channels.
     */
    getChannels(category = 'All', searchQuery = '', hideAdult = false, type = 'live', sortMode = 'default') {
        let list = [...this.#channels];

        // Filter adult content if parental lock active
        if (hideAdult) {
            list = list.filter(ch => !ch.isAdult && !/adult|18\+|xxx/i.test(ch.group || '') && !/adult|18\+|xxx/i.test(ch.name || ''));
        }

        // Content type filter (Live TV, Movies VOD, Series VOD)
        if (type && type !== 'all') {
            list = list.filter(ch => (ch.type || 'live') === type);
        }

        const query = searchQuery ? searchQuery.toLowerCase().trim() : '';

        if (query) {
            // Check if query matches channels in the specific selected category
            const matchInCurrentCategory = list.filter(ch => {
                const matchesCategory = category === 'All' || 
                    (category === 'Favorites' && this.#favorites.has(ch.id)) ||
                    (category === 'Recently Watched' && this.#recentHistory.some(r => r.id === ch.id)) ||
                    (ch.group === category);

                const matchesQuery = (ch.name && ch.name.toLowerCase().includes(query)) || 
                    (ch.group && ch.group.toLowerCase().includes(query)) ||
                    (ch.tvgId && ch.tvgId.toLowerCase().includes(query));

                return matchesCategory && matchesQuery;
            });

            if (matchInCurrentCategory.length > 0) {
                list = matchInCurrentCategory;
            } else {
                // Search across all channels if nothing matched in current selected category
                list = list.filter(ch => 
                    (ch.name && ch.name.toLowerCase().includes(query)) || 
                    (ch.group && ch.group.toLowerCase().includes(query)) ||
                    (ch.tvgId && ch.tvgId.toLowerCase().includes(query))
                );
            }
        } else {
            // Category filter when no search query
            if (category === 'Favorites') {
                list = list.filter(ch => this.#favorites.has(ch.id));
            } else if (category === 'Recently Watched') {
                list = [...this.#recentHistory];
            } else if (category !== 'All') {
                list = list.filter(ch => ch.group === category);
            }
        }

        // Ensure all items have valid stream URLs
        list = list.filter(ch => ch && ch.url);

        // Sorting
        if (sortMode === 'name') {
            list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        } else if (sortMode === 'group') {
            list.sort((a, b) => (a.group || '').localeCompare(b.group || ''));
        } else if (sortMode === 'favorites') {
            list.sort((a, b) => (this.#favorites.has(b.id) ? 1 : 0) - (this.#favorites.has(a.id) ? 1 : 0));
        }

        return list;
    }

    /**
     * Alias for getChannels to support filtered query retrieval.
     */
    getFilteredChannels(category = 'All', searchQuery = '', hideAdult = false, type = 'live', sortMode = 'default') {
        return this.getChannels(category, searchQuery, hideAdult, type, sortMode);
    }

    /**
     * Retrieves all connected provider connection objects.
     * @returns {Array<Object>}
     */
    getProviders() {
        return [...this.#providers];
    }

    /**
     * Gets a single provider by ID.
     * @param {string} providerId 
     * @returns {Object|null}
     */
    getProvider(providerId) {
        return this.#providers.find(p => p.id === providerId) || null;
    }

    /**
     * Saves or updates a provider object.
     * @param {Object} provider 
     */
    saveProvider(provider) {
        if (!provider || !provider.id) return;
        const idx = this.#providers.findIndex(p => p.id === provider.id);
        if (idx >= 0) {
            this.#providers[idx] = { ...this.#providers[idx], ...provider };
        } else {
            this.#providers.push({ ...provider });
        }
        this.saveToStorage();
    }

    /**
     * Attaches channel list to a specific provider and updates repository.
     * 
     * @param {Object} provider - Provider metadata object.
     * @param {Array<Object>} newChannels - List of channel objects.
     * @param {boolean} [replaceProviderChannels=true] - Replace channels associated with this provider.
     */
    addChannelsForProvider(provider, newChannels, replaceProviderChannels = true) {
        if (!provider || !provider.id) return;

        const sanitized = (newChannels || [])
            .map(ch => {
                const s = SecurityController.sanitizeChannel(ch);
                if (s) s.providerId = provider.id;
                return s;
            })
            .filter(ch => ch && ch.url);

        if (replaceProviderChannels) {
            this.#channels = this.#channels.filter(ch => ch.providerId !== provider.id);
            this.#channels = [...this.#channels, ...sanitized];
        } else {
            this.#channels = [...this.#channels, ...sanitized];
        }

        provider.channelCount = sanitized.length;
        provider.lastSync = new Date().toISOString();
        this.saveProvider(provider);
    }

    /**
     * Removes a provider and deletes all associated channels.
     * @param {string} providerId 
     */
    deleteProvider(providerId) {
        this.#providers = this.#providers.filter(p => p.id !== providerId);
        this.#channels = this.#channels.filter(c => c.providerId && c.providerId !== providerId);
        if (this.#providers.length === 0) {
            this.#channels = [];
            localStorage.removeItem('iptv_m3u_url');
            localStorage.removeItem('tellyx_connection_active');
            localStorage.removeItem('tellyx_providers_v1');
        }
        this.saveToStorage();
    }

    /**
     * Resets playlist channels and clears saved channel storage.
     */
    resetToDefaults() {
        this.#channels = [];
        this.#providers = [];
        this.#favorites.clear();
        this.#recentHistory = [];
        localStorage.removeItem('tellyx_providers_v1');
        this.saveToStorage();
    }

    /**
     * Total channels count.
     * @returns {number}
     */
    get totalChannels() {
        return this.#channels.length;
    }
}
