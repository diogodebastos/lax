// Notifications (Web Push): a session that needs you reaches the phone even when Lax isn't on screen. On an iPhone a web
// page is put to sleep in the background and its stream drops, so the Home Screen app (iOS 16.4+) subscribes, and this
// Mac sends to the push service itself (Apple's, Google's…) while something waits: no relay change, no dependency.
// What goes is encrypted to the phone (RFC 8291, aes128gcm): the push service carries it but can't read it. This Mac
// signs who it is (VAPID, RFC 8292) with a key made here once. A push service that says the subscription is gone (404,
// 410) loses it. Each push must show a notification (iOS revokes the permission otherwise): sw.js always shows one.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { HOME, secret, ensureDirs } from './paths.mjs';

const KEY_FILE = secret('vapid.json'), SUBS = path.join(HOME, 'push.json'), MAX = 5;
const SUB = 'https://github.com/diogodebastos/lax'; // VAPID's contact (Apple rejects a malformed one)
// The push services browsers use; nothing else may be posted to with what this Mac sends.
const SERVICES = /^(web\.push\.apple\.com|[\w-]+\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[\w.-]+\.notify\.windows\.com)$/;
const b64u = (b) => Buffer.from(b).toString('base64url');
const unb64u = (s) => (typeof s === 'string' && /^[\w-]+={0,2}$/.test(s) ? Buffer.from(s, 'base64url') : Buffer.alloc(0));

let vapid = null;
function keys() {
  if (vapid) return vapid;
  let jwk; try { jwk = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8')); } catch {}
  if (!jwk?.d) {
    ensureDirs();
    jwk = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ format: 'jwk' });
    fs.writeFileSync(KEY_FILE, JSON.stringify(jwk), { mode: 0o600 });
  }
  return (vapid = { key: crypto.createPrivateKey({ key: jwk, format: 'jwk' }), pub: Buffer.concat([Buffer.from([4]), unb64u(jwk.x), unb64u(jwk.y)]) });
}
/** The VAPID public key, base64url of the uncompressed point (the page's applicationServerKey). */
export const vapidPublicKey = () => b64u(keys().pub);

/** The VAPID token for one endpoint: for its push service's origin, good for 12 hours. */
export function vapidJwt(endpoint, now = Date.now()) {
  const part = (o) => b64u(JSON.stringify(o));
  const data = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: SUB })}`;
  return `${data}.${b64u(crypto.sign('sha256', Buffer.from(data), { key: keys().key, dsaEncoding: 'ieee-p1363' }))}`;
}

/** RFC 8291: the payload encrypted to one subscription (aes128gcm, one record). salt and localKey only for tests. */
export function encrypt(payload, p256dh, auth, { salt = crypto.randomBytes(16), localKey } = {}) {
  const ua = unb64u(p256dh), secretAuth = unb64u(auth), ecdh = crypto.createECDH('prime256v1');
  if (localKey) ecdh.setPrivateKey(localKey); else ecdh.generateKeys();
  const as = ecdh.getPublicKey(), shared = ecdh.computeSecret(ua);
  const hkdf = (s, ikm, info, n) => Buffer.from(crypto.hkdfSync('sha256', ikm, s, info, n));
  const ikm = hkdf(secretAuth, shared, Buffer.concat([Buffer.from('WebPush: info\0'), ua, as]), 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16), nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([c.update(Buffer.from(payload)), c.update(Buffer.from([2])), c.final(), c.getAuthTag()]); // 2: the last record
  const head = Buffer.alloc(21); salt.copy(head); head.writeUInt32BE(4096, 16); head[20] = as.length;
  return Buffer.concat([head, as, body]);
}

const read = () => { try { const j = JSON.parse(fs.readFileSync(SUBS, 'utf8')); return Array.isArray(j) ? j : []; } catch { return []; } };
// Not a secret, but an endpoint and its keys let anyone push to the phone: only yours.
const write = (subs) => { fs.writeFileSync(SUBS, JSON.stringify(subs, null, 2) + '\n', { mode: 0o600 }); fs.chmodSync(SUBS, 0o600); };

/** Why this isn't a subscription to keep, or null once it's kept (the newest MAX). */
export function subscribe(sub) {
  let u; try { u = new URL(sub?.endpoint); } catch { return 'no endpoint'; }
  const local = process.env.LAX_PUSH_TEST === '1' && u.protocol === 'http:' && u.hostname === '127.0.0.1'; // the tests' fake push service
  if (!local && (u.protocol !== 'https:' || !SERVICES.test(u.hostname))) return 'not a push service';
  const p = unb64u(sub.keys?.p256dh), a = unb64u(sub.keys?.auth);
  if (p.length !== 65 || p[0] !== 4 || a.length !== 16) return 'bad keys';
  write([...read().filter((s) => s.endpoint !== u.href), { endpoint: u.href, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }].slice(-MAX));
  return null;
}
export const unsubscribe = (endpoint) => { const subs = read(), left = subs.filter((s) => s.endpoint !== endpoint); if (left.length !== subs.length) write(left); };
/** How many phones would get a push. */
export const subscribers = () => read().length;

/** To every subscription; a gone one is dropped. Never throws: what failed goes to the server log. */
export async function send(payload, { topic, urgency = 'normal', ttl = 600 } = {}) {
  const text = JSON.stringify(payload);
  await Promise.all(read().map(async (s) => {
    try {
      const r = await fetch(s.endpoint, { method: 'POST', signal: AbortSignal.timeout(10000), body: encrypt(text, s.keys.p256dh, s.keys.auth),
        headers: { 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: String(Math.round(ttl)), urgency,
          ...(topic && { topic: String(topic).replace(/[^\w-]/g, '').slice(0, 32) }),
          authorization: `vapid t=${vapidJwt(s.endpoint)}, k=${vapidPublicKey()}` } });
      if (r.status === 404 || r.status === 410) { unsubscribe(s.endpoint); console.log(`[push] ${new URL(s.endpoint).host}: gone (${r.status}), dropped`); }
      else if (!r.ok) console.log(`[push] ${new URL(s.endpoint).host}: ${r.status} ${(await r.text()).slice(0, 200)}`);
      else console.log(`[push] sent to ${new URL(s.endpoint).host}`);
    } catch (e) { console.log(`[push] ${new URL(s.endpoint).host}: ${e.message}`); }
  }));
}
