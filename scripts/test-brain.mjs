// The seed brain (lib/brain.mjs), end to end with a fake Claude: a quiet session that did real work → Lax reflects →
// notes land in its mind (committed) → "learned" bubble → the next session in that project gets Lax's brief.
// Also: trivial sessions don't trigger a reflection, and a reflection is fenced into the mind (hook).
// Runs a PRIVATE Lax (own port + temp home), so your real Lax never sees any of it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { freePort } from './free-port.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = await freePort(), LAX = `http://127.0.0.1:${PORT}`, HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'lax-brain-'));
const MIND = path.join(HOME, 'mind');
// A real project folder with a README, which the reflection should get to read.
const PROJ = path.join(HOME, 'demo-proj'); fs.mkdirSync(PROJ);
fs.writeFileSync(path.join(PROJ, 'README.md'), '# demo-proj\nA tiny platformer written in Godot 4.\n');

// A fake `claude`: when asked to reflect, writes a project note and a user note, then answers like `claude -p --output-format json`.
const FAKE = path.join(HOME, 'fake-claude.mjs');
fs.writeFileSync(FAKE, `#!${process.execPath}
import fs from 'node:fs'; import path from 'node:path';
const prompt = process.argv[process.argv.indexOf('-p') + 1] || '';\nfs.writeFileSync(${JSON.stringify(path.join(HOME, 'last-prompt.txt'))}, prompt);\nfs.writeFileSync(${JSON.stringify(path.join(HOME, 'last-model.txt'))}, process.argv[process.argv.indexOf('--model') + 1] || '');
if (prompt.startsWith('Do your weekly review')) {
  fs.writeFileSync(${JSON.stringify(path.join(HOME, 'review-prompt.txt'))}, prompt);
  fs.appendFileSync('wishing.md', '- Ask where it runs (Mac or phone) before proposing.\\n');
  console.log(JSON.stringify({ result: 'Done.\\n{"learned": [], "changed_how_i_learn": "proposals ask where it runs first", "wish": {"asked": "learn to check where a wish runs", "why": "corrected twice"}}' }));
  process.exit(0);
}
const file = (prompt.match(/projects\\/([^\\s]+\\.md)/) || [])[1];
if (file) {
  fs.mkdirSync('projects', { recursive: true });
  fs.writeFileSync(path.join('projects', file), '# demo-proj\\n- A pixel-art game, in Godot. (2026-10-06)\\n');
  fs.appendFileSync('CLAUDE.md', '- Prefers short answers. (2026-10-06)\\n');
}
// An episode, as remembering.md says, plus two the answer only claims (not there, outside episodes/).
const sid = (prompt.match(/Session: ([^,\\s]+),/) || [])[1];
const ep = 'episodes/2026-10/2026-10-09-demo-proj-' + sid + '.md';
if (sid) { fs.mkdirSync(path.dirname(ep), { recursive: true });
  fs.writeFileSync(ep, '# Jump with coyote time\\nwhen: 2026-10-09 10:00 to 10:30\\nwhere: demo-proj\\nkind: build\\noutcome: done\\ntags: player, jump\\nsession: ' + sid + '\\nrole: gamedev\\nmade: player.gd\\n\\nAdded a jump to player.gd.\\n');
  fs.mkdirSync('roles', { recursive: true }); fs.writeFileSync('roles/gamedev.md', '# Game dev\\nPlaytest every change.\\n'); }
console.log(JSON.stringify({ result: 'Done.\\n' + JSON.stringify({ learned: ['demo-proj is a pixel-art game in Godot', 'prefers short answers'], episodes: sid ? [ep, 'episodes/nope.md', '../CLAUDE.md'] : [],
  roles: sid ? [{ name: 'gamedev', why: 'three games built' }] : [] }) }));
`, { mode: 0o755 });

const CC = path.join(HOME, 'cc-projects'); // Claude Code's transcripts, for this test
const ENV = { ...process.env, LAX_CLAUDE_PROJECTS: CC, LAX_HOME: HOME, LAX_PORT: String(PORT), LAX_URL: LAX, LAX_PUBLIC_URL: '', LAX_CLAUDE: FAKE, LAX_REFLECT_IDLE: '1' };
delete ENV.LAX_DATA; delete ENV.LAX_BUILD; // a build's fence on its own steps isn't the hook under test
const server = spawn(process.execPath, ['--no-warnings', path.join(ROOT, 'server.mjs')], { env: ENV, stdio: 'ignore' });
const cleanup = () => { server.kill(); fs.rmSync(HOME, { recursive: true, force: true }); };
process.on('exit', cleanup);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 50 && !fs.existsSync(path.join(HOME, 'secrets', 'token')); i++) await sleep(100);
for (let i = 0; i < 50; i++) { try { await fetch(LAX + '/'); break; } catch { await sleep(100); } } // then until it answers
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
const hook = (h) => post('/api/hook', { cwd: PROJ, ...h });
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
await hook({ hook_event_name: 'Stop', session_id: 's-work', last_assistant_message: 'Jump and coyote time are in.', transcript_path: path.join(CC, '-demo-proj', 's-work.jsonl') });
for (let i = 0; i < 40 && !learnedBubbles().length; i++) await sleep(150);
const b = learnedBubbles()[0];
check('a quiet session after real work → "learned" bubble', /I learned 2 things from demo-proj/.test(b?.d.text || ''), b?.d.text);
check('the bubble lists what was learned', /pixel-art game/.test(b?.d.details || ''));
check('project notes land in the mind', fs.existsSync(path.join(MIND, 'projects', 'demo-proj.md')));
const log = execFileSync('git', ['-C', MIND, 'log', '--oneline'], { encoding: 'utf8' });
check('…and are committed to its history', /learned from demo-proj/.test(log));
const sent = fs.readFileSync(path.join(HOME, 'last-prompt.txt'), 'utf8');
check('the reflection gets the project\'s README', /<README.md>[\s\S]*Godot 4/.test(sent));
check('the reflection uses the stronger model (sonnet)', fs.readFileSync(path.join(HOME, 'last-model.txt'), 'utf8') === 'sonnet');
check('the reflection knows its roles (Phase 6.3)', /Roles you have: none yet/.test(sent));
check('…and a role it drafted waits for your yes', JSON.parse(fs.readFileSync(path.join(HOME, 'roles.json'), 'utf8')).roles.some((r) => r.name === 'gamedev' && r.status === 'new')
  && phone.some((e) => e.ev === 'feed' && /role drafted: gamedev/.test(e.d.line)));
check('learning.md (how it learns) lives in the mind', fs.existsSync(path.join(MIND, 'learning.md')));

// Phase 6: what happened is kept as an episode, following remembering.md.
check('remembering.md (how it remembers) lives in the mind', /# How I remember/.test(fs.readFileSync(path.join(MIND, 'remembering.md'), 'utf8')));
check('the reflection is asked for episodes, with the session and its archived transcript',
  /following remembering\.md[\s\S]*Session: s-work, \d{4}-\d\d-\d\d \d\d:\d\d to \d\d:\d\d, transcript: .*archive\/transcripts\/-demo-proj\/s-work\.jsonl/.test(sent), sent.split('\n').find((l) => l.includes('Session:')));
check('the episode lands in the mind, and is committed', execFileSync('git', ['-C', MIND, 'status', '--porcelain'], { encoding: 'utf8' }).trim() === ''
  && /kept 2026-10-09-demo-proj-s-work/.test(execFileSync('git', ['-C', MIND, 'log', '--oneline'], { encoding: 'utf8' })));
const remembered = phone.filter((e) => e.ev === 'feed' && /remembered from demo-proj/.test(e.d.line));
check('the feed says what it remembered, by title, and only episodes that are there', remembered.length === 1 && remembered[0].d.line === '✦ remembered from demo-proj: Jump with coyote time', remembered[0]?.d.line);
check('CLAUDE.md: episodes are searched, never read whole', /kept as episodes in `episodes\/`/.test(fs.readFileSync(path.join(MIND, 'CLAUDE.md'), 'utf8')));
// The session goes on: the next reflection knows the episode it already kept.
for (const p of ['now double jump', 'and a dash']) await hook({ hook_event_name: 'UserPromptSubmit', session_id: 's-work', prompt: p });
const n = learnedBubbles().length;
await hook({ hook_event_name: 'Stop', session_id: 's-work', last_assistant_message: 'Done.' });
for (let i = 0; i < 40 && learnedBubbles().length === n; i++) await sleep(150);
check('a session that went on: its episode is listed, to update', /already kept about this session: episodes\/2026-10\/2026-10-09-demo-proj-s-work\.md/.test(fs.readFileSync(path.join(HOME, 'last-prompt.txt'), 'utf8')));

// The next session in that project starts with Lax's brief (through the real hook).
const out = execFileSync(process.execPath, [path.join(ROOT, 'hooks', 'lax-hook.mjs')], { env: ENV, encoding: 'utf8',
  input: JSON.stringify({ hook_event_name: 'SessionStart', session_id: 's-next', cwd: PROJ }) });
const ctx = (() => { try { return JSON.parse(out.trim().split('\n')[0]).hookSpecificOutput.additionalContext; } catch { return ''; } })();
check('a new session in that project gets Lax\'s brief', /pixel-art game/.test(ctx) && /short answers/.test(ctx));

// The fence: while reflecting, only the mind.
const fence = (tool, input) => { const o = execFileSync(process.execPath, [path.join(ROOT, 'hooks', 'lax-hook.mjs')], { env: { ...ENV, LAX_REFLECT: '1' }, encoding: 'utf8',
  input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input }) }); return /"allow"/.test(o) ? 'allow' : /"deny"/.test(o) ? 'deny' : 'none'; };
check('reflecting: may edit its mind', fence('Edit', { file_path: path.join(MIND, 'projects', 'x.md') }) === 'allow');
check('reflecting: no shell', fence('Bash', { command: 'ls' }) === 'deny');
check('reflecting: no reading outside its mind', fence('Read', { file_path: path.join(ROOT, 'server.mjs') }) === 'deny');
check('reflecting: no secrets', fence('Read', { file_path: path.join(HOME, 'secrets', 'token') }) === 'deny');

// Talking to Lax: its mind's history says what changed, not what was said (speech can be mis-heard).
process.env.LAX_HOME = HOME; const { describeMindDiff } = await import('../lib/home.mjs');
const hunk = (lines) => `--- a/projects/lax.md\n+++ b/projects/lax.md\n@@ -21 +20,0 @@\n${lines}`;
check('mind history: "forget that" reads as forgot', describeMindDiff(hunk('-- Landscape layout: bubbles above Lax on the left half, like portrait.')) === 'forgot: Landscape layout: bubbles above Lax on the left half, like portrait.');
check('mind history: a new note reads as noted', describeMindDiff(hunk('+- 2026-10-06: Prefers tea.')) === 'noted: Prefers tea.');
check('mind history: an edited note reads as changed', describeMindDiff(hunk('-- Likes coffee.\n+- Likes tea.')) === 'changed: Likes tea.');
check('mind history: no change, no message', describeMindDiff('') === '');
{ // "Forget that" reaches the learning record, also when the assistant committed the forget itself.
  const { mindHead, forgotSince, commitMind } = await import('../lib/home.mjs');
  const head = mindHead(), f = path.join(MIND, 'projects', 'forget-test.md');
  const commit = (m) => execFileSync('git', ['-C', MIND, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', m]);
  fs.writeFileSync(f, '- Old timer plan.\n- Likes tea.\n'); commitMind('noted: two things');
  fs.writeFileSync(f, '- Likes tea.\n'); commit('forgot the old timer plan: it is scheduling, done');
  fs.writeFileSync(f, ''); commitMind();
  fs.rmSync(f); commitMind('forgot role: research');
  check('forgets since a point: its own commit and ours, not a role\'s', JSON.stringify(forgotSince(head)) === JSON.stringify(['the old timer plan: it is scheduling, done', 'Likes tea.']));
  check('forgets: none without a starting point', forgotSince('').length === 0);
}

// Phase 5b: across projects, and how it learns.
check('learning.md knows where and when, connections, and its record', /## Across projects/.test(fs.readFileSync(path.join(MIND, 'learning.md'), 'utf8')));
check('CLAUDE.md: "what do you know about me?"', /What do you know about me\?/.test(fs.readFileSync(path.join(MIND, 'CLAUDE.md'), 'utf8')));
const OTHER = path.join(HOME, 'cv'); fs.mkdirSync(OTHER);
const before = learnedBubbles().length;
await hook({ hook_event_name: 'SessionStart', session_id: 's-cv', cwd: OTHER });
for (const p of ['tighten the summary', 'add the Cloudflare role']) await hook({ hook_event_name: 'UserPromptSubmit', session_id: 's-cv', cwd: OTHER, prompt: p });
await hook({ hook_event_name: 'Stop', session_id: 's-cv', cwd: OTHER, last_assistant_message: 'Done.' });
for (let i = 0; i < 40 && learnedBubbles().length === before; i++) await sleep(150);
const cvPrompt = fs.readFileSync(path.join(HOME, 'last-prompt.txt'), 'utf8');
check('a reflection lists the other projects it knows, to connect them', /Other projects you know[\s\S]*- demo-proj: .*pixel-art game/.test(cvPrompt));
// Its learning record: a proposal corrected twice the same way, then the weekly review reads it.
await post('/api/channel/event', { type: 'gap', asked: 'rotate the tunnel token', why: 'no access', cwd: PROJ }); // refused → recorded
const learnedBefore = learnedBubbles().length;
check('the weekly review can run now (local)', (await post('/api/brain/review', {})).ok === true);
for (let i = 0; i < 40 && learnedBubbles().length === learnedBefore; i++) await sleep(150);
const rev = fs.readFileSync(path.join(HOME, 'review-prompt.txt'), 'utf8');
check('the weekly review rereads self.md, and knows its roles', /reread self\.md/.test(rev) && /Roles drafted, waiting for the user's yes: gamedev/.test(rev));
check('the weekly review gets its learning record', /<record>[\s\S]*refused: rotate the tunnel token/.test(rev), rev.slice(-200));
check('…may change how it drafts wishes, and says so', /proposals ask where it runs first/.test(learnedBubbles().pop()?.d.details || '') && /Ask where it runs/.test(fs.readFileSync(path.join(MIND, 'wishing.md'), 'utf8')));
check('…and a fix that needs code becomes a wish', phone.some((e) => e.ev === 'feed' && /> wish: learn to check where a wish runs/.test(e.d.line)));
{ const { commitMind } = await import('../lib/home.mjs');
  const md = path.join(MIND, 'CLAUDE.md'); fs.writeFileSync(md, fs.readFileSync(md, 'utf8').replace(/^- Prefers short answers.*\n/m, ''));
  check('"forget that" commits as forgot (what the record keeps)', /^forgot: Prefers short answers/.test(commitMind())); }

console.log(failed ? `\n${failed} check(s) failed` : '\nall brain checks passed');
process.exit(failed ? 1 : 0);
