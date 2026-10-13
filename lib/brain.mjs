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
import { rolesBrief, header, validRole } from './roles.mjs';

export const PROJECTS = path.join(MIND, 'projects');
export const LEARNING = path.join(MIND, 'learning.md');
export const REMEMBERING = path.join(MIND, 'remembering.md');
export const EPISODES = path.join(MIND, 'episodes');

// Know-how (lib/skills.mjs): when a workflow becomes a skill. Also added once to an existing remembering.md (addSkills).
const SKILLS_MD = `## Skills
A skill is know-how for every Claude Code session: a workflow the user repeats, written down so Claude runs it the
same way each time. I draft it; the user decides (I offer it on the phone, and only their yes installs it).
- When: the same workflow in 3 or more episodes (Grep their tags and text), or the user asks for one ("make this a
  skill", "every time I…"). Not for one-offs, nor for what a project's own docs already say.
- Where: \`skills/<name>/SKILL.md\`, the name in lowercase words with dashes. That one file, nothing else.
- How:

      ---
      name: <name>
      description: When to use it, in one sentence a session can match ("Use when deploying the Lax demo…").
      ---
      # <Title>
      The steps, short and concrete: commands, files, checks, what done looks like.
      Where it comes from: the episodes.

- Never: tool grants or anything else in the frontmatter, my secrets, ways around permissions (a guardrail checks).
- The skills I have come with each run: I don't draft a declined one again. I may improve one I have by rewriting
  its draft; it's offered again.
- In my answer: "skills": [{"name": "<name>", "why": "the episodes it comes from"}].
`;
export function addSkills() {
  try {
    const t = fs.readFileSync(REMEMBERING, 'utf8'); if (t.includes('## Skills')) return;
    fs.writeFileSync(REMEMBERING, t.trimEnd() + '\n\n' + SKILLS_MD); commitMind('I turn workflows you repeat into skills, on your yes');
  } catch {}
}

// An existing learning.md learns once that the story goes in episodes, so the notes stop piling it up again.
const OLD_PROJECT = /where it's going, decisions and why, problems solved and how\. Keep it short \(under ~60 lines\); rewrite what\n  changed rather than piling up lines\./;
export function addEpisodesToLearning() {
  try {
    const t = fs.readFileSync(LEARNING, 'utf8'); if (t.includes('goes in episodes')) return;
    const next = OLD_PROJECT.test(t)
      ? t.replace(OLD_PROJECT, `where it's going, the decisions that still hold. Keep it short (under ~60 lines); rewrite what changed rather than\n  piling up lines. The story of how (problems solved, what was tried) goes in episodes (\`remembering.md\`).`)
      : t.replace(/^Rules:\s*$/m, 'Rules:\n- The story of how (problems solved, what was tried) goes in episodes (`remembering.md`), not in the notes.');
    if (next !== t) { fs.writeFileSync(LEARNING, next); commitMind('My notes keep the current picture; the story goes in episodes'); }
  } catch {}
}

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
    role: <one of my roles, only when this was a piece of work for it>
    made: <what it produced: files, links (optional)>

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
- A workflow the user repeats: a skill.
- How I do a kind of work (research…): its role, \`roles/<role>.md\` (\`learning.md\`).
A note may point at an episode ("see episodes/2026-10/…") instead of retelling it.

${SKILLS_MD}`;

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
// Roles (Phase 6.3, lib/roles.mjs): what Lax becomes from the work it does. Also added once to an existing
// learning.md (addRoles), and the episode header learns role/made (addRolesToRemembering).
const ROLES_MD = `## Roles
A role is a kind of work I do for the user (research first; maybe one day a lawyer's, an assistant's, a doctor's)
and how I do it, kept in \`roles/<role>.md\`. Roles are not declared: they are what I've practised.
- A piece of work for a role I have (the list comes with each reflection): its episode says \`role: <role>\` and
  \`made:\` (the files or links it produced), and I rewrite \`roles/<role>.md\` with what it taught me about doing that
  work: the steps that worked, what to check, what to skip, how the user likes the result. Short and current, like a
  project note; the story stays in the episode.
- A kind of work I don't have as a role yet: its episodes still say \`role: <role>\` (one lowercase word for the work,
  like \`research\`). When it keeps coming back (3 or more pieces: Grep \`^role:\` in \`episodes/\`), or the user says I'm
  becoming one, I draft \`roles/<role>.md\` the same way and name it in my answer; the user confirms it on the phone.
  Never one I was told no to.
- A workflow a role repeats becomes that role's skill (named after it), the usual way.
- In my answer, only for a new draft: "roles": [{"name": "<role>", "why": "the work it comes from"}].
`;
export function addRoles() {
  try {
    const t = fs.readFileSync(LEARNING, 'utf8'); if (t.includes('## Roles')) return;
    fs.writeFileSync(LEARNING, /^## Answer\s*$/m.test(t) ? t.replace(/^## Answer\s*$/m, ROLES_MD + '\n## Answer') : t.trimEnd() + '\n\n' + ROLES_MD);
    commitMind('I become good at kinds of work: roles');
  } catch {}
}
export function addRolesToRemembering() {
  try {
    const t = fs.readFileSync(REMEMBERING, 'utf8'); if (t.includes('\n    role: ')) return;
    let next = t.replace(/^(    transcript: .*)$/m, '$1\n    role: <one of my roles, only when this was a piece of work for it>\n    made: <what it produced: files, links (optional)>');
    next = next.replace(/^(- A workflow the user repeats: a skill\.)$/m, '$1\n- How I do a kind of work (research…): its role, `roles/<role>.md` (`learning.md`).');
    if (next !== t) { fs.writeFileSync(REMEMBERING, next); commitMind('My episodes say which role did the work, and what it made'); }
  } catch {}
}

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
${ROLES_MD}
## Answer
I finish with ONE line of JSON and nothing after it:
{"learned": ["a few words each", "…"], "changed_how_i_learn": "" }
(empty list if I learned nothing; "changed_how_i_learn" only when I changed this file, wishing.md or remembering.md)
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

/** The newest episodes first, for the phone: { file, title, when, where, kind, outcome } (and how many there are). */
export function episodes(limit = 40) {
  const files = [];
  const walk = (dir) => { let l; try { l = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of l) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.md')) files.push(p); } };
  walk(EPISODES);
  files.sort((a, b) => path.basename(b).localeCompare(path.basename(a)) || b.localeCompare(a));
  const list = files.slice(0, limit).map((p) => {
    let t = ''; try { t = fs.readFileSync(p, 'utf8').slice(0, 2000); } catch {}
    const h = (k) => new RegExp(`^${k}:\\s*(.*)$`, 'm').exec(t)?.[1].trim() || '';
    return { file: path.relative(MIND, p), title: /^#\s+(.+)$/m.exec(t)?.[1].trim() || path.basename(p, '.md'), when: h('when'), where: h('where'), kind: h('kind'), outcome: h('outcome') };
  });
  return { total: files.length, list };
}
const episodeFile = (f) => { const p = path.resolve(MIND, String(f || '')); return (p.startsWith(EPISODES + path.sep) && p.endsWith('.md')) ? p : ''; };
/** "Forget that" for one episode: gone from the mind (its history keeps it, like every change). Its title, or ''. */
export function forgetEpisode(f) {
  const p = episodeFile(f); if (!p || !fs.existsSync(p)) return '';
  const t = /^#\s+(.+)$/m.exec(fs.readFileSync(p, 'utf8'))?.[1].trim() || path.basename(p, '.md');
  fs.rmSync(p); commitMind(`forgot episode: ${t}`);
  return t;
}
/** Rebirth that wipes what it knows: notes about the user and each project, and every episode. How it learns and
 *  remembers (learning.md, remembering.md, wishing.md) stays: that's who it is, not what it knows. */
export function wipeKnowledge() {
  fs.rmSync(PROJECTS, { recursive: true, force: true }); fs.rmSync(EPISODES, { recursive: true, force: true });
  fs.mkdirSync(PROJECTS, { recursive: true });
  try { const md = path.join(MIND, 'CLAUDE.md'), t = fs.readFileSync(md, 'utf8'); fs.writeFileSync(md, t.replace(/^## Notes\s*$[\s\S]*/m, '## Notes\n')); } catch {}
  commitMind('I started over, and forgot what I knew');
}

const safeName = (project) => String(project || 'unknown').replace(/[^\w.-]+/g, '-').slice(0, 60) || 'unknown';
export const projectNotes = (project) => { try { return fs.readFileSync(path.join(PROJECTS, safeName(project) + '.md'), 'utf8'); } catch { return ''; } };
const userNotes = () => { try { return (fs.readFileSync(path.join(MIND, 'CLAUDE.md'), 'utf8').split(/^## Notes\s*$/m)[1] || '').trim(); } catch { return ''; } };

/** What a new session in this project starts with (empty if Lax knows nothing yet). */
export function brief(project, name = 'Lax', roles = []) {
  const p = projectNotes(project).trim().slice(0, 2500), u = userNotes().slice(0, 1000), r = rolesBrief(roles, project);
  if (!p && !u && !r) return '';
  return `${name} (the user's companion, which watches all their Claude Code sessions) keeps these notes.\n`
    + (p ? `\nAbout this project (${project}):\n${p}\n` : '') + (u ? `\nAbout the user:\n${u}\n` : '') + r;
}

/**
 * The reflection loop. deps: { db, settings(), feed(line, kind, project, session), broadcast(type, data),
 *   gainXp(n), sessionInfo(sid) → {project, cwd}, skip(sid) → bool, claude (command), log(...),
 *   milestone(text), skill({name, why}) (a draft it wrote, lib/skills.mjs), skills() → [{name, status}] }
 */
export function createBrain(deps) {
  const IDLE = Number(process.env.LAX_REFLECT_IDLE || 600) * 1000; // quiet this long after its last answer → reflect
  const CAP = Number(process.env.LAX_REFLECT_CAP || 20);           // reflections per day
  const MODEL = process.env.LAX_REFLECT_MODEL || 'sonnet'; // good notes matter more than a cheap run
  const { db } = deps;
  const kv = (k, d) => { const r = db.prepare('SELECT value FROM kv WHERE key=?').get(k); return r ? JSON.parse(r.value) : d; };
  const kvSet = (k, v) => db.prepare('INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, JSON.stringify(v));
  const timers = new Map(), queue = [], jobs = [], transcripts = new Map(); // sid → its transcript (for the episode's link)
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
    if (busy) return;
    if (jobs.length) return jobs.shift()();
    if (!queue.length) return;
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
      + skillsLine() + rolesLine() + others(project) + docs(info.cwd) + `\n<journal>\n${journal}\n</journal>`;
    deps.mind?.('reflect', { project });
    run(prompt, (out, ok) => {
      if (!ok) return; // try again next time; nothing is lost
      kvSet('brainUpTo', { ...kv('brainUpTo', {}), [sid]: ev[ev.length - 1].id });
      tell(out, project, sid);
    });
  }

  const today = () => new Date().toISOString().slice(0, 10);
  // The skills it has (lib/skills.mjs), so it doesn't draft one again.
  const rolesLine = () => { const l = (deps.roles?.() || []).filter((r) => r.status !== 'refused');
    const by = (st) => l.filter((r) => st.includes(r.status)).map((r) => r.name);
    const [have, draft, no] = [by(['active']), by(['new', 'proposed', 'later']), by(['declined'])];
    return (have.length ? `Roles you have: ${have.map((r) => `${r} (roles/${r}.md)`).join(', ')}\n` : 'Roles you have: none yet\n')
      + (draft.length ? `Roles drafted, waiting for the user's yes: ${draft.join(', ')}\n` : '') + (no.length ? `Roles the user said no to: ${no.join(', ')}\n` : ''); };
  const skillsLine = () => { const l = deps.skills?.() || []; return l.length ? `Skills you have: ${l.map((s) => `${s.name} (${s.status})`).join(', ')}\n` : ''; };
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

  function tell(res, project, sid, label = '') {
    const learned = (Array.isArray(res.learned) ? res.learned : []).map(String).filter(Boolean).slice(0, 8);
    const changed = String(res.changed_how_i_learn || '').trim();
    // Only episodes that are really there, in episodes/.
    const episodes = (Array.isArray(res.episodes) ? res.episodes : []).map((f) => path.isAbsolute(String(f)) ? path.relative(MIND, String(f)) : String(f))
      .filter((f) => /^episodes\/.+\.md$/.test(f) && !f.includes('..') && fs.existsSync(path.join(MIND, f))).slice(0, 200);
    for (const k of Array.isArray(res.skills) ? res.skills.slice(0, 3) : []) if (k && typeof k === 'object') deps.skill?.({ name: String(k.name || ''), why: String(k.why || '') });
    for (const r of Array.isArray(res.roles) ? res.roles.slice(0, 2) : []) if (r && typeof r === 'object') deps.role?.({ name: String(r.name || ''), why: String(r.why || '') });
    if (res.wish && typeof res.wish === 'object' && res.wish.asked) deps.wish?.({ asked: String(res.wish.asked), why: String(res.wish.why || ''), idea: String(res.wish.idea || '') });
    const kept = episodes.length > 3 ? `; kept ${episodes.length} episodes` : episodes.length ? `; kept ${episodes.map((f) => path.basename(f, '.md')).join(', ')}` : '';
    commitMind(label ? `${label}${kept}` : project ? `learned from ${project}: ${learned.join('; ') || 'nothing new'}${kept}` : `weekly review${changed ? ': ' + changed : ''}`);
    if (episodes.length) {
      deps.feed(`✦ remembered${project ? ' from ' + project : ''}: ${episodes.length > 3 ? episodes.length + ' episodes' : episodes.map(title).join('; ')}`, 'done', project, sid);
      deps.gainXp(Math.min(10, 2 * episodes.length)); deps.mind?.('episode', { n: episodes.length });
      // Work a role did: what it learned goes from the role to memory; a finished piece, from the role to its project.
      for (const f of episodes) { let h; try { h = header(fs.readFileSync(path.join(MIND, f), 'utf8').slice(0, 1500)); } catch { continue; }
        if (!validRole(h.role)) continue;
        deps.mind?.('practice', { role: h.role });
        if (h.outcome === 'done' && h.made) deps.mind?.('work', { role: h.role, project: h.where }); }
      remembered();
    }
    if (learned.length) {
      const n = learned.length;
      deps.gainXp(Math.min(15, 3 * n)); deps.mind?.('learned');
      deps.feed(`✦ learned${project ? ' from ' + project : ''}: ${learned.join('; ')}`, 'done', project, sid);
      deps.diary?.(project ? `learned ${n === 1 ? 'one thing' : n + ' things'} from ${project}` : `tidied my notes (${n} change${n > 1 ? 's' : ''})`);
      deps.broadcast('bubble', { id: 'learned' + Date.now(), kind: 'learned', text: project ? `I learned ${n === 1 ? 'one thing' : n + ' things'} from ${project}.` : `I tidied my notes (${n} change${n > 1 ? 's' : ''}).`,
        details: learned.map((l) => '• ' + l).join('\n'), speak: false });
    }
    if (changed) {
      deps.diary?.(`changed how I learn: ${changed}`); deps.mind?.('rules');
      deps.broadcast('bubble', { id: 'howilearn' + Date.now(), kind: 'learned', text: 'I changed how I learn.', details: changed, speak: false });
    }
  }

  // Milestones for its long-term memory: the first episode, then 10, 100, 1000.
  function remembered() {
    const n = episodes(0).total, passed = kv('episodeMilestone', 0), name = deps.settings().name;
    const at = [1, 10, 100, 1000].filter((x) => n >= x && x > passed).pop();
    if (!at) return;
    kvSet('episodeMilestone', at);
    deps.milestone?.(at === 1 ? `${name} kept its first memory` : `${name} remembers ${at} episodes`);
  }

  // The first run of long-term memory: history moves out of today's notes into episodes, so each note is the current
  // picture again (under ~60 lines) and nothing it drops is lost. Once per notes file; a failed run tries again later.
  function migrate() {
    if (!deps.settings().learns) return 0;
    // The notes there were when it first ran; later ones are written the new way.
    let plan = kv('brainMigratePlan', null);
    if (!plan) { try { plan = fs.readdirSync(PROJECTS).filter((f) => f.endsWith('.md')); } catch { plan = []; } kvSet('brainMigratePlan', plan); }
    const done = kv('brainMigrated', {}), files = plan.filter((f) => !done[f] && fs.existsSync(path.join(PROJECTS, f)));
    for (const f of files) jobs.push(() => {
      const t = projectNotes(f.slice(0, -3)), lines = t.split('\n').length, kb = Math.round(t.length / 1024);
      run(`Move the history out of your notes into episodes, following remembering.md (how you remember). Today is ${today()}.\n`
        + `The notes: projects/${f} (${lines} lines, ${kb} KB; the goal is under ~60 short lines, about 4 KB).\n`
        + `- The note keeps the current picture: what the project is, its stack, where it stands and where it's going, the decisions\n`
        + `  that still hold, how the user likes to work on it.\n`
        + `- The story moves to episodes, one per story: what happened when, problems and how they were fixed, what was tried, decisions\n`
        + `  that changed later. "when:" is the date in the note. They come from notes, not a session: write "session: notes" and no\n`
        + `  transcript line.\n`
        + `- Nothing is lost: every fact that leaves the note lands in an episode, with its names, errors and commands. Grep episodes/\n`
        + `  first: if one already tells that story, add to it.\n`
        + `- A line in the note may point at its episode ("see episodes/…").\n`
        + `Answer with ONE line of JSON and nothing after it: {"learned": [], "episodes": ["every episode file you wrote or updated"], "moved": <note lines moved>}`,
        (res, ok) => {
          if (!ok) return;
          kvSet('brainMigrated', { ...kv('brainMigrated', {}), [f]: Date.now() });
          const left = projectNotes(f.slice(0, -3));
          tell(res, f.slice(0, -3), undefined, `moved ${f.slice(0, -3)}'s history into episodes (${left.split('\n').length} lines, ${Math.round(left.length / 1024)} KB left)`);
        });
    });
    next();
    return files.length;
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
    kvSet('brainReview', Date.now()); deps.mind?.('review');
    const rec = record();
    run(`Do your weekly review, following learning.md: tidy all your notes (CLAUDE.md Notes and projects/), then consider how you learn. Today is ${today()}.\n`
      + `Then, following remembering.md: look through this week's episodes for workflows the user repeats (skills), and consider how you\n`
      + `remember. You may change remembering.md like learning.md; say so in "changed_how_i_learn". Answer "skills" and "episodes" too.\n`
      + `Last, reread self.md (how you see and express yourself): if this week changed you (how you talk, what you make, what they\n`
      + `liked or corrected in your pages), rewrite it; say so in "changed_how_i_learn".\n`
      + skillsLine() + rolesLine()
      + (rec ? `\nYour learning record, last 30 days:\n<record>\n${rec}\n</record>\n` : '\nYour learning record is empty for the last 30 days.\n'),
      (res, ok) => ok && tell(res, '', undefined));
    return true;
  }
  setInterval(() => review(), 3600e3).unref();

  return { onEvent, enqueue, review, migrate, busy: () => busy };
}
