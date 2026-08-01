import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find project root and tauri conf path flexibly
const tauriConfPath = fs.existsSync(path.resolve(__dirname, '../tauri.conf.json'))
  ? path.resolve(__dirname, '../tauri.conf.json')
  : path.resolve(process.cwd(), 'src-tauri/tauri.conf.json');

const envPath = fs.existsSync(path.resolve(__dirname, '../../.env'))
  ? path.resolve(__dirname, '../../.env')
  : path.resolve(process.cwd(), '.env');

/**
 * Retrieves environment variable value from process.env or .env file fallback.
 */
function getEnvVariable(key) {
  if (process.env[key] && process.env[key].trim()) {
    return process.env[key].trim();
  }
  if (fs.existsSync(envPath)) {
    try {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const lines = envContent.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [k, ...v] = trimmed.split('=');
          if (k.trim() === key) {
            let val = v.join('=').trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            return val;
          }
        }
      }
    } catch (e) {
      console.warn('[Tauri Setup] Error reading .env file:', e.message);
    }
  }
  return null;
}

const pubkey = getEnvVariable('TAURI_SIGNING_PUBLIC_KEY');

console.log('[Tauri Setup] Checking Tauri public key configuration...');

if (fs.existsSync(tauriConfPath)) {
  try {
    const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
    if (!tauriConf.plugins) tauriConf.plugins = {};
    if (!tauriConf.plugins.updater) tauriConf.plugins.updater = {};

    if (pubkey) {
      tauriConf.plugins.updater.pubkey = pubkey;
      fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2), 'utf8');
      console.log(`[Tauri Setup] Successfully injected TAURI_SIGNING_PUBLIC_KEY into ${tauriConfPath}`);
      console.log(`[Tauri Setup] Active Public Key: ${pubkey.substring(0, 32)}...`);
    } else {
      console.log(`[Tauri Setup] TAURI_SIGNING_PUBLIC_KEY not specified in environment or .env. Using existing pubkey in ${tauriConfPath}.`);
    }
  } catch (err) {
    console.error('[Tauri Setup] Failed to update tauri.conf.json:', err.message);
  }
} else {
  console.warn(`[Tauri Setup] Configuration file ${tauriConfPath} does not exist.`);
}
