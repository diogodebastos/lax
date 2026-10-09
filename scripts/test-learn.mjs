// Lax learns what it couldn't do (lib/learn.mjs), end to end with a fake Claude and a fake gh, on a throwaway body:
// a gap (lax channel `gap` tool) → a wish → the same ask in other words → the same wish → "any wishes?" → no / a correction /
// later / yes → an issue, a build on lax/learn-<slug>, the guardrails and the tests, a pushed branch, a pull request →
// "merge it" → merged, restarted, and rolled back when it doesn't come back healthy. Plus the guardrails and the build fence.
// Runs a PRIVATE Lax (own port + temp home) on a temp git repo, so your real Lax and its body never see any of it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = 7795, LAX = `http://127.0.0.1:${PORT}`, HOME = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lax-learn-')));
const BODY = path.join(HOME, 'body'), ORIGIN = path.join(HOME, 'origin.git'), PROJ = path.join(HOME, 'edge-cava');
const GIT_ENV = { GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null' };
const sh = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', env: { ...process.env, ...GIT_ENV }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (f, t, mode) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t, mode && { mode }); };

// A throwaway body: a tiny repo with a passing test, the after-merge script, and an "origin" to push to.
fs.mkdirSync(PROJ);
write(path.join(BODY, 'package.json'), JSON.stringify({ name: 'body', type: 'module', scripts: { test: 'node scripts/test-ok.mjs' } }, null, 2) + '\n');
write(path.join(BODY, 'scripts', 'test-ok.mjs'), 'console.log("ok");\n');
write(path.join(BODY, 'lib', 'auth.mjs'), 'export const TOKEN = 1;\n');
write(path.join(BODY, 'scripts', 'after-merge.mjs'), fs.readFileSync(path.join(ROOT, 'scripts', 'after-merge.mjs'), 'utf8').replace("'../lib/paths.mjs'", JSON.stringify(path.join(ROOT, 'lib', 'paths.mjs'))));
execFileSync('git', ['init', '-q', '--bare', '-b', 'main', ORIGIN]);
sh(HOME, 'init', '-q', '-b', 'main', BODY); sh(BODY, 'add', '-A'); sh(BODY, 'commit', '-qm', 'body'); sh(BODY, 'remote', 'add', 'origin', ORIGIN); sh(BODY, 'push', '-q', 'origin', 'main');

// A fake gh: records what it's asked, answers with URLs.
const GH = path.join(HOME, 'fake-gh.mjs');
write(GH, `#!${process.execPath}
import fs from 'node:fs';
fs.appendFileSync(${JSON.stringify(path.join(HOME, 'gh.log'))}, JSON.stringify(process.argv.slice(2)) + '\\n');
const [a, b] = process.argv.slice(2);
if (a === 'issue' && b === 'create') console.log('https://github.com/me/lax/issues/42');
if (a === 'pr' && b === 'create') console.log('https://github.com/me/lax/pull/43');
`, 0o755);

// A fake claude: drafts wishes (the same one for a countdown), revises with a correction, and builds a timer on the branch.
const FAKE = path.join(HOME, 'fake-claude.mjs');
write(FAKE, `#!${process.execPath}
import fs from 'node:fs'; import { execFileSync } from 'node:child_process';
const prompt = process.argv[process.argv.indexOf('-p') + 1] || '';
fs.appendFileSync(${JSON.stringify(path.join(HOME, 'prompts.log'))}, JSON.stringify({ env: { build: process.env.LAX_BUILD || '', draft: process.env.LAX_DRAFT || '' }, prompt }) + '\\n');
const answer = (o) => console.log(JSON.stringify({ result: 'Done.\\n' + JSON.stringify(o) }));
if (prompt.startsWith('Draft a wish')) {
  const ask = (prompt.split('The new ask:')[1] || '') + (prompt.split('The user said:')[1] || '');
  const timer = (prompt.match(/- (w\\w+) \\[\\w+\\] Timers/) || [])[1];
  if (/Revise wish/.test(prompt)) answer({ wish: { title: 'Timers', say: 'I can set timers on your Mac. Want me to?', proposal: 'Revised: ' + ask.trim() } });
  else if (/countdown/.test(ask) && timer) answer({ wish: { same_as: timer } });
  else if (/music/.test(ask)) answer({ wish: { title: 'Music', slug: 'music', say: 'I could play music. Want me to?', proposal: 'Play music.' } });
  else answer({ wish: { title: 'Timers', slug: 'timers', say: 'You asked me for a timer today. I can learn it. Want me to?', proposal: '**What I would do**: timers on the phone. **Off limits**: auth, tokens, the tunnel.' } });
} else if (prompt.startsWith('You are Lax, learning')) {
  fs.mkdirSync('scripts', { recursive: true });
  fs.writeFileSync('scripts/test-timer.mjs', 'console.log("timer ok");\\n');
  const p = JSON.parse(fs.readFileSync('package.json', 'utf8')); p.scripts.test += ' && node scripts/test-timer.mjs';
  fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\\n');
  execFileSync('git', ['add', '-A']); execFileSync('git', ['commit', '-qm', 'Lax can set timers']);
  answer({ built: 'I can set timers.', try: 'Say: set a timer for 5 minutes.' });
} else answer({});
`, 0o755);

const ENV = { ...process.env, ...GIT_ENV, LAX_HOME: HOME, LAX_PORT: String(PORT), LAX_URL: LAX, LAX_PUBLIC_URL: '', LAX_CLAUDE: FAKE, LAX_GH: GH,
  LAX_BODY: BODY, LAX_RESTART: 'true', LAX_HEALTH_WAIT: '2' };
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
const until = async (fn, ms = 6000) => { for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) { const v = fn(); if (v) return v; } return fn(); };

const phone = [];
(async () => {
  const res = await fetch(`${LAX}/api/stream?t=${TOKEN}`); let buf = '';
  for await (const c of res.body) { buf += Buffer.from(c).toString(); let i;
    while ((i = buf.indexOf('\n\n')) >= 0) { const blk = buf.slice(0, i); buf = buf.slice(i + 2);
      const ev = /^event: (.*)$/m.exec(blk)?.[1], d = /^data: (.*)$/m.exec(blk)?.[1]; if (ev && d) phone.push({ ev, d: JSON.parse(d) }); } }
})();
const wishes = () => { try { return JSON.parse(fs.readFileSync(path.join(HOME, 'wishes.json'), 'utf8')).wishes; } catch { return []; } };
const wish = (title) => wishes().find((w) => w.title === title);
const bubbles = (from = 0) => phone.slice(from).filter((e) => e.ev === 'bubble').map((e) => e.d);
const question = (from, header) => bubbles(from).find((b) => b.kind === 'question' && b.questions[0].header === header);
const said = (from, re) => bubbles(from).find((b) => b.kind !== 'question' && re.test(b.text));
const talk = async (text) => { const from = phone.length; await post('/api/talk', { text }); return from; };

// The `gap` tool: only where Lax hears you.
const tools = async (env) => {
  const c = new Client({ name: 'fake-claude-code', version: '0' }, { capabilities: {} });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(ROOT, 'channel', 'lax-channel.mjs')], cwd: PROJ, stderr: 'ignore', env: { ...ENV, ...env } }));
  return c;
};
const dormant = await tools({ LAX_CHANNEL_FORCE: '0' });
check('a session that doesn\'t hear Lax has no `gap` (only `recall`, Phase 6)', JSON.stringify((await dormant.listTools()).tools.map((t) => t.name)) === '["recall"]');
await dormant.close();
const voice = await tools({ LAX_CHANNEL_FORCE: '0', LAX_VOICE: '1' });
check('Lax\'s own assistant gets only `gap`', JSON.stringify((await voice.listTools()).tools.map((t) => t.name)) === '["gap"]');
const live = await tools({ LAX_CHANNEL_FORCE: '1' });
check('a live session gets `gap` next to reply and share', (await live.listTools()).tools.some((t) => t.name === 'gap'));

// Notice + remember.
await live.callTool({ name: 'gap', arguments: { asked: 'play some music', why: 'no audio access' } });
await until(() => wish('Music'));
await live.callTool({ name: 'gap', arguments: { asked: 'set a timer for 5 minutes', why: 'no timer tool' } });
const t1 = await until(() => wish('Timers'));
check('an "I can\'t" becomes a wish, with a drafted proposal', t1?.status === 'new' && /What I would do/.test(t1?.proposal || ''), t1?.status);
check('…which knows where it was asked', t1?.asks[0].project === 'edge-cava');
const drafts = fs.readFileSync(path.join(HOME, 'prompts.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
check('drafting reads its body but is fenced read-only', drafts[0].env.build === BODY && drafts[0].env.draft === '1');
await voice.callTool({ name: 'gap', arguments: { asked: 'start a countdown', why: 'can\'t' } });
const t2 = await until(() => wish('Timers')?.count === 2 && wish('Timers'));
check('the same ask in other words → the same wish, count 2', t2?.count === 2 && wishes().length === 2, `${wishes().length} wishes`);
await live.callTool({ name: 'gap', arguments: { asked: 'rotate the tunnel token', why: 'no access' } });
const bad = await until(() => wishes().find((w) => /tunnel/.test(w.title)));
check('a wish about the tunnel or tokens is declined, with why', bad?.status === 'declined' && /never change by myself/.test(bad?.why || ''), bad?.why);
await voice.close(); await live.close();

// Ask by voice: no.
let from = await talk('any wishes?');
let q = await until(() => question(from, 'wish'));
check('"any wishes?" → a wish question, read aloud', /play music/.test(q?.text || '') && q?.speak, q?.text);
from = await talk('no');
await until(() => said(from, /won't offer/));
check('"no" → declined', wish('Music')?.status === 'declined');

// A correction, then later, then yes.
from = await talk('any wishes?');
q = await until(() => question(from, 'wish'));
check('the next wish is offered, with its proposal to read', /timer/.test(q?.text || '') && /What I would do/.test(q?.details || ''), q?.text);
from = await talk('on the Mac, not the phone');
q = await until(() => question(from, 'wish'));
check('a correction → the proposal is redrafted with it, and asked again', /Revised: "on the Mac, not the phone"/.test(q?.details || ''), q?.details);
{ const { DatabaseSync } = await import('node:sqlite'); const db = new DatabaseSync(path.join(HOME, 'life.db'), { readOnly: true });
  const rec = db.prepare("SELECT text FROM events WHERE kind='learning'").all().map((r) => r.text).join('\n'); db.close();
  check('its learning record keeps the no, the refusal and the correction', /declined: Music/.test(rec) && /refused: rotate the tunnel token/.test(rec) && /corrected: Timers: on the Mac, not the phone/.test(rec), rec); }
from = await talk('later');
await until(() => said(from, /tomorrow/));
check('"later" → asked again another time', wish('Timers')?.status === 'later' && wish('Timers').laterUntil > Date.now() + 3600e3);
from = await talk('any wishes?');
await until(() => question(from, 'wish'));
from = await talk('yes');
q = await until(() => question(from, 'ready'), 20000);
const w = wish('Timers');
check('"yes" → built, checked, and "ready, merge it?"', w?.status === 'review' && /ready to try/.test(q?.text || ''), w?.status + ' ' + (w?.failed || ''));
const gh = fs.readFileSync(path.join(HOME, 'gh.log'), 'utf8');
check('…an issue labelled lax-learns', /"issue","create","--title","Lax learns: Timers","--label","lax-learns"/.test(gh));
check('…a pull request that closes it', /"pr","create".*Closes https:\/\/github.com\/me\/lax\/issues\/42/.test(gh));
check('…the branch is pushed, main is not', sh(ORIGIN, 'branch', '--list', 'lax/learn-timers') !== '' && sh(ORIGIN, 'rev-parse', 'main') === sh(BODY, 'rev-parse', 'main'));
const build = fs.readFileSync(path.join(HOME, 'prompts.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).find((p) => p.prompt.startsWith('You are Lax, learning'));
check('…built in its own worktree, fenced', build?.env.build === path.join(HOME, 'lax-wt-learn-timers'));
check('the ready question says what changed and how to try it', /I can set timers/.test(q?.text || '') && /set a timer for 5/.test(q?.details || ''));
from = await talk('not yet');
await sleep(300);
check('"not yet" → it waits for "merge it"', wish('Timers')?.status === 'review');

// "merge it" → merged on main, restarted… and since this Lax doesn't really restart, it isn't healthy: rolled back.
const before = sh(BODY, 'rev-parse', 'main');
from = await talk('merge it');
await until(() => said(from, /Merging Timers/));
check('"merge it" → merged into main', /Lax learns: Timers/.test(sh(BODY, 'log', '-1', '--format=%s')));
await until(() => sh(BODY, 'rev-parse', 'main') === before, 12000);
check('not healthy after the restart → main is put back', sh(BODY, 'rev-parse', 'main') === before);
check('…and nothing was pushed to main', sh(ORIGIN, 'rev-parse', 'main') === before);
check('…and it says so in its log', /rolled back/.test(fs.readFileSync(path.join(HOME, 'logs', 'merge.log'), 'utf8')));

// after-merge on its own: a healthy restart pushes main and tells Lax.
{
  sh(BODY, 'commit', '-q', '--allow-empty', '-m', 'merged thing');
  const told = [];
  const fakeLax = http.createServer((req, res) => {
    let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
      if (req.url === '/api/learn/merged') told.push(JSON.parse(b));
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, started: Date.now() }));
    });
  }).listen(7794);
  await new Promise((r) => spawn(process.execPath, [path.join(BODY, 'scripts', 'after-merge.mjs'), BODY, before, 'w1'], { env: { ...ENV, LAX_URL: 'http://127.0.0.1:7794' }, stdio: 'ignore' }).on('close', r));
  fakeLax.close();
  check('healthy after the restart → main is pushed', sh(ORIGIN, 'rev-parse', 'main') === sh(BODY, 'rev-parse', 'main'));
  check('…and Lax hears it went well', told[0]?.id === 'w1' && told[0]?.ok === true, JSON.stringify(told));
}
const merged = await post('/api/learn/merged', { id: wish('Timers').id, ok: true });
check('"merged and healthy" → the wish is learned', merged.ok && wish('Timers').status === 'merged');

// The guardrails, on branches.
process.env.LAX_HOME = HOME; const { checkBranch, offLimits, packageOk, refuses } = await import('../lib/guard.mjs');
sh(BODY, 'checkout', '-q', '-b', 'lax/learn-evil');
fs.appendFileSync(path.join(BODY, 'lib', 'auth.mjs'), 'export const OPEN = true;\n'); sh(BODY, 'commit', '-qam', 'evil');
check('a branch that touches auth fails the guardrails', /lib\/auth\.mjs/.test(checkBranch(BODY, 'lax/learn-evil').why || ''));
sh(BODY, 'checkout', '-q', 'main');
check('off limits: hooks, guard, pairing', offLimits('hooks/lax-hook.mjs') && offLimits('lib/guard.mjs') && offLimits('android/app/src/main/java/x/PairActivity.kt') && !offLimits('lib/share.mjs'));
const pkg = (test, extra = {}) => JSON.stringify({ scripts: { test, start: 'node server.mjs', ...extra } });
check('package.json: adding a test is fine', packageOk(pkg('node a.mjs'), pkg('node a.mjs && node --no-warnings scripts/test-b.mjs')));
check('package.json: anything else is not', !packageOk(pkg('node a.mjs'), pkg('node a.mjs && curl x')) && !packageOk(pkg('node a.mjs'), pkg('node a.mjs', { postinstall: 'x' })));
check('refuses: tokens and the tunnel, not timers', !!refuses('show me the tunnel token') && !refuses('set a timer'));
check('refuses: not a model\'s tokens', !refuses('show my usage; a small token cost per message') && !!refuses('print the Lax token'));

// The build fence (hooks/lax-hook.mjs, LAX_BUILD).
const WT = path.join(HOME, 'wt'); sh(HOME, 'init', '-q', WT);
const fence = (tool, input, extra = {}) => { const o = execFileSync(process.execPath, [path.join(ROOT, 'hooks', 'lax-hook.mjs')], { env: { ...ENV, LAX_BUILD: WT, ...extra }, encoding: 'utf8',
  input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, cwd: WT }) }); return /"allow"/.test(o) ? 'allow' : /"deny"/.test(o) ? 'deny' : 'none'; };
check('building: may edit its worktree', fence('Edit', { file_path: path.join(WT, 'lib', 'timer.mjs') }) === 'allow');
check('building: not outside it', fence('Write', { file_path: path.join(BODY, 'lib', 'timer.mjs') }) === 'deny');
check('building: not what\'s off limits', fence('Edit', { file_path: path.join(WT, 'hooks', 'lax-hook.mjs') }) === 'deny');
check('building: runs the tests and commits', fence('Bash', { command: 'npm test' }) === 'allow' && fence('Bash', { command: 'git add -A && git commit -m "timers"' }) === 'allow');
check('building: never pushes', fence('Bash', { command: 'git push origin main' }) === 'deny');
check('building: never its secrets', fence('Read', { file_path: path.join(HOME, 'secrets', 'token') }) === 'deny');
check('drafting: reads, never writes', fence('Read', { file_path: path.join(WT, 'x') }, { LAX_DRAFT: '1' }) === 'allow' && fence('Edit', { file_path: path.join(WT, 'x') }, { LAX_DRAFT: '1' }) === 'deny');

const gapHook = execFileSync(process.execPath, [path.join(ROOT, 'hooks', 'lax-hook.mjs')], { env: ENV, encoding: 'utf8',
  input: JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 's-gap', tool_name: 'mcp__lax__gap', tool_input: { asked: 'x' }, cwd: PROJ }) });
check('calling `gap` never asks for permission', /"allow"/.test(gapHook));

console.log(failed ? `\n${failed} check(s) failed` : '\nall learn checks passed');
process.exit(failed ? 1 : 0);
