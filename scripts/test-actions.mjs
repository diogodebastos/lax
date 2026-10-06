// Quick actions by voice (Phase 3.5), end to end with a fake Claude: `lax` (bin/claude-lax.mjs) runs it in a
// pseudo-terminal, your keys still pass through, saying "clear" in its live tab types /clear into it, only the closed
// list gets through, and nothing is left behind after it exits.
// Runs a PRIVATE Lax (own port + temp home), so your real Lax never sees any of it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { voiceAction, sendAction } from '../lib/actions.mjs';

const pty = createRequire(import.meta.url)('node-pty');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = 7796, LAX = `http://127.0.0.1:${PORT}`, HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'lax-act-'));
const ENV = { ...process.env, LAX_HOME: HOME, LAX_PORT: String(PORT), LAX_URL: LAX, LAX_PUBLIC_URL: '' };
delete ENV.LAX_DATA;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
const until = async (fn, ms = 3000) => { for (let t = 0; t < ms && !fn(); t += 50) await sleep(50); return fn(); };

// What counts as an action: only an exact short command.
check('"Clear." is an action', voiceAction('Clear.') === 'clear');
check('"stop!" is an action', voiceAction(' stop! ') === 'stop');
check('"/compact" is an action', voiceAction('/compact') === 'compact');
check('"clear up the README" is a message', voiceAction('clear up the README') === null);
check('"rm -rf" is not an action', voiceAction('rm -rf') === null);

const server = spawn(process.execPath, ['--no-warnings', path.join(ROOT, 'server.mjs')], { env: ENV, stdio: 'ignore' });
process.on('exit', () => { server.kill(); fs.rmSync(HOME, { recursive: true, force: true }); });
for (let i = 0; i < 50 && !fs.existsSync(path.join(HOME, 'secrets', 'token')); i++) await sleep(100);
await sleep(300);
const TOKEN = fs.readFileSync(path.join(HOME, 'secrets', 'token'), 'utf8').trim();
const post = (p, b) => fetch(LAX + p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-lax-token': TOKEN },
  body: JSON.stringify(b) }).then((r) => r.json());

// A fake `claude`: records every key it gets, reports its size on resize, links to Lax like the channel would
// (with the wrapper's socket), and exits with 3 when it reads "bye".
const KEYS = path.join(HOME, 'keys.txt'), SIZE = path.join(HOME, 'size.txt'), PID = path.join(HOME, 'pid.txt');
const FAKE = path.join(HOME, 'fake-claude.mjs');
fs.writeFileSync(FAKE, `#!${process.execPath}
import fs from 'node:fs';
fs.writeFileSync(${JSON.stringify(PID)}, String(process.pid));
process.stdin.setRawMode(true); process.stdin.setEncoding('utf8');
let all = '';
process.stdin.on('data', (d) => { all += d; fs.writeFileSync(${JSON.stringify(KEYS)}, all); if (all.endsWith('bye')) process.exit(3); });
process.stdout.on('resize', () => fs.writeFileSync(${JSON.stringify(SIZE)}, process.stdout.columns + 'x' + process.stdout.rows));
process.stdout.write('\\x1b[32mready\\x1b[0m\\n');
const qs = new URLSearchParams({ cid: 'fakecid', cwd: '/tmp/demo-proj', pty: process.env.LAX_PTY || '' });
fetch(${JSON.stringify(LAX)} + '/api/channel/stream?' + qs, { headers: { 'x-lax-token': ${JSON.stringify(TOKEN)} } })
  .then(async (r) => { for await (const _ of r.body); }).catch(() => {});
`, { mode: 0o755 });

// `lax` in a terminal (a pty of our own stands in for yours).
let screen = '';
const term = pty.spawn(process.execPath, [path.join(ROOT, 'bin', 'claude-lax.mjs')], { cols: 100, rows: 30, cwd: HOME,
  env: { ...ENV, LAX_CLAUDE: FAKE } });
term.onData((d) => { screen += d; });
let exit = null; term.onExit((e) => { exit = e; });
const keys = () => { try { return fs.readFileSync(KEYS, 'utf8'); } catch { return ''; } };

check('Claude\'s output reaches your terminal, colours intact', await until(() => screen.includes('\x1b[32mready')));
term.write('hi there\r');
check('your typing reaches Claude', await until(() => keys() === 'hi there\r'), JSON.stringify(keys()));
term.resize(120, 40);
check('resizing your window resizes Claude\'s', await until(() => fs.existsSync(SIZE) && fs.readFileSync(SIZE, 'utf8') === '120x40'), fs.existsSync(SIZE) ? fs.readFileSync(SIZE, 'utf8') : 'no size');

const SOCK = fs.existsSync(path.join(HOME, 'run')) && fs.readdirSync(path.join(HOME, 'run')).map((f) => path.join(HOME, 'run', f))[0];
check('the wrapper opens a private socket', !!SOCK && (fs.statSync(SOCK).mode & 0o077) === 0, SOCK || '');
check('the socket refuses anything off the list', !(await sendAction(SOCK, 'rm -rf /')));
await sleep(400); // let the live session link up

await post('/api/target', { target: 'fakecid' });
let before = keys();
check('saying "clear" in the live tab counts as done', (await post('/api/talk', { text: 'Clear.' })).ok);
check('…and types /clear, then Enter', await until(() => keys() === before + '/clear\r'), JSON.stringify(keys().slice(before.length)));
before = keys();
await post('/api/talk', { text: 'stop' });
check('"stop" presses Esc', await until(() => keys() === before + '\x1b'), JSON.stringify(keys().slice(before.length)));
before = keys();
await post('/api/talk', { text: 'clear up the README' });
await sleep(400);
check('a longer sentence is never typed into the terminal', keys() === before, JSON.stringify(keys().slice(before.length)));
check('/api/action refuses free text', !(await post('/api/action', { cid: 'fakecid', action: 'echo hi' })).ok);

const claudePid = Number(fs.readFileSync(PID, 'utf8'));
term.write('bye');
check('Claude\'s exit code comes back out', await until(() => exit !== null) && exit.exitCode === 3, JSON.stringify(exit));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
check('no stray process after exit', await until(() => !alive(claudePid)));
check('the socket is cleaned up', !fs.existsSync(SOCK));

console.log(failed ? `\n${failed} check(s) failed` : '\nall quick-action checks passed');
process.exit(failed ? 1 : 0);
