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

// On a throwaway Lax, with a fake push service: a session that asks while no page is open reaches the phone as a push,
// and its answer on the phone still goes back to the hook. A push service that says it's gone (410) loses it.
const { spawn } = await import('node:child_process'), http = await import('node:http');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), PORT = 7818, LAX = `http://127.0.0.1:${PORT}`, LH = path.join(HOME, 'lax');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const got2 = []; let reply = 201;
const fake = http.createServer((req, res) => { const b = []; req.on('data', (d) => b.push(d)); req.on('end', () => { got2.push({ headers: req.headers, body: Buffer.concat(b) }); res.writeHead(reply); res.end(); }); });
await new Promise((r) => fake.listen(0, '127.0.0.1', r));
const ENDPOINT = `http://127.0.0.1:${fake.address().port}/push/abc`;
const server = spawn(process.execPath, ['--no-warnings', path.join(ROOT, 'server.mjs')], { stdio: ['ignore', 'pipe', 'ignore'],
  env: { ...process.env, LAX_HOME: LH, LAX_DATA: '', LAX_PORT: String(PORT), LAX_CLAUDE: '/usr/bin/false', LAX_WHISPER: '0', LAX_PUSH_TEST: '1', LAX_ASK_TIMEOUT: '2' } });
let out = ''; server.stdout.on('data', (d) => (out += d));
process.on('exit', () => server.kill());
for (let i = 0; i < 80 && !/Phone:/.test(out); i++) await sleep(100);
const tok = fs.readFileSync(path.join(LH, 'secrets', 'token'), 'utf8').trim(), H = { 'content-type': 'application/json', 'x-lax-token': tok };
const post = (p, body) => fetch(LAX + p, { method: 'POST', headers: H, body: JSON.stringify(body) });

check('/api/push/key needs the token', (await fetch(`${LAX}/api/push/key`)).status === 401);
const k2 = (await (await fetch(`${LAX}/api/push/key`, { headers: H })).json()).key;
check('…and gives the key, kept only for you (0600)', u(k2).length === 65 && (fs.statSync(path.join(LH, 'secrets', 'vapid.json')).mode & 0o777) === 0o600);
const sub = (endpoint, p256dh = phone.getPublicKey('base64url'), a2 = auth.toString('base64url')) => post('/api/push', { subscription: { endpoint, keys: { p256dh, auth: a2 } } });
check('a page can\'t make it post anywhere but a push service', (await sub('https://evil.example.com/x')).status === 400 && (await sub('http://web.push.apple.com/x')).status === 400);
check('…nor with keys that aren\'t keys', (await sub('https://web.push.apple.com/x', 'abc')).status === 400 && (await sub('https://web.push.apple.com/x', undefined, 'abc')).status === 400);
let r = await (await post('/api/ask', { session_id: 's1', cwd: '/tmp/quokka', tool_name: 'Bash', tool_input: { command: 'rm x' } })).json();
check('no page and no phone subscribed: back to the terminal at once, as before', r.decision === 'none', JSON.stringify(r));
check('a phone subscribes', (await sub(ENDPOINT)).ok && (fs.statSync(path.join(LH, 'push.json')).mode & 0o777) === 0o600);

const asked = post('/api/ask', { session_id: 's1', cwd: '/tmp/quokka', tool_name: 'Bash', tool_input: { command: 'npm test', description: 'Run the tests' } }).then((x) => x.json());
for (let i = 0; i < 50 && !got2.length; i++) await sleep(100);
const p1 = got2[0], m = p1 && JSON.parse(decrypt(p1.body, phone.getPrivateKey(), auth) || '{}');
check('no page open: the phone gets one push, encrypted to it', got2.length === 1 && m.kind === 'permission' && /^quokka wants to: Run the tests/.test(m.body), JSON.stringify(m));
check('…urgent, for as long as it waits (a minute at least), replacing an older one for the same', p1?.headers.urgency === 'high' && p1.headers.ttl === '60' && p1.headers.topic === m.id && p1.headers['content-encoding'] === 'aes128gcm', JSON.stringify(p1?.headers));
check('…signed by this Mac', /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/.test(p1?.headers.authorization || '') && p1.headers.authorization.endsWith(`k=${k2}`));
await post('/api/decide', { id: m.id, decision: 'allow' });
check('the yes on the phone goes back to the hook', (await asked).decision === 'allow');

reply = 410;
const asked2 = post('/api/ask', { session_id: 's1', cwd: '/tmp/quokka', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: 'Which branch?', options: [] }] } }).then((x) => x.json());
for (let i = 0; i < 50 && got2.length < 2; i++) await sleep(100);
await sleep(200);
const m2 = JSON.parse(decrypt(got2[1].body, phone.getPrivateKey(), auth) || '{}');
check('a question says who asks', m2.kind === 'question' && m2.body === 'quokka asks: Which branch?', m2.body);
check('a push service that says it\'s gone loses the subscription', JSON.parse(fs.readFileSync(path.join(LH, 'push.json'), 'utf8')).length === 0);
await post('/api/decide', { id: m2.id, decision: 'pass' }); await asked2;

// Lax's assistant asks and nobody answers: for a while after, with no page open, it isn't kept waiting again.
reply = 201; await sub(ENDPOINT);
const voice = (command) => post('/api/ask', { session_id: 's2', cwd: '/tmp/quokka', tool_name: 'Bash', tool_input: { command }, lax_voice: true }).then((x) => x.json());
const open = async () => { const c = new AbortController(), res = await fetch(`${LAX}/api/stream?t=${tok}`, { signal: c.signal }), st = { buf: '', c };
  (async () => { try { for await (const d of res.body) st.buf += Buffer.from(d).toString(); } catch {} })(); return st; };
let page = await open();
check('a page open and no answer: it waits the usual time', (await voice('rm a')).decision === 'none');
page.c.abort(); await sleep(300);
let t0 = Date.now(); r = await voice('rm b');
check('…then, no page open: no answer at once, saying why', r.decision === 'none' && /a moment ago/.test(r.why) && Date.now() - t0 < 1000, JSON.stringify(r));
page = await open(); await sleep(200);
const asked3 = voice('rm c');
for (let i = 0; i < 50 && !/rm c/.test(page.buf); i++) await sleep(100);
const id3 = [...page.buf.matchAll(/^data: (.*)$/gm)].map((x) => { try { return JSON.parse(x[1]); } catch { return {}; } }).find((d) => d.kind === 'permission' && /rm c/.test(d.text || ''))?.id;
await post('/api/decide', { id: id3, decision: 'allow' });
check('…a page open again: the ask goes to the phone, and a yes comes back', !!id3 && (await asked3).decision === 'allow');
page.c.abort();
fake.close();

console.log(failed ? `\n${failed} push check(s) failed` : '\nall push checks passed');
process.exit(failed ? 1 : 0);
