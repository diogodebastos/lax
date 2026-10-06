// The seed brain (lib/brain.mjs), end to end with a fake Claude: a quiet session that did real work → Lax reflects →
// notes land in its mind (committed) → "learned" bubble → the next session in that project gets Lax's brief.
// Also: trivial sessions don't trigger a reflection, and a reflection is fenced into the mind (hook).
// Runs a PRIVATE Lax (own port + temp home), so your real Lax never sees any of it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = 7797, LAX = `http://127.0.0.1:${PORT}`, HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'lax-brain-'));
const MIND = path.join(HOME, 'mind');

// A fake `claude`: when asked to reflect, writes a project note and a user note, then answers like `claude -p --output-format json`.
const FAKE = path.join(HOME, 'fake-claude.mjs');
fs.writeFileSync(FAKE, `#!${process.execPath}
import fs from 'node:fs'; import path from 'node:path';
const prompt = process.argv[process.argv.indexOf('-p') + 1] || '';
const file = (prompt.match(/projects\\/([^\\s]+\\.md)/) || [])[1];
if (file) {
  fs.mkdirSync('projects', { recursive: true });
  fs.writeFileSync(path.join('projects', file), '# demo-proj\\n- A pixel-art game, in Godot. (2026-10-06)\\n');
  fs.appendFileSync('CLAUDE.md', '- Prefers short answers. (2026-10-06)\\n');
}
console.log(JSON.stringify({ result: 'Done.\\n{"learned": ["demo-proj is a pixel-art game in Godot", "prefers short answers"]}' }));
`, { mode: 0o755 });

const ENV = { ...process.env, LAX_HOME: HOME, LAX_PORT: String(PORT), LAX_URL: LAX, LAX_PUBLIC_URL: '', LAX_CLAUDE: FAKE, LAX_REFLECT_IDLE: '1' };
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
const hook = (h) => post('/api/hook', { cwd: '/tmp/demo-proj', ...h });
const learnedBubbles = () => phone.filter((e) => e.ev === 'bubble' && e.d.kind === 'learned');

// A trivial session: one question, then quiet → no reflection.
await hook({ hook_event_name: 'SessionStart', session_id: 's-trivial' });
await hook({ hook_event_name: 'UserPromptSubmit', session_id: 's-trivial', prompt: 'what time is it?' });
await hook({ hook_event_name: 'Stop', session_id: 's-trivial', last_assistant_message: 'It is noon.' });
await sleep(2000);
check('a trivial session doesn\'t trigger a reflection', learnedBubbles().length === 0);

// Real work, then quiet → reflection.
await hook({ hook_event_name: 'SessionStart', session_id: 's-work' });
for (const p of ['make the player jump', 'add coyote time']) await hook({ hook_event_name: 'UserPromptSubmit', session_id: 's-work', prompt: p });
for (const f of ['player.gd', 'level.tscn', 'player.gd']) await hook({ hook_event_name: 'PreToolUse', session_id: 's-work', tool_name: 'Edit', tool_input: { file_path: f } });
await hook({ hook_event_name: 'Stop', session_id: 's-work', last_assistant_message: 'Jump and coyote time are in.' });
for (let i = 0; i < 40 && !learnedBubbles().length; i++) await sleep(150);
const b = learnedBubbles()[0];
check('a quiet session after real work → "learned" bubble', /I learned 2 things from demo-proj/.test(b?.d.text || ''), b?.d.text);
check('the bubble lists what was learned', /pixel-art game/.test(b?.d.details || ''));
check('project notes land in the mind', fs.existsSync(path.join(MIND, 'projects', 'demo-proj.md')));
const log = execFileSync('git', ['-C', MIND, 'log', '--oneline'], { encoding: 'utf8' });
check('…and are committed to its history', /learned from demo-proj/.test(log));
check('learning.md (how it learns) lives in the mind', fs.existsSync(path.join(MIND, 'learning.md')));

// The next session in that project starts with Lax's brief (through the real hook).
const out = execFileSync(process.execPath, [path.join(ROOT, 'hooks', 'lax-hook.mjs')], { env: ENV, encoding: 'utf8',
  input: JSON.stringify({ hook_event_name: 'SessionStart', session_id: 's-next', cwd: '/tmp/demo-proj' }) });
const ctx = (() => { try { return JSON.parse(out.trim().split('\n')[0]).hookSpecificOutput.additionalContext; } catch { return ''; } })();
check('a new session in that project gets Lax\'s brief', /pixel-art game/.test(ctx) && /short answers/.test(ctx));

// The fence: while reflecting, only the mind.
const fence = (tool, input) => { const o = execFileSync(process.execPath, [path.join(ROOT, 'hooks', 'lax-hook.mjs')], { env: { ...ENV, LAX_REFLECT: '1' }, encoding: 'utf8',
  input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input }) }); return /"allow"/.test(o) ? 'allow' : /"deny"/.test(o) ? 'deny' : 'none'; };
check('reflecting: may edit its mind', fence('Edit', { file_path: path.join(MIND, 'projects', 'x.md') }) === 'allow');
check('reflecting: no shell', fence('Bash', { command: 'ls' }) === 'deny');
check('reflecting: no reading outside its mind', fence('Read', { file_path: path.join(ROOT, 'server.mjs') }) === 'deny');
check('reflecting: no secrets', fence('Read', { file_path: path.join(HOME, 'secrets', 'token') }) === 'deny');

console.log(failed ? `\n${failed} check(s) failed` : '\nall brain checks passed');
process.exit(failed ? 1 : 0);
