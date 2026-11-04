// Lax schedules (lib/schedule.mjs, Phase 7): when a job comes round (local time, weekdays, one-offs, reminders), the job
// fence (hooks/lax-hook.mjs LAX_JOB), and end to end on a PRIVATE Lax (own port + temp home) with a fake Claude: the
// `schedule` tool → "save it?" on the phone → yes (said) / no → saved → run now → a fresh run in its folder, fenced,
// with its notes → the answer spoken and in a log; a reminder only speaks; due jobs run on the tick, missed ones are skipped.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { freePort } from './free-port.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = await freePort(), LAX = `http://127.0.0.1:${PORT}`, HOME = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lax-schedule-')));
const PROJ = path.join(HOME, 'edge-cava');
fs.mkdirSync(PROJ);
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 6000) => { for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) { const v = fn(); if (v) return v; } return fn(); };

process.env.LAX_HOME = HOME; delete process.env.LAX_DATA;
const { parseWhen, nextRun, describeWhen, createSchedule, MISSED_MS } = await import('../lib/schedule.mjs');

// ---------- when ----------
const at = (s) => new Date(s).getTime(); // local time
const MON = at('2026-10-12T10:00'); // a Monday
check('weekdays at 8:30, on a Monday after 8:30 → Tuesday 8:30', nextRun(parseWhen({ time: '8:30', days: 'weekdays' }, MON), MON) === at('2026-10-13T08:30'));
check('…on a Friday evening → Monday', nextRun(parseWhen({ time: '08:30', days: 'weekdays' }), at('2026-10-16T20:00')) === at('2026-10-19T08:30'));
check('daily, later today → today', nextRun(parseWhen({ time: '18:00' }), MON) === at('2026-10-12T18:00'));
check('["mon","thu"] on a Monday at 10 → Thursday', nextRun(parseWhen({ time: '09:00', days: ['mon', 'thursday'] }), MON) === at('2026-10-15T09:00'));
check('once, a date → that time, then never', nextRun(parseWhen({ time: '09:00', date: '2026-10-14' }, MON), MON) === at('2026-10-14T09:00')
  && nextRun({ time: '09:00', date: '2026-10-14' }, at('2026-10-14T09:00')) === null);
check('in 20 minutes → a one-off 20 minutes from now', nextRun(parseWhen({ in_minutes: 20 }, MON), MON) === MON + 20 * 60e3);
check('a bad time, a past date, no days → why', !!parseWhen({ time: '25:00' }).error && !!parseWhen({ time: '09:00', date: '2026-10-11' }, MON).error
  && !!parseWhen({ time: '09:00', days: ['someday'] }).error);
check('said back plainly', describeWhen(parseWhen({ time: '08:30', days: 'weekdays' }), MON) === 'Every weekday at 8:30'
  && describeWhen({ time: '09:00', days: [1, 4] }) === 'Mondays and Thursdays at 9:00'
  && describeWhen({ time: '09:05', date: '2026-10-13' }, MON) === 'Tomorrow at 9:05' && describeWhen({ time: '14:20', date: '2026-10-12' }, MON) === 'At 14:20',
  describeWhen({ time: '09:00', days: [1, 4] }));

// ---------- the job fence ----------
const hook = (env, h) => { const o = execFileSync(process.execPath, [path.join(ROOT, 'hooks', 'lax-hook.mjs')],
  { env: { ...process.env, LAX_BUILD: '', LAX_URL: 'http://127.0.0.1:1', LAX_JOB: 'j1', LAX_JOB_DIR: PROJ, ...env }, encoding: 'utf8', input: JSON.stringify({ hook_event_name: 'PreToolUse', cwd: PROJ, ...h }) });
  return JSON.parse(o || '{}').hookSpecificOutput?.permissionDecision; };
fs.mkdirSync(path.join(HOME, 'secrets'), { recursive: true }); fs.writeFileSync(path.join(HOME, 'secrets', 'token'), 'x');
check('a job reads, searches and runs read-only commands', hook({}, { tool_name: 'Read', tool_input: { file_path: path.join(PROJ, 'a') } }) === 'allow'
  && hook({}, { tool_name: 'Bash', tool_input: { command: 'git log --oneline -5' } }) === 'allow' && hook({}, { tool_name: 'mcp__lax__recall', tool_input: {} }) === 'allow');
check('…the web only if you said so', hook({ LAX_JOB_TOOLS: 'read,web' }, { tool_name: 'WebFetch', tool_input: { url: 'x' } }) === 'allow'
  && hook({ LAX_JOB_TOOLS: 'read' }, { tool_name: 'WebFetch', tool_input: { url: 'x' } }) === 'deny');
check('…edits only in its folder, if you said so', hook({ LAX_JOB_TOOLS: 'read,edit' }, { tool_name: 'Edit', tool_input: { file_path: path.join(PROJ, 'notes.md') } }) === 'allow'
  && hook({ LAX_JOB_TOOLS: 'read,edit' }, { tool_name: 'Edit', tool_input: { file_path: path.join(HOME, 'other.md') } }) === 'deny'
  && hook({ LAX_JOB_TOOLS: 'read' }, { tool_name: 'Write', tool_input: { file_path: path.join(PROJ, 'notes.md') } }) === 'deny');
check('…anything else asks the phone (unreachable here: no)', hook({ LAX_JOB_TOOLS: 'read,web,edit,run' }, { tool_name: 'Bash', tool_input: { command: 'git push' } }) === 'deny');
check('the voice assistant calls `schedule` without asking (the tool asks "save it?" itself)', hook({ LAX_JOB: '', LAX_VOICE: '1' }, { tool_name: 'mcp__lax__schedule', tool_input: {} }) === 'allow');
check('…and never Lax\'s secrets', hook({}, { tool_name: 'Read', tool_input: { file_path: path.join(HOME, 'secrets', 'token') } }) === 'deny');

// ---------- the tick, with a clock and a fake Claude ----------
const FAKE = path.join(HOME, 'fake-claude.mjs');
fs.writeFileSync(FAKE, `#!${process.execPath}
import fs from 'node:fs';
const prompt = process.argv[process.argv.indexOf('-p') + 1] || '';
fs.appendFileSync(${JSON.stringify(path.join(HOME, 'runs.log'))}, JSON.stringify({ prompt, cwd: process.cwd(), job: process.env.LAX_JOB, tools: process.env.LAX_JOB_TOOLS, dir: process.env.LAX_JOB_DIR }) + '\\n');
console.log(JSON.stringify({ result: /fail/.test(prompt) ? '' : 'Two PRs are open. #31 waits for your review; #32 is a draft.', is_error: /fail/.test(prompt) }));
`, { mode: 0o755 });
const runsLog = () => { try { return fs.readFileSync(path.join(HOME, 'runs.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)); } catch { return []; } };
{
  let clock = MON; const out = [], pending = new Map();
  const s = createSchedule({ settings: () => ({ name: 'Lax' }), feed: (line) => out.push({ line }), diary: (t) => out.push({ line: '+ ' + t }),
    broadcast: (type, d) => out.push({ type, d }), pending, say: (t) => out.push({ say: t }), brief: () => 'NOTES ABOUT EDGE-CAVA',
    spoken: (t) => t.split('. ')[0] + '.', claude: FAKE, workdir: HOME, now: () => clock });
  const r = s.tool({ title: 'Brief you on open PRs', when: { time: '08:30', days: 'weekdays' }, prompt: 'List open PRs with gh.', cwd: PROJ });
  const q = out.find((o) => o.type === 'bubble' && o.d.kind === 'question');
  check('add → "save it?" on the phone, nothing saved yet', r.ok && /^Every weekday at 8:30, I'll brief you on open PRs, in edge-cava\. It may read and search the web; anything else asks you first\. Save it\?$/.test(q?.d.text)
    && s.jobs()[0].status === 'proposed', q?.d.text);
  check('…and the tool tells the assistant it waits for a yes', /saved only on their yes/.test(r.say));
  s.hears('yes please');
  const j = s.jobs()[0];
  check('yes → saved, next run Tuesday 8:30', j.status === 'on' && j.next === at('2026-10-13T08:30') && out.some((o) => /^Saved\. Every weekday at 8:30/.test(o.say || '')));
  clock = at('2026-10-13T08:30:20'); s.tick();
  await until(() => out.some((o) => o.type === 'bubble' && o.d.kind === 'reply'));
  const run = runsLog()[0] || {};
  check('due → a fresh run in its folder, fenced to its tools', run.cwd === fs.realpathSync(PROJ) && run.job === j.id && run.tools === 'read,web' && run.dir === PROJ, JSON.stringify(run).slice(0, 200));
  check('…with what it is, the time, its notes and recall', /doing a job the user scheduled: "Brief you on open PRs"/.test(run.prompt) && /NOTES ABOUT EDGE-CAVA/.test(run.prompt)
    && /`recall`/.test(run.prompt) && /List open PRs with gh\.$/.test(run.prompt));
  const said = out.find((o) => o.type === 'bubble' && o.d.kind === 'reply');
  check('…its answer spoken, short', said?.d.text === 'Brief you on open PRs: Two PRs are open.' && said.d.speak, said?.d.text);
  await until(() => s.jobs()[0].runs?.length);
  const log = s.jobs()[0].runs?.[0]?.log;
  check('…and kept in a run log', !!log && /#31 waits for your review/.test(fs.readFileSync(log, 'utf8')) && log.startsWith(path.join(HOME, 'runs', 'brief-you-on-open-prs')), log);
  check('…next run Wednesday', s.jobs()[0].next === at('2026-10-14T08:30'));
  clock = at('2026-10-15T09:00'); const before = runsLog().length; s.tick(); await sleep(300);
  check('a run missed by a night (the Mac asleep) is skipped, not run late', runsLog().length === before && out.some((o) => /skipped Brief you on open PRs/.test(o.line || ''))
    && s.jobs()[0].next === at('2026-10-16T08:30'));
  check('(missed means over 12 hours)', MISSED_MS === 12 * 3600e3);

  s.tool({ title: 'Call Rita', when: { in_minutes: 20 }, say: 'Time to call Rita.' });
  s.hears('no');
  check('no → not saved', s.jobs().length === 1 && out.some((o) => o.say === 'Okay, I didn\'t save it.'));
  s.tool({ title: 'Call Rita', when: { in_minutes: 20 }, say: 'Time to call Rita.' });
  check('a reminder asks with what it will say', /^At 9:20, I'll remind you: Time to call Rita\. Save it\?$/.test(out.filter((o) => o.type === 'bubble' && o.d.kind === 'question').pop()?.d.text));
  s.hears('yes');
  clock = at('2026-10-15T09:20'); const n = runsLog().length; s.tick();
  check('…and at its time only speaks: no run, then it\'s gone', out.some((o) => o.type === 'bubble' && o.d.text === 'Time to call Rita.' && o.d.speak) && runsLog().length === n
    && !s.jobs().some((x) => x.title === 'Call Rita'));
  check('list → what is scheduled, with ids', new RegExp(`${j.id}: Brief you on open PRs \\(Every weekday at 8:30, in ${PROJ}`).test(s.tool({ action: 'list' }).say));
  check('remove → gone', s.tool({ action: 'remove', id: j.id }).ok && !s.jobs().length && s.tool({ action: 'list' }).say === 'Nothing is scheduled.');
  check('nonsense is refused, with why', /time must be HH:MM/.test(s.tool({ title: 'x', when: { time: 'noon' }, prompt: 'x' }).say)
    && /needs a title/.test(s.tool({ when: { time: '09:00' } }).say) && /doesn't exist/.test(s.tool({ title: 'x', when: { time: '09:00' }, prompt: 'x', cwd: '/nope' }).say));
}

// ---------- end to end: the voice assistant's `schedule` tool, "yes" said on the phone, "run it now" ----------
fs.rmSync(path.join(HOME, 'jobs.json'), { force: true }); fs.rmSync(path.join(HOME, 'secrets'), { recursive: true, force: true });
const ENV = { ...process.env, LAX_HOME: HOME, LAX_PORT: String(PORT), LAX_URL: LAX, LAX_PUBLIC_URL: '', LAX_CLAUDE: FAKE, LAX_MIGRATE_AFTER: '9999' };
delete ENV.LAX_DATA; delete ENV.LAX_BUILD; // a build's fence on its own steps isn't the hook under test
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
const c = new Client({ name: 'fake-claude-code', version: '0' }, { capabilities: {} });
await c.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(ROOT, 'channel', 'lax-channel.mjs')], cwd: PROJ, stderr: 'ignore',
  env: { ...ENV, LAX_CHANNEL_FORCE: '0', LAX_VOICE: '1' } }));
const r = await c.callTool({ name: 'schedule', arguments: { title: 'Brief you on open PRs', when: { time: '08:30', days: 'weekdays' }, prompt: 'List open PRs.', cwd: PROJ } });
const bubble = await until(() => phone.find((e) => e.ev === 'bubble' && e.d.questions?.[0].header === 'schedule'));
check('the voice assistant\'s tool → "save it?" on the phone', !!bubble && /saved only on their yes/.test(r.content[0].text), r.content[0].text);
await post('/api/talk', { text: 'Yes.', voice: true });
const jobs = () => { try { return JSON.parse(fs.readFileSync(path.join(HOME, 'jobs.json'), 'utf8')).jobs; } catch { return []; } };
const saved = await until(() => jobs()[0]?.status === 'on' && phone.some((e) => e.ev === 'bubble' && /^Saved\./.test(e.d.text)));
check('"yes" said → saved', !!saved, phone.filter((e) => e.ev === 'bubble').map((e) => e.d.text).join(' / '));
const id = jobs()[0].id, from = phone.length;
await c.callTool({ name: 'schedule', arguments: { action: 'run', id } });
const done = await until(() => phone.slice(from).find((e) => e.ev === 'bubble' && /^Brief you on open PRs:/.test(e.d.text)));
check('"run it now" → the answer spoken on the phone', /^Brief you on open PRs: Two PRs are open\./.test(done?.d.text) && done.d.speak, done?.d.text);
check('…and in Lax\'s tab, in full', phone.slice(from).some((e) => e.ev === 'feed' && e.d.answer && /#32 is a draft/.test(e.d.text)));
await c.close();

// ---------- the budget (lib/budget.mjs): a job at its time asks it; "run it now" doesn't ----------
{
  let clock = MON; const out = [], pending = new Map(), spent = []; let wait = 'your 5-hour limit is at 93%';
  const budget = { may: (k) => (wait ? { ok: false, why: wait } : { ok: true }), spent: (k) => spent.push(k) };
  const s = createSchedule({ budget, settings: () => ({ name: 'Lax' }), feed: (line) => out.push({ line }), diary: () => {}, broadcast: (type, d) => out.push({ type, d }),
    pending, say: () => {}, brief: () => '', spoken: (t) => t.split('. ')[0] + '.', claude: FAKE, workdir: HOME, now: () => clock });
  s.tool({ title: 'Morning brief', when: { time: '08:00', days: 'weekdays' }, prompt: 'Brief me.', cwd: PROJ }); s.hears('yes');
  const before = runsLog().length;
  clock = at('2026-10-13T08:00:10'); s.tick(); await sleep(400);
  const said = out.find((o) => o.type === 'bubble' && /^I skipped Morning brief/.test(o.d.text || ''));
  check('near your limit, a job at its time is skipped, and says so aloud', runsLog().length === before && said?.d.speak
    && said.d.text === 'I skipped Morning brief: your 5-hour limit is at 93%. Say "run it now" to run it anyway.', said?.d.text);
  check('…not tried again until its next time', s.jobs().find((j) => j.title === 'Morning brief').next === at('2026-10-14T08:00') && !spent.length);
  s.tool({ action: 'run', id: s.jobs().find((j) => j.title === 'Morning brief').id });
  await until(() => runsLog().length > before);
  check('"run it now" is you asking: it runs, and isn\'t counted', runsLog().length === before + 1 && !spent.length);
  wait = ''; clock = at('2026-10-14T08:00:10'); s.tick(); await until(() => runsLog().length > before + 1);
  check('room again → it runs at its time, counted as a job', runsLog().length === before + 2 && spent.join() === 'job');
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall good');
process.exit(failed ? 1 : 0);
