/**
 * @file tauri-bridge.js
 * @description Tauri Native Runtime Bridge & Environment Integration for TellyX Player.
 * Detects embedded Tauri runtime context across Desktop (Windows, Linux, macOS) and Mobile (Android).
 * Automatically hides CORS Proxy settings when running inside Tauri since native webview bypasses web browser CORS restrictions.
 * Displays browser CORS notice with native download links for Armature.TN when running in standard browsers.
 * 
 * @module TauriBridge
 * @version 1.0.0
 * @author Armature.TN
 * @license Dual License: GNU AGPL-3.0 or Commercial License (SPDX: AGPL-3.0-or-later OR Commercial)
 */

/**
 * Detects whether the application is currently executing inside an embedded Tauri runtime window.
 * Checks for window.__TAURI__, window.__TAURI_INTERNALS__, window.__TAURI_METADATA__, and window.isTauri.
 * 
 * @returns {boolean} True if running inside Tauri, false if in standard browser.
 */
export function isTauriEnvironment() {
    if (typeof window === 'undefined') return false;
    return Boolean(
        window.__TAURI__ ||
        window.__TAURI_INTERNALS__ ||
        window.__TAURI_METADATA__ ||
        window.isTauri ||
        (window.navigator && window.navigator.userAgent && window.navigator.userAgent.includes('Tauri'))
    );
}

/**
 * Opens an external URL.
 * On Tauri Native (Windows, Linux, macOS, Android), uses Tauri Shell or Opener plugin to launch the default system browser.
 * On standard Web Browsers, opens via window.open(url, '_blank', 'noopener,noreferrer').
 * 
 * @param {string} url - Target URL to open.
 */
export async function openExternalUrl(url) {
    if (!url) return;
    if (isTauriEnvironment()) {
        try {
            const shellPkg = '@tauri-apps/plugin-shell';
            const { open } = await import(/* @vite-ignore */ shellPkg);
            await open(url);
            return;
        } catch (e1) {
            try {
                const openerPkg = '@tauri-apps/plugin-opener';
                const { openUrl } = await import(/* @vite-ignore */ openerPkg);
                await openUrl(url);
                return;
            } catch (e2) {
                try {
                    if (window.__TAURI__?.shell?.open) {
                        await window.__TAURI__.shell.open(url);
                        return;
                    }
                    if (window.__TAURI__?.opener?.openUrl) {
                        await window.__TAURI__.opener.openUrl(url);
                        return;
                    }
                } catch (e3) {
                    console.warn('[TellyX Tauri Bridge] External navigator launch failed:', e3);
                }
            }
        }
    }
    // Web browser environment or fallback
    window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Sets up native Tauri window minimization/restore listeners across Desktop (Windows, Linux, macOS) & Mobile.
 * 
 * @param {Object} options - { onMinimize, onRestore }
 */
export async function setupTauriWindowListeners({ onMinimize, onRestore }) {
    if (!isTauriEnvironment()) return;
    try {
        const windowPkg = '@tauri-apps/api/window';
        const { getCurrentWindow } = await import(/* @vite-ignore */ windowPkg);
        const appWindow = getCurrentWindow();
        if (appWindow) {
            if (appWindow.onResized) {
                appWindow.onResized(async () => {
                    try {
                        const isMin = await appWindow.isMinimized();
                        if (isMin) {
                            if (onMinimize) onMinimize();
                        } else {
                            if (onRestore) onRestore();
                        }
                    } catch (e) {}
                });
            }
            if (appWindow.onFocusChanged) {
                appWindow.onFocusChanged(async ({ payload: focused }) => {
                    try {
                        const isMin = await appWindow.isMinimized();
                        if (isMin) {
                            if (onMinimize) onMinimize();
                        } else if (focused) {
                            if (onRestore) onRestore();
                        }
                    } catch (e) {}
                });
            }
        }
    } catch (err) {
        console.warn('[TellyX Tauri Bridge] Window minimize listener error:', err);
    }
}

/**
 * Initializes Tauri embedded environment integrations.
 * When embedded in Tauri:
 * 1. Hides the CORS Proxy Bypass section in Settings since Tauri webviews load HTTP/HTTPS streams directly without browser CORS restrictions.
 * 2. Displays the Tauri Native Embedded notice badge.
 * 3. Hides the browser CORS notice box.
 * 4. Enables the native auto-updater section.
 * When running in standard web browser:
 * 1. Retains the CORS Proxy Bypass setting section.
 * 2. Hides the Tauri Native notice badge in Settings.
 * 3. Shows the browser CORS info banner with Armature.TN pre-built native app download options.
 * 4. Hides the native auto-updater section.
 * 
 * @param {Object} [uiController=null] - Optional UI Controller reference.
 * @returns {boolean} True if embedded in Tauri runtime, false otherwise.
 */
export function initTauriIntegration(uiController = null) {
    const isEmbedded = isTauriEnvironment();
    const corsSection = document.getElementById('corsProxySection');
    const tauriNotice = document.getElementById('tauriNativeNotice');
    const browserNoticeBox = document.getElementById('browserCorsNoticeBox');
    const autoUpdaterSection = document.getElementById('autoUpdaterSection');
    const btnCheckUpdate = document.getElementById('btnCheckTellyxUpdate');

    // Intercept clicks on external links:
    // Web: ensures target="_blank" and rel="noopener noreferrer"
    // Tauri (Windows, Linux, macOS, Android): opens external navigator / browser
    document.addEventListener('click', async (e) => {
        const anchor = e.target.closest('a[href]');
        if (!anchor) return;

        const href = anchor.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

        if (href.startsWith('http://') || href.startsWith('https://')) {
            anchor.setAttribute('target', '_blank');
            anchor.setAttribute('rel', 'noopener noreferrer');

            if (isTauriEnvironment()) {
                e.preventDefault();
                e.stopPropagation();
                await openExternalUrl(href);
            }
        }
    });

    if (btnCheckUpdate) {
        btnCheckUpdate.onclick = () => {
            checkForTellyxUpdate(uiController, false);
        };
    }

    if (isEmbedded) {
        console.log('[TellyX Tauri Bridge] Embedded native Tauri runtime detected. Hiding CORS Proxy settings.');

        if (corsSection) {
            corsSection.classList.add('hidden');
        }
        if (tauriNotice) {
            tauriNotice.classList.remove('hidden');
        }
        if (browserNoticeBox) {
            browserNoticeBox.classList.add('hidden');
        }
        if (autoUpdaterSection) {
            autoUpdaterSection.classList.remove('hidden');
        }
        // Auto check for updates on startup
        setTimeout(() => {
            checkForTellyxUpdate(uiController, true);
        }, 3000);
    } else {
        console.log('[TellyX Tauri Bridge] Standard browser runtime detected. CORS Proxy option enabled.');
        if (corsSection) {
            corsSection.classList.remove('hidden');
        }
        if (tauriNotice) {
            tauriNotice.classList.add('hidden');
        }
        if (autoUpdaterSection) {
            autoUpdaterSection.classList.add('hidden');
        }
        if (browserNoticeBox) {
            // Always show notice on each app start / restart
            browserNoticeBox.classList.remove('hidden');

            // Wire up notice dismiss button
            const btnDismiss = document.getElementById('btnDismissCorsNotice');
            if (btnDismiss) {
                btnDismiss.onclick = () => {
                    browserNoticeBox.classList.add('hidden');
                };
            }
        }
    }

    return isEmbedded;
}

/**
 * Checks for updates for TellyX via Tauri plugin or online update manifest.
 * 
 * @param {Object} [uiController=null] - UI controller for toast messages
 * @param {boolean} [silent=true] - If true, suppressed 'up to date' messages
 */
export async function checkForTellyxUpdate(uiController = null, silent = true) {
    const statusText = document.getElementById('updaterStatusText');
    const statusBadge = document.getElementById('updaterStatusBadge');

    const formatVersion = (v) => {
        if (!v) return 'v0.1.0';
        const clean = String(v).trim().replace(/^v+/, '');
        return `v${clean}`;
    };

    const cleanSemver = (v) => {
        if (!v) return '0.1.0';
        return String(v).trim().replace(/^v+/, '');
    };

    if (statusText) {
        statusText.classList.remove('hidden');
        statusText.textContent = 'Checking for updates...';
    }

    // 1. Try Native Tauri Updater Plugin first if inside Tauri
    if (isTauriEnvironment()) {
        try {
            const updaterPkg = '@tauri-apps/plugin-updater';
            const { check } = await import(/* @vite-ignore */ updaterPkg);
            const update = await check();

            if (update) {
                const displayVer = formatVersion(update.version);
                console.log(`[TellyX AutoUpdater] New update available: ${displayVer}`);
                if (statusBadge) statusBadge.textContent = `New ${displayVer}`;
                if (statusText) statusText.textContent = `New version ${displayVer} available! Downloading update...`;

                if (uiController) {
                    uiController.showToast(`Updating TellyX to ${displayVer}...`, 'info');
                }

                // Download & install update
                await update.downloadAndInstall((event) => {
                    if (event.event === 'Started') {
                        if (statusText) statusText.textContent = `Downloading update package (${event.data.contentLength || ''} bytes)...`;
                    } else if (event.event === 'Progress') {
                        if (statusText) statusText.textContent = `Downloading: ${event.data.chunkLength} bytes received...`;
                    } else if (event.event === 'Finished') {
                        if (statusText) statusText.textContent = 'Download finished! Installing and restarting application...';
                    }
                });

                if (statusText) statusText.textContent = 'Update installed! Restarting TellyX...';
                if (uiController) {
                    uiController.showToast('Update installed successfully! Restarting...', 'success');
                }
                return;
            } else {
                console.log('[TellyX AutoUpdater] TellyX is up to date.');
                if (statusText) statusText.textContent = 'TellyX is running the latest version (v0.1.0).';
                if (!silent && uiController) {
                    uiController.showToast('TellyX is up to date! (v0.1.0)', 'success');
                }
                return;
            }
        } catch (err) {
            console.warn('[TellyX AutoUpdater] Native Tauri updater error, falling back to HTTP manifest check:', err);
        }
    }

    // 2. Fallback HTTP manifest check (works for Web/Mobile or Tauri fallback)
    try {
        const updateManifestUrls = [
            'https://armature.tn/tellyx/update.json',
            'https://raw.githubusercontent.com/armature-tn/tellyx/main/update.json'
        ];

        let manifestData = null;
        for (const url of updateManifestUrls) {
            try {
                const res = await fetch(url, { cache: 'no-store' });
                if (res.ok) {
                    manifestData = await res.json();
                    break;
                }
            } catch (e) {
                // Try next
            }
        }

        if (manifestData) {
            const rawLatest = manifestData.version || '0.1.0';
            const cleanLatest = cleanSemver(rawLatest);
            const cleanCurrent = '0.1.0';
            const displayVer = formatVersion(rawLatest);

            if (cleanLatest !== cleanCurrent) {
                if (statusBadge) statusBadge.textContent = `${displayVer} Available`;
                if (statusText) {
                    statusText.innerHTML = `New update <strong>${displayVer}</strong> available on <a href="https://github.com/armature-tn/tellyx/releases/latest" target="_blank" class="text-rose-400 underline font-bold">GitHub Releases</a>.`;
                }
                if (uiController) {
                    uiController.showToast(`New update ${displayVer} available!`, 'info');
                }
            } else {
                if (statusText) statusText.textContent = 'TellyX is up to date (v0.1.0).';
                if (!silent && uiController) {
                    uiController.showToast('TellyX is up to date! (v0.1.0)', 'success');
                }
            }
        } else {
            if (statusText) statusText.textContent = 'Check completed. TellyX is on current release v0.1.0.';
            if (!silent && uiController) {
                uiController.showToast('TellyX is up to date! (v0.1.0)', 'success');
            }
        }
    } catch (err) {
        console.error('[TellyX AutoUpdater] Manifest check failed:', err);
        if (statusText) statusText.textContent = 'Unable to reach update server.';
        if (!silent && uiController) {
            uiController.showToast('Could not check for updates.', 'error');
        }
    }
}
