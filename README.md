# TellyX — High-Performance IPTV & VOD Web App

[![Version](https://img.shields.io/badge/version-0.1.0-rose.svg)](https://github.com/armature-tn/tellyx)
[![PWA Ready](https://img.shields.io/badge/PWA-Installable-emerald.svg)](./public/manifest.json)
[![License](https://img.shields.io/badge/license-AGPL--3.0--or--later%20%7C%20Commercial-blue.svg)](./LICENSE)
[![Framework](https://img.shields.io/badge/React-19-cyan.svg)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-purple.svg)](https://vitejs.dev)

**TellyX** is an ultra-fast, modern, feature-rich Progressive Web App (PWA) and cross-platform IPTV & Video-On-Demand (VOD) player built for web browsers, mobile devices, and desktop operating systems via Tauri. It features WebAssembly (WASM) acceleration, real-time HLS streaming with live Timeshift buffers, XMLTV EPG schedule grids, Xtream Codes API connection management, Quad-Screen Multi-View, DVR recording, and audio visualization.

---

## 🌟 Key Features

### 📱 Progressive Web App (PWA) & Web App Experience
* **Installable Application**: Built-in support for Web App Manifest (`manifest.json`) and Service Worker (`sw.js`) enabling one-click "Add to Home Screen" or Desktop Web App installation.
* **Offline Caching & Resilience**: Service Worker caches critical core assets for ultra-fast startup and offline UI availability.
* **Responsive Multi-Device Interface**: Seamlessly adapts to mobile phones, tablets, desktop monitors, and Smart TV screens with touch, mouse, keyboard, and TV remote navigation.

### 📺 Streaming & Playback Engine
* **HLS Live Streaming & Timeshift**: Real-time HTTP Live Streaming powered by `hls.js` with seekable live back-buffer, live edge synchronization (`GO LIVE ▶`), and instant `-10s` / `+10s` seek.
* **Quad-Screen Multi-View (Quad View)**: View up to 4 streams concurrently in a split grid layout with independent mute, audio, and channel switching controls.
* **DVR Stream Recording**: Record live stream feeds directly in your browser using the MediaRecorder API with download capability.
* **Audio Spectrum Visualizer**: Real-time Web Audio API frequency spectrum analyzer canvas overlay.
* **Screen Casting & AirPlay**: Native support for Presentation API, Web Cast, AirPlay, and Display Share to cast streams to smart TVs and external displays.
* **Auto-Resume & Last Channel Memory**: Remembers last watched Live TV channels and automatically resumes streaming upon application launch or reconnection.
* **Multi-Content Category Support**: Seamless filtering across **Live TV**, **Movies VOD**, and **Series VOD**.

### ⚡ WebAssembly (WASM) Engine
* **Embedded WASM Pipeline**: High-performance WebAssembly module (`wasm-engine.js`) executing low-level CRC32 checksums, FNV-1a string hashing, and byte array manipulations in linear memory.
* **Graceful JS Fallback**: Automatic detection and instant fallback to JavaScript algorithms if WASM is unavailable or disabled.

### 📅 EPG Matrix & Electronic Program Guide
* **Interactive EPG Matrix Schedule**: Real-time schedule timeline displaying active broadcast shows, progress indicators, and program details.
* **XMLTV / EPG Feed Sync**: Synchronize and map XMLTV program guide feeds to live channels.

### 🔌 Provider & Connection Management
* **Xtream Codes API Integration**: Direct connection support for Xtream Codes servers using server URL, username, and password with automatic Live/VOD playlist generation.
* **M3U / M3U8 Playlist Parsing**: Parse remote URL playlists or uploaded local `.m3u` / `.m3u8` files with group/category extraction.
* **Multi-Provider Account Manager**: Manage multiple IPTV provider accounts inside Settings with right-aligned Sync, Edit, and Delete controls.

### 🔒 Security & Parental Controls
* **Parental Lock System**: SHA-256 PIN-protected restriction mode (`0000` default) that dynamically filters adult/XXX content categories and stream names.
* **Hardened Security Controller**: Strict HTML escaping for XSS prevention, URL scheme validation, and input sanitization (`security.js`).

### ⌨️ Keyboard & Hotkey Controls
* `Space`: Play / Pause stream toggle
* `M`: Mute / Unmute audio
* `F`: Fullscreen mode toggle
* `P`: Picture-in-Picture (PiP) mode toggle
* `S`: Stream stats overlay toggle ("Stats for Nerds")
* `G`: EPG TV Guide matrix modal toggle
* `ArrowLeft` / `ArrowRight`: Rewind / Fast-forward 10 seconds in Timeshift buffer
* `ArrowUp` / `ArrowDown`: Switch to Previous / Next channel in active category

---

## 🛠️ Tech Stack & Architecture

* **Frontend Engine**: Modular ES2022 JavaScript + [React 19](https://react.dev)
* **Build System & Bundler**: [Vite 6](https://vitejs.dev)
* **Styling & Theme Engine**: [Tailwind CSS v4](https://tailwindcss.com) with `@tailwindcss/vite` & 8 dynamic color themes
* **Media Player Engine**: [Hls.js](https://github.com/video-dev/hls.js/) (v1.6+) for HLS adaptive streaming & MSE buffer management
* **High-Performance Computation**: WebAssembly (WASM) byte pipeline
* **Cross-Platform Container**: Integrated [Tauri v2](https://tauri.app) bridge for Windows, macOS, Linux, and Android builds
* **AI Integration**: [@google/genai](https://www.npmjs.com/package/@google/genai) SDK for server-side smart channel recommendations and insights

---

## 🚀 Getting Started

### Prerequisites
* **Node.js**: v18.0.0 or higher
* **npm**: v9.0.0 or higher

### Installation

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
   Fill in your API keys, Tauri signing keys, and Android keystore credentials (see [Environment Variables & CI/CD Secrets Setup](#-environment-variables--cicd-secrets-setup) below).

4. **Start Development Server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

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
   When running `npm run tauri:build`, `npm run tauri:android`, or GitHub Actions CI, `scripts/setup-tauri-pubkey.js` automatically reads `TAURI_SIGNING_PUBLIC_KEY` from your environment or `.env` file and updates `plugins.updater.pubkey` inside `src-tauri/tauri.conf.json`.

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

## 📜 Available Scripts

| Script | Command | Description |
| :--- | :--- | :--- |
| `dev` | `npm run dev` | Launches Vite dev server on port 3000 (`0.0.0.0`) |
| `build` | `npm run build` | Builds production web distribution to `/dist` |
| `preview` | `npm run preview` | Previews the production build locally |
| `lint` | `npm run lint` | Performs TypeScript type checking (`tsc --noEmit`) |
| `clean` | `npm run clean` | Cleans build artifacts and dist folder |
| `update-manifest` | `npm run update-manifest` | Updates application PWA manifest file |
| `tauri:dev` | `npm run tauri:dev` | Launches desktop application in Tauri development mode |
| `tauri:build` | `npm run tauri:build` | Builds native desktop application packages |
| `tauri:android` | `npm run tauri:android` | Builds native Android APK / AAB package |

---

## 📁 Project Structure

```
├── index.html            # Landing & Download Hub HTML entry point
├── player.html           # Primary IPTV Player Application HTML entry point
├── metadata.json         # Platform capabilities & frame permissions
├── package.json          # Dependencies, scripts & build configuration
├── .env.example          # Environment variables template
├── LICENSE               # Dual license terms (AGPL-3.0 / Commercial)
├── NOTICE                # Third-party notices and attribution
├── public/
│   ├── manifest.json     # Web App Manifest for PWA installation
│   ├── sw.js             # Service Worker for offline asset caching
│   ├── icon.svg          # High-resolution vector application icon
│   └── wasm/             # WebAssembly binary files
├── src/
│   ├── css/
│   │   └── styles.css    # Tailwind CSS v4 design system & multi-theme variables
│   └── js/
│       ├── app.js        # Main application controller, bootstrap & event binder
│       ├── iptv-core.js   # M3U/Xtream parser, provider repository & storage
│       ├── stream-engine.js # HLS player engine, Timeshift buffer & DVR recording
│       ├── epg-engine.js  # XMLTV EPG parser, program matcher & matrix grid renderer
│       ├── ui-controller.js # DOM manager, modals, toasts, cards & provider UI
│       ├── wasm-engine.js # WebAssembly engine & JS fallback hash computational pipeline
│       ├── security.js   # Input sanitization, XSS escaping & crypto PIN hashing
│       └── tauri-bridge.js # Native desktop/mobile integration bridge & window controls
└── src-tauri/            # Tauri native platform configuration and Rust backend
```

---

## 📖 Feature Usage Guide

### 1. Web App / PWA Installation
* Open TellyX in any modern Web browser (Chrome, Edge, Safari, Firefox).
* Click the **Install App** button in the header bar or browser address bar to install TellyX as a standalone Web App.

### 2. Connecting IPTV Providers
* Open **Settings** or click **Add Provider** in the top navigation bar.
* Select **Xtream Codes API** (Server URL, Username, Password) or **M3U Playlist URL / File**.
* The application will automatically fetch categories, channels, VOD movies, and series.

### 3. Live TV & Timeshift
* Select any channel to start live streaming.
* Use the timeline bar or `ArrowLeft`/`ArrowRight` keys to scrub back in time using the Live Timeshift buffer.
* Click **GO LIVE ▶** to jump back to real-time broadcast edge.

### 4. Quad-Screen Multi-View
* Click **Quad View** in the top control bar to switch to multi-screen mode.
* Click any of the 4 slot viewports to assign active channels.

### 5. DVR Recording & Audio Visualizer
* Click **Record Stream** on the media controls to start recording the current live stream.
* Toggle **Audio Visualizer** to display real-time audio frequency spectrum animations.

---

## 📄 License & Attribution

TellyX is authored by **Armature.TN** ([contact@armature.tn](mailto:contact@armature.tn)) and dual-licensed under:
1. **GNU Affero General Public License v3.0 (AGPL-3.0-or-later)**
2. **Commercial License** (for commercial usage without AGPL constraints)

For any inquiries or licensing questions to the author, contact [contact@armature.tn](mailto:contact@armature.tn).

See [LICENSE](./LICENSE) and [NOTICE](./NOTICE) for full terms and third-party attribution details.
