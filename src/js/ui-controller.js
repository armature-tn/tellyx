/**
 * @file ui-controller.js
 * @description Master UI & UX Controller for IPTV Player.
 * Manages modal dialogs, responsive channel lists, TV Guide overlays,
 * TV Remote & Keyboard hotkeys, parental controls, and toast notifications.
 * 
 * @module UIController
 * @version 0.1.0
 * @author Armature.TN
 * @license Dual License: GNU AGPL-3.0 or Commercial License (SPDX: AGPL-3.0-or-later OR Commercial)
 */

import { SecurityController } from './security.js';

/**
 * @class UIController
 * @classdesc Comprehensive user interface manager binding user input events,
 * DOM views, state indicators, keyboard hotkeys, and stream overlays.
 */
export class UIController {
    /**
     * @private
     * @type {Object}
     * @description References to key DOM elements.
     */
    #elements = {};

    /**
     * @private
     * @type {Function} Callback for playing channel.
     */
    #onSelectChannel;

    /**
     * @private
     * @type {Function} Callback for favoriting channel.
     */
    #onToggleFavorite;

    /**
     * @private
     * @type {Function} Callback for opening channel EPG modal.
     */
    #onOpenChannelEpg;

    /**
     * @private
     * @type {boolean}
     */
    #isParentalUnlocked = false;

    /**
     * @private
     * @type {Array<Object>}
     */
    #currentChannels = [];

    /**
     * @private
     * @type {number}
     */
    #currentLimit = 60;

    /**
     * @private
     * @type {boolean}
     */
    #scrollListenerAttached = false;

    /**
     * @private
     * @type {Object|null}
     */
    #currentActiveChannel = null;

    /**
     * Constructs the UI Controller.
     * 
     * @param {Object} callbacks - Interactive event handler callbacks.
     */
    constructor(callbacks = {}) {
        this.#onSelectChannel = callbacks.onSelectChannel || (() => {});
        this.#onToggleFavorite = callbacks.onToggleFavorite || (() => {});
        this.#onOpenChannelEpg = callbacks.onOpenChannelEpg || (() => {});

        this.#cacheDOMElements();

        this.#elements.nowPlayingFavBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.#currentActiveChannel) {
                this.#onToggleFavorite(this.#currentActiveChannel.id);
            }
        });

        this.#elements.nowPlayingEpgBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.#onOpenChannelEpg) {
                this.#onOpenChannelEpg();
            }
        });

        this.setupFullscreenAutohide();
    }

    /**
     * Stores references to DOM components.
     * @private
     */
    #cacheDOMElements() {
        this.#elements = {
            channelGrid: document.getElementById('channelGrid'),
            categoryList: document.getElementById('categoryList'),
            searchInput: document.getElementById('searchInput'),
            videoPlayer: document.getElementById('videoPlayer'),
            btnCastStream: document.getElementById('btnCastStream'),
            nowPlayingBox: document.getElementById('nowPlayingBox'),
            nowPlayingTitle: document.getElementById('nowPlayingTitle'),
            nowPlayingGroup: document.getElementById('nowPlayingGroup'),
            nowPlayingLogo: document.getElementById('nowPlayingLogo'),
            nowPlayingLogoFallback: document.getElementById('nowPlayingLogoFallback'),
            nowPlayingShow: document.getElementById('nowPlayingShow'),
            nowPlayingTime: document.getElementById('nowPlayingTime'),
            nowPlayingProgress: document.getElementById('nowPlayingProgress'),
            nowPlayingEpgBtn: document.getElementById('btnNowPlayingEpg'),
            nowPlayingFavBtn: document.getElementById('btnNowPlayingFav'),
            channelEpgModal: document.getElementById('channelEpgModal'),
            statsOverlay: document.getElementById('statsOverlay'),
            toastContainer: document.getElementById('toastContainer'),
            parentalModal: document.getElementById('parentalModal'),
            pinInput: document.getElementById('pinInput'),
            epgModal: document.getElementById('epgModal'),
            epgGrid: document.getElementById('epgGrid'),
            playlistModal: document.getElementById('playlistModal'),
            settingsModal: document.getElementById('settingsModal'),
            helpModal: document.getElementById('helpModal'),
            wasmStatusBadge: document.getElementById('wasmStatusBadge'),
            totalChannelsBadge: document.getElementById('totalChannelsBadge'),
            btnTogglePip: document.getElementById('btnTogglePip')
        };
    }

    /**
     * @private
     * @type {boolean}
     */
    #carouselEventsBound = false;

    /**
     * Renders category tab filter buttons inside a smooth scrollable carousel.
     * 
     * @param {Array<string|{ name: string, count?: number }>} categories - Category list.
     * @param {string} activeCategory - Active group title.
     * @param {Function} onSelectCategory - Click listener.
     */
    renderCategories(categories, activeCategory, onSelectCategory) {
        const container = this.#elements.categoryList;
        if (!container) return;

        container.innerHTML = '';

        // Bind carousel scroll buttons, mouse wheel, and drag-scroll once
        if (!this.#carouselEventsBound) {
            this.#carouselEventsBound = true;
            const btnLeft = document.getElementById('btnCatScrollLeft');
            const btnRight = document.getElementById('btnCatScrollRight');

            if (btnLeft) {
                btnLeft.addEventListener('click', (e) => {
                    e.stopPropagation();
                    container.scrollBy({ left: -220, behavior: 'smooth' });
                });
            }

            if (btnRight) {
                btnRight.addEventListener('click', (e) => {
                    e.stopPropagation();
                    container.scrollBy({ left: 220, behavior: 'smooth' });
                });
            }

            // Enable horizontal mouse wheel scroll over carousel
            container.addEventListener('wheel', (e) => {
                if (e.deltaY !== 0) {
                    e.preventDefault();
                    container.scrollBy({ left: e.deltaY * 2.5, behavior: 'smooth' });
                }
            }, { passive: false });

            // Mouse drag-to-scroll support for carousel
            let isDown = false;
            let startX;
            let scrollLeft;

            container.addEventListener('mousedown', (e) => {
                isDown = true;
                container.classList.add('cursor-grabbing');
                startX = e.pageX - container.offsetLeft;
                scrollLeft = container.scrollLeft;
            });

            container.addEventListener('mouseleave', () => {
                isDown = false;
                container.classList.remove('cursor-grabbing');
            });

            container.addEventListener('mouseup', () => {
                isDown = false;
                container.classList.remove('cursor-grabbing');
            });

            container.addEventListener('mousemove', (e) => {
                if (!isDown) return;
                e.preventDefault();
                const x = e.pageX - container.offsetLeft;
                const walk = (x - startX) * 2;
                container.scrollLeft = scrollLeft - walk;
            });
        }

        let activeBtnElement = null;

        categories.forEach(item => {
            const catName = typeof item === 'object' ? item.name : item;
            const count = typeof item === 'object' && item.count !== undefined ? item.count : null;

            const btn = document.createElement('button');
            const isActive = catName === activeCategory;
            btn.className = `px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center space-x-1.5 shrink-0 ${
                isActive 
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30 font-semibold scale-105' 
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700/50'
            }`;

            let labelHtml = `<span>${SecurityController.escapeHTML(catName)}</span>`;
            if (count !== null && count >= 0) {
                labelHtml += `<span class="px-1.5 py-0.2 text-[10px] font-bold rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-rose-950/80 text-rose-300 border border-rose-800/50'}">${count}</span>`;
            }

            btn.innerHTML = labelHtml;
            btn.addEventListener('click', () => {
                onSelectCategory(catName);
                btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            });

            if (isActive) {
                activeBtnElement = btn;
            }

            container.appendChild(btn);
        });

        if (activeBtnElement) {
            setTimeout(() => {
                activeBtnElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }, 50);
        }
    }

    /**
     * Renders instant search results dropdown for categories and channels.
     * 
     * @param {Array<{ name: string, count: number }>} categories 
     * @param {Array<Object>} channels 
     * @param {Function} onSelectCategory 
     * @param {Function} onSelectChannel 
     */
    renderSearchDropdown(categories, channels, onSelectCategory, onSelectChannel) {
        const dropdown = document.getElementById('searchResultsDropdown');
        const catList = document.getElementById('categoryMatchList');
        const chanList = document.getElementById('channelMatchList');
        const catCount = document.getElementById('categoryMatchCount');
        const chanCount = document.getElementById('channelMatchCount');
        const btnClear = document.getElementById('btnClearSearch');
        const searchInput = document.getElementById('searchInput');

        if (!dropdown) return;

        if (btnClear) {
            if (searchInput && searchInput.value.trim().length > 0) {
                btnClear.classList.remove('hidden');
            } else {
                btnClear.classList.add('hidden');
            }
        }

        if ((!categories || categories.length === 0) && (!channels || channels.length === 0)) {
            dropdown.classList.add('hidden');
            return;
        }

        dropdown.classList.remove('hidden');

        // Render matching categories section
        if (catList) {
            catList.innerHTML = '';
            const catSection = document.getElementById('searchDropdownCategories');
            if (!categories || categories.length === 0) {
                if (catSection) catSection.classList.add('hidden');
            } else {
                if (catSection) catSection.classList.remove('hidden');
                if (catCount) catCount.textContent = `${categories.length} categories`;
                categories.slice(0, 6).forEach(cat => {
                    const item = document.createElement('div');
                    item.className = 'flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-rose-900/40 text-slate-200 hover:text-white cursor-pointer transition-all text-xs font-medium';
                    item.innerHTML = `
                        <div class="flex items-center space-x-2 truncate">
                            <svg class="w-3.5 h-3.5 text-rose-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
                            <span class="truncate">${SecurityController.escapeHTML(cat.name)}</span>
                        </div>
                        <span class="text-[10px] text-rose-300/80 font-mono bg-rose-950 px-1.5 py-0.5 rounded border border-rose-800/40 flex-shrink-0">${cat.count} channels</span>
                    `;
                    item.addEventListener('click', (e) => {
                        e.stopPropagation();
                        onSelectCategory(cat.name);
                        dropdown.classList.add('hidden');
                    });
                    catList.appendChild(item);
                });
            }
        }

        // Render matching channels section
        if (chanList) {
            chanList.innerHTML = '';
            const chanSection = document.getElementById('searchDropdownChannels');
            if (!channels || channels.length === 0) {
                if (chanSection) chanSection.classList.add('hidden');
            } else {
                if (chanSection) chanSection.classList.remove('hidden');
                if (chanCount) chanCount.textContent = `${channels.length} channels`;
                channels.slice(0, 8).forEach(ch => {
                    const item = document.createElement('div');
                    item.className = 'flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-slate-200 hover:text-white cursor-pointer transition-all text-xs';
                    item.innerHTML = `
                        <div class="flex items-center space-x-2.5 truncate mr-2">
                            <div class="w-5 h-5 rounded bg-slate-950 flex items-center justify-center overflow-hidden flex-shrink-0 border border-slate-800">
                                ${ch.logo ? `<img src="${SecurityController.escapeHTML(ch.logo)}" class="w-full h-full object-contain" onError="this.style.display='none'">` : '<svg class="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>'}
                            </div>
                            <span class="font-medium truncate">${SecurityController.escapeHTML(ch.name)}</span>
                        </div>
                        <span class="text-[10px] text-slate-400 font-medium px-2 py-0.5 rounded bg-slate-800/80 flex-shrink-0 truncate max-w-[100px]">${SecurityController.escapeHTML(ch.group || 'Live')}</span>
                    `;
                    item.addEventListener('click', (e) => {
                        e.stopPropagation();
                        onSelectChannel(ch);
                        dropdown.classList.add('hidden');
                    });
                    chanList.appendChild(item);
                });
            }
        }
    }

    /**
     * Renders channel grid cards with logos, favorite buttons, and current program details.
     * Supports paginated chunking and auto-scroll for massive playlists without layout overlap.
     * 
     * @param {Array<Object>} channels - List of channels to display.
     * @param {Function} isFavFn - Callback checking if channel is favorited.
     * @param {Function} epgFn - Callback getting current show for channel.
     * @param {string} [activeChannelId=null] - Currently playing channel ID.
     */
    renderChannels(channels, isFavFn, epgFn, activeChannelId = null) {
        const grid = this.#elements.channelGrid;
        if (!grid) return;

        // Reset limit if new channels list is provided
        if (this.#currentChannels !== channels) {
            this.#currentChannels = channels;
            this.#currentLimit = 60;
            grid.scrollTop = 0;
        }

        grid.innerHTML = '';

        if (!channels || channels.length === 0) {
            grid.innerHTML = `
                <div class="col-span-full py-16 text-center text-slate-400 flex flex-col items-center justify-center space-y-4">
                    <div class="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-rose-500 shadow-lg">
                        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                    </div>
                    <div>
                        <p class="text-base font-medium text-white">No IPTV Channels Loaded</p>
                        <p class="text-xs text-slate-400 mt-1 max-w-sm">Connect your M3U playlist URL, Xtream Codes credentials, or upload an M3U file to start watching.</p>
                    </div>
                    <button id="btnEmptyStateOpenPlaylist" class="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-rose-600/30 cursor-pointer transition-all flex items-center space-x-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                        <span>Add Playlist / Stream URL</span>
                    </button>
                </div>
            `;
            document.getElementById('btnEmptyStateOpenPlaylist')?.addEventListener('click', () => {
                this.toggleModal('playlistModal');
            });
            return;
        }

        const visibleSlice = channels.slice(0, this.#currentLimit);

        visibleSlice.forEach(ch => {
            const isFav = isFavFn(ch.id);
            const isPlaying = activeChannelId === ch.id;
            const program = epgFn(ch.tvgId || ch.id, ch.name);

            const card = document.createElement('div');
            card.id = `card_${ch.id}`;
            card.className = `group relative flex flex-col justify-between p-3.5 rounded-xl border transition-all duration-200 cursor-pointer overflow-hidden min-h-[100px] w-full ${
                isPlaying
                    ? 'bg-gradient-to-br from-rose-950/80 to-slate-900 border-rose-500/80 shadow-xl shadow-rose-500/10 ring-1 ring-rose-500/50'
                    : 'bg-slate-900/60 hover:bg-slate-800/80 border-slate-800/80 hover:border-slate-700/80 hover:shadow-lg'
            }`;

            // Safe HTML content
            const initials = SecurityController.escapeHTML(ch.name ? ch.name.substring(0, 2).toUpperCase() : 'TV');
            const safeName = SecurityController.escapeHTML(ch.name || 'Unnamed Channel');
            const safeGroup = SecurityController.escapeHTML(ch.group || 'General');

            const isLiveChannel = !ch.type || ch.type === 'live';
            const hasEpg = program && program.hasEpg;
            const programInfoHtml = `
                <div class="mt-2 pt-2 border-t border-slate-800/60 text-[11px] text-slate-400">
                    <div class="flex items-center justify-between text-[10px]">
                        <span class="truncate font-medium ${hasEpg ? 'text-slate-300' : 'text-slate-500 italic'}">${SecurityController.escapeHTML(program ? program.title : 'No EPG available')}</span>
                        ${hasEpg && program.progressPct ? `<span class="text-rose-400 font-mono flex-shrink-0 ml-1">${program.progressPct}%</span>` : ''}
                    </div>
                    ${hasEpg && program.progressPct ? `
                        <div class="w-full bg-slate-800 rounded-full h-1 overflow-hidden mt-1">
                            <div class="bg-rose-500 h-full rounded-full transition-all duration-300" style="width: ${program.progressPct}%"></div>
                        </div>
                    ` : ''}
                </div>
            `;

            card.innerHTML = `
                <div class="flex items-start justify-between space-x-3 mb-2">
                    <div class="flex items-center space-x-3 min-w-0">
                        <div class="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700/50 flex items-center justify-center overflow-hidden flex-shrink-0 relative">
                            ${ch.logo ? `<img src="${SecurityController.escapeHTML(ch.logo)}" alt="${safeName}" class="w-full h-full object-contain p-1" onerror="this.onerror=null; this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.classList.remove('hidden');"><span class="text-xs font-bold text-rose-400 hidden">${initials}</span>` : `<span class="text-xs font-bold text-rose-400">${initials}</span>`}
                        </div>
                        <div class="min-w-0">
                            <h4 class="text-sm font-semibold text-slate-100 group-hover:text-rose-400 transition-colors truncate">${safeName}</h4>
                            <span class="inline-block text-[10px] font-medium text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700/40 truncate">${safeGroup}</span>
                        </div>
                    </div>
                    <button class="fav-btn p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-slate-800 transition-colors cursor-pointer" title="Favorite">
                        <svg class="w-4 h-4 ${isFav ? 'text-amber-400 fill-amber-400' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path></svg>
                    </button>
                </div>
                ${programInfoHtml}
            `;

            // Card click plays stream
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.fav-btn')) {
                    this.#onSelectChannel(ch);
                }
            });

            // Favorite button handler
            const favBtn = card.querySelector('.fav-btn');
            favBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.#onToggleFavorite(ch.id);
            });

            grid.appendChild(card);
        });

        // Add "Load More Channels" button footer if list exceeds current visible limit
        if (channels.length > this.#currentLimit) {
            const footer = document.createElement('div');
            footer.className = 'col-span-full py-4 flex flex-col items-center justify-center space-y-2 border-t border-slate-800/60 mt-2';
            footer.innerHTML = `
                <div class="text-[11px] text-slate-400 font-mono">
                    Showing <span class="text-rose-400 font-bold">${visibleSlice.length}</span> of <span class="text-white font-bold">${channels.length}</span> streams
                </div>
                <button id="btnLoadMoreChannels" class="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-lg shadow-rose-900/30 flex items-center space-x-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>
                    <span>Load More Channels (+60)</span>
                </button>
            `;

            const btnMore = footer.querySelector('#btnLoadMoreChannels');
            if (btnMore) {
                btnMore.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.#currentLimit += 60;
                    this.renderChannels(channels, isFavFn, epgFn, activeChannelId);
                });
            }

            grid.appendChild(footer);
        }

        // Attach infinite auto-scroll handler
        if (!this.#scrollListenerAttached) {
            this.#scrollListenerAttached = true;
            grid.addEventListener('scroll', () => {
                if (grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 200) {
                    if (this.#currentChannels && this.#currentLimit < this.#currentChannels.length) {
                        this.#currentLimit += 60;
                        this.renderChannels(this.#currentChannels, isFavFn, epgFn, activeChannelId);
                    }
                }
            });
        }
    }

    /**
     * Updates active channel display banner header.
     * 
     * @param {Object} channel - Active channel record.
     * @param {Object} program - Current EPG program.
     * @param {boolean} [isFav=false] - Favorite status of active channel.
     */
    updateActiveHeader(channel, program, isFav = false) {
        if (!channel) return;
        this.#currentActiveChannel = channel;

        if (this.#elements.nowPlayingBox) {
            this.#elements.nowPlayingBox.classList.remove('hidden');
        }
        if (this.#elements.nowPlayingTitle) {
            this.#elements.nowPlayingTitle.textContent = channel.name;
        }

        const isVod = channel.type === 'movie' || channel.type === 'series';

        if (this.#elements.nowPlayingGroup) {
            const defaultFallback = channel.type === 'movie' ? 'Movie' : (channel.type === 'series' ? 'Series' : 'Live TV');
            this.#elements.nowPlayingGroup.textContent = channel.group || defaultFallback;
        }

        const liveBadge = document.getElementById('nowPlayingLiveBadge');
        if (liveBadge) {
            if (isVod) {
                liveBadge.classList.add('hidden');
            } else {
                liveBadge.classList.remove('hidden');
            }
        }

        if (this.#elements.nowPlayingShow && program) {
            const hasEpg = !isVod && program.hasEpg;
            this.#elements.nowPlayingShow.textContent = isVod ? (channel.group || 'VOD Stream') : (program.title || 'No EPG available');
            if (hasEpg) {
                this.#elements.nowPlayingShow.classList.remove('italic', 'text-slate-500');
                this.#elements.nowPlayingShow.classList.add('text-slate-300');
            } else {
                this.#elements.nowPlayingShow.classList.add('italic', 'text-slate-500');
                this.#elements.nowPlayingShow.classList.remove('text-slate-300');
            }
        }
        if (this.#elements.nowPlayingTime && program) {
            if (!isVod && program.hasEpg && program.formattedStart && program.formattedEnd) {
                this.#elements.nowPlayingTime.textContent = `${program.formattedStart} - ${program.formattedEnd}`;
            } else {
                this.#elements.nowPlayingTime.textContent = '';
            }
        }
        if (this.#elements.nowPlayingProgress && program) {
            this.#elements.nowPlayingProgress.style.width = `${(!isVod && program.hasEpg && program.progressPct) || 0}%`;
        }

        const logoImg = this.#elements.nowPlayingLogo;
        const logoFallback = this.#elements.nowPlayingLogoFallback;

        if (logoImg) {
            if (channel.logo) {
                logoImg.src = channel.logo;
                logoImg.classList.remove('hidden');
                if (logoFallback) logoFallback.classList.add('hidden');
            } else {
                logoImg.classList.add('hidden');
                if (logoFallback) logoFallback.classList.remove('hidden');
            }
        }

        if (this.#elements.nowPlayingEpgBtn) {
            if (isVod) {
                this.#elements.nowPlayingEpgBtn.classList.add('hidden');
            } else {
                this.#elements.nowPlayingEpgBtn.classList.remove('hidden');
            }
        }

        this.updateNowPlayingFavState(isFav);
    }

    /**
     * Updates favorite icon button state on the Now Playing banner.
     * 
     * @param {boolean} isFav
     */
    updateNowPlayingFavState(isFav) {
        const btn = this.#elements.nowPlayingFavBtn;
        if (!btn || !this.#currentActiveChannel) {
            if (btn) btn.classList.add('hidden');
            return;
        }
        btn.classList.remove('hidden');
        if (isFav) {
            btn.innerHTML = `<svg class="w-5 h-5 text-amber-400 fill-amber-400" fill="currentColor" viewBox="0 0 24 24"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path></svg>`;
            btn.title = 'Remove from Favorites';
            btn.setAttribute('aria-label', 'Remove from Favorites');
        } else {
            btn.innerHTML = `<svg class="w-5 h-5 text-slate-300 hover:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path></svg>`;
            btn.title = 'Add to Favorites';
            btn.setAttribute('aria-label', 'Add to Favorites');
        }
    }

    /**
     * Toggles stats overlay display ("Stats for Nerds").
     */
    toggleStatsOverlay() {
        const overlay = this.#elements.statsOverlay;
        if (overlay) {
            overlay.classList.toggle('hidden');
        }
    }

    /**
     * Updates telemetry metrics on the Stats overlay panel.
     * 
     * @param {Object} stats - Metrics object from StreamEngine.
     */
    updateStatsOverlay(stats) {
        const overlay = this.#elements.statsOverlay;
        if (!overlay || overlay.classList.contains('hidden')) return;

        overlay.innerHTML = `
            <div class="text-[11px] font-mono space-y-1 text-emerald-400 bg-slate-950/90 backdrop-blur-md p-3 rounded-lg border border-emerald-500/30 shadow-2xl">
                <div class="font-bold border-b border-emerald-500/30 pb-1 text-white flex justify-between">
                    <span>STREAM DIAGNOSTICS</span>
                    <span class="text-xs text-emerald-400 animate-pulse">● LIVE</span>
                </div>
                <div>Protocol: <span class="text-white">${stats.protocol}</span></div>
                <div>Resolution: <span class="text-white">${stats.resolution} @ ${stats.fps}fps</span></div>
                <div>Buffer Health: <span class="text-white">${stats.bufferHealthSec}s</span></div>
                <div>Dropped Frames: <span class="text-white">${stats.droppedFrames}</span></div>
                <div>Latency: <span class="text-white">${stats.latencyMs}ms</span></div>
                <div>Volume: <span class="text-white">${stats.volume}% ${stats.muted ? '(Muted)' : ''}</span></div>
            </div>
        `;
    }

    /**
     * Displays a temporary notification toast banner.
     * 
     * @param {string} message - Toast message text.
     * @param {'info'|'success'|'warning'|'error'} [type='info'] - Severity level.
     */
    showToast(message, type = 'info') {
        const container = this.#elements.toastContainer;
        if (!container) return;

        const colors = {
            info: 'bg-rose-600 text-white border-rose-400',
            success: 'bg-emerald-600 text-white border-emerald-400',
            warning: 'bg-amber-600 text-white border-amber-400',
            error: 'bg-rose-600 text-white border-rose-400'
        };

        const toast = document.createElement('div');
        toast.className = `px-4 py-2.5 rounded-lg shadow-xl border text-xs font-semibold backdrop-blur-md flex items-center space-x-2 transition-all duration-300 transform translate-y-2 opacity-0 ${colors[type] || colors.info}`;
        toast.innerHTML = `<span>${SecurityController.escapeHTML(message)}</span>`;

        container.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.classList.remove('translate-y-2', 'opacity-0');
        });

        // Auto remove
        setTimeout(() => {
            toast.classList.add('opacity-0', 'translate-y-2');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Toggles a modal window by element ID.
     * 
     * @param {string} modalId - ID of modal container.
     */
    toggleModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.toggle('hidden');
        }
    }

    /**
     * Updates total channels count badge in the UI header.
     * @param {number} count 
     */
    updateTotalChannelsBadge(count) {
        if (this.#elements.totalChannelsBadge) {
            this.#elements.totalChannelsBadge.textContent = `${count} Channels`;
        }
    }

    /**
     * Updates WASM engine status badge in the UI header.
     * @param {boolean} active 
     */
    updateWASMBadge(active) {
        if (this.#elements.wasmStatusBadge) {
            if (active) {
                this.#elements.wasmStatusBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
                this.#elements.wasmStatusBadge.textContent = 'WASM ACTIVE';
            } else {
                this.#elements.wasmStatusBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30';
                this.#elements.wasmStatusBadge.textContent = 'JS FALLBACK';
            }
        }
    }

    /**
     * Updates Picture-in-Picture UI button state and visual indicators.
     * 
     * @param {boolean} isPipActive - Whether PiP is currently active.
     * @param {boolean} [isSupported=true] - Whether PiP is supported on current platform.
     */
    updatePipButtonState(isPipActive, isSupported = true) {
        const btn = this.#elements.btnTogglePip || document.getElementById('btnTogglePip');
        if (!btn) return;

        if (!isSupported) {
            btn.classList.add('opacity-40', 'cursor-not-allowed');
            btn.title = 'Picture-in-Picture not supported on this device/browser';
            return;
        }

        btn.classList.remove('opacity-40', 'cursor-not-allowed');

        if (isPipActive) {
            btn.classList.remove('bg-slate-900/90', 'hover:bg-slate-800', 'text-slate-300', 'hover:text-white', 'border-slate-700/80');
            btn.classList.add('bg-rose-950/80', 'text-rose-400', 'border-rose-500/80', 'shadow-rose-900/30', 'shadow-lg');
            btn.title = 'Exit Picture-in-Picture Mode (P)';
            btn.setAttribute('aria-label', 'Exit Picture-in-Picture Mode');
        } else {
            btn.classList.remove('bg-rose-950/80', 'text-rose-400', 'border-rose-500/80', 'shadow-rose-900/30', 'shadow-lg');
            btn.classList.add('bg-slate-900/90', 'hover:bg-slate-800', 'text-slate-300', 'hover:text-white', 'border-slate-700/80');
            btn.title = 'Picture-in-Picture Mode (P)';
            btn.setAttribute('aria-label', 'Picture-in-Picture Mode');
        }
    }

    /**
     * Renders connected IPTV providers inside the Settings Modal with right-aligned modify & delete controls.
     * 
     * @param {Array<Object>} providers 
     * @param {Object} callbacks - { onSync, onEdit, onDelete }
     */
    renderProvidersList(providers, { onSync, onEdit, onDelete } = {}) {
        const container = document.getElementById('settingsProvidersList');
        if (!container) return;

        if (!providers || providers.length === 0) {
            container.innerHTML = `
                <div class="p-3.5 bg-slate-900/60 border border-slate-800/80 rounded-xl text-center space-y-1">
                    <div class="text-xs font-semibold text-slate-300">No IPTV Providers Connected</div>
                    <div class="text-[10px] text-slate-400">Click "Add Provider" above to add an Xtream Codes account, M3U URL, or file.</div>
                </div>
            `;
            return;
        }

        container.innerHTML = providers.map(p => {
            let typeLabel = 'M3U URL';
            let badgeClass = 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
            let iconSvg = `<svg class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>`;
            let detailText = p.url || 'Remote M3U Playlist';

            if (p.type === 'xtream') {
                typeLabel = 'Xtream API';
                badgeClass = 'bg-rose-500/20 text-rose-300 border-rose-500/30';
                iconSvg = `<svg class="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2"></path></svg>`;
                detailText = `${p.server || 'Xtream Server'} (User: ${p.user || 'N/A'})`;
            } else if (p.type === 'm3u_file') {
                typeLabel = 'Local File';
                badgeClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
                iconSvg = `<svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>`;
                detailText = p.fileName || 'Local M3U File';
            }

            const syncTime = p.lastSync ? new Date(p.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now';

            let accountBadge = '';
            if (p.accountInfo) {
                const acc = p.accountInfo;
                accountBadge = `
                    <div class="mt-1 flex flex-wrap items-center gap-1 text-[9px]">
                        <span class="px-1.5 py-0.5 rounded font-bold ${acc.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'}">${SecurityController.escapeHTML(acc.status)}</span>
                        <span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/50 font-mono">Exp: ${SecurityController.escapeHTML(acc.expDate)}</span>
                        <span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/50 font-mono">Cons: ${SecurityController.escapeHTML(acc.activeCons)}/${SecurityController.escapeHTML(acc.maxCons)}</span>
                    </div>
                `;
            }

            return `
                <div class="flex items-center justify-between p-2.5 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl transition-all group" data-provider-id="${p.id}">
                    <div class="flex items-center space-x-2.5 min-w-0 flex-1 mr-2">
                        <div class="w-8 h-8 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0">
                            ${iconSvg}
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center space-x-1.5">
                                <span class="font-bold text-white text-xs truncate">${SecurityController.escapeHTML(p.name || 'IPTV Provider')}</span>
                                <span class="px-1.5 py-0.2 rounded text-[9px] font-bold border ${badgeClass}">${typeLabel}</span>
                            </div>
                            <div class="text-[10px] text-slate-400 truncate mt-0.5">${SecurityController.escapeHTML(detailText)}</div>
                            <div class="text-[9px] text-slate-500 mt-0.5 flex items-center space-x-2">
                                <span class="text-rose-400/90 font-semibold">${p.channelCount || 0} Channels</span>
                                <span>•</span>
                                <span>Synced: ${syncTime}</span>
                            </div>
                            ${accountBadge}
                        </div>
                    </div>

                    <!-- CONTROLS AT THE RIGHT OF EACH ELEMENT -->
                    <div class="flex items-center space-x-1 shrink-0">
                        <button data-action="sync" data-id="${p.id}" title="Sync / Refresh Channels" class="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-950/60 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-emerald-500/30">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                        </button>
                        <button data-action="edit" data-id="${p.id}" title="Modify Provider Settings" class="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-950/60 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-amber-500/30">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                        </button>
                        <button data-action="delete" data-id="${p.id}" title="Delete Provider Connection" class="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/60 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-rose-500/30">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        container.onclick = (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;

            const action = btn.dataset.action;
            const id = btn.dataset.id;

            if (action === 'sync' && onSync) onSync(id);
            if (action === 'edit' && onEdit) onEdit(id);
            if (action === 'delete' && onDelete) onDelete(id);
        };
    }

    /**
     * Shows custom confirmation dialog without relying on window.confirm.
     * @param {Object} options - { title, message, okText, onConfirm }
     */
    showConfirm({ title = 'Confirm Action', message = 'Are you sure?', okText = 'Confirm', onConfirm } = {}) {
        const modal = document.getElementById('confirmModal');
        const titleEl = document.getElementById('confirmModalTitle');
        const msgEl = document.getElementById('confirmModalMessage');
        const okBtn = document.getElementById('btnConfirmOK');
        const cancelBtn = document.getElementById('btnConfirmCancel');

        if (!modal) {
            if (onConfirm) onConfirm();
            return;
        }

        if (titleEl) titleEl.textContent = title;
        if (msgEl) msgEl.textContent = message;
        if (okBtn) okBtn.textContent = okText;

        const cleanup = () => {
            modal.classList.add('hidden');
            if (okBtn) okBtn.onclick = null;
            if (cancelBtn) cancelBtn.onclick = null;
        };

        if (okBtn) {
            okBtn.onclick = () => {
                cleanup();
                if (onConfirm) onConfirm();
            };
        }

        if (cancelBtn) {
            cancelBtn.onclick = () => {
                cleanup();
            };
        }

        modal.classList.remove('hidden');
    }

    /**
     * Returns true if parental controls are active (locked), hiding adult content.
     * @returns {boolean}
     */
    isParentalLocked() {
        return !this.#isParentalUnlocked;
    }

    /**
     * Returns true if parental controls are unlocked.
     * @returns {boolean}
     */
    isParentalUnlocked() {
        return this.#isParentalUnlocked;
    }

    /**
     * Sets parental controls unlocked state and updates the UI accordingly.
     * @param {boolean} unlocked
     */
    setParentalUnlocked(unlocked) {
        this.#isParentalUnlocked = unlocked;
        this.updateParentalUI(unlocked);
    }

    /**
     * Updates parental control modal status badge and header button state.
     * @param {boolean} [unlocked]
     */
    updateParentalUI(unlocked = this.#isParentalUnlocked) {
        const statusBadge = document.getElementById('parentalStatusBadge');
        const lockBtn = document.getElementById('btnParentalModal');
        const submitBtn = document.getElementById('btnSubmitParentalPin');
        const pinInput = document.getElementById('parentalPinInput');
        const errorText = document.getElementById('parentalPinError');

        if (errorText) errorText.textContent = '';
        if (pinInput) pinInput.value = '';

        if (statusBadge) {
            if (unlocked) {
                statusBadge.textContent = 'UNLOCKED (Adult/XXX Content Visible)';
                statusBadge.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
            } else {
                statusBadge.textContent = 'LOCKED (Adult/XXX Content Hidden)';
                statusBadge.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30';
            }
        }

        if (submitBtn) {
            submitBtn.textContent = unlocked ? 'Lock Adult Content' : 'Unlock Adult Content';
        }

        if (lockBtn) {
            if (unlocked) {
                lockBtn.innerHTML = `<svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"></path></svg>`;
                lockBtn.title = 'Parental Control (Unlocked)';
                lockBtn.classList.add('border-emerald-500/50', 'bg-emerald-950/30');
                lockBtn.classList.remove('border-slate-800');
            } else {
                lockBtn.innerHTML = `<svg class="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>`;
                lockBtn.title = 'Parental Control (Locked)';
                lockBtn.classList.remove('border-emerald-500/50', 'bg-emerald-950/30');
                lockBtn.classList.add('border-slate-800');
            }
        }
    }

    /**
     * Binds fullscreen change and mouse/touch activity listeners
     * to autohide and autoshow player controls in fullscreen and interactive modes.
     */
    setupFullscreenAutohide() {
        const container = document.getElementById('singlePlayerContainer');
        if (!container) return;

        let autohideTimer = null;
        const HIDE_DELAY = 3000; // 3 seconds of inactivity

        const isFSActive = () => {
            return !!(
                document.fullscreenElement ||
                document.webkitFullscreenElement ||
                document.mozFullScreenElement ||
                document.msFullscreenElement ||
                container.classList.contains('is-fullscreen')
            );
        };

        const showControls = () => {
            container.classList.remove('controls-hidden');
            if (autohideTimer) clearTimeout(autohideTimer);
            if (isFSActive()) {
                autohideTimer = setTimeout(hideControls, HIDE_DELAY);
            }
        };

        const hideControls = () => {
            if (!isFSActive()) return;

            // Don't hide if user is currently interacting with an input, select dropdown, or button inside controls
            const controls = container.querySelector('.player-controls');
            const topControls = container.querySelector('.player-top-controls');
            if ((controls && controls.contains(document.activeElement)) ||
                (topControls && topControls.contains(document.activeElement)) ||
                document.activeElement?.tagName === 'SELECT') {
                autohideTimer = setTimeout(hideControls, 2000);
                return;
            }

            container.classList.add('controls-hidden');
        };

        const handleFullscreenChange = () => {
            const fsEl = document.fullscreenElement ||
                         document.webkitFullscreenElement ||
                         document.mozFullScreenElement ||
                         document.msFullscreenElement;

            if (fsEl) {
                container.classList.add('is-fullscreen');
                showControls();
            } else {
                container.classList.remove('is-fullscreen', 'controls-hidden');
                if (autohideTimer) {
                    clearTimeout(autohideTimer);
                    autohideTimer = null;
                }
            }
        };

        // Fullscreen change events for all browser vendor prefixes
        ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(eventType => {
            document.addEventListener(eventType, handleFullscreenChange);
        });

        // Mouse & Pointer movement inside container
        ['mousemove', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchmove', 'pointermove'].forEach(eventType => {
            container.addEventListener(eventType, () => {
                showControls();
            }, { passive: true });
        });

        // Keydown activity anywhere
        document.addEventListener('keydown', () => {
            showControls();
        }, { passive: true });
    }
}
