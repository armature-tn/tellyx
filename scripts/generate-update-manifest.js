import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const cleanVersion = (pkg.version || '0.1.0').replace(/^v+/, '');
const versionTag = `v${cleanVersion}`;
const pubDate = new Date().toISOString();

const manifest = {
  version: cleanVersion,
  notes: `TellyX ${versionTag} Release - High Performance IPTV Player with Multi-Screen Quad View, WASM engine, and Tauri auto-updater.`,
  pub_date: pubDate,
  platforms: {
    "darwin-aarch64": {
      "signature": "",
      "url": `https://github.com/armature-tn/tellyx/releases/download/${versionTag}/TellyX_${cleanVersion}_aarch64.app.tar.gz`
    },
    "darwin-x86_64": {
      "signature": "",
      "url": `https://github.com/armature-tn/tellyx/releases/download/${versionTag}/TellyX_${cleanVersion}_x64.app.tar.gz`
    },
    "linux-x86_64": {
      "signature": "",
      "url": `https://github.com/armature-tn/tellyx/releases/download/${versionTag}/TellyX_${cleanVersion}_amd64.AppImage.tar.gz`
    },
    "windows-x86_64": {
      "signature": "",
      "url": `https://github.com/armature-tn/tellyx/releases/download/${versionTag}/TellyX_x64-setup.nsis.zip`
    },
    "android": {
      "signature": "",
      "url": `https://github.com/armature-tn/tellyx/releases/download/${versionTag}/app-universal-release.apk`
    }
  }
};

const jsonContent = JSON.stringify(manifest, null, 2);

const targets = [
  path.join(rootDir, 'update.json'),
  path.join(rootDir, 'public', 'update.json'),
  path.join(rootDir, 'dist', 'update.json'),
  path.join(rootDir, 'dist', 'latest.json')
];

targets.forEach((targetPath) => {
  const dir = path.dirname(targetPath);
  if (fs.existsSync(dir)) {
    fs.writeFileSync(targetPath, jsonContent, 'utf8');
    console.log(`[Auto-Update Manifest] Generated update manifest at ${targetPath}`);
  }
});
