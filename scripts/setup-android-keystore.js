import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const keystorePath = path.join(rootDir, 'release.keystore');
const genAndroidAppDir = path.join(rootDir, 'src-tauri', 'gen', 'android', 'app');
const keyPropsPath = path.join(genAndroidAppDir, 'key.properties');

const storePassword = (process.env.ANDROID_KEYSTORE_PASSWORD || process.env.ANDROID_KEY_STORE_PASSWORD || 'tellyxkey').trim();
const keyPassword = (process.env.ANDROID_KEY_PASSWORD || process.env.ANDROID_KEYSTORE_PASSWORD || 'tellyxkey').trim();
let keyAlias = (process.env.ANDROID_KEY_ALIAS || process.env.ANDROID_KEYALIAS || 'tellyxkey').trim();

console.log('[Android Keystore Setup] Initializing Android release keystore setup...');

if (process.env.ANDROID_KEYSTORE_BASE64) {
  console.log('[Android Keystore Setup] Found ANDROID_KEYSTORE_BASE64 environment variable. Decoding keystore...');
  const buffer = Buffer.from(process.env.ANDROID_KEYSTORE_BASE64.trim(), 'base64');
  fs.writeFileSync(keystorePath, buffer);
  console.log(`[Android Keystore Setup] Successfully wrote release keystore to ${keystorePath}`);
} else if (!fs.existsSync(keystorePath)) {
  console.log('[Android Keystore Setup] No existing keystore or base64 secret found. Attempting keytool generation...');
  try {
    const cmd = `keytool -genkey -v -keystore "${keystorePath}" -storepass "${storePassword}" -alias "${keyAlias}" -keypass "${keyPassword}" -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=TellyX, OU=Media, O=Armature, L=Tunis, C=TN"`;
    execSync(cmd, { stdio: 'inherit' });
    console.log(`[Android Keystore Setup] Successfully generated fallback release keystore at ${keystorePath}`);
  } catch (err) {
    console.warn('[Android Keystore Setup] Keytool generation skipped or unavailable:', err.message);
  }
}

// Auto-detect alias in decoded keystore to avoid alias mismatch errors
if (fs.existsSync(keystorePath)) {
  try {
    const listOutput = execSync(`keytool -list -keystore "${keystorePath}" -storepass "${storePassword}"`, { encoding: 'utf8' });
    console.log('[Android Keystore Setup] Keystore details:\n' + listOutput);
    const aliases = [];
    for (const line of listOutput.split('\n')) {
      if (line.includes('PrivateKeyEntry')) {
        const parts = line.split(',');
        if (parts[0] && parts[0].trim()) {
          aliases.push(parts[0].trim());
        }
      }
    }
    if (aliases.length > 0) {
      console.log(`[Android Keystore Setup] Found PrivateKeyEntry alias(es) in keystore: ${aliases.join(', ')}`);
      if (!aliases.includes(keyAlias)) {
        console.warn(`[Android Keystore Setup] Specified keyAlias '${keyAlias}' not found in keystore. Automatically switching to keystore alias '${aliases[0]}'.`);
        keyAlias = aliases[0];
      } else {
        console.log(`[Android Keystore Setup] Confirmed keyAlias '${keyAlias}' exists in keystore.`);
      }
    }
  } catch (err) {
    console.warn('[Android Keystore Setup] Could not verify keystore alias list via keytool:', err.message);
  }
}

if (fs.existsSync(genAndroidAppDir)) {
  // Patch app/src/main/AndroidManifest.xml using real DOM parser to guarantee valid XML syntax
  const mainManifestPath = path.join(genAndroidAppDir, 'src', 'main', 'AndroidManifest.xml');
  if (fs.existsSync(mainManifestPath)) {
    try {
      const originalXml = fs.readFileSync(mainManifestPath, 'utf8');
      const doc = new DOMParser().parseFromString(originalXml, 'text/xml');
      const manifestNode = doc.getElementsByTagName('manifest')[0];
      const appNode = doc.getElementsByTagName('application')[0];

      let modified = false;

      if (appNode) {
        if (appNode.getAttribute('android:usesCleartextTraffic') !== 'true') {
          appNode.setAttribute('android:usesCleartextTraffic', 'true');
          modified = true;
        }

        const activityNodes = appNode.getElementsByTagName('activity');
        for (let i = 0; i < activityNodes.length; i++) {
          if (activityNodes[i].getAttribute('android:supportsPictureInPicture') !== 'true') {
            activityNodes[i].setAttribute('android:supportsPictureInPicture', 'true');
            modified = true;
          }
        }
      }

      if (manifestNode) {
        const existingPerms = new Set();
        const permNodes = doc.getElementsByTagName('uses-permission');
        for (let i = 0; i < permNodes.length; i++) {
          const name = permNodes[i].getAttribute('android:name');
          if (name) existingPerms.add(name);
        }

        const requiredPerms = [
          'android.permission.INTERNET',
          'android.permission.ACCESS_NETWORK_STATE'
        ];

        for (const perm of requiredPerms) {
          if (!existingPerms.has(perm)) {
            const newPerm = doc.createElement('uses-permission');
            newPerm.setAttribute('android:name', perm);
            if (appNode) {
              manifestNode.insertBefore(newPerm, appNode);
            } else {
              manifestNode.appendChild(newPerm);
            }
            modified = true;
          }
        }
      }

      if (modified) {
        const serialized = new XMLSerializer().serializeToString(doc);
        fs.writeFileSync(mainManifestPath, serialized, 'utf8');
        console.log(`[Android Setup] Safely updated ${mainManifestPath} via DOM Parser (Cleartext HTTP traffic & network permissions).`);
      }
    } catch (err) {
      console.warn(`[Android Setup] Could not patch main manifest ${mainManifestPath}:`, err.message);
    }
  }

  if (fs.existsSync(keystorePath)) {
    const propertiesContent = [
      `storePassword=${storePassword}`,
      `keyPassword=${keyPassword}`,
      `keyAlias=${keyAlias}`,
      `storeFile=${keystorePath.replace(/\\/g, '/')}`
    ].join('\n');
    fs.writeFileSync(keyPropsPath, propertiesContent, 'utf8');
    console.log(`[Android Keystore Setup] Configured ${keyPropsPath} for Gradle signing.`);

    // Patch build.gradle.kts to load key.properties if not already configured
    const gradleKtsPath = path.join(genAndroidAppDir, 'build.gradle.kts');
    if (fs.existsSync(gradleKtsPath)) {
      let gradleContent = fs.readFileSync(gradleKtsPath, 'utf8');
      if (!gradleContent.includes('keyPropsFile')) {
        const importHeader = 'import java.util.Properties\n\n';

        const signingConfigBlock = `
    signingConfigs {
        create("release") {
            val keyPropsFile = file("key.properties")
            if (keyPropsFile.exists()) {
                val keyProperties = Properties()
                keyProperties.load(keyPropsFile.inputStream())
                storeFile = file(keyProperties.getProperty("storeFile"))
                storePassword = keyProperties.getProperty("storePassword")
                keyAlias = keyProperties.getProperty("keyAlias")
                keyPassword = keyProperties.getProperty("keyPassword")
            }
        }
    }
`;

        const signingAssignBlock = `
            val keyPropsFile = file("key.properties")
            if (keyPropsFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
`;

        // Prepend imports at the very top of build.gradle.kts (before plugins block)
        if (!gradleContent.includes('import java.util.Properties')) {
          gradleContent = importHeader + gradleContent;
        }

        if (gradleContent.includes('android {')) {
          gradleContent = gradleContent.replace('android {', 'android {' + signingConfigBlock);
        }

        if (gradleContent.includes('getByName("release") {')) {
          gradleContent = gradleContent.replace(
            'getByName("release") {',
            'getByName("release") {' + signingAssignBlock
          );
        } else if (gradleContent.includes('release {')) {
          gradleContent = gradleContent.replace(
            'release {',
            'release {' + signingAssignBlock
          );
        }

        fs.writeFileSync(gradleKtsPath, gradleContent, 'utf8');
        console.log(`[Android Keystore Setup] Successfully patched ${gradleKtsPath} to apply release signing configuration.`);
      }
    }
  }
} else {
  console.log('[Android Keystore Setup] Note: Android directory not yet initialized. Will configure upon build.');
}
