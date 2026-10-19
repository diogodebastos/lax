// Sealed (Phase 11, end to end): what the phone and this Mac say to each other, readable by them only. Both ways in pass
// through Cloudflare, which decrypts TLS at its edge, and the relay keeps what it holds while the Mac sleeps; sealed, all
// it sees is the path and the token. The key is made here and reaches the phone only after the # of its pairing link
// (lib/auth.mjs), which no server is ever sent. AES-256-GCM: base64 of iv (12 bytes) + ciphertext + tag.
//   phone → Mac   x-lax-seal: 1, and a POST body of { sealed }
//   Mac → phone   x-lax-sealed: 1 and { sealed } (json in server.mjs); the stream with ?seal=1, each event's data { sealed }
// Who doesn't ask (an older page, the hooks, `lax watch`) is answered plain, as before.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { secret, ensureDirs } from './paths.mjs';

const FILE = secret('seal-key');
ensureDirs();
if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, crypto.randomBytes(32).toString('base64url'), { mode: 0o600 });
const KEY = Buffer.from(fs.readFileSync(FILE, 'utf8').trim(), 'base64url');
/** For the pairing link's #k=. */
export const SEAL_KEY = KEY.toString('base64url');

export function seal(text) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  return Buffer.concat([iv, c.update(String(text), 'utf8'), c.final(), c.getAuthTag()]).toString('base64');
}
/** The text, or null when it wasn't sealed with this key. */
export function unseal(b64) {
  try {
    const b = Buffer.from(String(b64), 'base64'), d = crypto.createDecipheriv('aes-256-gcm', KEY, b.subarray(0, 12));
    d.setAuthTag(b.subarray(-16));
    return Buffer.concat([d.update(b.subarray(12, -16)), d.final()]).toString('utf8');
  } catch { return null; }
}
/** An event for the stream, sealed when that phone asked. */
export const sse = (event, data, sealed) => `event: ${event}\ndata: ${sealed ? JSON.stringify({ sealed: seal(JSON.stringify(data)) }) : JSON.stringify(data)}\n\n`;
