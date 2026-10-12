// Lax schedules (Phase 7, #7): "every weekday at 8:30, brief me on open PRs" becomes a job you confirm on the phone
// before it's saved (~/.lax/jobs.json). Each run is a fresh, focused `claude -p` in its own folder, with its own tools
// (fenced by hooks/lax-hook.mjs: anything else asks on the phone) and a time limit, and Lax's long-term memory (its
// notes up front, the `recall` tool). The answer comes back spoken (and as a notification), each run kept in a log
// (~/.lax/runs/<job>/). A reminder ("remind me in 20 minutes to…") has no run at all: Lax just says it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HOME } from './paths.mjs';
import { runClaude } from './claude-run.mjs';
import { verdict } from './learn.mjs';

export const JOBS = path.join(HOME, 'jobs.json');
export const RUNS = path.join(HOME, 'runs');

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS = [1, 2, 3, 4, 5];
/** What a job may do without asking: always read (files, searches, read-only commands, Lax's memory); the rest on request. */
export const TOOLS = { read: 'read', web: 'search the web', edit: 'edit files in its folder', run: 'run local commands' };
export const MISSED_MS = 12 * 3600e3; // a run missed (the Mac was asleep) by more than this is skipped, not run late

const cut = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const pad = (n) => String(n).padStart(2, '0');
const localDay = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/** A `when` as the schedule tool gives it → { time: 'HH:MM', days: [0-6] } (repeats) or { time, date: 'YYYY-MM-DD' } (once),
 *  or { error }. days: "daily" | "weekdays" | "weekends" | ["mon", "wed"]; in_minutes: a reminder from now. */
export function parseWhen(w = {}, now = Date.now()) {
  if (Number.isFinite(+w.in_minutes) && +w.in_minutes > 0) {
    const at = new Date(now + Math.min(+w.in_minutes, 60 * 24 * 365) * 60e3);
    return { time: `${pad(at.getHours())}:${pad(at.getMinutes())}`, date: localDay(at) };
  }
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(w.time || '').trim());
  if (!m || +m[1] > 23 || +m[2] > 59) return { error: 'time must be HH:MM, 24-hour, local time' };
  const time = `${pad(+m[1])}:${m[2]}`;
  if (w.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(w.date))) return { error: 'date must be YYYY-MM-DD' };
    return nextRun({ time, date: w.date }, now) ? { time, date: w.date } : { error: 'that time has already passed' };
  }
  const d = w.days ?? 'daily';
  const days = d === 'daily' || d === 'every day' ? [0, 1, 2, 3, 4, 5, 6] : d === 'weekdays' ? WEEKDAYS : d === 'weekends' ? [0, 6]
    : Array.isArray(d) ? [...new Set(d.map((x) => DAYS.indexOf(String(x).toLowerCase().slice(0, 3))))].filter((i) => i >= 0).sort() : [];
  return days.length ? { time, days } : { error: 'days must be daily, weekdays, weekends or a list like ["mon","thu"]' };
}

/** The next time a `when` comes round after `after` (ms), in the Mac's local time, or null (a one-off that's past). */
export function nextRun(when, after = Date.now()) {
  const [h, mi] = when.time.split(':').map(Number);
  if (when.date) { const [y, mo, d] = when.date.split('-').map(Number), t = new Date(y, mo - 1, d, h, mi).getTime(); return t > after ? t : null; }
  const a = new Date(after);
  for (let i = 0; i <= 7; i++) {
    const t = new Date(a.getFullYear(), a.getMonth(), a.getDate() + i, h, mi);
    if (t.getTime() > after && when.days.includes(t.getDay())) return t.getTime();
  }
  return null;
}

/** "Every weekday at 8:30", "Mondays and Thursdays at 18:00", "Tomorrow at 9:05", "At 14:20". */
export function describeWhen(when, now = Date.now()) {
  const at = `at ${when.time.replace(/^0(\d)/, '$1')}`;
  if (when.date) {
    const day = when.date === localDay(now) ? '' : when.date === localDay(new Date(now).setDate(new Date(now).getDate() + 1)) ? 'tomorrow '
      : `on ${new Date(when.date + 'T12:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} `;
    return (day + at).replace(/^./, (c) => c.toUpperCase());
  }
  const d = when.days.join();
  const days = d === '0,1,2,3,4,5,6' ? 'Every day' : d === '1,2,3,4,5' ? 'Every weekday' : d === '0,6' ? 'Every weekend day'
    : when.days.map((i) => DAY_NAMES[i] + 's').join(', ').replace(/, ([^,]*)$/, ' and $1');
  return `${days} ${at}`;
}

const slugify = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'job';
const toolsSaid = (tools) => `It may ${tools.map((t) => TOOLS[t]).join(', ').replace(/, ([^,]*)$/, ' and $1')}; anything else asks you first.`;

/**
 * deps: { settings(), feed(line, kind, project, session, extra), diary(text), broadcast(type, data), pending (Map),
 *   say(text, kind), brief(project) (its notes for a run), spoken(text) (the first sentence, for the bubble), claude, log(...),
 *   workdir (where a job runs when none is given), now() (tests) }
 */
export function createSchedule(deps) {
  const now = deps.now || Date.now;
  const me = () => deps.settings().name.toLowerCase();
  const load = () => { try { return JSON.parse(fs.readFileSync(JOBS, 'utf8')); } catch { return { jobs: [] }; } };
  let list = load();
  const save = () => fs.writeFileSync(JOBS, JSON.stringify(list, null, 2) + '\n');
  const find = (id) => list.jobs.find((j) => j.id === id);
  // After a restart, a job that was waiting for your yes is gone with its question; a run that was cut off isn't retried.
  list.jobs = list.jobs.filter((j) => j.status !== 'proposed');
  for (const j of list.jobs) if (j.running) delete j.running;

  // ---------- the schedule tool (channel/lax-channel.mjs): add (asks first), list, remove, run now ----------
  function tool(b = {}) {
    const action = String(b.action || 'add');
    if (action === 'list') {
      const on = list.jobs.filter((j) => j.status === 'on');
      return { ok: true, say: on.length ? on.map((j) => `- ${j.id}: ${j.title} (${describeWhen(j.when, now())}${j.say ? ', a reminder' : `, in ${j.cwd}`}; next ${new Date(j.next).toLocaleString('en-GB')})`).join('\n')
        : 'Nothing is scheduled.' };
    }
    if (action === 'remove' || action === 'run') {
      const j = find(String(b.id || '')) || list.jobs.find((x) => x.status === 'on' && x.title.toLowerCase() === String(b.id || '').toLowerCase());
      if (!j || j.status !== 'on') return { ok: false, say: `No scheduled job "${b.id}". List them first for their ids.` };
      if (action === 'run') { if (j.say) remind(j); else queue(j, 'asked'); return { ok: true, say: `Running "${j.title}" now; the answer comes to the phone.` }; }
      list.jobs = list.jobs.filter((x) => x !== j); save();
      deps.diary(`unscheduled: ${j.title}`);
      return { ok: true, say: `Removed "${j.title}".` };
    }
    // add
    const when = parseWhen(b.when, now());
    if (when.error) return { ok: false, say: `Not saved: ${when.error}.` };
    const title = cut(b.title, 60), prompt = String(b.prompt || '').trim().slice(0, 4000), say = cut(b.say, 300);
    if (!title || (!prompt && !say)) return { ok: false, say: 'Not saved: a job needs a title, and a prompt (what to do) or say (a reminder).' };
    const cwd = path.resolve(String(b.cwd || '').replace(/^~(?=\/|$)/, os.homedir()) || deps.workdir);
    if (!say && !fs.existsSync(cwd)) return { ok: false, say: `Not saved: ${cwd} doesn't exist.` };
    const tools = ['read', ...new Set((Array.isArray(b.tools) ? b.tools : ['web']).map(String).filter((t) => t !== 'read' && TOOLS[t]))];
    const minutes = Math.min(60, Math.max(2, Number(b.max_minutes) || 10));
    const j = { id: 'j' + now().toString(36), title, slug: uniqueSlug(slugify(title)), when, ...(say ? { say } : { prompt, cwd, tools, minutes }),
      status: 'proposed', made: now(), next: nextRun(when, now()), runs: [] };
    list.jobs.push(j); save();
    confirm(j);
    return { ok: true, say: `Asked the user on the phone: "${question(j)}" It's saved only on their yes; tell them it's waiting for that.` };
  }
  const uniqueSlug = (s) => { let x = s, i = 2; while (list.jobs.some((j) => j.slug === x)) x = `${s}-${i++}`; return x; };
  const question = (j) => j.say ? `${describeWhen(j.when, now())}, I'll remind you: ${j.say} Save it?`
    : `${describeWhen(j.when, now())}, I'll ${j.title.replace(/^./, (c) => c.toLowerCase())}, in ${path.basename(j.cwd)}. ${toolsSaid(j.tools)} Save it?`;

  // ---------- "save it?": a question on the phone, answered by tap or by voice ----------
  let asking = null; // { id (pending id), job id }
  function confirm(j) {
    if (asking) deps.pending.get(asking.id)?.finish('none');
    const id = `job-${j.id}`, text = question(j);
    const bubble = { id, kind: 'question', project: me(), questions: [{ question: text, header: 'schedule', options: [
      { label: 'Yes', description: 'Save it' }, { label: 'No', description: 'Forget it' }] }], text, speak: true,
      details: j.prompt ? `What it does each time:\n${j.prompt}\n\nIn ${j.cwd}, up to ${j.minutes} minutes.` : undefined };
    const timer = setTimeout(() => deps.pending.get(id)?.finish('none'), 10 * 60e3);
    asking = { id, job: j.id };
    deps.pending.set(id, { bubble, finish(decision, answers) {
      if (!deps.pending.delete(id)) return;
      clearTimeout(timer); deps.broadcast('clear', { id });
      if (asking?.id === id) asking = null;
      answer(j.id, decision === 'answer' ? String(Object.values(answers || {})[0] || '') : '');
    } });
    deps.broadcast('bubble', bubble);
  }
  function answer(id, said) {
    const j = find(id); if (!j || j.status !== 'proposed') return;
    if (verdict(said) === 'yes') {
      j.status = 'on'; j.next = nextRun(j.when, now()); save();
      deps.diary(`scheduled: ${j.title} (${describeWhen(j.when, now()).toLowerCase()})`);
      deps.say(`Saved. ${describeWhen(j.when, now())}${j.say ? ", I'll remind you" : `, I'll ${j.title.replace(/^./, (c) => c.toLowerCase())}`}.`);
    } else {
      list.jobs = list.jobs.filter((x) => x !== j); save();
      if (said) deps.say(`Okay, I didn't save it.${verdict(said) === 'no' ? '' : ' Tell me again how you want it.'}`);
    }
  }
  /** What you said, if it answers the "save it?" on screen. */
  function hears(text) {
    if (!asking || !deps.pending.has(asking.id)) return false;
    deps.feed(`> ${cut(text, 90)}`, 'prompt', me());
    deps.pending.get(asking.id).finish('answer', { q: text });
    return true;
  }

  // ---------- running: a tick every minute; one run at a time ----------
  function tick() {
    const t = now();
    for (const j of list.jobs) {
      if (j.status !== 'on' || !j.next || j.next > t || j.running) continue;
      const late = t - j.next;
      j.next = nextRun(j.when, t); // the next one, from now: missed runs aren't piled up
      if (late > MISSED_MS) { deps.feed(`  skipped ${j.title}: the Mac was asleep at ${new Date(t - late).toLocaleString('en-GB')}`, 'diary', me()); }
      else if (j.say) remind(j);
      else queue(j, 'due');
      if (!j.next) j.status = 'done'; // a one-off, done
    }
    list.jobs = list.jobs.filter((j) => j.status !== 'done' || j.running || runs.some((r) => r.id === j.id));
    save();
  }
  function remind(j) {
    deps.feed(`  reminder: ${j.say}`, 'diary', me());
    deps.broadcast('bubble', { id: 'job' + now() + j.id, kind: 'reply', text: j.say, speak: true });
  }
  const runs = []; let running = null;
  function queue(j, why) { if (!runs.some((r) => r.id === j.id) && running !== j.id) { runs.push({ id: j.id, why }); runNext(); } }
  async function runNext() {
    if (running || !runs.length) return;
    const { id } = runs.shift(), j = find(id); if (!j) return runNext();
    running = j.id; j.running = true; save();
    try { await run(j); } catch (e) { deps.log?.('schedule: run failed:', e.message); }
    finally { running = null; delete j.running; save(); runNext(); }
  }
  async function run(j) {
    const started = now();
    deps.feed(`  running: ${j.title}`, 'diary', me());
    const notes = deps.brief?.(path.basename(j.cwd)) || '';
    const prompt = `You are ${deps.settings().name}, doing a job the user scheduled: "${j.title}" (${describeWhen(j.when, started).toLowerCase()}). `
      + `It's ${new Date(started).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} now.\n`
      + `Your answer is read aloud on their phone: start with ONE short, plain sentence that sums it up; details may follow, short.\n`
      + `You may ${toolsSaid(j.tools).replace(/^It may /, '').replace('anything else asks you first', 'anything else asks the user on the phone and may be refused')}. `
      + `For the past (how something was done, what was decided), use your lax \`recall\` tool.\n`
      + (notes ? `\n${notes}\n` : '') + `\nThe job:\n${j.prompt}`;
    const r = await runClaude({ prompt, cwd: j.cwd, maxTurns: 40, timeoutMs: j.minutes * 60e3, claude: deps.claude,
      env: { LAX_JOB: j.id, LAX_JOB_TOOLS: j.tools.join(','), LAX_JOB_DIR: j.cwd, LAX_HOME: HOME } });
    const ok = r.ok, text = ok ? r.text.trim() : `I couldn't finish ${j.title}: ${cut(r.err || r.text || 'no answer', 160)}`;
    const log = path.join(RUNS, j.slug, `${localDay(started)}-${new Date(started).toTimeString().slice(0, 5).replace(':', '')}.md`);
    try {
      fs.mkdirSync(path.dirname(log), { recursive: true });
      fs.writeFileSync(log, `# ${j.title}\n\n${new Date(started).toString()} · ${Math.round((now() - started) / 1000)}s · ${ok ? 'ok' : 'failed'}\nIn ${j.cwd}; may ${j.tools.join(', ')}.\n\n## Asked\n\n${j.prompt}\n\n## Answer\n\n${r.text || ''}\n${r.err ? `\n## Errors\n\n${r.err}\n` : ''}`);
    } catch {}
    j.runs = [...(j.runs || []), { ts: started, ok, log, said: cut(deps.spoken(text), 200) }].slice(-20); j.last = started;
    deps.feed(`↩ ${j.title}: ${cut(text, 4000)}`, ok ? 'done' : 'error', me(), undefined, { answer: true, text: `${j.title}\n\n${text}\n\n(log: ${log})` });
    deps.broadcast('bubble', { id: 'job' + now() + j.id, kind: ok ? 'reply' : 'error', text: `${j.title}: ${deps.spoken(text)}`, speak: true });
  }
  setInterval(tick, 30e3).unref();

  return { tool, hears, tick, jobs: () => list.jobs, busy: () => !!running };
}
