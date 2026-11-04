// Lax improves itself (lib/improve.mjs, Phase 8), end to end with a fake Claude on a throwaway body: friction noted
// ("Lax, that was annoying", a voice run that failed) → the night: one fix drafted read-only from it, built on a branch
// through the wish flow (fenced, tested), never pushed, no issue or PR → told in the morning with what it saw → "no"
// throws it away and it isn't proposed again → the next night's fix → "merge it" → merged as "Lax improves: …".
// Runs a PRIVATE Lax (own port + temp home) on a temp git repo, so your real Lax and its body never see any of it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { freePort } from './free-port.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = await freePort(), LAX = `http://127.0.0.1:${PORT}`, HOME = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lax-improve-')));
const BODY = path.join(HOME, 'body'), ORIGIN = path.join(HOME, 'origin.git');
const GIT_ENV = { GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null' };
const sh = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', env: { ...process.env, ...GIT_ENV }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (f, t, mode) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t, mode && { mode }); };
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) { const v = fn(); if (v) return v; } return fn(); };

process.env.LAX_HOME = HOME; delete process.env.LAX_DATA;
const { ANNOYED, unheard } = await import('../lib/improve.mjs');
{
  const cli = { where: 'cli', pid: 42 }, chans = [{ sessionPid: 7 }];
  check('a terminal session with no `lax` channel is unheard', unheard(cli, chans, false));
  check('…not once its channel came (same pid), nor Lax\'s own, nor a non-terminal or pid-less one',
    !unheard(cli, [...chans, { sessionPid: 42 }], false) && !unheard(cli, chans, true)
    && !unheard({ where: 'app', pid: 42 }, chans, false) && !unheard({ where: 'cli' }, chans, false));
}
check('"Lax, that was annoying" / "that\'s so slow" / "isso foi irritante" are friction',
  ['Lax, that was annoying', "that's so slow.", 'you are really useless', 'isso foi mesmo irritante', 'estás muito lenta'].every((t) => ANNOYED.test(t)));
check('…"that was an annoying bug, fix it" or "is it slow?" are not', !['fix that annoying bug', 'is it slow?', 'the build is broken, look'].some((t) => ANNOYED.test(t)));

// A throwaway body with a passing test, the after-merge script, and an "origin" that must never see a self-fix.
write(path.join(BODY, 'package.json'), JSON.stringify({ name: 'body', type: 'module', scripts: { test: 'node scripts/test-ok.mjs' } }, null, 2) + '\n');
write(path.join(BODY, 'scripts', 'test-ok.mjs'), 'console.log("ok");\n');
write(path.join(BODY, 'scripts', 'after-merge.mjs'), fs.readFileSync(path.join(ROOT, 'scripts', 'after-merge.mjs'), 'utf8').replace("'../lib/paths.mjs'", JSON.stringify(path.join(ROOT, 'lib', 'paths.mjs'))).replace("'../lib/upstream.mjs'", JSON.stringify(path.join(ROOT, 'lib', 'upstream.mjs'))).replace("'../lib/service.mjs'", JSON.stringify(path.join(ROOT, 'lib', 'service.mjs'))));
execFileSync('git', ['init', '-q', '--bare', '-b', 'main', ORIGIN]);
sh(HOME, 'init', '-q', '-b', 'main', BODY); sh(BODY, 'add', '-A'); sh(BODY, 'commit', '-qm', 'body'); sh(BODY, 'remote', 'add', 'origin', ORIGIN); sh(BODY, 'push', '-q', 'origin', 'main');
const GH = path.join(HOME, 'fake-gh.mjs');
write(GH, `#!${process.execPath}\nimport fs from 'node:fs'; fs.appendFileSync(${JSON.stringify(path.join(HOME, 'gh.log'))}, JSON.stringify(process.argv.slice(2)) + '\\n');\n`, 0o755);

// A fake claude: a voice run that fails, tonight's fix (another one once the first was declined), and the build.
const FAKE = path.join(HOME, 'fake-claude.mjs');
write(FAKE, `#!${process.execPath}
import fs from 'node:fs'; import { execFileSync } from 'node:child_process';
const prompt = process.argv[process.argv.indexOf('-p') + 1] || '';
fs.appendFileSync(${JSON.stringify(path.join(HOME, 'prompts.log'))}, JSON.stringify({ env: { build: process.env.LAX_BUILD || '', draft: process.env.LAX_DRAFT || '' }, prompt }) + '\\n');
const answer = (o) => console.log(JSON.stringify({ result: 'Done.\\n' + JSON.stringify(o) }));
if (prompt.startsWith('[Context now')) console.log(JSON.stringify({ type: 'result', result: 'boom: overloaded', is_error: true }));
else if (prompt.startsWith('Tonight you improve yourself')) {
  if (/Louder asks \\(you said no\\)/.test(prompt)) answer({ fix: { saw: 'You said I was annoying after a long answer.', title: 'Shorter answers', slug: 'shorter-answers', proposal: '**What I saw**: long answers.' } });
  else answer({ fix: { saw: 'Two approvals were answered at the terminal.', title: 'Louder asks', slug: 'louder-asks', proposal: '**What I saw**: approvals missed on the phone.' } });
} else if (prompt.startsWith('You are Lax, learning')) {
  fs.writeFileSync('scripts/test-fix.mjs', 'console.log("fix ok");\\n');
  const p = JSON.parse(fs.readFileSync('package.json', 'utf8')); p.scripts.test += ' && node scripts/test-fix.mjs';
  fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\\n');
  execFileSync('git', ['add', '-A']); execFileSync('git', ['commit', '-qm', 'fix']);
  answer({ built: 'I now ask with a sound when the phone is closed.', try: 'Let a session ask for something.' });
} else answer({});
`, 0o755);
const prompts = () => fs.readFileSync(path.join(HOME, 'prompts.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

const ENV = { ...process.env, ...GIT_ENV, LAX_HOME: HOME, LAX_PORT: String(PORT), LAX_URL: LAX, LAX_PUBLIC_URL: '', LAX_CLAUDE: FAKE, LAX_GH: GH,
  LAX_BODY: BODY, LAX_RESTART: 'true', LAX_HEALTH_WAIT: '2', LAX_WISH_TICK: '1', LAX_MORNING_HOUR: '0', LAX_MIGRATE_AFTER: '9999' };
delete ENV.LAX_DATA;
const server = spawn(process.execPath, ['--no-warnings', path.join(ROOT, 'server.mjs')], { env: ENV, stdio: 'ignore' });
process.on('exit', () => { server.kill(); fs.rmSync(HOME, { recursive: true, force: true }); });
for (let i = 0; i < 50 && !fs.existsSync(path.join(HOME, 'secrets', 'token')); i++) await sleep(100);
for (let i = 0; i < 50; i++) { try { await fetch(LAX + '/'); break; } catch { await sleep(100); } } // then until it answers
const TOKEN = fs.readFileSync(path.join(HOME, 'secrets', 'token'), 'utf8').trim();
const post = (p, b) => fetch(LAX + p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-lax-token': TOKEN }, body: JSON.stringify(b) }).then((r) => r.json());
const phone = [];
(async () => {
  const res = await fetch(`${LAX}/api/stream?t=${TOKEN}`); let buf = '';
  for await (const c of res.body) { buf += Buffer.from(c).toString(); let i;
    while ((i = buf.indexOf('\n\n')) >= 0) { const blk = buf.slice(0, i); buf = buf.slice(i + 2);
      const ev = /^event: (.*)$/m.exec(blk)?.[1], d = /^data: (.*)$/m.exec(blk)?.[1]; if (ev && d) phone.push({ ev, d: JSON.parse(d) }); } }
})();
await sleep(300);
const bubbles = (from = 0) => phone.slice(from).filter((e) => e.ev === 'bubble').map((e) => e.d);
const said = (from, re) => bubbles(from).find((b) => b.kind !== 'question' && re.test(b.text));
const question = (from) => bubbles(from).find((b) => b.kind === 'question' && b.questions[0].header === 'ready');
const talk = async (text) => { const from = phone.length; await post('/api/talk', { text }); return from; };
const friction = () => { try { return JSON.parse(fs.readFileSync(path.join(HOME, 'friction.json'), 'utf8')).items; } catch { return []; } };
const wishes = () => { try { return JSON.parse(fs.readFileSync(path.join(HOME, 'wishes.json'), 'utf8')).wishes; } catch { return []; } };
const wish = (title) => wishes().find((w) => w.title === title);

// Friction.
check('nothing to fix on a night without friction', (await post('/api/improve/night', {})).ok === false && !fs.existsSync(path.join(HOME, 'prompts.log')));
let from = await talk('Lax, that was annoying');
check('"Lax, that was annoying" → noted, and said so', !!(await until(() => said(from, /noted it, and I'll look at it tonight/))) && friction().some((f) => f.kind === 'you said' && /that was annoying/.test(f.text)));
await talk('what time is it?');
check('a voice run that failed → noted', !!(await until(() => friction().find((f) => f.kind === 'voice failed' && /overloaded/.test(f.text)))), JSON.stringify(friction()));

// The night: a fix, drafted read-only, built on a branch, nothing leaves the Mac.
await post('/api/improve/night', {});
const draft = prompts().find((p) => p.prompt.startsWith('Tonight you improve yourself'));
check('the night drafts one fix from the friction, fenced read-only in its body', draft?.env.build === BODY && draft.env.draft === '1'
  && /1 you said, 1 voice failed/.test(draft.prompt) && /that was annoying/.test(draft.prompt), draft?.prompt.slice(0, 120));
const w = await until(() => wish('Louder asks')?.status === 'review' && wish('Louder asks'), 20000);
check('…built on its own branch through the wish flow', !!w && w.self && sh(BODY, 'branch', '--list', 'lax/learn-louder-asks') !== '', `${wish('Louder asks')?.status} ${wish('Louder asks')?.failed || ''}`);
check('…no issue, no pull request, nothing pushed', !fs.existsSync(path.join(HOME, 'gh.log')) && sh(ORIGIN, 'branch', '--list', 'lax/learn-louder-asks') === '');

// The morning: told what it saw and what it changed.
const q = await until(() => question(0));
check('in the morning: what it saw, what it changed, merge it?', /^Last night I noticed two approvals were answered at the terminal\. I now ask with a sound when the phone is closed\. Merge it\?$/.test(q?.text || '')
  && /not pushed/.test(q?.details || '') && q.questions[0].options.map((o) => o.label).join() === 'Merge it,No,Not yet', q?.text);
from = await talk('no');
await until(() => said(from, /threw it away/));
check('"no" → thrown away: declined, its branch gone', wish('Louder asks')?.status === 'declined' && !!(await until(() => sh(BODY, 'branch', '--list', 'lax/learn-louder-asks') === '')));

// The next night: what was declined isn't proposed again; "merge it" merges.
await talk('you are so slow');
await post('/api/improve/night', {});
const second = prompts().filter((p) => p.prompt.startsWith('Tonight you improve yourself')).pop();
check('the next night knows what you said no to, and only sees new friction', /Louder asks \(you said no\)/.test(second.prompt) && /1 you said\)/.test(second.prompt), second.prompt.split('\n').find((l) => l.startsWith('Friction since')));
const q2 = await until(() => wish('Shorter answers')?.status === 'review' && question(from), 20000);
check('…another fix, told the same way', /^Last night I noticed you said I was annoying after a long answer\./.test(q2?.text || ''), q2?.text);
from = await talk('merge it');
await until(() => said(from, /Merging Shorter answers/));
check('"merge it" → merged into main as "Lax improves"', /Lax improves: Shorter answers/.test(sh(BODY, 'log', '-1', '--format=%s')));

// A night whose run fails (the Mac slept mid-run and woke offline, 2026-10-15) doesn't count: its friction is kept and
// it tries again later that night, at most 3 times, and not while offline.
{
  const { createImprove, NIGHT_HOUR } = await import('../lib/improve.mjs');
  const FLAKY = path.join(HOME, 'flaky-claude.mjs'), RUNS = path.join(HOME, 'flaky-runs');
  write(FLAKY, `#!${process.execPath}
import fs from 'node:fs'; const n = (fs.existsSync(${JSON.stringify(RUNS)}) ? fs.readFileSync(${JSON.stringify(RUNS)}, 'utf8').length : 0) + 1;
fs.writeFileSync(${JSON.stringify(RUNS)}, 'x'.repeat(n));
if (n === 1) { console.error('getaddrinfo ENOTFOUND api.anthropic.com'); process.exit(1); }
console.log(JSON.stringify({ result: 'Looked.\\n' + JSON.stringify({ fix: { none: 'it fell back to the terminal, nothing lost' } }) }));
`, 0o755);
  const night = new Date(); night.setHours(NIGHT_HOUR, 5, 0, 0);
  let t = night.getTime(), up = false; const feed = [], logs = [];
  fs.writeFileSync(path.join(HOME, 'friction.json'), JSON.stringify({ items: [{ ts: t - 3600e3, kind: 'unanswered', text: 'a question' }], lastNight: 0 }));
  const imp = createImprove({ settings: () => ({ name: 'Lax', learns: true }), feed: (l) => feed.push(l), learn: { wishes: () => [] },
    body: BODY, claude: FLAKY, log: (...a) => logs.push(a.join(' ')), now: () => t, online: async () => up });
  const runs = () => (fs.existsSync(RUNS) ? fs.readFileSync(RUNS, 'utf8').length : 0);
  await imp.night();
  check('offline at night → no run, and the night is still to do', runs() === 0 && /offline/.test(logs.at(-1)), logs.at(-1));
  up = true; await imp.night();
  check('the run fails → logged as try 1 of 3, its friction kept', runs() === 1 && /try 1 of 3/.test(logs.at(-1)), logs.at(-1));
  t += 10 * 60e3; await imp.night();
  check('…not tried again 10 minutes later', runs() === 1);
  t += 25 * 60e3; await imp.night();
  check('…tried again half an hour on, with the same friction → this time it answers', runs() === 2 && feed.some((l) => /looked at 1 friction, nothing to fix/.test(l)), feed.at(-1));
  t += 60 * 60e3; await imp.night();
  check('…and then the night is done', runs() === 2);
}

// A night the Mac was off: caught up later that day, once nobody has used it for a while.
{
  const { createImprove, NIGHT_HOUR } = await import('../lib/improve.mjs');
  const CALM = path.join(HOME, 'calm-claude.mjs'), RUNS = path.join(HOME, 'calm-runs');
  write(CALM, `#!${process.execPath}
import fs from 'node:fs'; fs.appendFileSync(${JSON.stringify(RUNS)}, 'x');
console.log(JSON.stringify({ result: 'Looked.\\n' + JSON.stringify({ fix: { saw: 'A question went unanswered.', title: 'Ask again', slug: 'ask-again', proposal: 'x' } }) }));
`, 0o755);
  const day = new Date(); day.setHours(NIGHT_HOUR + 10, 0, 0, 0);
  let t = day.getTime(), idle = false; const fixes = [];
  fs.writeFileSync(path.join(HOME, 'friction.json'), JSON.stringify({ items: [{ ts: t - 20 * 3600e3, kind: 'unanswered', text: 'a question' }], lastNight: t - 36 * 3600e3 }));
  const imp = createImprove({ settings: () => ({ name: 'Lax', learns: true }), feed: () => {}, learn: { wishes: () => [], selfFix: (f) => fixes.push(f) },
    body: BODY, claude: CALM, now: () => t, online: async () => true, idle: () => idle });
  const runs = () => (fs.existsSync(RUNS) ? fs.readFileSync(RUNS, 'utf8').length : 0);
  await imp.night();
  check('the night was missed, but you\'re using the Mac → it waits', runs() === 0);
  idle = true; await imp.night();
  check('…left idle → it catches up on the night, and its fix is told as "earlier", not "last night"', runs() === 1 && fixes[0]?.caughtUp === true, JSON.stringify(fixes));
  t += 60 * 60e3; await imp.night();
  check('…once a day, still', runs() === 1);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall good');
process.exit(failed ? 1 : 0);
