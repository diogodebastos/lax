// Notifications (lib/push.mjs): the payload is encrypted as RFC 8291 says (its Appendix A, byte for byte) and the phone's
// key opens it, the VAPID token verifies with the key the page subscribes with, for the push service's origin only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'lax-push-'));
process.env.LAX_HOME = HOME;
const push = await import('../lib/push.mjs');
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
process.on('exit', () => fs.rmSync(HOME, { recursive: true, force: true }));
const u = (s) => Buffer.from(s, 'base64url');

// RFC 8291, Appendix A.
const A = { text: 'When I grow up, I want to be a watermelon', asPriv: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPriv: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94', uaPub: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw', auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  out: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN' };
const got = push.encrypt(A.text, A.uaPub, A.auth, { salt: u(A.salt), localKey: u(A.asPriv) });
check('RFC 8291 Appendix A, byte for byte', got.toString('base64url') === A.out, got.toString('base64url').slice(0, 40));

// The phone's side, by hand: what any payload becomes, its key opens.
function decrypt(buf, uaPriv, auth) {
  const salt = buf.subarray(0, 16), idlen = buf[20], as = buf.subarray(21, 21 + idlen), ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(uaPriv);
  const ua = ecdh.getPublicKey(), hk = (s, k, i, n) => Buffer.from(crypto.hkdfSync('sha256', k, s, i, n));
  const ikm = hk(auth, ecdh.computeSecret(as), Buffer.concat([Buffer.from('WebPush: info\0'), ua, as]), 32);
  const d = crypto.createDecipheriv('aes-128-gcm', hk(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16), hk(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12));
  const body = buf.subarray(21 + idlen); d.setAuthTag(body.subarray(-16));
  const plain = Buffer.concat([d.update(body.subarray(0, -16)), d.final()]);
  return plain[plain.length - 1] === 2 ? plain.subarray(0, -1).toString() : null;
}
const phone = crypto.createECDH('prime256v1'); phone.generateKeys();
const auth = crypto.randomBytes(16), msg = JSON.stringify({ id: 'abc', title: 'Lax', body: 'lax wants to: run npm test' });
const a = push.encrypt(msg, phone.getPublicKey('base64url'), auth.toString('base64url')), b = push.encrypt(msg, phone.getPublicKey('base64url'), auth.toString('base64url'));
check('the phone\'s key opens it', decrypt(a, phone.getPrivateKey(), auth) === msg);
check('…a new salt and key each time', !a.subarray(0, 16).equals(b.subarray(0, 16)) && !a.subarray(21, 86).equals(b.subarray(21, 86)));

// VAPID (RFC 8292).
const key = push.vapidPublicKey(), file = path.join(HOME, 'secrets', 'vapid.json');
check('a P-256 key, made once and only yours (0600)', u(key).length === 65 && u(key)[0] === 4 && (fs.statSync(file).mode & 0o777) === 0o600 && push.vapidPublicKey() === key);
const now = Date.UTC(2026, 9, 26, 12), jwt = push.vapidJwt('https://web.push.apple.com/QGuq4fH2mpW8Iz2dJ3kZ?x=1', now), [h, c, s] = jwt.split('.');
const pub = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: u(key).subarray(1, 33).toString('base64url'), y: u(key).subarray(33).toString('base64url') }, format: 'jwk' });
check('the token verifies with the key the page subscribes with', crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key: pub, dsaEncoding: 'ieee-p1363' }, u(s)));
const claims = JSON.parse(u(c)), head = JSON.parse(u(h));
check('…ES256, for the push service\'s origin, under 24 hours, with an https contact', head.alg === 'ES256' && claims.aud === 'https://web.push.apple.com'
  && claims.exp > now / 1000 && claims.exp <= now / 1000 + 86400 && /^https:\/\//.test(claims.sub), JSON.stringify(claims));

console.log(failed ? `\n${failed} push check(s) failed` : '\nall push checks passed');
process.exit(failed ? 1 : 0);
