import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AsyncEntry } from '@napi-rs/keyring';
import { createChatGPT } from '../vendor/siwc/src/index.js';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Only this app's encryption key enters the OS secret store. Tokens never enter the renderer.
const entry = new AsyncEntry('wiki-chat', 'credential-encryption-v1');
let keyPromise: Promise<Buffer> | undefined;
function encryptionKey() {
  return keyPromise ??= (async () => {
    const saved = await entry.getPassword();
    if (saved) {
      const key = Buffer.from(saved, 'base64');
      if (key.length !== 32) throw new Error('WikiChat’s keychain entry is invalid. Existing credentials were preserved.');
      return key;
    }
    const key = randomBytes(32);
    await entry.setPassword(key.toString('base64'));
    return key;
  })().catch(error => { keyPromise = undefined; throw error; });
}
export let authorizationUrl: string | undefined;
export const chatgpt = createChatGPT({
  appName: 'WikiChat', appId: 'wiki-chat', redirectPort: 0, sendHostId: true,
  storageDir: join(homedir(), '.config', 'wiki-chat', 'chatgpt'),
  openBrowser(url) { authorizationUrl = url; },
  credentialEncryption: {
    id: 'wiki-chat-os-keychain-aes256gcm-v1',
    async isAvailable() { try { await encryptionKey(); return true; } catch { return false; } },
    async encrypt(plaintext) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', await encryptionKey(), iv);
      return Buffer.concat([iv, cipher.update(plaintext, 'utf8'), cipher.final(), cipher.getAuthTag()]);
    },
    async decrypt(ciphertext) {
      const bytes = Buffer.from(ciphertext);
      const decipher = createDecipheriv('aes-256-gcm', await encryptionKey(), bytes.subarray(0,12));
      decipher.setAuthTag(bytes.subarray(-16));
      return Buffer.concat([decipher.update(bytes.subarray(12,-16)), decipher.final()]).toString('utf8');
    }
  }
});
export function clearAuthorizationUrl() { authorizationUrl = undefined; }
