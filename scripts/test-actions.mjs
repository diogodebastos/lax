// Quick actions by voice (Phase 3.5), end to end with a fake Claude: `lax` (bin/claude-lax.mjs) runs it in a
// pseudo-terminal, your keys still pass through, saying "clear" in its live tab types /clear into it, "plan mode"
// switches modes by reading the footer, "context"/"usage" are read back aloud, only the closed list gets through,
// and nothing is left behind after it exits.
// Runs a PRIVATE Lax (own port + temp home), so your real Lax never sees any of it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { voiceAction, sendAction, screenMode, readStatus } from '../lib/actions.mjs';

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
check('"Quit." is an action', voiceAction('Quit.') === 'quit');
check('"/compact" is an action', voiceAction('/compact') === 'compact');
check('"Slash clear" (as speech hears "/clear") is an action', voiceAction('Slash clear') === 'clear');
check('"Quit" ends the session (an action)', voiceAction('Quit') === 'quit' && voiceAction('exit.') === 'exit');
check('"Plan mode." is an action', voiceAction('Plan mode.') === 'plan mode' && voiceAction('plan  mode') === 'plan mode');
check('"Context?" / "usage" / "cost" are actions', voiceAction('Context?') === 'context' && voiceAction('usage') === 'usage' && voiceAction('Cost.') === 'cost');
check('"clear up the README" is a message', voiceAction('clear up the README') === null);
check('"rm -rf" is not an action', voiceAction('rm -rf') === null);

// Reading Claude Code's screen (shapes copied from the real thing, v2.1).
const FOOT = (m) => `❯ \n────\n  ⚠ Transcript saving is off\n  ${m} (shift+tab to cycle)`;
check('footer: plan mode', screenMode(FOOT('⏸ plan mode on')) === 'plan');
check('footer: accept edits', screenMode(FOOT('⏵⏵ accept edits on')) === 'accept edits');
check('footer: auto mode', screenMode(FOOT('⏵⏵ auto mode on')) === 'auto');
const CONTEXT = `❯ /context
  ⎿  Context Usage
     ⛀ ⛁ ⛁ ⛁ ⛀ ⛀ ⛀ ⛁ ⛀ ⛀ ⛶ ⛶   Opus 5.5
     ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   27.3k/1m tokens (3%)
     ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   Estimated usage by category
     ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   ⛁ System prompt: 2.4k tokens (0.2%)
     ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   ⛁ Messages: 1.5k tokens (0.1%)
                                 ⛶ Free space: 939.7k (94.0%)
────────────────────────────────────────
❯ `;
const ctx = readStatus('context', CONTEXT);
check('context is read aloud', ctx.say === 'Context is 3% full: 27.3k of 1m tokens.', ctx.say);
check('…with the categories in the feed', /System prompt: 2\.4k/.test(ctx.text) && /Messages: 1\.5k/.test(ctx.text) && !/Free space/.test(ctx.text), JSON.stringify(ctx.text));
// A short window: the header has scrolled off, so it's worked out from free space and the autocompact buffer.
const SHORT = CONTEXT.split('\n').filter((l) => !/tokens \(3%\)|Context Usage/.test(l)).join('\n')
  .replace('⛶ Free space: 939.7k (94.0%)', '⛶ Free space: 939.7k (94.0%)\n   ⛝ Autocompact buffer: 33k tokens (3.3%)');
check('context still read when the header scrolled off', readStatus('context', SHORT).say === 'Context is 3% full: 27k of 1m tokens.', readStatus('context', SHORT).say);
const USAGE = `   Settings  Status   Config   Usage   Stats

   Session

   Total cost:            $0.0000
   Total duration (API):  0s

   Current session
   ██████████▌                                        21% used
   Resets 7:39pm (Europe/Lisbon)

   Current week (all models)
   ██████████████▍                                    29% used
   Resets Oct 7 at 5:59pm (Europe/Lisbon)
`;
const use = readStatus('usage', USAGE);
check('usage is read aloud', use.say === 'This session window is 21% used, resets 7:39pm. This week, 29%.', use.say);
check('…with resets and cost in the feed', /week 29% · resets Oct 7 at 5:59pm/.test(use.text) && /\$0\.0000/.test(use.text), JSON.stringify(use.text));
check('an unreadable screen says so', readStatus('usage', 'nothing here').say === "I couldn't read the usage.");

const server = spawn(process.execPath, ['--no-warnings', path.join(ROOT, 'server.mjs')], { env: ENV, stdio: 'ignore' });
process.on('exit', () => { server.kill(); fs.rmSync(HOME, { recursive: true, force: true }); });
for (let i = 0; i < 50 && !fs.existsSync(path.join(HOME, 'secrets', 'token')); i++) await sleep(100);
await sleep(300);
const TOKEN = fs.readFileSync(path.join(HOME, 'secrets', 'token'), 'utf8').trim();
const post = (p, b) => fetch(LAX + p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-lax-token': TOKEN },
  body: JSON.stringify(b) }).then((r) => r.json());

// A fake `claude`: records every key it gets, reports its size on resize, links to Lax like the channel would
// (with the wrapper's socket), cycles modes on Shift+Tab (footer like the real one), prints /context and /usage
// like the real ones, and exits with 3 when it reads "bye".
const KEYS = path.join(HOME, 'keys.txt'), SIZE = path.join(HOME, 'size.txt'), PID = path.join(HOME, 'pid.txt');
const FAKE = path.join(HOME, 'fake-claude.mjs');
const crlf = (s) => JSON.stringify(s.replace(/\n/g, '\r\n'));
fs.writeFileSync(FAKE, `#!${process.execPath}
import fs from 'node:fs';
fs.writeFileSync(${JSON.stringify(PID)}, String(process.pid));
process.stdin.setRawMode(true); process.stdin.setEncoding('utf8');
const MODES = ['⏵⏵ auto mode on', '⏸ manual mode on', '⏵⏵ accept edits on', '⏸ plan mode on']; let mode = 0;
const foot = () => process.stdout.write('\\r\\n────\\r\\n  ' + MODES[mode] + ' (shift+tab to cycle)\\r\\n');
let all = '';
process.stdin.on('data', (d) => {
  all += d; fs.writeFileSync(${JSON.stringify(KEYS)}, all);
  if (all.endsWith('bye')) process.exit(3);
  if (d === '\\x1b[Z') { mode = (mode + 1) % MODES.length; foot(); }
  if (all.endsWith('/context\\r')) process.stdout.write(${crlf(CONTEXT)});
  if (all.endsWith('/usage\\r')) process.stdout.write(${crlf(USAGE)});
});
process.stdout.on('resize', () => fs.writeFileSync(${JSON.stringify(SIZE)}, process.stdout.columns + 'x' + process.stdout.rows));
process.stdout.write('\\x1b[32mready\\x1b[0m\\r\\n'); foot();
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
// What the phone would hear.
const bubbles = [];
(async () => {
  const res = await fetch(`${LAX}/api/stream?t=${TOKEN}`); let buf = '';
  for await (const c of res.body) {
    buf += Buffer.from(c).toString(); let i;
    while ((i = buf.indexOf('\n\n')) >= 0) { const blk = buf.slice(0, i); buf = buf.slice(i + 2);
      if (/^event: bubble$/m.test(blk)) bubbles.push(JSON.parse(/^data: (.*)$/m.exec(blk)[1])); }
  }
})().catch(() => {});
const heard = (re) => until(() => bubbles.some((b) => re.test(b.text)), 6000);
const presses = () => (keys().match(/\x1b\[Z/g) || []).length;

check('Claude\'s output reaches your terminal, colours intact', await until(() => screen.includes('\x1b[32mready')));
term.write('hi there\r');
check('your typing reaches Claude', await until(() => keys() === 'hi there\r'), JSON.stringify(keys()));
term.resize(120, 40);
check('resizing your window resizes Claude\'s', await until(() => fs.existsSync(SIZE) && fs.readFileSync(SIZE, 'utf8') === '120x40'), fs.existsSync(SIZE) ? fs.readFileSync(SIZE, 'utf8') : 'no size');

const SOCK = fs.existsSync(path.join(HOME, 'run')) && fs.readdirSync(path.join(HOME, 'run')).map((f) => path.join(HOME, 'run', f))[0];
check('the wrapper opens a private socket', !!SOCK && (fs.statSync(SOCK).mode & 0o077) === 0, SOCK || '');
check('the socket refuses anything off the list', !(await sendAction(SOCK, 'rm -rf /')).ok);
await sleep(400); // let the live session link up

await post('/api/target', { target: 'fakecid' });
let before = keys();
check('saying "clear" in the live tab counts as done', (await post('/api/talk', { text: 'Clear.' })).ok);
check('…and types /clear, then Enter', await until(() => keys() === before + '/clear\r'), JSON.stringify(keys().slice(before.length)));
before = keys();
await post('/api/talk', { text: 'stop' });
check('"stop" presses Esc', await until(() => keys() === before + '\x1b'), JSON.stringify(keys().slice(before.length)));
await post('/api/talk', { text: 'Plan mode.' });
check('"plan mode" presses Shift+Tab until the footer says plan', await heard(/demo-proj is in plan mode now/) && presses() === 3, `${presses()} presses`);
bubbles.length = 0;
await post('/api/talk', { text: 'plan mode' });
check('…and presses nothing if it already is', await heard(/in plan mode now/) && presses() === 3, `${presses()} presses`);
await post('/api/talk', { text: 'Context?' });
check('"context" types /context and reads it aloud', await heard(/^Context is 3% full/), JSON.stringify(bubbles.map((b) => b.text)));
before = keys();
await post('/api/talk', { text: 'usage' });
check('"usage" types /usage, reads it aloud, then closes the panel', await heard(/session window is 21% used/) && keys().endsWith('/usage\r\x1b'), JSON.stringify(keys().slice(before.length)));
before = keys();
await post('/api/talk', { text: 'Quit' });
check('"quit" types /exit, then Enter', await until(() => keys() === before + '/exit\r'), JSON.stringify(keys().slice(before.length)));
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
