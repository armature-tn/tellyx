# TellyX — High-Performance IPTV & VOD Web App

[![Version](https://img.shields.io/badge/version-0.1.0-rose.svg)](https://github.com/armature-tn/tellyx)
[![PWA Ready](https://img.shields.io/badge/PWA-Installable-emerald.svg)](./public/manifest.json)
[![License](https://img.shields.io/badge/license-AGPL--3.0--or--later%20%7C%20Commercial-blue.svg)](./LICENSE)
[![Framework](https://img.shields.io/badge/React-19-cyan.svg)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-purple.svg)](https://vitejs.dev)
[![Tauri](https://img.shields.io/badge/Tauri-v2-orange.svg)](https://tauri.app)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind--CSS-v4-38bdf8.svg)](https://tailwindcss.com)

**TellyX** is an ultra-fast, modern, feature-rich Progressive Web App (PWA) and cross-platform IPTV & Video-On-Demand (VOD) player built for web browsers, mobile devices, desktop operating systems (Windows, macOS, Linux), and Android via Tauri v2. It features WebAssembly (WASM) computational acceleration, real-time HLS adaptive streaming with live Timeshift buffers, XMLTV Electronic Program Guide (EPG) schedule matrix grid, Xtream Codes API connection management, Quad-Screen Multi-View, stream DVR recording, audio spectrum visualization, parental controls, and smart TV remote D-Pad navigation.

---

## 📋 Table of Contents

- [🌟 Key Features](#-key-features)
  - [📱 Progressive Web App (PWA) & Web App Experience](#-progressive-web-app-pwa--web-app-experience)
  - [📺 Streaming & Playback Engine](#-streaming--playback-engine)
  - [⚡ WebAssembly (WASM) Acceleration Pipeline](#-webassembly-wasm-acceleration-pipeline)
  - [📅 EPG Matrix & Electronic Program Guide](#-epg-matrix--electronic-program-guide)
  - [🔌 Provider & Connection Management](#-provider--connection-management)
  - [🔒 Security & Parental Controls](#-security--parental-controls)
  - [🎮 D-Pad & Smart TV Navigation](#-d-pad--smart-tv-navigation)
- [🛠️ Tech Stack & Architecture](#-tech-stack--architecture)
- [📁 Exhaustive Project Structure](#-exhaustive-project-structure)
- [🚀 Getting Started & Installation](#-getting-started--installation)
- [🔐 Environment Variables & CI/CD Secrets Setup](#-environment-variables--cicd-secrets-setup)
  - [📋 Environment Variables Reference](#-environment-variables-reference)
  - [🔑 How to Generate Tauri Minisign Signing Keys](#-how-to-generate-tauri-minisign-signing-keys)
  - [🤖 How to Generate Android Release Keystore & Base64 String](#-how-to-generate-android-release-keystore--base64-string)
  - [🐙 Configuring GitHub Repository Secrets for Automated CI/CD](#-configuring-github-repository-secrets-for-automated-cicd)
- [📜 Available Scripts Reference](#-available-scripts-reference)
- [⌨️ Keyboard & Hotkey Controls](#-keyboard--hotkey-controls)
- [🏗️ Internal Architecture & Engine Modules](#-internal-architecture--engine-modules)
- [📱 Tauri Native App Integration](#-tauri-native-app-integration)
- [❓ Troubleshooting & FAQ](#-troubleshooting--faq)
- [📄 License & Attribution](#-license--attribution)

---

## 🌟 Key Features

### 📱 Progressive Web App (PWA) & Web App Experience
* **Installable Application**: Native PWA support via Web App Manifest (`manifest.json`) and Service Worker (`sw.js`) enabling one-click installation on Desktop and Mobile browsers.
* **Offline Asset Caching**: Service Worker caches critical application assets to guarantee instant cold boot and offline application frame availability.
* **Responsive Multi-Device Layout**: Fully adaptive responsive UI supporting desktop monitors, mobile phones, tablets, and 10-foot Smart TV displays with light/dark glassmorphism styling.
* **Dynamic Color Theme Engine**: Built-in real-time switching across 8 customized visual themes (Emerald, Cyberpunk, Sunset, Synthwave, Nord, Midnight, Crimson, Amber).

### 📺 Streaming & Playback Engine
* **HLS Adaptive Live Streaming**: High-performance HTTP Live Streaming powered by `hls.js` supporting adaptive bitrate switching, low-latency live edge alignment (`GO LIVE ▶`), and buffer management.
* **Seekable Live Timeshift Buffer**: Real-time seekable back-buffer allowing instant rewind (`-10s`) and fast-forward (`+10s`) during live TV broadcasts.
* **Quad-Screen Multi-View**: Concurrent viewing of up to 4 live streams in a dynamic 2x2 grid layout with independent audio isolation, mute toggles, and channel assignments.
* **DVR Stream Recording**: In-browser stream capture using the `MediaRecorder` API allowing users to record live broadcasts directly into downloadable video files (`.webm`).
* **Real-time Audio Spectrum Visualizer**: Audio frequency analyzer overlay powered by the Web Audio API (`AnalyserNode`) rendering real-time animated canvas spectrum bars.
* **Screen Casting & Display Sharing**: Built-in support for Presentation API, AirPlay, Display Share, and Web Cast protocol to project streams to external TVs and monitors.
* **Auto-Resume & Channel Memory**: Automatically remembers and resumes the last watched Live TV channel or VOD title upon launch.

### ⚡ WebAssembly (WASM) Acceleration Pipeline
* **Embedded WASM Computation**: Dedicated WebAssembly binary module (`wasm-engine.js`) executing low-level CRC32 checksum verification, FNV-1a string hashing, and byte array manipulations in linear memory.
* **Automatic JS Fallback**: Built-in feature detection that seamlessly falls back to optimized pure JavaScript hash routines if WASM initialization is unavailable or restricted.

### 📅 EPG Matrix & Electronic Program Guide
* **Interactive EPG Grid Matrix**: Time-aligned schedule timeline displaying active, past, and upcoming TV programs with live broadcast progress bars.
* **XMLTV Feed Synchronization**: Automatic downloading, parsing, and channel mapping of XMLTV program guide feeds (`.xml` / `.xml.gz`).

### 🔌 Provider & Connection Management
* **Xtream Codes API Integration**: Native support for Xtream Codes IPTV servers via URL, username, and password with automatic categorization for Live TV, Movies (VOD), and TV Series.
* **M3U / M3U8 Playlist Parser**: Multi-format M3U playlist parser supporting remote HTTP URLs and local `.m3u` / `.m3u8` file uploads with group title extraction.
* **Multi-Account Repository**: Manage multiple IPTV subscriptions inside the Settings modal with right-aligned Sync, Edit, and Delete actions.

### 🔒 Security & Parental Controls
* **SHA-256 Protected Parental Lock**: PIN-protected restriction mode (`0000` default PIN) that dynamically censors adult content categories, channel titles, and VOD listings.
* **Hardened Security Controller**: Centralized input sanitization, HTML entity escaping against XSS vulnerabilities, and safe URL scheme validation (`security.js`).

### 🎮 D-Pad & Smart TV Navigation
* **Spatial D-Pad Navigation Engine**: Dedicated TV Remote controller (`tv-remote.js`) enabling 10-foot spatial directional navigation (`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Enter`, `Back`) for Smart TV set-top boxes.

---

## 🛠️ Tech Stack & Architecture

* **Frontend Framework**: [React 19](https://react.dev) + Modular Modern JavaScript (ES2022)
* **Bundler & Dev Server**: [Vite 6](https://vitejs.dev)
* **Styling Framework**: [Tailwind CSS v4](https://tailwindcss.com) via `@tailwindcss/vite`
* **Streaming Media Engine**: [Hls.js](https://github.com/video-dev/hls.js/) (v1.6+) utilizing HTML5 Media Source Extensions (MSE)
* **Native Cross-Platform Runtime**: [Tauri v2](https://tauri.app) (Rust Backend)
* **Performance Pipeline**: WebAssembly (WASM) Linear Memory Engine
* **AI Recommendation Engine**: [@google/genai](https://www.npmjs.com/package/@google/genai) SDK for server-side channel recommendations and smart insights
* **Iconography**: [Lucide React](https://lucide.dev)

---

## 📁 Exhaustive Project Structure

Below is the complete, unabbreviated directory and file structure of the **TellyX** codebase:

```
tellyx/
├── .github/                                  # GitHub configuration & automated CI/CD workflows
│   └── workflows/
│       └── ci.yml                            # GitHub Actions workflow for linting, building web app, generating icons, injecting Tauri keys, and compiling cross-platform release artifacts (Windows, macOS, Linux, Android)
├── assets/                                   # Repository static visual assets and media
│   └── .aistudio/                           # Platform workspace tracking files
│       └── .gitignore                        # AI Studio internal git rules
├── public/                                   # Public static files served at application root
│   ├── icon.svg                              # Scalable vector application icon for web browsers, PWA manifest, and Tauri icon generator
│   ├── manifest.json                         # Web App Manifest defining PWA metadata, color theme, display modes, and launcher icons
│   ├── sw.js                                 # Service Worker implementation providing offline asset caching, cache storage management, and PWA installation support
│   └── update.json                           # Copy of Tauri update manifest for public web updates and verification
├── scripts/                                  # Root node utility & build pipeline scripts
│   ├── generate-update-manifest.js           # Build script generating Tauri update manifests (update.json) with Minisign cryptographic signatures for release binaries
│   └── setup-android-keystore.js             # Build script decoding base64 Android keystore secrets into release.keystore files during CI/CD execution
├── src/                                      # Application frontend source code
│   ├── css/
│   │   └── styles.css                        # Tailwind CSS v4 design system, glassmorphism styles, scrollbar styling, and 8 dynamic color themes
│   ├── js/
│   │   ├── app.js                            # Application entry coordinator: bootstraps components, attaches global hotkeys, binds UI listeners, and manages app state
│   │   ├── epg-engine.js                     # XMLTV EPG parser and schedule grid matrix renderer: processes guide XML, maps channels, and renders interactive timeline
│   │   ├── iptv-core.js                      # Core IPTV data layer: Xtream Codes API client, M3U/M3U8 parser, provider storage manager, and catalog filter
│   │   ├── security.js                       # Security & Parental Control engine: HTML entity escaping, XSS sanitization, SHA-256 PIN hashing, and adult channel masking
│   │   ├── stream-engine.js                  # HLS playback engine: hls.js lifecycle manager, Timeshift buffer scrubber, MediaRecorder DVR engine, and Web Audio spectrum visualizer
│   │   ├── tauri-bridge.js                   # Cross-platform Tauri v2 bridge: manages native OS window controls, system notifications, native file dialogs, and updater IPC calls
│   │   ├── tv-remote.js                      # Smart TV spatial D-Pad navigation controller: manages focus styling and directional arrow key navigation for TV remotes
│   │   ├── ui-controller.js                  # DOM View & State Manager: manages tabs, modals, toast notifications, channel grids, VOD detail cards, search, and settings panels
│   │   └── wasm-engine.js                    # WebAssembly computational pipeline: executes low-level CRC32/FNV-1a byte hash algorithms with automatic JavaScript fallback
│   ├── App.tsx                               # React top-level application wrapper component
│   ├── index.css                             # Global stylesheet entry importing Tailwind CSS
│   ├── main.tsx                              # React 19 application client entry point
│   └── vite-env.d.ts                         # Vite client TypeScript type ambient module declarations
├── src-tauri/                                # Tauri v2 native platform application directory (Rust)
│   ├── capabilities/
│   │   └── default.json                      # Tauri v2 security capability configuration defining plugin scopes (updater, dialog, shell, fs)
│   ├── scripts/
│   │   └── setup-tauri-pubkey.js             # Build-time script injecting TAURI_SIGNING_PUBLIC_KEY into src-tauri/tauri.conf.json from process environment or .env file
│   ├── src/
│   │   ├── lib.rs                            # Tauri Rust library entry point establishing custom IPC commands, plugin initializations, and window events
│   │   └── main.rs                           # Tauri Rust binary entry executing standard desktop app runtime loop
│   ├── build.rs                              # Cargo build script for native Tauri Rust compilation
│   ├── Cargo.toml                            # Rust crate manifest defining Tauri dependencies, plugin crates, and compiler release optimization profiles
│   └── tauri.conf.json                       # Master Tauri v2 application configuration file (bundle identifiers, window properties, security scope, and updater settings)
├── .env.example                              # Master environment variable template for API keys, Tauri signing keys, and Android keystore credentials
├── .gitignore                                # Git ignore configuration excluding node_modules, build outputs, local keys, and environment files
├── bun.lock                                  # Bun package manager lockfile
├── index.html                                # Official Landing Page, Feature Showcase, and Desktop Binary Download Hub HTML entry point
├── LICENSE                                   # Dual licensing terms (AGPL-3.0-or-later / Commercial License)
├── metadata.json                             # AI Studio metadata & major capabilities declaration
├── NOTICE                                    # Comprehensive legal third-party notices and open-source software attributions
├── package.json                              # NPM package manifest defining application scripts, dependencies, build targets, and metadata
├── package-lock.json                         # NPM lockfile ensuring deterministic dependency version resolution
├── player.html                               # Primary IPTV & VOD Web Application interface HTML entry point
├── README.md                                 # Complete technical documentation, setup guides, API reference, and repository documentation
├── tsconfig.json                             # TypeScript compiler configuration (strict mode, JSX settings, module resolution)
├── update.json                               # Master Tauri auto-updater manifest file containing version releases, release notes, binary download URLs, and Minisign signatures
└── vite.config.ts                            # Vite 6 bundler configuration with React plugin, Tailwind CSS v4 integration, and dev server port settings
```

---

## 🚀 Getting Started & Installation

### Prerequisites
* **Node.js**: `v18.0.0` or higher
* **npm**: `v9.0.0` or higher (or `bun` / `pnpm`)

### Installation Steps

1. **Clone the repository**:
   ```bash
   git clone https://github.com/armature-tn/tellyx.git
   cd tellyx
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Fill in your required API keys, Tauri signing keys, and Android keystore credentials (see [Environment Variables & CI/CD Secrets Setup](#-environment-variables--cicd-secrets-setup) below).

4. **Start Development Server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your web browser.

---

## 🔐 Environment Variables & CI/CD Secrets Setup

TellyX supports automated release signing and updater verification for both Desktop (Tauri v2 Minisign) and Mobile (Android Release Keystore).

### 📋 Environment Variables Reference

| Variable | Description | Where to Set |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Google Gemini AI API Key for server-side recommendations | `.env` / Environment |
| `APP_URL` | Application base host URL | `.env` / Environment |
| `TAURI_SIGNING_PUBLIC_KEY` | Minisign Public Key string (injected into `src-tauri/tauri.conf.json` at build time) | `.env` / GitHub Secret |
| `TAURI_SIGNING_PRIVATE_KEY` | Minisign Private Key string (used by Tauri build tools to sign binary packages) | `.env` / GitHub Secret |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for Minisign private key (leave empty if unencrypted) | `.env` / GitHub Secret |
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded string of the `release.keystore` binary file | `.env` / GitHub Secret |
| `ANDROID_KEYSTORE_PASSWORD` | Password for the Android release keystore | `.env` / GitHub Secret |
| `ANDROID_KEY_ALIAS` | Key alias name inside the Android release keystore | `.env` / GitHub Secret |
| `ANDROID_KEY_PASSWORD` | Password for the key alias inside the keystore | `.env` / GitHub Secret |

---

### 🔑 How to Generate Tauri Minisign Signing Keys

Tauri v2 uses **Minisign** Ed25519 signatures to sign release binaries and verify auto-updates.

1. **Generate Minisign Keypair**:
   Run the Tauri CLI signer generator:
   ```bash
   npx @tauri-apps/cli signer generate -w ~/.tauri/tellyx.key
   ```
   *(Note: Use `npx @tauri-apps/cli signer generate` rather than `npx tauri signer generate` to avoid executable resolution issues).*

2. **Key Output**:
   * **Public Key**: Printed directly in the console (e.g., `dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYy...`).
     Copy this string to `TAURI_SIGNING_PUBLIC_KEY`.
   * **Private Key File**: Created at `~/.tauri/tellyx.key`.
     Copy the contents of this file (including comments) to `TAURI_SIGNING_PRIVATE_KEY`.
   * **Password**: If you specified a password during prompt, set `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

3. **Automatic Build-Time Public Key Injection**:
   When running `npm run tauri:build`, `npm run tauri:android`, or GitHub Actions CI, `src-tauri/scripts/setup-tauri-pubkey.js` automatically reads `TAURI_SIGNING_PUBLIC_KEY` from your environment or `.env` file and updates `plugins.updater.pubkey` inside `src-tauri/tauri.conf.json`.

---

### 🤖 How to Generate Android Release Keystore & Base64 String

Android APK and AAB release builds require a Java Keystore (`.keystore`) signed with RSA 2048-bit encryption.

1. **Generate Keystore file (`release.keystore`)**:
   Run the `keytool` command in your terminal:
   ```bash
   keytool -genkey -v -keystore release.keystore -storepass tellyxkey -alias tellyxkey -keypass tellyxkey -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=TellyX, OU=Media, O=Armature, L=Tunis, C=TN"
   ```

2. **Encode Keystore to Base64**:
   Convert the binary `release.keystore` into a single line Base64 string:
   * **Linux / macOS**:
     ```bash
     base64 -w 0 release.keystore
     # or
     openssl base64 -A -in release.keystore
     ```
   * **Windows (PowerShell)**:
     ```powershell
     [Convert]::ToBase64String([IO.File]::ReadAllBytes("release.keystore"))
     ```

3. **Set Environment Variables**:
   Copy the Base64 output string into `ANDROID_KEYSTORE_BASE64` in `.env` or GitHub Secrets. Set `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD` accordingly.

---

### 🐙 Configuring GitHub Repository Secrets for Automated CI/CD

To enable automated release signing in GitHub Actions:
1. Navigate to your GitHub repository: **Settings -> Secrets and variables -> Actions**.
2. Click **New repository secret** and add the following 7 secrets:
   * `TAURI_SIGNING_PUBLIC_KEY`
   * `TAURI_SIGNING_PRIVATE_KEY`
   * `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
   * `ANDROID_KEYSTORE_BASE64`
   * `ANDROID_KEYSTORE_PASSWORD`
   * `ANDROID_KEY_ALIAS`
   * `ANDROID_KEY_PASSWORD`
3. Whenever a release tag (e.g., `v0.1.0`) is pushed, CI will automatically build signed Windows, macOS, Linux, and Android binaries and attach signed update manifests to the GitHub release.

---

## 📜 Available Scripts Reference

| Script Name | Executed Command | Description |
| :--- | :--- | :--- |
| `dev` | `vite` | Launches Vite dev server on port 3000 (`0.0.0.0`) |
| `build` | `vite build` | Compiles production web bundle into `/dist` |
| `preview` | `vite preview` | Previews the production build locally |
| `lint` | `tsc --noEmit` | Performs TypeScript type checking |
| `clean` | `rm -rf dist server.js` | Cleans temporary build artifacts |
| `generate:icons` | `tauri icon public/icon.svg` | Generates cross-platform icons for desktop and mobile targets |
| `setup:tauri-pubkey` | `node src-tauri/scripts/setup-tauri-pubkey.js` | Injects Minisign public key into `src-tauri/tauri.conf.json` |
| `update-manifest` | `node scripts/generate-update-manifest.js` | Generates Tauri updater manifest (`update.json`) |
| `tauri:dev` | `node src-tauri/scripts/setup-tauri-pubkey.js && tauri dev` | Boots desktop application in Tauri development mode |
| `tauri:build` | `node src-tauri/scripts/setup-tauri-pubkey.js && npm run generate:icons && tauri build` | Injects key, generates icons, and builds native desktop app bundles |
| `tauri:android` | `node src-tauri/scripts/setup-tauri-pubkey.js && npm run generate:icons && tauri android build` | Injects key, generates icons, and builds native Android APK / AAB |

---

## ⌨️ Keyboard & Hotkey Controls

| Hotkey | Action | Description |
| :--- | :--- | :--- |
| `Space` | Play / Pause | Toggle live playback state |
| `M` | Mute / Unmute | Toggle player audio mute |
| `F` | Fullscreen | Toggle fullscreen mode |
| `P` | Picture-in-Picture | Toggle native browser PiP window |
| `S` | Stats Overlay | Toggle playback technical stats ("Stats for Nerds") |
| `G` | EPG Matrix Modal | Open / Close XMLTV TV Guide schedule matrix |
| `ArrowLeft` | Rewind 10s | Rewind 10 seconds in live Timeshift buffer |
| `ArrowRight` | Fast-Forward 10s | Fast-forward 10 seconds in live Timeshift buffer |
| `ArrowUp` | Previous Channel | Switch to previous channel in active list |
| `ArrowDown` | Next Channel | Switch to next channel in active list |
| `Escape` | Back / Exit | Close active modals, settings, or fullscreen |

---

## 🏗️ Internal Architecture & Engine Modules

### 1. Application Coordinator (`src/js/app.js`)
Serves as the central orchestrator. Initializes security protocols, checks Tauri native bridge environment, boots WebAssembly engine, connects IPTV data repository, binds global DOM listeners, and manages app state transitions.

### 2. IPTV Core Data Layer (`src/js/iptv-core.js`)
Manages provider connections (Xtream Codes API and M3U playlists), local storage persistence (`localStorage`), category mapping, search filtering, and active subscription repositories.

### 3. Stream Playback Engine (`src/js/stream-engine.js`)
Encapsulates `hls.js` lifecycle management, MSE video element binding, live edge alignment, seekable Timeshift buffering, DVR recording via `MediaRecorder`, and Web Audio API spectrum visualization.

### 4. EPG Grid Matrix Engine (`src/js/epg-engine.js`)
Parses XMLTV data feeds, computes program start/end timestamps, matches program guides to live channels, and renders the horizontal schedule grid matrix with progress indicators.

### 5. DOM View & UI Controller (`src/js/ui-controller.js`)
Controls UI rendering, tab navigation (Live TV, VOD Movies, Series, EPG, Settings), channel grid cards, modal overlays, search filters, notifications, theme toggles, and Quad Multi-View grids.

### 6. Security Controller (`src/js/security.js`)
Provides HTML entity escaping (`escapeHtml`), strict XSS input sanitization, safe URL scheme validation (`validateUrl`), and SHA-256 PIN hashing for parental controls.

### 7. WebAssembly Engine (`src/js/wasm-engine.js`)
Encapsulates WebAssembly linear memory initialization, compiling low-level byte arrays, and executing fast CRC32 checksum and FNV-1a hash operations with pure JS fallback support.

### 8. Tauri Bridge (`src/js/tauri-bridge.js`)
Interfaces with `@tauri-apps/api` and `@tauri-apps/plugin-updater`. Handles window minimizing/maximizing/closing, native desktop notifications, OS file dialogs, and native auto-update checks.

### 9. Smart TV Remote Engine (`src/js/tv-remote.js`)
Manages spatial focus for 10-foot television user interfaces, allowing users to navigate channel grids, player controls, and menus using standard Android TV / Smart TV D-Pad remotes.

### 10. Tauri Public Key Injector (`src-tauri/scripts/setup-tauri-pubkey.js`)
Cross-platform node script that automatically reads `TAURI_SIGNING_PUBLIC_KEY` from environment or `.env` and writes it to `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`.

---

## 📱 Tauri Native App Integration

TellyX is fully configured for Tauri v2 native compilation:
* **Desktop Targets**: Windows (`.exe`, `.msi`), macOS (`.app`, `.dmg`), Linux (`.deb`, `.AppImage`).
* **Mobile Targets**: Android (`.apk`, `.aab`).
* **Security Scope**: Configured capabilities in `src-tauri/capabilities/default.json` explicitly allow updater, dialog, shell, and filesystem operations.
* **Auto-Updater Integration**: Configured with Minisign signature validation pointing to `update.json` on GitHub Releases.

---

## ❓ Troubleshooting & FAQ

#### Q: Why did `npx tauri signer generate` fail with `could not determine executable to run`?
**A**: In Tauri v2, the CLI package is `@tauri-apps/cli`. Run `npx @tauri-apps/cli signer generate` instead of `npx tauri signer generate`.

#### Q: How does public key injection work during CI/CD?
**A**: `src-tauri/scripts/setup-tauri-pubkey.js` is automatically triggered prior to compilation. It injects the `TAURI_SIGNING_PUBLIC_KEY` secret into `src-tauri/tauri.conf.json` dynamically so that repository files do not store hardcoded public keys.

#### Q: What if WASM is not supported by the browser or container environment?
**A**: `wasm-engine.js` automatically detects WASM feature support. If compilation fails or is disabled by browser policies, it automatically switches to built-in pure JavaScript fallback algorithms.

#### Q: How do I resolve CORS errors when loading remote M3U or Xtream Codes servers?
**A**: For web browser deployments, IPTV streams must support CORS headers (`Access-Control-Allow-Origin: *`). Desktop and mobile native apps compiled via Tauri bypass CORS restrictions automatically due to native platform networking capabilities.

---

## 📄 License & Attribution

TellyX is authored by **Armature.TN** ([contact@armature.tn](mailto:contact@armature.tn)) and dual-licensed under:
1. **GNU Affero General Public License v3.0 (AGPL-3.0-or-later)**
2. **Commercial License** (for commercial usage without AGPL constraints)

For any inquiries, commercial licensing, or custom features, contact [contact@armature.tn](mailto:contact@armature.tn).

See [LICENSE](./LICENSE) and [NOTICE](./NOTICE) for full license terms and third-party open-source software attributions.
