/**
 * @file tv-remote.js
 * @description Full TiviMate-style TV Remote & D-Pad Navigation Engine for Android TV, Google TV, and Smart TVs.
 * Provides spatial D-Pad navigation, channel number zapping overlay, Web Audio haptic/audio feedback,
 * and an interactive Virtual TV Remote Overlay for non-TV test environments.
 * 
 * @module TVRemoteManager
 * @version 0.1.0
 * @author Armature.TN
 * @license Dual License: GNU AGPL-3.0 or Commercial License (SPDX: AGPL-3.0-or-later OR Commercial)
 */

export class TVRemoteManager {
    /** @type {Object} Reference to main app instance */
    app;

    /** @type {boolean} State of TV Remote Mode */
    isEnabled = true;

    /** @type {HTMLElement|null} Currently focused DOM element */
    focusedElement = null;

    /** @type {string} Channel number buffer for quick number zapping */
    numberBuffer = '';

    /** @type {number|null} Timer for number zapping countdown */
    numberZapTimer = null;

    /** @type {AudioContext|null} Web Audio context for soft D-pad sound effects */
    audioCtx = null;

    /** @type {boolean} Sound effects enabled flag */
    soundEnabled = true;

    /**
     * Initializes the TV Remote Engine.
     * @param {Object} appMain - Reference to main application coordinator
     */
    constructor(appMain) {
        this.app = appMain;
        this.initWebAudio();
        this.bindGlobalKeyboardListeners();
        this.injectRemoteUI();
        console.log('[TVRemoteManager] TiviMate TV Remote Experience initialized.');
    }

    /**
     * Lazy initializes Web Audio API for subtle D-pad feedback clicks.
     * @private
     */
    initWebAudio() {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                this.audioCtx = new AudioContextClass();
            }
        } catch (e) {
            console.warn('[TVRemoteManager] Web Audio API not available:', e);
        }
    }

    /**
     * Plays a subtle, pleasant D-pad click or select tone.
     * @param {'move'|'select'|'back'|'error'} type 
     */
    playFeedbackSound(type = 'move') {
        if (navigator.vibrate) {
            try {
                navigator.vibrate(type === 'select' ? 18 : 8);
            } catch (e) {
                // Ignore vibration restriction
            }
        }

        if (!this.audioCtx || !this.soundEnabled) return;
        try {
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }

            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();

            osc.connect(gain);
            gain.connect(this.audioCtx.destination);

            const now = this.audioCtx.currentTime;

            if (type === 'move') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(600, now);
                osc.frequency.exponentialRampToValueAtTime(300, now + 0.04);
                gain.gain.setValueAtTime(0.04, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
                osc.start(now);
                osc.stop(now + 0.04);
            } else if (type === 'select') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(800, now);
                osc.frequency.exponentialRampToValueAtTime(1200, now + 0.06);
                gain.gain.setValueAtTime(0.08, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
                osc.start(now);
                osc.stop(now + 0.06);
            } else if (type === 'back') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(450, now);
                osc.frequency.exponentialRampToValueAtTime(250, now + 0.05);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
                osc.start(now);
                osc.stop(now + 0.05);
            }
        } catch (e) {
            // Audio play warning ignored
        }
    }

    /**
     * Injects the TiviMate Channel Number Jump Badge and Virtual TV Remote DOM overlays.
     * @private
     */
    injectRemoteUI() {
        if (document.getElementById('tvChannelNumberBox')) return;

        const container = document.createElement('div');
        container.id = 'tvRemoteOverlayContainer';
        container.innerHTML = `
            <!-- TIVIMATE CHANNEL NUMBER ZAPPING BADGE -->
            <div id="tvChannelNumberBox" class="fixed top-6 right-8 z-[120] bg-rose-950/95 border-2 border-rose-500 text-white rounded-2xl px-6 py-4 shadow-2xl backdrop-blur-xl flex flex-col items-center justify-center space-y-1 transform transition-all duration-300 scale-0 opacity-0 pointer-events-none min-w-[160px]">
                <div class="text-[10px] font-black uppercase tracking-widest text-rose-300">Zapping Channel</div>
                <div id="tvChannelNumberDisplay" class="text-3xl font-black font-mono text-white tracking-wider">CH. ---</div>
                <div class="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden border border-rose-500/30 mt-1">
                    <div id="tvZapProgressBar" class="bg-gradient-to-r from-rose-500 to-amber-400 h-full w-full transition-all duration-100"></div>
                </div>
            </div>

            <!-- FLOATING VIRTUAL TV REMOTE CONTROL DRAWER -->
            <div id="virtualTvRemoteModal" class="fixed bottom-6 right-6 z-[110] bg-slate-950/95 border-2 border-rose-500/60 text-white rounded-3xl p-5 shadow-2xl backdrop-blur-2xl w-72 flex flex-col items-center space-y-4 transition-all duration-300 transform translate-y-full opacity-0 pointer-events-none border-t-rose-500/80">
                <!-- HEADER BAR -->
                <div class="w-full flex items-center justify-between pb-2 border-b border-slate-800">
                    <div class="flex items-center space-x-2">
                        <div class="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></div>
                        <span class="text-xs font-black uppercase tracking-wider text-rose-400">TV Remote D-Pad</span>
                    </div>
                    <button id="btnCloseVirtualRemote" class="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>

                <!-- D-PAD WHEEL CONTROLLER -->
                <div class="relative w-44 h-44 rounded-full bg-slate-900 border-2 border-slate-800 shadow-inner flex items-center justify-center">
                    <!-- UP BUTTON -->
                    <button id="btnDpadUp" class="absolute top-1 w-12 h-12 bg-slate-800 hover:bg-rose-600 rounded-t-full flex items-center justify-center text-slate-200 hover:text-white active:scale-95 transition-all cursor-pointer border-b border-slate-700" title="D-Pad Up">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 15l7-7 7 7"></path></svg>
                    </button>
                    <!-- DOWN BUTTON -->
                    <button id="btnDpadDown" class="absolute bottom-1 w-12 h-12 bg-slate-800 hover:bg-rose-600 rounded-b-full flex items-center justify-center text-slate-200 hover:text-white active:scale-95 transition-all cursor-pointer border-t border-slate-700" title="D-Pad Down">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M19 9l-7 7-7-7"></path></svg>
                    </button>
                    <!-- LEFT BUTTON -->
                    <button id="btnDpadLeft" class="absolute left-1 w-12 h-12 bg-slate-800 hover:bg-rose-600 rounded-l-full flex items-center justify-center text-slate-200 hover:text-white active:scale-95 transition-all cursor-pointer border-r border-slate-700" title="D-Pad Left">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M15 19l-7-7 7-7"></path></svg>
                    </button>
                    <!-- RIGHT BUTTON -->
                    <button id="btnDpadRight" class="absolute right-1 w-12 h-12 bg-slate-800 hover:bg-rose-600 rounded-r-full flex items-center justify-center text-slate-200 hover:text-white active:scale-95 transition-all cursor-pointer border-l border-slate-700" title="D-Pad Right">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M9 5l7 7-7 7"></path></svg>
                    </button>
                    <!-- CENTER OK BUTTON -->
                    <button id="btnDpadOk" class="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider shadow-xl active:scale-90 transition-all cursor-pointer border-2 border-rose-400 flex items-center justify-center" title="OK / Select">
                        OK
                    </button>
                </div>

                <!-- ACTION BUTTONS ROW (BACK, MENU, CH+, CH-) -->
                <div class="grid grid-cols-4 gap-2 w-full pt-1">
                    <button id="btnRemoteBack" class="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 font-bold text-xs flex flex-col items-center justify-center space-y-0.5 cursor-pointer active:scale-95" title="Back">
                        <svg class="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 15l-3-3m0 0l3-3m-3 3h8M3 12a9 9 0 1118 0 9 9 0 01-18 0z"></path></svg>
                        <span class="text-[9px]">BACK</span>
                    </button>
                    <button id="btnRemoteMenu" class="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 font-bold text-xs flex flex-col items-center justify-center space-y-0.5 cursor-pointer active:scale-95" title="Menu / OSD">
                        <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
                        <span class="text-[9px]">MENU</span>
                    </button>
                    <button id="btnRemoteChUp" class="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 font-bold text-xs flex flex-col items-center justify-center space-y-0.5 cursor-pointer active:scale-95" title="Channel Up">
                        <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 11l7-7 7 7M5 19l7-7 7 7"></path></svg>
                        <span class="text-[9px]">CH +</span>
                    </button>
                    <button id="btnRemoteChDown" class="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 font-bold text-xs flex flex-col items-center justify-center space-y-0.5 cursor-pointer active:scale-95" title="Channel Down">
                        <svg class="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 13l-7 7-7-7m14-8l-7 7-7-7"></path></svg>
                        <span class="text-[9px]">CH -</span>
                    </button>
                </div>

                <!-- EXTRA FEATURES ROW (EPG, PIP, VOL+, VOL-) -->
                <div class="grid grid-cols-4 gap-2 w-full">
                    <button id="btnRemoteEPG" class="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 font-bold text-xs flex flex-col items-center justify-center space-y-0.5 cursor-pointer active:scale-95" title="TV Guide (EPG)">
                        <svg class="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        <span class="text-[9px]">EPG</span>
                    </button>
                    <button id="btnRemotePIP" class="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 font-bold text-xs flex flex-col items-center justify-center space-y-0.5 cursor-pointer active:scale-95" title="Picture in Picture">
                        <svg class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                        <span class="text-[9px]">PIP</span>
                    </button>
                    <button id="btnRemoteVolUp" class="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 font-bold text-xs flex flex-col items-center justify-center space-y-0.5 cursor-pointer active:scale-95" title="Volume Up">
                        <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M6 9H4a1 1 0 00-1 1v4a1 1 0 001 1h2l4 4V5L6 9z"></path></svg>
                        <span class="text-[9px]">VOL +</span>
                    </button>
                    <button id="btnRemoteVolDown" class="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 font-bold text-xs flex flex-col items-center justify-center space-y-0.5 cursor-pointer active:scale-95" title="Volume Down">
                        <svg class="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15L4 13.414A1 1 0 013.293 12.707V11.293A1 1 0 014 10.586L5.586 9M11 5L6 9H4v6h2l5 4V5z"></path></svg>
                        <span class="text-[9px]">VOL -</span>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(container);

        // Bind Virtual Remote Buttons
        document.getElementById('btnCloseVirtualRemote')?.addEventListener('click', () => this.toggleVirtualRemote(false));
        document.getElementById('btnDpadUp')?.addEventListener('click', () => { this.playFeedbackSound('move'); this.handleDpad('up'); });
        document.getElementById('btnDpadDown')?.addEventListener('click', () => { this.playFeedbackSound('move'); this.handleDpad('down'); });
        document.getElementById('btnDpadLeft')?.addEventListener('click', () => { this.playFeedbackSound('move'); this.handleDpad('left'); });
        document.getElementById('btnDpadRight')?.addEventListener('click', () => { this.playFeedbackSound('move'); this.handleDpad('right'); });
        document.getElementById('btnDpadOk')?.addEventListener('click', () => { this.playFeedbackSound('select'); this.handleOk(); });

        document.getElementById('btnRemoteBack')?.addEventListener('click', () => { this.playFeedbackSound('back'); this.handleBack(); });
        document.getElementById('btnRemoteMenu')?.addEventListener('click', () => { this.playFeedbackSound('move'); this.handleMenu(); });
        document.getElementById('btnRemoteChUp')?.addEventListener('click', () => { this.playFeedbackSound('select'); this.app?.playNextChannel(); });
        document.getElementById('btnRemoteChDown')?.addEventListener('click', () => { this.playFeedbackSound('select'); this.app?.playPreviousChannel(); });

        document.getElementById('btnRemoteEPG')?.addEventListener('click', () => {
            this.playFeedbackSound('select');
            this.app?.uiController?.toggleModal('epgModal');
            this.app?.populateEpgControls();
            requestAnimationFrame(() => this.app?.renderEPGGrid(true));
        });

        document.getElementById('btnRemotePIP')?.addEventListener('click', () => {
            this.playFeedbackSound('select');
            this.app?.streamEngine?.togglePictureInPicture();
        });

        document.getElementById('btnRemoteVolUp')?.addEventListener('click', () => {
            this.playFeedbackSound('move');
            if (this.app?.streamEngine) {
                const newVol = Math.min(1.0, this.app.streamEngine.volume + 0.1);
                this.app.streamEngine.setVolume(newVol);
                this.app.uiController?.showToast(`Volume: ${Math.round(newVol * 100)}%`, 'info');
            }
        });

        document.getElementById('btnRemoteVolDown')?.addEventListener('click', () => {
            this.playFeedbackSound('move');
            if (this.app?.streamEngine) {
                const newVol = Math.max(0, this.app.streamEngine.volume - 0.1);
                this.app.streamEngine.setVolume(newVol);
                this.app.uiController?.showToast(`Volume: ${Math.round(newVol * 100)}%`, 'info');
            }
        });
    }

    /**
     * Toggles visibility of the Virtual On-Screen TV Remote Overlay.
     * @param {boolean} [show] 
     */
    toggleVirtualRemote(show) {
        const modal = document.getElementById('virtualTvRemoteModal');
        if (!modal) return;

        const isHidden = modal.classList.contains('pointer-events-none');
        const nextState = (show !== undefined) ? show : isHidden;

        if (nextState) {
            modal.classList.remove('pointer-events-none', 'translate-y-full', 'opacity-0');
            modal.classList.add('translate-y-0', 'opacity-100');
            this.playFeedbackSound('select');
        } else {
            modal.classList.add('pointer-events-none', 'translate-y-full', 'opacity-0');
            modal.classList.remove('translate-y-0', 'opacity-100');
            this.playFeedbackSound('back');
        }
    }

    /**
     * Handles typing channel numbers (0-9) for quick channel zapping.
     * @param {string} digit 
     */
    handleNumberInput(digit) {
        this.playFeedbackSound('move');
        this.numberBuffer += digit;

        const box = document.getElementById('tvChannelNumberBox');
        const display = document.getElementById('tvChannelNumberDisplay');
        const progress = document.getElementById('tvZapProgressBar');

        if (display) display.textContent = `CH. ${this.numberBuffer}`;
        if (box) {
            box.classList.remove('scale-0', 'opacity-0', 'pointer-events-none');
            box.classList.add('scale-100', 'opacity-100');
        }

        if (progress) {
            progress.style.transition = 'none';
            progress.style.width = '100%';
            requestAnimationFrame(() => {
                progress.style.transition = 'width 1.8s linear';
                progress.style.width = '0%';
            });
        }

        if (this.numberZapTimer) clearTimeout(this.numberZapTimer);

        this.numberZapTimer = setTimeout(() => {
            this.commitNumberZap();
        }, 1800);
    }

    /**
     * Tunes to the channel index typed in number buffer.
     */
    commitNumberZap() {
        if (!this.numberBuffer) return;
        const targetNum = parseInt(this.numberBuffer, 10);
        this.numberBuffer = '';

        const box = document.getElementById('tvChannelNumberBox');
        if (box) {
            box.classList.add('scale-0', 'opacity-0', 'pointer-events-none');
            box.classList.remove('scale-100', 'opacity-100');
        }

        if (isNaN(targetNum) || targetNum <= 0) return;

        const channels = this.app?.iptvCore?.getChannelsForCategory(
            this.app?.activeCategory,
            this.app?.activeType,
            '',
            this.app?.sortMode,
            this.app?.isParentalUnlocked
        ) || [];

        if (channels.length === 0) return;

        const targetChannel = channels[targetNum - 1] || channels.find(c => c.id === String(targetNum) || c.tvgId === String(targetNum));

        if (targetChannel) {
            this.playFeedbackSound('select');
            this.app?.playChannel(targetChannel);
            this.app?.uiController?.showToast(`Tuned to CH #${targetNum}: ${targetChannel.name}`, 'success');
        } else {
            this.playFeedbackSound('error');
            this.app?.uiController?.showToast(`Channel #${targetNum} not found`, 'warning');
        }
    }

    /**
     * Main Keyboard Event Handler for D-Pad, Remote Keys & Shortcuts.
     * @private
     * @param {KeyboardEvent} e 
     */
    bindGlobalKeyboardListeners() {
        window.addEventListener('keydown', (e) => {
            // Do not intercept input when user is typing in text fields
            const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
            if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
                if (e.key === 'Escape') {
                    document.activeElement.blur();
                }
                return;
            }

            // Key mappings for TV Remote & D-Pad
            const key = e.key;
            const code = e.keyCode;

            // Virtual Remote Toggle Key (KeyR or F12 or KeyT)
            if (key === 'r' || key === 'R') {
                e.preventDefault();
                this.toggleVirtualRemote();
                return;
            }

            // Numbers 0-9
            if (/^[0-9]$/.test(key) || (code >= 96 && code <= 105)) {
                e.preventDefault();
                const digit = key;
                this.handleNumberInput(digit);
                return;
            }

            // D-Pad Directional Keys
            if (key === 'ArrowUp' || code === 19) {
                e.preventDefault();
                this.playFeedbackSound('move');
                this.handleDpad('up');
                return;
            }
            if (key === 'ArrowDown' || code === 20) {
                e.preventDefault();
                this.playFeedbackSound('move');
                this.handleDpad('down');
                return;
            }
            if (key === 'ArrowLeft' || code === 21) {
                e.preventDefault();
                this.playFeedbackSound('move');
                this.handleDpad('left');
                return;
            }
            if (key === 'ArrowRight' || code === 22) {
                e.preventDefault();
                this.playFeedbackSound('move');
                this.handleDpad('right');
                return;
            }

            // OK / Select / Enter / Space
            if (key === 'Enter' || key === ' ' || key === 'Select' || code === 23 || code === 66) {
                e.preventDefault();
                if (this.numberBuffer) {
                    if (this.numberZapTimer) clearTimeout(this.numberZapTimer);
                    this.commitNumberZap();
                    return;
                }
                this.playFeedbackSound('select');
                this.handleOk();
                return;
            }

            // Back / Escape / Backspace / Android Back
            if (key === 'Escape' || key === 'Backspace' || key === 'GoBack' || code === 4 || code === 111) {
                if (this.numberBuffer) {
                    e.preventDefault();
                    this.numberBuffer = '';
                    const box = document.getElementById('tvChannelNumberBox');
                    if (box) box.classList.add('scale-0', 'opacity-0', 'pointer-events-none');
                    return;
                }
                e.preventDefault();
                this.playFeedbackSound('back');
                this.handleBack();
                return;
            }

            // Menu / Info / KeyM / ContextMenu
            if (key === 'm' || key === 'M' || key === 'i' || key === 'I' || key === 'ContextMenu' || code === 82) {
                e.preventDefault();
                this.playFeedbackSound('move');
                this.handleMenu();
                return;
            }

            // Channel Up / Channel Down (PageUp / PageDown)
            if (key === 'PageUp' || code === 166) {
                e.preventDefault();
                this.playFeedbackSound('select');
                this.app?.playNextChannel();
                return;
            }
            if (key === 'PageDown' || code === 167) {
                e.preventDefault();
                this.playFeedbackSound('select');
                this.app?.playPreviousChannel();
                return;
            }

            // Media Play / Pause (KeyP or Space or MediaPlayPause)
            if (key === 'p' || key === 'P' || key === 'MediaPlayPause') {
                e.preventDefault();
                this.playFeedbackSound('select');
                if (this.app?.streamEngine) {
                    const isPaused = this.app.streamEngine.togglePlayPause();
                    this.app.updatePlayPauseIcons(isPaused);
                }
                return;
            }
        });
    }

    /**
     * Handles D-Pad Directional Navigation.
     * @param {'up'|'down'|'left'|'right'} dir 
     */
    handleDpad(dir) {
        // If an active input field is focused, don't hijack focus
        const active = document.activeElement;

        // Collect all focusable elements in viewport
        const focusables = Array.from(document.querySelectorAll(
            'button:not([disabled]), [tabindex]:not([tabindex="-1"]), [data-channel-id], input:not([type="hidden"]), select, a[href]'
        )).filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';
        });

        if (focusables.length === 0) return;

        if (!active || active === document.body || !focusables.includes(active)) {
            // Initial focus target: Channel Card or main button
            const firstTarget = document.querySelector('[data-channel-id]') || focusables[0];
            if (firstTarget) {
                firstTarget.focus();
                firstTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
            }
            return;
        }

        // Calculate spatial position of current element
        const currentRect = active.getBoundingClientRect();
        let bestCandidate = null;
        let minDistance = Infinity;

        focusables.forEach(el => {
            if (el === active) return;
            const r = el.getBoundingClientRect();

            let dx = 0;
            let dy = 0;
            let isValidDirection = false;

            if (dir === 'up') {
                dy = currentRect.top - r.bottom;
                dx = Math.abs((currentRect.left + currentRect.width / 2) - (r.left + r.width / 2));
                isValidDirection = r.bottom <= currentRect.top + 10;
            } else if (dir === 'down') {
                dy = r.top - currentRect.bottom;
                dx = Math.abs((currentRect.left + currentRect.width / 2) - (r.left + r.width / 2));
                isValidDirection = r.top >= currentRect.bottom - 10;
            } else if (dir === 'left') {
                dx = currentRect.left - r.right;
                dy = Math.abs((currentRect.top + currentRect.height / 2) - (r.top + r.height / 2));
                isValidDirection = r.right <= currentRect.left + 10;
            } else if (dir === 'right') {
                dx = r.left - currentRect.right;
                dy = Math.abs((currentRect.top + currentRect.height / 2) - (r.top + r.height / 2));
                isValidDirection = r.left >= currentRect.right - 10;
            }

            if (isValidDirection) {
                // Weighted Manhattan / Euclidean distance favoring direct alignment
                const dist = Math.sqrt((dx * dx) + (dy * dy * 4));
                if (dist < minDistance) {
                    minDistance = dist;
                    bestCandidate = el;
                }
            }
        });

        if (bestCandidate) {
            bestCandidate.focus();
            bestCandidate.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        } else {
            // Fallback zapping if video player is active
            if (dir === 'up') this.app?.playPreviousChannel();
            else if (dir === 'down') this.app?.playNextChannel();
        }
    }

    /**
     * Handles OK / Center button press.
     */
    handleOk() {
        const active = document.activeElement;

        if (active && active !== document.body && typeof active.click === 'function') {
            active.click();
            return;
        }

        // If video player container is active, toggle OSD controls
        const videoEl = document.getElementById('videoPlayer');
        if (videoEl) {
            const isPaused = this.app?.streamEngine?.togglePlayPause();
            this.app?.updatePlayPauseIcons(isPaused);
        }
    }

    /**
     * Handles Back / Escape button press.
     */
    handleBack() {
        // First check if any open modals exist and close them
        const openModals = ['playlistModal', 'epgModal', 'programModal', 'channelEpgModal', 'settingsModal', 'parentalModal', 'helpModal', 'editProviderModal', 'confirmModal', 'castModal', 'installModal'];
        for (const modalId of openModals) {
            const modal = document.getElementById(modalId);
            if (modal && !modal.classList.contains('hidden')) {
                this.app?.uiController?.toggleModal(modalId);
                return;
            }
        }

        // Close virtual remote if visible
        const remoteModal = document.getElementById('virtualTvRemoteModal');
        if (remoteModal && !remoteModal.classList.contains('pointer-events-none')) {
            this.toggleVirtualRemote(false);
            return;
        }

        // Exit Fullscreen if active
        const fsContainer = document.getElementById('singlePlayerContainer');
        if (document.fullscreenElement || document.webkitFullscreenElement || fsContainer?.classList.contains('is-fullscreen')) {
            if (this.app?.toggleFullscreen) {
                this.app.toggleFullscreen();
            } else {
                fsContainer?.classList.remove('is-fullscreen', 'controls-hidden');
                if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
                else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            }
            return;
        }

        // Show Back/Exit toast
        this.app?.uiController?.showToast('Press Back again or Home to exit player', 'info');
    }

    /**
     * Handles Menu / OSD button press.
     */
    handleMenu() {
        // Toggle Quick TV Guide or Settings
        const epgModal = document.getElementById('epgModal');
        if (epgModal) {
            this.app?.uiController?.toggleModal('epgModal');
            this.app?.populateEpgControls();
            requestAnimationFrame(() => this.app?.renderEPGGrid(true));
        }
    }
}
