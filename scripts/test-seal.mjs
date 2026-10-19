// Sealed (lib/seal.mjs) on a throwaway Lax: the key is made once and kept only for you, the pairing link carries it after
// the #, a sealed request is opened and answered sealed, the stream is sealed for a phone that asks, plain for one that
// doesn't, and a body sealed with another key is nothing.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = 7817, LAX = `http://127.0.0.1:${PORT}`, HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'lax-seal-'));
const ENV = { ...process.env, LAX_HOME: HOME, LAX_DATA: '', LAX_PORT: String(PORT), LAX_PUBLIC_URL: 'https://lax.example.com', LAX_CLAUDE: '/usr/bin/false', LAX_WHISPER: '0' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
const server = spawn(process.execPath, ['--no-warnings', path.join(ROOT, 'server.mjs')], { env: ENV, stdio: ['ignore', 'pipe', 'ignore'] });
let out = ''; server.stdout.on('data', (d) => (out += d));
process.on('exit', () => { server.kill(); fs.rmSync(HOME, { recursive: true, force: true }); });
for (let i = 0; i < 80 && !/Phone:/.test(out); i++) await sleep(100);

const file = path.join(HOME, 'secrets', 'seal-key'), k = fs.readFileSync(file, 'utf8').trim(), key = Buffer.from(k, 'base64url');
const tok = fs.readFileSync(path.join(HOME, 'secrets', 'token'), 'utf8').trim();
check('a 32-byte key, only yours (0600)', key.length === 32 && (fs.statSync(file).mode & 0o777) === 0o600);
check('the phone\'s link carries it after the #', out.includes(`/?t=${tok}#k=${k}`));
const seal = (t, kk = key) => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', kk, iv); return Buffer.concat([iv, c.update(t), c.final(), c.getAuthTag()]).toString('base64'); };
const open = (s) => { const b = Buffer.from(s, 'base64'), d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12)); d.setAuthTag(b.subarray(-16)); return Buffer.concat([d.update(b.subarray(12, -16)), d.final()]).toString(); };
const post = (body, sealed = true) => fetch(`${LAX}/api/settings`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-lax-token': tok, ...(sealed ? { 'x-lax-seal': '1' } : {}) }, body });

let r = await post(JSON.stringify({ sealed: seal(JSON.stringify({ name: 'Sealy' })) })), j = await r.json();
check('a sealed request is opened, and answered sealed', r.headers.get('x-lax-sealed') === '1' && !('settings' in j) && JSON.parse(open(j.sealed)).settings?.name === 'Sealy', JSON.stringify(j).slice(0, 80));
r = await post(JSON.stringify({ sealed: seal(JSON.stringify({ name: 'Mallory' }), crypto.randomBytes(32)) })); j = JSON.parse(open((await r.json()).sealed));
check('…one sealed with another key is nothing', j.settings?.name === 'Sealy', j.settings?.name);
r = await post(JSON.stringify({ name: 'Plain' }), false); j = await r.json();
check('who doesn\'t ask is answered plain, as before', !r.headers.get('x-lax-sealed') && j.settings?.name === 'Plain');

const stream = async (q) => { const c = new AbortController(), s = await fetch(`${LAX}/api/stream?t=${tok}${q}`, { signal: c.signal }); const rd = s.body.getReader(); let b = '';
  const t = Date.now(); while (Date.now() - t < 2000 && !/\n\n/.test(b)) b += new TextDecoder().decode((await rd.read()).value); c.abort(); return b; };
let b = await stream('&seal=1'), d = JSON.parse(b.match(/data: (.*)/)[1]);
check('the stream, sealed for a phone that asks', typeof d.sealed === 'string' && !/"pet"/.test(b) && JSON.parse(open(d.sealed)).pet);
b = await stream('');
check('…and plain for one that doesn\'t', /"pet"/.test(b));

console.log(failed ? `\n${failed} seal check(s) failed` : '\nall seal checks passed');
process.exit(failed ? 1 : 0);
