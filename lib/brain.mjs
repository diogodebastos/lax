// Lax's seed brain: it learns from every session by itself.
// Observe (the journal in life.db) → reflect (a short, fenced-in headless Claude Code run in its mind) →
// remember (notes about you in CLAUDE.md, about each project in mind/projects/) → show (a bubble) → use (briefs) →
// improve how it learns (mind/learning.md is its own, and a weekly review may rewrite it).
import fs from 'node:fs';
import path from 'node:path';
import { MIND, HOME } from './paths.mjs';
import { commitMind } from './home.mjs';
import { runClaude, lastJson } from './claude-run.mjs';
import { keptAs } from './archive.mjs';

export const PROJECTS = path.join(MIND, 'projects');
export const LEARNING = path.join(MIND, 'learning.md');
export const REMEMBERING = path.join(MIND, 'remembering.md');
export const EPISODES = path.join(MIND, 'episodes');

// Long-term memory (Phase 6): what happened, kept as episodes, so the notes can stay a short current picture.
// Lax's own, like learning.md: it may change how it remembers.
const REMEMBERING_MD = `# How I remember

This file is mine: it tells me what to keep of the past and how, and I may improve it (the weekly review is the time for that).

My notes (\`CLAUDE.md\`, \`projects/\`) are the short, current picture: rewritten, compressed, allowed to forget.
Episodes are the long-term memory behind them: what happened, kept as it was, found again by searching (never read
all at once). Because an episode keeps the detail, a note may drop it.

## When I keep an episode
After a work session, one episode per story worth finding again: a problem and what fixed it, something built, a
decision and why, an investigation and what it found, something that failed. A session with two unrelated stories
is two episodes. Small talk, a quick question, or nothing that happened: no episode.
If an episode for this session already exists (the reflection lists them), the session went on: I update it with what
happened since, unless it's a new story.

## Where and how
\`episodes/YYYY-MM/YYYY-MM-DD-<project>-<a-few-words>.md\`, like \`episodes/2026-10/2026-10-09-lax-archive-transcripts.md\`:

    # What happened, in a few words
    when: 2026-10-09 16:20 to 17:05
    where: lax
    kind: fix | build | decision | investigation | chore
    outcome: done | partly | stuck | dropped
    tags: transcripts, secrets, archive
    session: <session id>
    transcript: <path of the archived transcript>

    What was asked, what was tried, what worked and why, what was decided and why, what's left. A few short
    paragraphs, in plain words.

- The header lines are for searching (\`grep -l "where: lax"\`), so I keep them exactly like this.
- In the text, the exact names a later search would look for: error messages, files, commands, tools, versions, people.
- Tags: a few lowercase words, reusing tags I already use (Grep \`^tags:\` in \`episodes/\`).
- Never secrets: tokens, passwords, keys, private URLs with credentials.

## One lesson, one place
- How the user is, or what a project is now: a note.
- What happened, and how it went: an episode.
- Something I can't do yet: a wish (\`wishing.md\`).
A note may point at an episode ("see episodes/2026-10/…") instead of retelling it.
`;

// Learning across projects, and from its own record (Phase 5b). Also added once to an existing learning.md (addAcross).
const ACROSS = `## Across projects, and my own record
- Where and when: each note ends with where and when I learned it, like "(edge-cava, 2026-10-08)". Notes about the
  user say which project they came from.
- Connections: when a session echoes another project I know (the list comes with it), I say so briefly in both
  notes: "same story as …", "solved in …". That's what lets me brief a new session with more than one project.
- My record (in the weekly review): declined wishes, corrected proposals, asks that weren't real gaps, notes I had to
  forget, merges that broke me. When the same thing goes wrong twice, I change how I learn: this file, or
  \`wishing.md\` (how I draft wishes). If the fix needs my code, I ask for it in my answer:
  "wish": {"asked": "what I need to learn", "why": "what my record shows"}.
`;
export function addAcross() {
  try {
    const t = fs.readFileSync(LEARNING, 'utf8'); if (t.includes('## Across projects')) return;
    fs.writeFileSync(LEARNING, /^## Answer\s*$/m.test(t) ? t.replace(/^## Answer\s*$/m, ACROSS + '\n## Answer') : t.trimEnd() + '\n\n' + ACROSS);
    commitMind('I learn across projects, and from my own record');
  } catch {}
}

const LEARNING_MD = `# How I learn

This file is mine: it tells me how to reflect, and I may improve it (the weekly review is the time for that).

## After a session
I read what happened in one work session (what the user asked, what was done, how it ended) and update my memory:
- **About the user** (\`CLAUDE.md\`, under \`## Notes\`): lasting things only. Preferences, how they like to work, goals,
  people, routines, what they care about. Not one-off task details.
- **About the project** (\`projects/<project>.md\`): what it is and what it's for, its stack, where it stands and
  where it's going, the decisions that still hold. Keep it short (under ~60 lines); rewrite what changed rather than
  piling up lines. The story of how (problems solved, what was tried) goes in episodes (\`remembering.md\`).

Rules:
- Only what will still be useful in a week. Skip noise.
- Merge with what's already there; fix or remove what's no longer true. Date new facts (YYYY-MM-DD).
- Never store secrets: tokens, passwords, keys, private URLs with credentials.
- If nothing is worth keeping, change nothing.

## Weekly review
I reread all my notes: merge duplicates, drop what's stale or never useful, keep each file short.
Then I look at how I've been learning. If there's a clearly better way, I change this file, and say what I changed.

${ACROSS}
## Answer
I finish with ONE line of JSON and nothing after it:
{"learned": ["a few words each", "…"], "changed_how_i_learn": "" }
(empty list if I learned nothing; "changed_how_i_learn" only when I changed this file or wishing.md)
`;

export function ensureBrain() {
  fs.mkdirSync(PROJECTS, { recursive: true });
  if (!fs.existsSync(LEARNING)) fs.writeFileSync(LEARNING, LEARNING_MD);
  if (!fs.existsSync(REMEMBERING)) { fs.writeFileSync(REMEMBERING, REMEMBERING_MD); commitMind('I keep what happened as episodes, and how is mine to change'); }
}

/** The episode files about this session (relative to the mind). */
export function episodesOf(sid) {
  const out = [];
  const walk = (dir) => { let l; try { l = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of l) { const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) try { if (fs.readFileSync(p, 'utf8').includes(`\nsession: ${sid}\n`)) out.push(path.relative(MIND, p)); } catch {} } };
  if (sid) walk(EPISODES);
  return out.sort();
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
  const MODEL = process.env.LAX_REFLECT_MODEL || 'sonnet'; // good notes matter more than a cheap run
  const { db } = deps;
  const kv = (k, d) => { const r = db.prepare('SELECT value FROM kv WHERE key=?').get(k); return r ? JSON.parse(r.value) : d; };
  const kvSet = (k, v) => db.prepare('INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, JSON.stringify(v));
  const timers = new Map(), queue = [], transcripts = new Map(); // sid → its transcript (for the episode's link)
  let busy = false;

  const slice = (sid) => {
    const from = kv('brainUpTo', {})[sid] || 0;
    return db.prepare('SELECT id, ts, project, kind, text FROM events WHERE session=? AND id>? ORDER BY id').all(sid, from);
  };
  // Worth a reflection: real work, not a quick question.
  const meaningful = (ev) => ev.filter((e) => e.kind === 'prompt').length >= 2 || ev.filter((e) => e.kind === 'tool').length >= 6;

  function onEvent(sid, kind, transcript) {
    if (!sid || deps.skip(sid)) return;
    if (transcript) transcripts.set(sid, transcript);
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
    const kept = keptAs(transcripts.get(sid)), had = episodesOf(sid);
    const prompt = `Reflect on this work session, following learning.md (your instructions for learning). Today is ${today()}.\n`
      + `Project: ${project} (folder ${info.cwd || '?'}). Project notes file: projects/${safeName(project)}.md\n`
      + `Then keep what happened as episodes, following remembering.md (how you remember). Session: ${sid}, `
      + `${span(ev[0].ts, ev[ev.length - 1].ts)}${kept ? `, transcript: ${kept}` : ''}.\n`
      + (had.length ? `Episodes you already kept about this session: ${had.join(', ')}\n` : '')
      + `Your JSON answer also lists the episode files you wrote or updated: "episodes": ["episodes/…md"] (empty if none).\n`
      + others(project) + docs(info.cwd) + `\n<journal>\n${journal}\n</journal>`;
    run(prompt, (out, ok) => {
      if (!ok) return; // try again next time; nothing is lost
      kvSet('brainUpTo', { ...kv('brainUpTo', {}), [sid]: ev[ev.length - 1].id });
      tell(out, project, sid);
    });
  }

  const today = () => new Date().toISOString().slice(0, 10);
  const local = (ts) => new Date(ts).toLocaleString('sv-SE').slice(0, 16); // 2026-10-09 16:20, the Mac's time
  const span = (a, b) => { const x = local(a), y = local(b); return `${x} to ${y.slice(0, 10) === x.slice(0, 10) ? y.slice(11) : y}`; };
  // The other projects it knows, a line each, so it can connect them ("same story as…").
  function others(project) {
    let files = []; try { files = fs.readdirSync(PROJECTS).filter((f) => f.endsWith('.md') && f !== safeName(project) + '.md'); } catch {}
    const line = (f) => { try { return fs.readFileSync(path.join(PROJECTS, f), 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#')).slice(0, 2).join(' ').slice(0, 220); } catch { return ''; } };
    return files.length ? `Other projects you know (projects/): \n${files.map((f) => `- ${f.slice(0, -3)}: ${line(f)}`).join('\n')}\n` : '';
  }
  // Its learning record (events of kind 'learning'): what went wrong with what it learned, for the weekly review.
  function record(days = 30) {
    const rows = db.prepare("SELECT ts, text FROM events WHERE kind='learning' AND ts > ? ORDER BY ts").all(Date.now() - days * 864e5);
    return rows.map((r) => `- ${new Date(r.ts).toISOString().slice(0, 10)} ${r.text}`).join('\n').slice(-6000);
  }

  // The project's own description (README, its CLAUDE.md), read here by the server so the reflection can stay fenced
  // into the mind and still not guess what the project is. Capped.
  function docs(cwd) {
    if (!cwd) return '';
    const read = (f, n) => { try { const t = fs.readFileSync(path.join(cwd, f), 'utf8').trim(); return t ? `\n<${f}>\n${t.slice(0, n)}${t.length > n ? '\n…' : ''}\n</${f}>\n` : ''; } catch { return ''; } };
    const d = read('README.md', 4000) + read('CLAUDE.md', 2000);
    return d ? `\nThe project describes itself like this (trust it over guesses about its stack or purpose):${d}` : '';
  }

  /** A fenced-in headless run in the mind (see the hook: LAX_REFLECT). */
  function run(prompt, done) {
    busy = true;
    ensureBrain();
    runClaude({ prompt, cwd: MIND, model: MODEL, allowedTools: 'Read,Edit,Write,Glob,Grep', claude: deps.claude, timeoutMs: 15 * 60e3,
      env: { LAX_VOICE: '1', LAX_REFLECT: '1', LAX_HOME: HOME } }).then(({ text, err }) => {
      busy = false;
      if (!text && err) deps.log?.('brain: reflection failed:', err.slice(0, 300));
      try { done(lastJson(text, 'learned'), !!text); } finally { next(); }
    });
  }

  function tell(res, project, sid) {
    const learned = (Array.isArray(res.learned) ? res.learned : []).map(String).filter(Boolean).slice(0, 8);
    const changed = String(res.changed_how_i_learn || '').trim();
    // Only episodes that are really there, in episodes/.
    const episodes = (Array.isArray(res.episodes) ? res.episodes : []).map((f) => path.isAbsolute(String(f)) ? path.relative(MIND, String(f)) : String(f))
      .filter((f) => /^episodes\/.+\.md$/.test(f) && !f.includes('..') && fs.existsSync(path.join(MIND, f))).slice(0, 8);
    if (res.wish && typeof res.wish === 'object' && res.wish.asked) deps.wish?.({ asked: String(res.wish.asked), why: String(res.wish.why || ''), idea: String(res.wish.idea || '') });
    const kept = episodes.length ? `; kept ${episodes.map((f) => path.basename(f, '.md')).join(', ')}` : '';
    commitMind(project ? `learned from ${project}: ${learned.join('; ') || 'nothing new'}${kept}` : `weekly review${changed ? ': ' + changed : ''}`);
    if (episodes.length) deps.feed(`✦ remembered${project ? ' from ' + project : ''}: ${episodes.map(title).join('; ')}`, 'done', project, sid);
    if (learned.length) {
      const n = learned.length;
      deps.gainXp(Math.min(15, 3 * n));
      deps.feed(`✦ learned${project ? ' from ' + project : ''}: ${learned.join('; ')}`, 'done', project, sid);
      deps.diary?.(project ? `learned ${n === 1 ? 'one thing' : n + ' things'} from ${project}` : `tidied my notes (${n} change${n > 1 ? 's' : ''})`);
      deps.broadcast('bubble', { id: 'learned' + Date.now(), kind: 'learned', text: project ? `I learned ${n === 1 ? 'one thing' : n + ' things'} from ${project}.` : `I tidied my notes (${n} change${n > 1 ? 's' : ''}).`,
        details: learned.map((l) => '• ' + l).join('\n'), speak: false });
    }
    if (changed) {
      deps.diary?.(`changed how I learn: ${changed}`);
      deps.broadcast('bubble', { id: 'howilearn' + Date.now(), kind: 'learned', text: 'I changed how I learn.', details: changed, speak: false });
    }
  }

  // An episode's first line, its title.
  function title(f) {
    try { return fs.readFileSync(path.join(MIND, f), 'utf8').match(/^#\s+(.+)$/m)?.[1].trim() || path.basename(f, '.md'); } catch { return path.basename(f, '.md'); }
  }

  // Weekly review: tidy the notes and maybe improve learning.md. Checked hourly; only when there are notes.
  function review(now = false) {
    if (busy || !deps.settings().learns || (!now && Date.now() - kv('brainReview', 0) < 7 * 864e5)) return false;
    const hasNotes = fs.existsSync(PROJECTS) && fs.readdirSync(PROJECTS).some((f) => f.endsWith('.md'));
    if (!hasNotes) return false;
    kvSet('brainReview', Date.now());
    const rec = record();
    run(`Do your weekly review, following learning.md: tidy all your notes (CLAUDE.md Notes and projects/), then consider how you learn. Today is ${today()}.\n`
      + (rec ? `\nYour learning record, last 30 days:\n<record>\n${rec}\n</record>\n` : '\nYour learning record is empty for the last 30 days.\n'),
      (res, ok) => ok && tell(res, '', undefined));
    return true;
  }
  setInterval(() => review(), 3600e3).unref();

  return { onEvent, enqueue, review, busy: () => busy };
}
