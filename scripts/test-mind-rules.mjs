// Lax's mind may change itself and use Lax's own tools without the phone (lib/home.mjs), a mind from before those rules
// gets them, keeping yours, and a claude Lax starts finds a node for its hooks even when launchd's PATH has none
// (server.mjs): without one the hook fails, nothing reaches the phone, and `claude -p` refuses.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lax-rules-'));
process.env.LAX_HOME = path.join(tmp, 'home');
const { ensureHome } = await import('../lib/home.mjs');
const { MIND, SECRETS } = await import('../lib/paths.mjs');
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));
const FILE = path.join(MIND, '.claude', 'settings.json'), rules = () => JSON.parse(fs.readFileSync(FILE, 'utf8')).permissions;
const OWN = [`Edit(/${MIND}/**)`, 'mcp__lax__*'];

ensureHome({ repos: tmp, body: tmp, name: 'Lax' });
let p = rules();
check('a new mind may edit itself and use Lax\'s tools', OWN.every((r) => p.allow.includes(r)), JSON.stringify(p.allow));
check('…and still never its secrets', p.deny.includes(`Edit(/${SECRETS}/**)`) && p.deny.includes(`Read(/${SECRETS}/**)`));
fs.writeFileSync(FILE, JSON.stringify({ permissions: { allow: ['Read', 'Bash(make:*)'], deny: ['Read(//x)'] }, model: 'x' }));
ensureHome({ repos: tmp, body: tmp, name: 'Lax' }); ensureHome({ repos: tmp, body: tmp, name: 'Lax' });
p = rules();
check('an older mind gets them once, keeping what was there', JSON.stringify(p.allow) === JSON.stringify(['Read', 'Bash(make:*)', ...OWN])
  && p.deny[0] === 'Read(//x)' && JSON.parse(fs.readFileSync(FILE, 'utf8')).model === 'x', JSON.stringify(p));

// A Lax started the way launchd starts it: no node on PATH. Its "claude" says which node a hook would get.
const fake = path.join(tmp, 'claude'), seen = path.join(tmp, 'node-seen'), PORT = 7819, LH = path.join(tmp, 'lax');
fs.writeFileSync(fake, `#!/bin/sh\ncommand -v node > "${seen}"\n`, { mode: 0o755 });
const server = spawn(process.execPath, ['--no-warnings', path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'server.mjs')], { stdio: ['ignore', 'pipe', 'ignore'],
  env: { HOME: os.homedir(), PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LAX_HOME: LH, LAX_PORT: String(PORT), LAX_CLAUDE: fake, LAX_WHISPER: '0' } });
let out = ''; server.stdout.on('data', (d) => (out += d));
process.on('exit', () => server.kill());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 80 && !/Phone:/.test(out); i++) await sleep(100);
const tok = fs.readFileSync(path.join(LH, 'secrets', 'token'), 'utf8').trim();
await fetch(`http://127.0.0.1:${PORT}/api/talk`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-lax-token': tok }, body: JSON.stringify({ text: 'hello' }) });
for (let i = 0; i < 50 && !fs.existsSync(seen); i++) await sleep(100);
const node = fs.existsSync(seen) ? fs.readFileSync(seen, 'utf8').trim() : '';
check('a claude Lax starts finds the node Lax runs on, for its hooks', node === process.execPath, node || '(none)');

console.log(failed ? `\n${failed} mind rule check(s) failed` : '\nall mind rule checks passed');
process.exit(failed ? 1 : 0);
