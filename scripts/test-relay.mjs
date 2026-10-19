// The relay (Phase 11), locally: the real Worker under `wrangler dev`, the Mac's client (lib/relay.mjs), first against an
// echo server (requests, a 2 MB body, a stream, the phone going away, wrong tokens, the Mac's link going and coming back),
// what the phone sent while the Mac slept (held, then handed over in order, once), then a throwaway Lax end to end (its
// event stream through the relay, nothing relayed counts as "this Mac", a repeated request done once).
//   node --no-warnings scripts/test-relay.mjs     (needs wrangler: npx fetches it the first time)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { startRelay } from '../lib/relay.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const W = 8799, RELAY = `http://127.0.0.1:${W}`, KEY = 'test-key-' + crypto.randomBytes(4).toString('hex'), ECHO = 7814, LAXP = 7815;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lax-relay-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
const procs = [];
process.on('exit', () => { for (const p of procs) try { process.kill(-p.pid, 'SIGTERM'); } catch { try { p.kill(); } catch {} } fs.rmSync(TMP, { recursive: true, force: true }); });
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => process.exit(1));

// An echo server, standing in for Lax.
let closedStreams = 0; const got_ = []; // what reached the "Mac", in order
const TOK = 'phone-token-' + crypto.randomBytes(4).toString('hex');
http.createServer((req, res) => {
  if (req.url === '/stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    let n = 0; const t = setInterval(() => res.write(`data: ${n++}\n\n`), 100);
    return req.on('close', () => { clearInterval(t); closedStreams++; });
  }
  if (req.url === '/nope') { res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"error":"bad token"}'); }
  got_.push(`${req.method} ${req.url}${req.headers['x-lax-once'] ? ' ' + req.headers['x-lax-once'] : ''}`);
  const h = crypto.createHash('sha256'); let len = 0;
  req.on('data', (d) => { h.update(d); len += d.length; });
  req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json', 'x-echo': 'yes' }); res.end(JSON.stringify({ method: req.method, path: req.url, relay: req.headers['x-lax-relay'], cf: Object.keys(req.headers).filter((k) => k.startsWith('cf-')), len, sha: h.digest('hex') })); });
}).listen(ECHO, '127.0.0.1');

const wr = spawn('npx', ['-y', 'wrangler@4', 'dev', '--config', path.join(ROOT, 'relay', 'wrangler.jsonc'), '--port', String(W), '--ip', '127.0.0.1',
  '--var', `RELAY_KEY:${KEY}`, '--persist-to', path.join(TMP, 'state'), '--show-interactive-dev-session=false'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
procs.push(wr); let wlog = ''; wr.stdout.on('data', (d) => (wlog += d)); wr.stderr.on('data', (d) => (wlog += d));
let ready = false;
for (let i = 0; i < 120 && !ready; i++) { try { await fetch(RELAY + '/'); ready = true; } catch { await sleep(500); } }
if (!ready) { console.log('✗ wrangler dev did not start\n' + wlog.slice(-2000)); process.exit(1); }

// ---------- before the Mac links ----------
let r = await fetch(RELAY + '/', { headers: { accept: 'text/html' } });
check('no Mac yet: "Mac asleep" (503), a page for a browser', r.status === 503 && /asleep/.test(await r.text()), String(r.status));
r = await fetch(RELAY + '/api/state');
check('…and JSON for the app', r.status === 503 && (await r.json()).error === 'Mac asleep');
const wrong = startRelay({ url: RELAY, key: 'not-the-key', port: ECHO });
await sleep(1500);
check('a wrong relay key never links', !wrong.linked()); wrong.stop();

// ---------- the pipe ----------
let mac = startRelay({ url: RELAY, key: KEY, port: ECHO, token: TOK });
for (let i = 0; i < 40 && !mac.linked(); i++) await sleep(100);
check('the Mac links with its key', mac.linked());
r = await fetch(RELAY + '/hello?x=1&t=abc', { headers: { 'cf-connecting-ip': '9.9.9.9' } });
let e = await r.json();
check('a request reaches the Mac: method, path and query', r.status === 200 && e.method === 'GET' && e.path === '/hello?x=1&t=abc', JSON.stringify(e));
check('…marked as relayed, without Cloudflare\'s headers', e.relay === '1' && e.cf.length === 0, JSON.stringify(e.cf));
check('…and its answer\'s headers come back', r.headers.get('x-echo') === 'yes');
const big = crypto.randomBytes(2 * 1024 * 1024);
r = await fetch(RELAY + '/api/hear', { method: 'POST', body: big, headers: { 'content-type': 'application/octet-stream' } });
e = await r.json();
check('a 2 MB body (a long voice message) arrives whole', e.len === big.length && e.sha === crypto.createHash('sha256').update(big).digest('hex'), `${e.len} bytes`);

const ctl = new AbortController();
r = await fetch(RELAY + '/stream', { signal: ctl.signal });
const rd = r.body.getReader(); let got = '';
const t0 = Date.now(); while (Date.now() - t0 < 3000 && (got.match(/data:/g) || []).length < 3) got += new TextDecoder().decode((await rd.read()).value);
check('a stream comes through live, event by event', (got.match(/data:/g) || []).length >= 3 && Date.now() - t0 < 3000, `${Date.now() - t0} ms`);
ctl.abort(); try { await rd.cancel(); } catch {}
for (let i = 0; i < 40 && !closedStreams; i++) await sleep(100);
check('the phone going away ends it on the Mac too', closedStreams === 1);

for (let i = 0; i < 20; i++) await (await fetch(RELAY + '/nope', { headers: { 'cf-connecting-ip': '6.6.6.6' } })).text();
r = await fetch(RELAY + '/hello', { headers: { 'cf-connecting-ip': '6.6.6.6' } });
check('20 wrong tokens from one address: refused (429), right token or not', r.status === 429, String(r.status)); await r.text();
r = await fetch(RELAY + '/hello', { headers: { 'cf-connecting-ip': '7.7.7.7' } });
check('…other addresses aren\'t', r.status === 200); await r.text();

mac.stop(); await sleep(500);
r = await fetch(RELAY + '/hello');
check('the Mac\'s link goes: "Mac asleep" right away', r.status === 503, String(r.status)); await r.text();
mac = startRelay({ url: RELAY, key: KEY, port: ECHO, token: TOK });
for (let i = 0; i < 40 && !mac.linked(); i++) await sleep(100);
r = await fetch(RELAY + '/hello');
check('…and back when it links again', r.status === 200, String(r.status)); await r.text();
r = await fetch(`${RELAY}/_relay/up?t=${TOK}`); e = await r.json();
check('"is the Mac there?" with the phone\'s token: yes, open to other pages (CORS)', e.mac === true && r.headers.get('access-control-allow-origin') === '*', JSON.stringify(e));
r = await fetch(`${RELAY}/_relay/up?t=wrong`); await r.text();
check('…not with another token', r.status === 401, String(r.status));
mac.stop(); await sleep(500);
r = await fetch(`${RELAY}/_relay/up?t=${TOK}`); e = await r.json();
check('…and no, once its link is gone', e.mac === false, JSON.stringify(e));

// ---------- held while the Mac sleeps ----------
const post = (p, once, { token = TOK, queue = true } = {}) => fetch(RELAY + p, { method: 'POST', body: JSON.stringify({ text: 'hi' }),
  headers: { 'content-type': 'application/json', 'x-lax-token': token, 'x-lax-once': once, ...(queue ? { 'x-lax-queue': '1' } : {}) } });
r = await post('/api/talk', 'once-talk-1');
e = await r.json();
check('Mac asleep: what you said is held (202, queued)', r.status === 202 && e.queued === true, `${r.status} ${JSON.stringify(e)}`);
r = await post('/api/talk', 'once-talk-1'); await r.text();
check('…the same request again (a retry) too, but it\'s kept once', r.status === 202);
r = await post('/api/decide', 'once-decide-1'); await r.text();
check('…a yes or no too', r.status === 202);
r = await post('/api/talk', 'once-wrong-1', { token: 'not-the-phone' }); await r.text();
check('…not with another token: "Mac asleep"', r.status === 503, String(r.status));
r = await post('/api/action', 'once-action-1'); await r.text();
check('…nor a quick action ("stop" hours later)', r.status === 503, String(r.status));
r = await post('/api/talk', 'once-plain-1', { queue: false }); await r.text();
check('…nor what the phone didn\'t mark to hold', r.status === 503, String(r.status));
got_.length = 0;
mac = startRelay({ url: RELAY, key: KEY, port: ECHO, token: TOK });
for (let i = 0; i < 40 && !mac.linked(); i++) await sleep(100);
for (let i = 0; i < 40 && got_.length < 2; i++) await sleep(100);
r = await fetch(RELAY + '/hello'); await r.text(); await sleep(300);
check('the Mac wakes: what was held arrives in order, each once, before anything new',
  JSON.stringify(got_) === JSON.stringify(['POST /api/talk once-talk-1', 'POST /api/decide once-decide-1', 'GET /hello']), JSON.stringify(got_));
mac.stop(); await sleep(500);
mac = startRelay({ url: RELAY, key: KEY, port: ECHO, token: TOK });
for (let i = 0; i < 40 && !mac.linked(); i++) await sleep(100);
await sleep(500);
check('…and never again on the next link', got_.length === 3, JSON.stringify(got_));
mac.stop(); await sleep(300);

// ---------- a real Lax through the relay ----------
const DATA = path.join(TMP, 'home');
const lax = spawn(process.execPath, ['--no-warnings', path.join(ROOT, 'server.mjs')], { stdio: 'ignore',
  env: { ...process.env, LAX_HOME: DATA, LAX_DATA: '', LAX_PORT: String(LAXP), LAX_PUBLIC_URL: RELAY, LAX_RELAY_URL: RELAY, LAX_RELAY_KEY: KEY, LAX_CLAUDE: '/usr/bin/false', LAX_WHISPER: '0' } });
procs.push(lax);
let state = null;
for (let i = 0; i < 100 && !state; i++) {
  await sleep(200);
  try { const tok = fs.readFileSync(path.join(DATA, 'secrets', 'token'), 'utf8').trim(), c = new AbortController();
    const s = await fetch(`${RELAY}/api/stream?t=${tok}`, { signal: c.signal });
    if (s.status === 200) { const rd2 = s.body.getReader(); let b = ''; const t1 = Date.now();
      while (Date.now() - t1 < 3000 && !/event: state/.test(b)) b += new TextDecoder().decode((await rd2.read()).value);
      state = /event: state/.test(b); c.abort(); }
  } catch {}
}
check('the phone gets Lax\'s live state through the relay', state === true);
r = await fetch(RELAY + '/pair'); await r.text();
check('/pair through the relay: refused, it\'s only for this Mac', r.status === 403, String(r.status));
r = await fetch(RELAY + '/api/health');
check('…and so is the health check', r.status !== 200 || !(await r.json()).ok, String(r.status));
r = await fetch(`${RELAY}/api/stream?t=wrong`); await r.text();
check('a wrong token through the relay: 401 from Lax itself', r.status === 401, String(r.status));
{ const tok = fs.readFileSync(path.join(DATA, 'secrets', 'token'), 'utf8').trim();
  const again = () => fetch(`${RELAY}/api/settings`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json', 'x-lax-token': tok, 'x-lax-once': 'once-settings-1' } });
  const a = await again(), b = await again(); await a.text(); await b.text();
  check('a request sent twice (a retry) is done once: the repeat gets the first answer', a.status === 200 && b.status === 200 && !a.headers.get('x-lax-once') && b.headers.get('x-lax-once') === 'repeat', `${a.status} ${b.status} ${b.headers.get('x-lax-once')}`); }

console.log(failed ? `\n${failed} relay check(s) failed` : '\nall relay checks passed');
process.exit(failed ? 1 : 0);
