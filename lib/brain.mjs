// Lax's seed brain: it learns from every session by itself.
// Observe (the journal in life.db) → reflect (a short, fenced-in headless Claude Code run in its mind) →
// remember (notes about you in CLAUDE.md, about each project in mind/projects/) → show (a bubble) → use (briefs) →
// improve how it learns (mind/learning.md is its own, and a weekly review may rewrite it).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { MIND, HOME } from './paths.mjs';
import { commitMind } from './home.mjs';

export const PROJECTS = path.join(MIND, 'projects');
export const LEARNING = path.join(MIND, 'learning.md');

const LEARNING_MD = `# How I learn

This file is mine: it tells me how to reflect, and I may improve it (the weekly review is the time for that).

## After a session
I read what happened in one work session (what the user asked, what was done, how it ended) and update my memory:
- **About the user** (\`CLAUDE.md\`, under \`## Notes\`): lasting things only. Preferences, how they like to work, goals,
  people, routines, what they care about. Not one-off task details.
- **About the project** (\`projects/<project>.md\`): what it is and what it's for, its stack, where it stands and
  where it's going, decisions and why, problems solved and how. Keep it short (under ~60 lines); rewrite what
  changed rather than piling up lines.

Rules:
- Only what will still be useful in a week. Skip noise.
- Merge with what's already there; fix or remove what's no longer true. Date new facts (YYYY-MM-DD).
- Never store secrets: tokens, passwords, keys, private URLs with credentials.
- If nothing is worth keeping, change nothing.

## Weekly review
I reread all my notes: merge duplicates, drop what's stale or never useful, keep each file short.
Then I look at how I've been learning. If there's a clearly better way, I change this file, and say what I changed.

## Answer
I finish with ONE line of JSON and nothing after it:
{"learned": ["a few words each", "…"], "changed_how_i_learn": "" }
(empty list if I learned nothing; "changed_how_i_learn" only when I changed this file)
`;

export function ensureBrain() {
  fs.mkdirSync(PROJECTS, { recursive: true });
  if (!fs.existsSync(LEARNING)) fs.writeFileSync(LEARNING, LEARNING_MD);
}

const safeName = (project) => String(project || 'unknown').replace(/[^\w.-]+/g, '-').slice(0, 60) || 'unknown';
export const projectNotes = (project) => { try { return fs.readFileSync(path.join(PROJECTS, safeName(project) + '.md'), 'utf8'); } catch { return ''; } };
const userNotes = () => { try { return (fs.readFileSync(path.join(MIND, 'CLAUDE.md'), 'utf8').split(/^## Notes\s*$/m)[1] || '').trim(); } catch { return ''; } };

/** What a new session in this project starts with (empty if Lax knows nothing yet). */
export function brief(project, name = 'Lax') {
  const p = projectNotes(project).trim().slice(0, 2500), u = userNotes().slice(0, 1000);
  if (!p && !u) return '';
  return `${name} (the user's companion, which watches all their Claude Code sessions) keeps these notes.\n`
    + (p ? `\nAbout this project (${project}):\n${p}\n` : '') + (u ? `\nAbout the user:\n${u}\n` : '');
}

/**
 * The reflection loop. deps: { db, settings(), feed(line, kind, project, session), broadcast(type, data),
 *   gainXp(n), sessionInfo(sid) → {project, cwd}, skip(sid) → bool, claude (command), log(...) }
 */
export function createBrain(deps) {
  const IDLE = Number(process.env.LAX_REFLECT_IDLE || 600) * 1000; // quiet this long after its last answer → reflect
  const CAP = Number(process.env.LAX_REFLECT_CAP || 20);           // reflections per day
  const MODEL = process.env.LAX_REFLECT_MODEL || 'haiku';
  const { db } = deps;
  const kv = (k, d) => { const r = db.prepare('SELECT value FROM kv WHERE key=?').get(k); return r ? JSON.parse(r.value) : d; };
  const kvSet = (k, v) => db.prepare('INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, JSON.stringify(v));
  const timers = new Map(), queue = [];
  let busy = false;

  const slice = (sid) => {
    const from = kv('brainUpTo', {})[sid] || 0;
    return db.prepare('SELECT id, ts, project, kind, text FROM events WHERE session=? AND id>? ORDER BY id').all(sid, from);
  };
  // Worth a reflection: real work, not a quick question.
  const meaningful = (ev) => ev.filter((e) => e.kind === 'prompt').length >= 2 || ev.filter((e) => e.kind === 'tool').length >= 6;

  function onEvent(sid, kind) {
    if (!sid || deps.skip(sid)) return;
    clearTimeout(timers.get(sid)); timers.delete(sid);
    if (kind === 'Stop') timers.set(sid, setTimeout(() => { timers.delete(sid); enqueue(sid); }, IDLE));
    if (kind === 'SessionEnd') enqueue(sid);
  }
  function enqueue(sid) {
    if (!deps.settings().learns || queue.includes(sid)) return;
    queue.push(sid); next();
  }
  function capped() {
    const today = new Date().toISOString().slice(0, 10), c = kv('brainDay', { day: today, n: 0 });
    if (c.day !== today) { c.day = today; c.n = 0; }
    if (c.n >= CAP) return true;
    c.n++; kvSet('brainDay', c); return false;
  }

  function next() {
    if (busy || !queue.length) return;
    const sid = queue.shift(), ev = slice(sid);
    if (!meaningful(ev)) return next();
    if (capped()) { deps.log?.('brain: daily cap reached'); queue.length = 0; return; }
    const info = deps.sessionInfo(sid) || {}, project = info.project || ev[ev.length - 1]?.project || 'unknown';
    const journal = ev.map((e) => `[${new Date(e.ts).toISOString().slice(0, 16)}] ${e.kind}: ${e.text}`).join('\n').slice(-14000);
    const prompt = `Reflect on this work session, following learning.md (your instructions for learning).\n`
      + `Project: ${project} (folder ${info.cwd || '?'}). Project notes file: projects/${safeName(project)}.md\n\n<journal>\n${journal}\n</journal>`;
    run(prompt, (out, ok) => {
      if (!ok) return; // try again next time; nothing is lost
      kvSet('brainUpTo', { ...kv('brainUpTo', {}), [sid]: ev[ev.length - 1].id });
      tell(out, project, sid);
    });
  }

  /** A fenced-in headless run in the mind (see the hook: LAX_REFLECT). */
  function run(prompt, done) {
    busy = true;
    ensureBrain();
    const args = ['-p', prompt, '--output-format', 'json', '--model', MODEL, '--allowedTools', 'Read,Edit,Write,Glob,Grep'];
    const child = spawn(deps.claude || 'claude', args, { cwd: MIND, env: { ...process.env, LAX_VOICE: '1', LAX_REFLECT: '1', LAX_HOME: HOME },
      stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (d) => (out += d)); child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => { err += e.message; });
    child.on('close', () => {
      busy = false;
      let text = ''; try { text = JSON.parse(out).result || ''; } catch { text = out; }
      if (!text && err) deps.log?.('brain: reflection failed:', err.slice(0, 300));
      let res = {}; try { res = JSON.parse((text.match(/\{[^{}]*"learned"[^{}]*\}\s*$/) || ['{}'])[0]); } catch {}
      try { done(res, !!text); } finally { next(); }
    });
  }

  function tell(res, project, sid) {
    const learned = (Array.isArray(res.learned) ? res.learned : []).map(String).filter(Boolean).slice(0, 8);
    const changed = String(res.changed_how_i_learn || '').trim();
    commitMind(project ? `learned from ${project}: ${learned.join('; ') || 'nothing new'}` : `weekly review${changed ? ': ' + changed : ''}`);
    if (learned.length) {
      const n = learned.length;
      deps.gainXp(Math.min(15, 3 * n));
      deps.feed(`✦ learned${project ? ' from ' + project : ''}: ${learned.join('; ')}`, 'done', project, sid);
      deps.broadcast('bubble', { id: 'learned' + Date.now(), kind: 'learned', text: project ? `I learned ${n === 1 ? 'one thing' : n + ' things'} from ${project}.` : `I tidied my notes (${n} change${n > 1 ? 's' : ''}).`,
        details: learned.map((l) => '• ' + l).join('\n'), speak: false });
    }
    if (changed) {
      deps.feed(`✦ changed how I learn: ${changed}`, 'done');
      deps.broadcast('bubble', { id: 'howilearn' + Date.now(), kind: 'learned', text: 'I changed how I learn.', details: changed, speak: false });
    }
  }

  // Weekly review: tidy the notes and maybe improve learning.md. Checked hourly; only when there are notes.
  function review() {
    if (busy || !deps.settings().learns || Date.now() - kv('brainReview', 0) < 7 * 864e5) return;
    const hasNotes = fs.existsSync(PROJECTS) && fs.readdirSync(PROJECTS).some((f) => f.endsWith('.md'));
    if (!hasNotes) return;
    kvSet('brainReview', Date.now());
    run('Do your weekly review, following learning.md: tidy all your notes (CLAUDE.md Notes and projects/), then consider how you learn.', (res, ok) => ok && tell(res, '', undefined));
  }
  setInterval(review, 3600e3).unref();

  return { onEvent, enqueue, review, busy: () => busy };
}
