/**
 * @file epg-engine.js
 * @description XMLTV Electronic Program Guide (EPG) Engine.
 * Parses XMLTV schedule feeds, generates synthetic live EPG schedules for channels,
 * tracks current program progress, and renders interactive TV Guide timelines.
 * 
 * @module EPGEngine
 * @version 0.1.0
 * @author Armature.TN
 * @license Dual License: GNU AGPL-3.0 or Commercial License (SPDX: AGPL-3.0-or-later OR Commercial)
 */

import { SecurityController } from './security.js';

/**
 * @class EPGEngine
 * @classdesc Program schedule guide controller providing schedule parsing,
 * real-time program lookup, progress calculations, and XMLTV feeds.
 */
export class EPGEngine {
    /**
     * @private
     * @type {Map<string, Array<Object>>}
     * @description Map of channel ID / tvg-id to program schedules.
     */
    #schedules = new Map();

    /**
     * @private
     * @type {Map<string, Array<Object>>}
     * @description O(1) normalized lookup map for channel keys and names.
     */
    #normSchedules = new Map();

    /**
     * Rebuilds O(1) normalized lookup map for fast schedule matching.
     * @private
     */
    #rebuildNormSchedules() {
        this.#normSchedules.clear();
        for (const [key, progList] of this.#schedules.entries()) {
            if (progList && progList.length > 0) {
                const normKey = String(key).trim().toLowerCase();
                this.#normSchedules.set(normKey, progList);
            }
        }
    }

    /**
     * Parses an XMLTV format XML string.
     * 
     * @param {string} xmlString - Raw XMLTV string.
     * @returns {number} Number of parsed programs.
     * @complexity O(N) where N is number of XML nodes.
     * @security Sanitizes program titles, descriptions, and categories against XSS.
     */
    parseXMLTV(xmlString) {
        if (!xmlString) return 0;
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
            const programmes = xmlDoc.querySelectorAll('programme');
            let count = 0;

            programmes.forEach(prog => {
                const channelId = prog.getAttribute('channel');
                const startRaw = prog.getAttribute('start');
                const stopRaw = prog.getAttribute('stop');
                const titleNode = prog.querySelector('title');
                const descNode = prog.querySelector('desc');
                const categoryNode = prog.querySelector('category');

                if (channelId && startRaw && stopRaw && titleNode) {
                    const programObj = {
                        title: SecurityController.escapeHTML(titleNode.textContent || 'Untitled Program'),
                        desc: SecurityController.escapeHTML(descNode ? descNode.textContent : 'No program description available.'),
                        category: SecurityController.escapeHTML(categoryNode ? categoryNode.textContent : 'General'),
                        startTime: this.#parseXMLTVDate(startRaw),
                        endTime: this.#parseXMLTVDate(stopRaw)
                    };

                    if (!this.#schedules.has(channelId)) {
                        this.#schedules.set(channelId, []);
                    }
                    this.#schedules.get(channelId).push(programObj);
                    count++;
                }
            });

            this.#rebuildNormSchedules();
            console.log(`[EPGEngine] Successfully imported ${count} XMLTV program entries.`);
            return count;
        } catch (e) {
            console.warn('[EPGEngine] Failed to parse XMLTV data:', e);
            return 0;
        }
    }

    /**
     * Converts XMLTV date format (YYYYMMDDHHMMSS +HHMM) to standard JS Date.
     * @private
     * @param {string} dateStr - XMLTV formatted date string.
     * @returns {Date}
     */
    #parseXMLTVDate(dateStr) {
        if (!dateStr || dateStr.length < 14) return new Date();
        const year = parseInt(dateStr.substring(0, 4), 10);
        const month = parseInt(dateStr.substring(4, 6), 10) - 1;
        const day = parseInt(dateStr.substring(6, 8), 10);
        const hour = parseInt(dateStr.substring(8, 10), 10);
        const min = parseInt(dateStr.substring(10, 12), 10);
        const sec = parseInt(dateStr.substring(12, 14), 10);
        return new Date(Date.UTC(year, month, day, hour, min, sec));
    }

    /**
     * Gets schedule for a channel if available.
     * Returns empty array if channel does not provide EPG.
     * 
     * @param {string} channelKey - Channel TVG ID or Channel ID.
     * @param {string} [channelName=''] - Channel name for fallback matching.
     * @returns {Array<Object>} List of program schedules for today or empty array.
     */
    getScheduleForChannel(channelKey, channelName = '') {
        if (!channelKey && !channelName) return [];

        // 1. Direct match by channelKey
        if (channelKey && this.#schedules.has(channelKey)) {
            const list = this.#schedules.get(channelKey);
            if (list && list.length > 0) return list;
        }

        // 2. Direct match by channelName
        if (channelName && this.#schedules.has(channelName)) {
            const list = this.#schedules.get(channelName);
            if (list && list.length > 0) return list;
        }

        // 3. Fast O(1) Normalized matching
        const normKey = channelKey ? String(channelKey).trim().toLowerCase() : '';
        const normName = channelName ? String(channelName).trim().toLowerCase() : '';

        if (normKey && this.#normSchedules.has(normKey)) {
            return this.#normSchedules.get(normKey);
        }
        if (normName && this.#normSchedules.has(normName)) {
            return this.#normSchedules.get(normName);
        }

        // Return empty array if channel does not provide XMLTV EPG
        return [];
    }

    /**
     * Finds the currently airing program for a channel.
     * 
     * @param {string} channelKey - Channel TVG ID or Channel ID.
     * @param {string} [channelName=''] - Fallback title matching.
     * @returns {Object} Currently playing program object or No EPG object.
     */
    getCurrentProgram(channelKey, channelName = '') {
        const schedule = this.getScheduleForChannel(channelKey, channelName);
        const now = new Date();

        if (schedule && schedule.length > 0) {
            for (const prog of schedule) {
                if (now >= prog.startTime && now <= prog.endTime) {
                    const totalMs = prog.endTime.getTime() - prog.startTime.getTime();
                    const elapsedMs = now.getTime() - prog.startTime.getTime();
                    const progressPct = Math.min(100, Math.max(0, Math.round((elapsedMs / totalMs) * 100)));

                    return {
                        ...prog,
                        hasEpg: true,
                        progressPct,
                        formattedStart: this.#formatTime(prog.startTime),
                        formattedEnd: this.#formatTime(prog.endTime)
                    };
                }
            }
        }

        // Return No EPG state when channel does not provide EPG
        return {
            title: 'No EPG available',
            desc: 'No program guide information available for this channel.',
            category: 'No EPG',
            hasEpg: false,
            startTime: null,
            endTime: null,
            progressPct: 0,
            formattedStart: '',
            formattedEnd: ''
        };
    }

    /**
     * Helper to render a single channel matrix row HTML string.
     * @private
     */
    #renderRowHTML(ch, activeChannelId) {
        const schedule = this.getScheduleForChannel(ch.tvgId || ch.id, ch.name);
        const isPlaying = activeChannelId && (ch.id === activeChannelId);
        const hasSchedule = schedule && schedule.length > 0;
        const now = new Date();

        return `
            <div class="flex items-stretch transition-colors group cursor-pointer ${
                isPlaying 
                    ? 'bg-rose-950/40 border-l-4 border-l-rose-500 ring-1 ring-rose-500/30' 
                    : 'hover:bg-slate-800/40'
            }" data-channel-id="${ch.id}">
                <!-- FIXED CHANNEL LOGO / NAME COLUMN -->
                <div class="w-48 lg:w-56 p-2.5 flex-shrink-0 border-r border-slate-800/80 bg-slate-950/60 flex items-center space-x-2.5 group-hover:bg-rose-600/10 transition-colors ${
                    isPlaying ? '!bg-rose-950/80 border-r-rose-500/60' : ''
                }">
                    <img src="${ch.logo}" loading="lazy" class="w-7 h-7 rounded-lg object-contain bg-slate-900 border ${isPlaying ? 'border-rose-500/60' : 'border-slate-800'} flex-shrink-0" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1593784991095-a205069470b6?w=60&auto=format&fit=crop&q=60'">
                    <div class="truncate flex-1 min-w-0">
                        <div class="text-xs font-bold ${isPlaying ? 'text-rose-400' : 'text-slate-200'} group-hover:text-rose-400 truncate flex items-center justify-between">
                            <span class="truncate">${ch.name}</span>
                            ${isPlaying ? '<span class="ml-1 px-1.5 py-0.2 text-[8px] font-extrabold bg-rose-600 text-white rounded shrink-0 uppercase tracking-wider animate-pulse">Playing</span>' : ''}
                        </div>
                        <div class="text-[10px] text-slate-500 truncate">${ch.group || 'General'}</div>
                    </div>
                </div>

                <!-- SHOW BLOCKS HORIZONTAL SLOTS -->
                <div class="flex-1 flex min-w-[720px] items-center p-1 space-x-1 overflow-hidden">
                    ${hasSchedule ? schedule.slice(0, 4).map((prog) => {
                        const isCurrent = now >= prog.startTime && now <= prog.endTime;
                        return `
                            <div class="flex-1 h-10 p-2 rounded-lg border text-left flex flex-col justify-center truncate transition-all ${
                                isCurrent 
                                    ? 'bg-rose-600/20 border-rose-500/60 text-rose-200 shadow-md shadow-rose-500/10' 
                                    : 'bg-slate-900/80 border-slate-800/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                            }">
                                <div class="text-[11px] font-semibold truncate flex items-center justify-between">
                                    <span class="truncate">${prog.title}</span>
                                    ${isCurrent ? '<span class="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping ml-1 flex-shrink-0"></span>' : ''}
                                </div>
                                <div class="text-[9px] text-slate-500 truncate font-mono">${this.#formatTime(prog.startTime)} - ${this.#formatTime(prog.endTime)}</div>
                            </div>
                        `;
                    }).join('') : `
                        <div class="flex-1 h-10 px-3 py-2 rounded-lg bg-slate-950/40 border border-slate-800/40 text-slate-500 text-xs font-medium italic flex items-center justify-center">
                            No EPG available
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    /**
     * Renders horizontal matrix EPG into target container with lazy loading.
     * 
     * @param {HTMLElement} container - Target DOM element for matrix grid.
     * @param {Array<Object>} channels - List of channels to render in matrix.
     * @param {Function} [onSelectChannel] - Callback when channel or show is clicked.
     * @param {string|null} [activeChannelId=null] - Currently playing channel ID to highlight.
     * @param {number} [limit=30] - Number of channels to render in current batch.
     * @param {Function} [onLoadMore=null] - Callback when "Load More" is triggered.
     * @param {boolean} [shouldScrollActive=false] - Whether to scroll active channel into view.
     * @param {boolean} [isAppend=false] - Whether to append new batch instead of replacing container DOM.
     * @param {string} [selectedCategory=''] - Current category filter.
     * @param {string} [selectedQuery=''] - Current search query filter.
     */
    renderMatrixGrid(container, channels = [], onSelectChannel, activeChannelId = null, limit = 30, onLoadMore = null, shouldScrollActive = false, isAppend = false, selectedCategory = '', selectedQuery = '') {
        if (!container) return;

        if (!channels || channels.length === 0) {
            container.innerHTML = `
                <div class="p-12 text-center text-slate-400 space-y-3">
                    <svg class="w-12 h-12 text-slate-600 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    <p class="text-sm font-semibold text-slate-300">No channels found in this category or search filter</p>
                    <p class="text-xs text-slate-500">Try selecting another category or clearing your search filter above.</p>
                </div>
            `;
            return;
        }

        const rowsContainer = container.querySelector('#epgRowsContainer');
        const loadMoreContainer = container.querySelector('#epgLoadMoreContainer');
        const headerCountEl = container.querySelector('#epgHeaderCount');

        const prevCat = container.dataset.category || '';
        const prevQuery = container.dataset.query || '';
        const filterChanged = (prevCat !== String(selectedCategory)) || (prevQuery !== String(selectedQuery));

        if (isAppend && !filterChanged && rowsContainer && loadMoreContainer && headerCountEl) {
            // INCREMENTAL DOM APPEND MODE (No DOM destruction, no scroll jump)
            const currentCount = rowsContainer.children.length;
            const newBatch = channels.slice(currentCount, limit);

            if (newBatch.length > 0) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = newBatch.map(ch => this.#renderRowHTML(ch, activeChannelId)).join('');

                const newRows = Array.from(tempDiv.children);
                newRows.forEach(row => {
                    const id = row.getAttribute('data-channel-id');
                    row.addEventListener('click', () => {
                        if (onSelectChannel) onSelectChannel(id);
                    });
                    rowsContainer.appendChild(row);
                });

                const renderedCount = rowsContainer.children.length;
                headerCountEl.textContent = `CHANNELS (${renderedCount} of ${channels.length})`;

                if (channels.length > renderedCount) {
                    loadMoreContainer.innerHTML = `
                        <div class="p-4 border-t border-slate-800 bg-slate-950/90 flex flex-col items-center justify-center space-y-2">
                            <div class="text-[11px] text-slate-400 font-mono">
                                Showing <span class="text-rose-400 font-bold">${renderedCount}</span> of <span class="text-white font-bold">${channels.length}</span> channels in EPG
                            </div>
                            <button id="btnLoadMoreEpgChannels" class="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-lg shadow-rose-900/30 flex items-center space-x-2 active:scale-95">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>
                                <span>Load More Channels (+30)</span>
                            </button>
                        </div>
                    `;
                    const btnMore = loadMoreContainer.querySelector('#btnLoadMoreEpgChannels');
                    if (btnMore && onLoadMore) {
                        btnMore.addEventListener('click', (e) => {
                            e.stopPropagation();
                            onLoadMore();
                        });
                    }
                } else {
                    loadMoreContainer.innerHTML = '';
                }
            }
            return;
        }

        // FULL INITIAL RENDER MODE WITH PROGRESS ANIMATION
        container.dataset.category = String(selectedCategory);
        container.dataset.query = String(selectedQuery);

        // Immediate Loading Progress Display
        container.innerHTML = `
            <div class="p-10 flex flex-col items-center justify-center space-y-4 text-center bg-slate-950/80 rounded-2xl border border-slate-800/80 backdrop-blur-sm min-h-[320px] shadow-2xl">
                <div class="relative w-12 h-12 flex items-center justify-center">
                    <div class="absolute inset-0 rounded-full border-4 border-rose-500/20 border-t-rose-500 animate-spin"></div>
                    <div class="absolute inset-2 rounded-full border-4 border-amber-500/20 border-b-amber-500 animate-spin" style="animation-direction: reverse; animation-duration: 0.75s;"></div>
                    <svg class="w-5 h-5 text-rose-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 002-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                </div>
                <div class="space-y-1">
                    <div class="text-sm font-bold text-white tracking-wide">Building EPG Guide Matrix</div>
                    <div class="text-xs text-rose-400 font-mono" id="epgLoadingStatusText">Processing ${channels.length} channels...</div>
                </div>
                <div class="w-64 bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                    <div id="epgLoadingProgressBar" class="bg-gradient-to-r from-rose-500 via-amber-500 to-rose-400 h-full rounded-full transition-all duration-200 shadow-glow" style="width: 35%"></div>
                </div>
            </div>
        `;

        const visibleSlice = channels.slice(0, limit);
        const now = new Date();
        const currentHour = now.getHours();

        // 6 time columns starting 1 hour ago
        const timeHeaders = [];
        for (let i = -1; i <= 6; i++) {
            const timeDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), currentHour + i, 0, 0);
            timeHeaders.push({
                label: timeDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                date: timeDate
            });
        }

        // Defer timeline DOM construction to next animation frame so progress spinner shows instantly
        requestAnimationFrame(() => {
            const progressBar = container.querySelector('#epgLoadingProgressBar');
            if (progressBar) progressBar.style.width = '75%';

            setTimeout(() => {
                const rowsHTML = visibleSlice.map(ch => this.#renderRowHTML(ch, activeChannelId)).join('');

                let html = `
                    <div class="epg-matrix-timeline bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto shadow-2xl relative">
                        <!-- RED TIME MARKER -->
                        <div class="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-30 pointer-events-none shadow-glow" style="left: 220px;" title="Current Time"></div>

                        <!-- MATRIX HEADER -->
                        <div class="flex border-b border-slate-800 bg-slate-950/90 sticky top-0 z-20 font-mono text-[11px] font-bold text-slate-400">
                            <div class="w-48 lg:w-56 p-3 flex-shrink-0 border-r border-slate-800 text-slate-300 flex items-center justify-between bg-slate-950">
                                <span id="epgHeaderCount">CHANNELS (${visibleSlice.length} of ${channels.length})</span>
                                <span class="text-[10px] text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded">LIVE</span>
                            </div>
                            <div class="flex-1 flex min-w-[720px]">
                                ${timeHeaders.map(th => `
                                    <div class="flex-1 p-3 border-r border-slate-800/60 text-center">
                                        ${th.label}
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <!-- MATRIX ROWS -->
                        <div id="epgRowsContainer" class="divide-y divide-slate-800/60">
                            ${rowsHTML}
                        </div>

                        <!-- LOAD MORE CONTAINER -->
                        <div id="epgLoadMoreContainer">
                            ${channels.length > visibleSlice.length ? `
                                <div class="p-4 border-t border-slate-800 bg-slate-950/90 flex flex-col items-center justify-center space-y-2">
                                    <div class="text-[11px] text-slate-400 font-mono">
                                        Showing <span class="text-rose-400 font-bold">${visibleSlice.length}</span> of <span class="text-white font-bold">${channels.length}</span> channels in EPG
                                    </div>
                                    <button id="btnLoadMoreEpgChannels" class="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-lg shadow-rose-900/30 flex items-center space-x-2 active:scale-95">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>
                                        <span>Load More Channels (+30)</span>
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;

                container.innerHTML = html;

                // Attach click listeners to matrix rows
                container.querySelectorAll('[data-channel-id]').forEach(row => {
                    row.addEventListener('click', () => {
                        const id = row.getAttribute('data-channel-id');
                        if (onSelectChannel) onSelectChannel(id);
                    });
                });

                // Attach load more button listener
                const btnMore = container.querySelector('#btnLoadMoreEpgChannels');
                if (btnMore && onLoadMore) {
                    btnMore.addEventListener('click', (e) => {
                        e.stopPropagation();
                        onLoadMore();
                    });
                }

                // Scroll currently playing channel into view ONLY if requested
                if (shouldScrollActive && activeChannelId) {
                    const activeRow = container.querySelector(`[data-channel-id="${activeChannelId}"]`);
                    if (activeRow) {
                        setTimeout(() => {
                            activeRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                        }, 50);
                    }
                }
            }, 15);
        });
    }

    /**
     * Formats Date to HH:MM string.
     * @private
     * @param {Date} date
     * @returns {string}
     */
    #formatTime(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    /**
     * Simple hash helper.
     * @private
     */
    #simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    }
}
