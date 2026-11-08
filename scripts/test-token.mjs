// npm run rotate-token (scripts/rotate-token.mjs) on a PRIVATE Lax: the old link gets 401 once Lax restarts, the new
// token works, and it's kept only for you (0600).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { freePort } from './free-port.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = await freePort(), LAX = `http://127.0.0.1:${PORT}`, HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'lax-token-'));
const ENV = { ...process.env, LAX_HOME: HOME, LAX_DATA: '', LAX_PORT: String(PORT), LAX_PUBLIC_URL: '', LAX_CLAUDE: '/usr/bin/false', LAX_WHISPER: '0' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let server = null, failed = 0;
process.on('exit', () => { server?.kill(); fs.rmSync(HOME, { recursive: true, force: true }); });
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
const tokenFile = path.join(HOME, 'secrets', 'token'), read = () => fs.readFileSync(tokenFile, 'utf8').trim();
async function start() {
  server = spawn(process.execPath, ['--no-warnings', path.join(ROOT, 'server.mjs')], { env: ENV, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) { try { await fetch(LAX + '/'); return; } catch { await sleep(100); } }
}
const status = async (t) => { const c = new AbortController(); const r = await fetch(`${LAX}/api/stream?t=${t}`, { signal: c.signal }); c.abort(); return r.status; };

await start();
const old = read();
check('the token works before', await status(old) === 200);
const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'rotate-token.mjs'), '--no-restart'], { env: ENV, encoding: 'utf8' });
const fresh = read();
check('rotate-token writes a new one', r.status === 0 && fresh !== old && /^[0-9a-f]{24}$/.test(fresh), r.stderr);
check('…only yours (0600)', (fs.statSync(tokenFile).mode & 0o777) === 0o600);
server.kill(); await new Promise((res) => server.on('exit', res)); await start();
check('after the restart: the old link gets 401', await status(old) === 401);
check('…and the new token works', await status(fresh) === 200);

console.log(failed ? `\n${failed} token check(s) failed` : '\nall token checks passed');
process.exit(failed ? 1 : 0);
