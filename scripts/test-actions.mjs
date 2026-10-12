// Quick actions by voice (Phase 3.5), end to end with a fake Claude: `lax` (bin/claude-lax.mjs) runs it in a
// pseudo-terminal, your keys still pass through, saying "clear" in its live tab types /clear into it, "plan mode" /
// "auto mode" switch modes by reading the footer, "context"/"usage"/"model" are read back aloud, "sonnet" switches, only the closed list gets through,
// and nothing is left behind after it exits.
// Runs a PRIVATE Lax (own port + temp home), so your real Lax never sees any of it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { voiceAction, sendAction, screenMode, readStatus, tabCommand } from '../lib/actions.mjs';
import { verdict, laterFor, WISH_ASK, MERGE_IT } from '../lib/learn.mjs';
import { FRESH } from '../lib/talk.mjs';

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
check('"Quit" ends the session (an action)', voiceAction('Quit') === 'quit' && voiceAction('exit.') === 'exit' && voiceAction('Close') === 'close');
check('"Plan mode." is an action', voiceAction('Plan mode.') === 'plan mode' && voiceAction('plan  mode') === 'plan mode');
check('"Plan mouth" (misheard) is plan mode', voiceAction('Plan mouth') === 'plan mode' && voiceAction('Plan mood.') === 'plan mode');
check('"Blind mode" (misheard) is plan mode', voiceAction('Blind mode') === 'plan mode');
check('"Context?" / "usage" / "cost" are actions', voiceAction('Context?') === 'context' && voiceAction('usage') === 'usage' && voiceAction('Cost.') === 'cost');
check('"Auto mode" / "switch to accept edits" / "manual mode" are actions', voiceAction('Auto mode.') === 'auto mode' && voiceAction('switch to accept edits') === 'accept edits' && voiceAction('manual mode') === 'manual mode');
check('"Aiko" (misheard) is Haiku', voiceAction('Aiko') === 'model haiku');
check('menu answers can\'t be said', voiceAction('pick 1') === null);
check('"model" asks which model', voiceAction('Model?') === 'model');
check('"sonnet" / "use opus" / "Haiku model" / "model fable" switch models', voiceAction('Sonnet.') === 'model sonnet' && voiceAction('use opus') === 'model opus' && voiceAction('Haiku model') === 'model haiku' && voiceAction('model fable') === 'model fable');
check('"sonnet is great" is a message', voiceAction('sonnet is great') === null);
check('"clear up the README" is a message', voiceAction('clear up the README') === null);
check('"rm -rf" is not an action', voiceAction('rm -rf') === null);

// Changing tabs by voice: only when the words name a tab (or Lax).
const TABS = [{ id: 's1', project: 'edge-cava', where: 'cli' }, { id: 's2', project: 'side-project', where: 'mac' }, { id: 's3', project: 'lax', where: 'cli' }];
check('"Talk to edge cava" goes to that tab', tabCommand('Talk to edge cava.', TABS) === 's1');
check('"switch to the side-project session" / "go to side project mac" go to that tab', tabCommand('switch to the side-project session', TABS) === 's2' && tabCommand('go to side project mac', TABS) === 's2');
check('"go to edge kava" (misheard) still finds it', tabCommand('go to edge kava', TABS) === 's1');
check('"back to you" / "talk to Pip" (its name) go to Lax\'s own tab', tabCommand('Back to you.', TABS) === 'all' && tabCommand('talk to Pip', TABS, 'Pip') === 'all');
check('"Go to Lax CLI to session" (as heard) goes to lax·cli', tabCommand('Go to Lax CLI to session', TABS) === 's3');
const TWO = [...TABS, { id: 's4', project: 'lax', where: 'cli' }];
check('two lax·cli tabs: "go to lax cli two" / "lax cli 2" / "lax cli to" (as heard) go to the second', tabCommand('go to lax cli two', TWO) === 's4' && tabCommand('talk to lax cli 2', TWO) === 's4' && tabCommand('go to lax cli to session', TWO) === 's4');
check('two lax·cli tabs: "go to lax cli" goes to the first', tabCommand('go to lax cli', TWO) === 's3');
check('"go to the store" is a message', tabCommand('go to the store', TABS) === null);
check('"talk to me about lax" is a message', tabCommand('talk to me about lax', TABS) === null);
check('"switch to plan mode" is not a tab', tabCommand('switch to plan mode', TABS) === null);

// Everything said in English works in Portuguese too.
check('PT actions: "limpa" / "pára" / "fecha" / "compacta" / "continua"', voiceAction('Limpa.') === 'clear' && voiceAction('pára') === 'stop' && voiceAction('fecha') === 'close' && voiceAction('compacta') === 'compact' && voiceAction('continua') === 'continue');
check('PT modes: "modo plano" / "muda para o modo automático" / "modo manual"', voiceAction('modo plano') === 'plan mode' && voiceAction('muda para o modo automático') === 'auto mode' && voiceAction('modo manual') === 'manual mode');
check('PT: "contexto" / "uso" / "modelo" / "usa o sonnet" / "modelo opus"', voiceAction('contexto') === 'context' && voiceAction('uso') === 'usage' && voiceAction('modelo?') === 'model' && voiceAction('usa o sonnet') === 'model sonnet' && voiceAction('modelo opus') === 'model opus');
check('PT: "limpa o README" / "para o servidor" are messages', voiceAction('limpa o README') === null && voiceAction('para o servidor') === null);
check('PT tabs: "fala com o edge cava" / "muda para a sessão do side project"', tabCommand('fala com o edge cava', TABS) === 's1' && tabCommand('muda para a sessão do side project', TABS) === 's2');
check('PT tabs: "volta para ti" / "fala com o Lax" go to Lax\'s own tab', tabCommand('volta para ti', TABS) === 'all' && tabCommand('fala com o Lax', TABS) === 'all');
check('PT tabs: "vai para lax cli dois" goes to the second', tabCommand('vai para lax cli dois', TWO) === 's4');
check('PT tabs: "vai para a loja" is a message', tabCommand('vai para a loja', TABS) === null);
check('PT wish answers: "sim" / "claro" yes, "não" / "nem pensar" no, "mais tarde" / "amanhã" later', verdict('Sim.') === 'yes' && verdict('claro') === 'yes' && verdict('não') === 'no' && verdict('nem pensar') === 'no' && verdict('mais tarde') === 'later' && verdict('amanhã') === 'later');
check('"ask me in one week" / "next month" / "daqui a 3 dias" are a later, with how long', verdict('ask me in one week') === 'later' && laterFor('Ask me in one week.') === 7 * 86400e3 && laterFor('next month') === 30 * 86400e3 && laterFor('pergunta-me daqui a 3 dias') === 3 * 86400e3 && laterFor('as I said before try in two weeks') === 14 * 86400e3);
check('"later" has no time; "yes, in a week" and "on the Mac" aren\'t a later', laterFor('later') === 0 && verdict('yes but in a week') === 'other' && verdict('on the Mac, not the phone') === 'other');
check('PT: "sim mas no Mac" is a correction', verdict('sim mas no Mac') === 'other');
check('PT: "tens desejos?" / "o que queres aprender?" / "lê-me a tua lista de desejos" ask for wishes', WISH_ASK.test('tens desejos?') && WISH_ASK.test('Lax, o que queres aprender?') && WISH_ASK.test('lê-me a tua lista de desejos'));
check('PT: "faz o merge" / "sim, junta isso" merge', MERGE_IT.test('faz o merge') && MERGE_IT.test('sim, junta isso'));
check('PT: "nova conversa" / "vamos começar de novo" / "recomeça" start fresh', FRESH.test('nova conversa') && FRESH.test('vamos começar de novo') && FRESH.test('Recomeça.'));
check('PT: "começa" / "começa os testes" don\'t start fresh', !FRESH.test('começa') && !FRESH.test('começa os testes'));

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
const PICKER = `   Select model
     1.  Default (recommended)  Opus 5.5 · Best for everyday, complex tasks
   ❯ 2.  Opus 5.5 ✔             For complex work and everyday tasks
     3.  Sonnet 5.5             Most efficient for simpler tasks
   Enter to set as default · s to use this session only · Esc to cancel`;
check('model: the picker\'s ✔ is read aloud', readStatus('model', PICKER).say === 'This session uses Opus 5.5.', readStatus('model', PICKER).say);
check('model: "Default ✔" reads the model behind it', readStatus('model', '     1.  Default (recommended) ✔  Opus 5.5 · Best').say === 'This session uses Opus 5.5.');
const SET = `❯ /model sonnet\n  ⎿  Set model to Sonnet 5.5 and saved as your default for new sessions\n   ◐ medium · /effort`;
const SWITCH = `⏺ ok\n\n▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔\n   Switch model?\n   Your next response will be slower and use more tokens\n\n   This conversation is cached for the current model.\n\n   ❯ 1. Yes, switch to Haiku 4.5\n     2. No, go back\n`;
const menu = readStatus('model haiku', SWITCH).menu;
check('model: "Switch model?" mid-conversation is a menu for the phone', menu?.question === 'Switch model?' && menu.options.join('|') === 'Yes, switch to Haiku 4.5|No, go back' && /slower/.test(menu.detail), JSON.stringify(menu));
check('model: "Kept model" after "No, go back"', readStatus('pick 2', SWITCH + '\n  ⎿  Kept model as Opus 5.5\n  ⏵⏵ auto mode on').say === 'Kept Opus 5.5.');
check('model: the footer under a switch isn\'t a menu', !readStatus('model sonnet', SET).menu);
check('model: a switch is confirmed aloud', readStatus('model sonnet', SET).say === 'Switched to Sonnet 5.5. New sessions will use it too.', readStatus('model sonnet', SET).say);
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
  if (all.endsWith('/model\\r')) process.stdout.write(${crlf(PICKER)});
  if (all.endsWith('/model sonnet\\r')) process.stdout.write(${crlf(SET)});
  if (all.endsWith('/model haiku\\r')) process.stdout.write(${crlf(SWITCH)});
  if (all.endsWith('/model haiku\\r2')) process.stdout.write(${crlf('\n  ⎿  Kept model as Opus 5.5\n')});
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
const bubbles = [], feedLines = [];
(async () => {
  const res = await fetch(`${LAX}/api/stream?t=${TOKEN}`); let buf = '';
  for await (const c of res.body) {
    buf += Buffer.from(c).toString(); let i;
    while ((i = buf.indexOf('\n\n')) >= 0) { const blk = buf.slice(0, i); buf = buf.slice(i + 2);
      if (/^event: bubble$/m.test(blk)) bubbles.push(JSON.parse(/^data: (.*)$/m.exec(blk)[1]));
      if (/^event: feed$/m.test(blk)) feedLines.push(JSON.parse(/^data: (.*)$/m.exec(blk)[1]).line); }
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
await post('/api/talk', { text: 'Auto mode.' });
check('"auto mode" goes on round to auto', await heard(/demo-proj is in auto mode now/) && presses() === 4, `${presses()} presses`);
await post('/api/talk', { text: 'accept edits' });
check('"accept edits" too', await heard(/in accept-edits mode now/) && presses() === 6, `${presses()} presses`);
check('the feed shows actions plainly, no emoji', feedLines.includes('> clear') && feedLines.includes('> auto mode') && !feedLines.some((l) => /\p{Extended_Pictographic}/u.test(l)), JSON.stringify(feedLines));
before = keys();
await post('/api/talk', { text: 'Model?' });
check('"model" opens the picker, reads the ✔ aloud, then closes it', await heard(/This session uses Opus 5\.5/) && keys().endsWith('/model\r\x1b'), JSON.stringify(keys().slice(before.length)));
before = keys();
await post('/api/talk', { text: 'use sonnet' });
check('"use sonnet" types /model sonnet and confirms aloud', await heard(/Switched to Sonnet 5\.5/) && keys().endsWith('/model sonnet\r'), JSON.stringify(keys().slice(before.length)));
before = keys(); bubbles.length = 0;
await post('/api/talk', { text: 'Haiku' });
check('"haiku" mid-conversation: Claude Code\'s "Switch model?" comes to the phone as a question',
  await until(() => bubbles.some((b) => b.kind === 'question' && b.questions[0].question === 'Switch model?' && b.questions[0].options.length === 2), 6000), JSON.stringify(bubbles));
const q = bubbles.find((b) => b.kind === 'question');
await post('/api/decide', { id: q?.id, decision: 'answer', answers: { 'Switch model?': 'No, go back' } });
check('…picking "No, go back" presses 2 and says so', await heard(/Kept Opus 5\.5/) && keys().endsWith('/model haiku\r2'), JSON.stringify(keys().slice(before.length)));
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
