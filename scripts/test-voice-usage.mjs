// Talking to Lax: every voice message carries the current context (sessions, plan usage) in its prompt, also when the
// conversation is resumed (a resumed run keeps its first system prompt). The phone shows only what you said.
// Runs a PRIVATE Lax (own port + temp home) with a fake Claude that records its arguments.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = 7791, LAX = `http://127.0.0.1:${PORT}`, HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'lax-voice-'));
const CALLS = path.join(HOME, 'calls.jsonl');

// A fake `claude -p --output-format stream-json`: notes its arguments, starts a session, answers.
const FAKE = path.join(HOME, 'fake-claude.mjs');
fs.writeFileSync(FAKE, `#!${process.execPath}
import fs from 'node:fs';
fs.appendFileSync(${JSON.stringify(CALLS)}, JSON.stringify(process.argv.slice(2)) + '\\n');
console.log(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'fake-session' }));
console.log(JSON.stringify({ type: 'result', result: 'Here are your numbers.', is_error: false }));
`, { mode: 0o755 });

const ENV = { ...process.env, LAX_HOME: HOME, LAX_PORT: String(PORT), LAX_URL: LAX, LAX_PUBLIC_URL: '', LAX_CLAUDE: FAKE };
delete ENV.LAX_DATA;
const server = spawn(process.execPath, ['--no-warnings', path.join(ROOT, 'server.mjs')], { env: ENV, stdio: 'ignore' });
const cleanup = () => { server.kill(); fs.rmSync(HOME, { recursive: true, force: true }); };
process.on('exit', cleanup);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 50 && !fs.existsSync(path.join(HOME, 'secrets', 'token')); i++) await sleep(100);
await sleep(300);
const TOKEN = fs.readFileSync(path.join(HOME, 'secrets', 'token'), 'utf8').trim();
const H = { 'content-type': 'application/json', 'x-lax-token': TOKEN };
const post = (p, b) => fetch(LAX + p, { method: 'POST', headers: H, body: JSON.stringify(b) }).then((r) => r.json());
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

const phone = [];
(async () => {
  const res = await fetch(`${LAX}/api/stream?t=${TOKEN}`); let buf = '';
  for await (const c of res.body) { buf += Buffer.from(c).toString(); let i;
    while ((i = buf.indexOf('\n\n')) >= 0) { const blk = buf.slice(0, i); buf = buf.slice(i + 2);
      const ev = /^event: (.*)$/m.exec(blk)?.[1], d = /^data: (.*)$/m.exec(blk)?.[1]; if (ev && d) phone.push({ ev, d: JSON.parse(d) }); } }
})();
await sleep(200);

const calls = () => fs.existsSync(CALLS) ? fs.readFileSync(CALLS, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
const replies = () => phone.filter((e) => e.ev === 'bubble' && e.d.kind === 'reply').length;
async function say(text) {
  const n = replies();
  check(`"${text}" reaches Lax`, (await post('/api/talk', { text })).ok);
  for (let i = 0; i < 50 && replies() === n; i++) await sleep(100);
}
const hours = (h) => Date.now() / 1000 + h * 3600;
const prompt = (args) => args[args.indexOf('-p') + 1] || '';

// No terminal has reported usage yet: Lax is told it's unknown.
await say('how much usage do I have?');
check('with no status line yet, usage is "unknown"', /Their Claude plan usage: unknown/.test(prompt(calls()[0] || [])));

// A terminal's status line reports usage, then you ask (the conversation resumes).
await post('/api/usage', { rate_limits: { five_hour: { used_percentage: 23, resets_at: hours(2) }, seven_day: { used_percentage: 41, resets_at: hours(72) } } });
await say('and now?');
let [, second] = calls();
check('a resumed message (--resume)…', second?.includes('--resume') && second[second.indexOf('--resume') + 1] === 'fake-session');
check('…carries the current usage in its prompt', /\[Context now[^\n]*\][\s\S]*5-hour limit 23% used[\s\S]*weekly limit 41% used[\s\S]*\[\/Context\]\n\nand now\?$/.test(prompt(second || [])), prompt(second || []).slice(0, 80));
check('the system prompt only says how to talk', !/usage/.test(second?.[second.indexOf('--append-system-prompt') + 1] || 'usage'));

// The numbers move: the next message has the new ones.
await post('/api/usage', { rate_limits: { five_hour: { used_percentage: 67, resets_at: hours(1) }, seven_day: { used_percentage: 45, resets_at: hours(70) } } });
await say('and now, again?');
const third = calls()[2] || [];
check('each message gets fresh numbers', /5-hour limit 67% used/.test(prompt(third)) && !/23%/.test(prompt(third)));

const said = phone.filter((e) => e.ev === 'feed' && e.d.kind === 'prompt').map((e) => e.d.line);
check('the phone shows only what you said', JSON.stringify(said) === JSON.stringify(['> how much usage do I have?', '> and now?', '> and now, again?']), JSON.stringify(said));

console.log(failed ? `\n${failed} check(s) failed` : '\nall voice usage checks passed');
process.exit(failed ? 1 : 0);
