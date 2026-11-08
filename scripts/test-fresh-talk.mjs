// Lax's own conversation starts fresh when it's long (or quiet, or you say so), carries how the last one ended, and
// keeps its context block small. Runs a PRIVATE Lax (own port + temp home) with a fake Claude that records its arguments.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { freePort } from './free-port.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = await freePort(), LAX = `http://127.0.0.1:${PORT}`, HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'lax-fresh-'));
const CALLS = path.join(HOME, 'calls.jsonl'), TOKENS = path.join(HOME, 'tokens');

// A fake `claude -p --output-format stream-json`: notes its arguments, resumes or starts a session, keeps a transcript
// where Claude Code would (under $HOME), and reports how full the conversation is (from the TOKENS file).
const FAKE = path.join(HOME, 'fake-claude.mjs');
fs.writeFileSync(FAKE, `#!${process.execPath}
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2), n = fs.existsSync(${JSON.stringify(CALLS)}) ? fs.readFileSync(${JSON.stringify(CALLS)}, 'utf8').trim().split('\\n').length : 0;
fs.appendFileSync(${JSON.stringify(CALLS)}, JSON.stringify(args) + '\\n');
const r = args.indexOf('--resume'), id = r >= 0 ? args[r + 1] : 'fake-' + n, answer = 'answer ' + n;
const dir = path.join(process.env.HOME, '.claude', 'projects', path.join(process.env.LAX_HOME, 'mind').replace(/[^a-zA-Z0-9]/g, '-'));
fs.mkdirSync(dir, { recursive: true });
const ts = new Date().toISOString();
fs.appendFileSync(path.join(dir, id + '.jsonl'), JSON.stringify({ type: 'user', uuid: 'u' + n, timestamp: ts, message: { content: args[args.indexOf('-p') + 1] } }) + '\\n'
  + JSON.stringify({ type: 'assistant', uuid: 'a' + n, timestamp: ts, message: { content: [{ type: 'text', text: answer }] } }) + '\\n');
const tokens = Number(fs.existsSync(${JSON.stringify(TOKENS)}) ? fs.readFileSync(${JSON.stringify(TOKENS)}, 'utf8') : 1000);
console.log(JSON.stringify({ type: 'system', subtype: 'init', session_id: id }));
console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: answer }], usage: { input_tokens: 2, cache_read_input_tokens: tokens - 2, cache_creation_input_tokens: 0 } } }));
console.log(JSON.stringify({ type: 'result', result: answer, is_error: false }));
`, { mode: 0o755 });

const ENV = { ...process.env, HOME, LAX_HOME: HOME, LAX_PORT: String(PORT), LAX_URL: LAX, LAX_PUBLIC_URL: '', LAX_CLAUDE: FAKE };
delete ENV.LAX_DATA; delete ENV.LAX_FRESH_HOURS; delete ENV.LAX_FRESH_TOKENS;
let server;
const start = () => { server = spawn(process.execPath, ['--no-warnings', path.join(ROOT, 'server.mjs')], { env: ENV, stdio: 'ignore' }); };
start();
const cleanup = () => { server.kill(); fs.rmSync(HOME, { recursive: true, force: true }); };
process.on('exit', cleanup);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const up = async () => { for (let i = 0; i < 100; i++) { try { await fetch(LAX + '/api/health'); return; } catch {} await sleep(100); } };
await up();
const TOKEN = fs.readFileSync(path.join(HOME, 'secrets', 'token'), 'utf8').trim();
const H = { 'content-type': 'application/json', 'x-lax-token': TOKEN };
const post = (p, b) => fetch(LAX + p, { method: 'POST', headers: H, body: JSON.stringify(b) }).then((r) => r.json());
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

let phone = [];
const listen = (backlog = 0) => (async () => {
  const res = await fetch(`${LAX}/api/stream?t=${TOKEN}&backlog=${backlog}`); let buf = '';
  for await (const c of res.body) { buf += Buffer.from(c).toString(); let i;
    while ((i = buf.indexOf('\n\n')) >= 0) { const blk = buf.slice(0, i); buf = buf.slice(i + 2);
      const ev = /^event: (.*)$/m.exec(blk)?.[1], d = /^data: (.*)$/m.exec(blk)?.[1]; if (ev && d) phone.push({ ev, d: JSON.parse(d) }); } }
})().catch(() => {});
listen();
await sleep(200);

const calls = () => fs.existsSync(CALLS) ? fs.readFileSync(CALLS, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
const replies = () => phone.filter((e) => e.ev === 'bubble' && ['reply', 'error'].includes(e.d.kind)).length;
async function say(text) {
  const n = replies();
  check(`"${text}" reaches Lax`, (await post('/api/talk', { text })).ok);
  for (let i = 0; i < 50 && replies() === n; i++) await sleep(100);
  await sleep(100);
}
const prompt = (args = []) => args[args.indexOf('-p') + 1] || '';
const resumes = (args = []) => args.includes('--resume') ? args[args.indexOf('--resume') + 1] : null;
const feedLines = () => phone.filter((e) => e.ev === 'feed').map((e) => e.d.line);

// A session of yours, with a few steps, so the context block has something to show.
const hook = (b) => post('/api/hook', { session_id: 'work-1', cwd: '/tmp/edge-cava', ...b });
await hook({ hook_event_name: 'SessionStart' });
for (const c of ['npm test', 'git status', 'git diff', 'npm run build']) await hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: c, description: `Runs ${c}` } });

await say('hello');
check('the first message starts a conversation', resumes(calls()[0]) === null);
const brief = prompt(calls()[0]).split('[/Context]')[0];
check('a session not mentioned: one line and its latest step', /- edge-cava·cli \(.*\):\n {4}\S[^\n]*\n\n/.test(brief) && !/npm test/.test(brief), JSON.stringify(brief.slice(-200)));
await say('what is edge cava doing?');
check('a normal follow-up resumes', resumes(calls()[1]) === 'fake-0');
check('a session you name: its last steps', /npm test[\s\S]*git status[\s\S]*git diff/.test(prompt(calls()[1]).split('[/Context]')[0]));

// Long: the reply reports 200k tokens, so the next message starts fresh and carries how the last one ended.
fs.writeFileSync(TOKENS, '200000');
await say('tell me a long story');
check('it still resumes while it gets long', resumes(calls()[2]) === 'fake-0');
fs.writeFileSync(TOKENS, '1000');
await say('and now?');
const fresh = calls()[3];
check('once long, the next message starts fresh (no --resume)', fresh && resumes(fresh) === null);
check('…carrying how the last one ended', /This is a new conversation\. The last one ended with:\nYou: hello\nMe: answer 0\nYou: what is edge cava doing\?\nMe: answer 1\nYou: tell me a long story\nMe: answer 2\n/.test(prompt(fresh)), JSON.stringify(prompt(fresh).slice(0, 300)));
check('…inside the context block (the phone shows only what you said)', /\[\/Context\]\n\nand now\?$/.test(prompt(fresh)) && feedLines().includes('> and now?'));
check('the phone sees where it started over', feedLines().includes('○ new conversation (long (200k))'), JSON.stringify(feedLines().filter((l) => l.startsWith('○'))));
await say('and then?');
check('the new one resumes as usual, without the recap', resumes(calls()[4]) === 'fake-3' && !/new conversation/.test(prompt(calls()[4])));
check("Lax's old conversation never shows as one of your tabs", !phone.filter((e) => e.ev === 'state').at(-1)?.d.sessions?.some((s) => /^fake-/.test(s.id)));

// "Start fresh": by voice, answered by Lax itself, not sent to Claude.
const before = calls().length;
await say('start fresh');
check('"start fresh" is answered without Claude', calls().length === before && phone.some((e) => e.ev === 'bubble' && /^Fresh start/.test(e.d.text)));
await say('who are you?');
check('…and the next message starts a new conversation', resumes(calls().at(-1)) === null && /The last one ended with:\nYou: and now\?/.test(prompt(calls().at(-1))));

// A long message: the line is cut, and the whole of it comes along for the phone to open; a short one doesn't need to.
const long = 'please check that the deploy went through and then tell me which of the three workers failed and why, in detail';
await say(long);
const sent = phone.filter((e) => e.ev === 'feed' && e.d.kind === 'prompt').at(-1)?.d;
check('a long message is cut on its line, and comes whole', sent?.line.endsWith('…') && sent?.text === long, JSON.stringify(sent));
check('a short one comes as it is', phone.some((e) => e.ev === 'feed' && e.d.line === '> who are you?' && e.d.text === undefined));

// A restart: Lax's tab shows both conversations, with the divider between them.
await sleep(700); // its state is saved half a second after a change
await new Promise((r) => { server.once('exit', r); server.kill(); }); phone = []; start(); await up();
listen(300); await sleep(500);
const back = feedLines();
const at = (l) => back.indexOf(l);
check('after a restart: the one before, the divider, then this one', at('> and then?') >= 0 && at('> and then?') < at('○ new conversation') && at('○ new conversation') < at('> who are you?'), JSON.stringify(back));

console.log(failed ? `\n${failed} check(s) failed` : '\nall fresh talk checks passed');
process.exit(failed ? 1 : 0);
