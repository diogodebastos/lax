// The public shape of Lax's mind (<host>/demo/mind): only counts, times, a colour and the names of the
// projects you allowed; never a note, an episode's title, a skill's text or what a recall asked. Built on the Mac from
// what Lax has (shape) and checked again by the Worker before it keeps or shows anything (clean): the same code, so
// whatever isn't exactly this shape is refused. No Node imports: demo/worker.mjs bundles it.

// Not when a transcript is archived or a session comes and goes: that's more of your day than the page needs.
export const KINDS = ['recall', 'reflect', 'episode', 'skill', 'install', 'forget', 'learned', 'review', 'rules', 'hear', 'speak', 'tool',
  'track', 'practice', 'work']; // a role's work (Phase 6.3): a track starting, what it learned kept, a finished piece
// Where an event went (recall: where it found it; learned, forget: what changed). 'project' goes with the event's project.
export const PLACES = ['you', 'memory', 'archive', 'skills', 'learning', 'project'];
const DOING = ['hearing', 'speaking', 'reflecting', 'recalling'];
export const MAX_PROJECTS = 4, MAX_SESSIONS = 6, MAX_EVENTS = 20, MAX_ROLES = 4;
const STATES = ['working', 'idle', 'waiting'];
const NAME = /^[a-z0-9][a-z0-9._-]{0,30}$/, COLOR = /^#[0-9a-f]{6}$/i, STAGE = /^[a-z]{1,12}$/;
const int = (n, max = 1e7) => Math.max(0, Math.min(max, Math.floor(Number(n) || 0)));
const time = (n) => int(n, 1e14);
const DAY = 864e5;

/** What Lax has, reduced to the public shape. raw: { color, stage, you, projects: [{ name, notes }], episodes: [file names],
 *  archive, skills: [{ status }], rules: { learning, remembering, wishing } (mtimes), sessions: [{ project, status }],
 *  heard, spoke (times you talked to it / it answered aloud, this week), changes (times its mind changed, this week),
 *  busy (it's at work right now: a session working, answering you, reflecting, recalling), owner (what to call you),
 *  doing: { hearing, speaking, reflecting, recalling } (what it's doing this moment, for as long as it lasts),
 *  roles: [{ name, work: [{ day, where }] }] (the roles you confirmed, and the pieces of work each did) }.
 *  allow: the project names that may be shown; the others are there, unnamed. allowRoles: the same for roles. */
export function shape(raw, allow = [], now = Date.now(), allowRoles = []) {
  const projects = [...(raw.projects || [])].sort((a, b) => b.notes - a.notes || String(a.name).localeCompare(String(b.name))).slice(0, MAX_PROJECTS);
  const index = (name) => { const i = projects.findIndex((p) => p.name === name); return i < 0 ? null : i; };
  const week = (raw.episodes || []).filter((f) => { const d = Date.parse(/(\d{4}-\d{2}-\d{2})/.exec(f)?.[1] || ''); return d && now - d < 7 * DAY; }).length;
  const skills = raw.skills || [];
  return clean({
    v: 1, seen: time(now),
    look: { color: COLOR.test(raw.color || '') ? raw.color.toLowerCase() : '#d97757', stage: STAGE.test(raw.stage || '') ? raw.stage : 'egg' },
    owner: NAME.test(String(raw.owner || '').toLowerCase()) ? String(raw.owner).toLowerCase() : '',
    you: int(raw.you),
    projects: projects.map((p) => ({ name: allow.includes(p.name) && NAME.test(p.name) ? p.name : '', notes: int(p.notes) })),
    episodes: { total: int((raw.episodes || []).length), week: int(week) },
    archive: int(raw.archive),
    skills: { drafts: int(skills.filter((s) => ['new', 'proposed', 'later'].includes(s.status)).length), installed: int(skills.filter((s) => s.status === 'installed').length) },
    rules: { learning: time(raw.rules?.learning), remembering: time(raw.rules?.remembering), wishing: time(raw.rules?.wishing) },
    week: { heard: int(raw.heard), spoke: int(raw.spoke), changes: int(raw.changes) },
    busy: raw.busy === true,
    doing: Object.fromEntries(DOING.map((k) => [k, raw.doing?.[k] === true])),
    sessions: (raw.sessions || []).slice(0, MAX_SESSIONS).map((s) => ({ p: index(s.project), state: STATES.includes(s.status) ? s.status : 'idle' })),
    // Each role: its work (all, and this week) and the places of the projects it worked in. Never what the work was.
    roles: rolesOf(raw).map((r) => ({ name: allowRoles.includes(r.name) && NAME.test(r.name) ? r.name : '', work: int(r.work.length),
      week: int(r.work.filter((w) => { const d = Date.parse(w.day || ''); return d && now - d < 7 * DAY; }).length),
      p: [...new Set(r.work.map((w) => index(w.where)).filter((i) => i !== null))].sort() })),
  });
}
/** The roles in the order the page places them: most work first. */
export const rolesOf = (raw) => [...(raw.roles || [])].sort((a, b) => (b.work?.length || 0) - (a.work?.length || 0) || String(a.name).localeCompare(String(b.name))).slice(0, MAX_ROLES);

/** The snapshot rebuilt from its known fields only; null unless that's exactly what came in (an extra field, a long
 *  string, a wrong type: refused, not trimmed). */
export function clean(s) {
  if (!s || typeof s !== 'object') return null;
  if (!('roles' in s)) s = { ...s, roles: [] }; // kept before roles (Phase 6.3)
  let out;
  try {
    out = {
      v: 1, seen: time(s.seen),
      look: { color: COLOR.test(s.look.color) ? s.look.color : '#d97757', stage: STAGE.test(s.look.stage) ? s.look.stage : 'egg' },
      owner: s.owner === '' || NAME.test(s.owner) ? s.owner : '',
      you: int(s.you),
      projects: s.projects.slice(0, MAX_PROJECTS).map((p) => ({ name: p.name === '' || NAME.test(p.name) ? p.name : '', notes: int(p.notes) })),
      episodes: { total: int(s.episodes.total), week: int(s.episodes.week) },
      archive: int(s.archive),
      skills: { drafts: int(s.skills.drafts), installed: int(s.skills.installed) },
      rules: { learning: time(s.rules.learning), remembering: time(s.rules.remembering), wishing: time(s.rules.wishing) },
      week: { heard: int(s.week.heard), spoke: int(s.week.spoke), changes: int(s.week.changes) },
      busy: s.busy === true,
      doing: Object.fromEntries(DOING.map((k) => [k, s.doing[k] === true])),
      sessions: s.sessions.slice(0, MAX_SESSIONS).map((x) => ({ p: x.p === null ? null : Math.min(MAX_PROJECTS - 1, int(x.p)), state: STATES.includes(x.state) ? x.state : 'idle' })),
      roles: s.roles.slice(0, MAX_ROLES).map((r) => ({ name: r.name === '' || NAME.test(r.name) ? r.name : '', work: int(r.work), week: int(r.week),
        p: r.p.slice(0, MAX_PROJECTS).map((i) => Math.min(MAX_PROJECTS - 1, int(i))) })),
    };
  } catch { return null; }
  return JSON.stringify(out) === JSON.stringify(s) ? out : null;
}

/** One event: { kind, at, n?, project?, session?, role?, to? } (project, session, role: the index of one of the snapshot's; to: PLACES).
 *  null if it isn't one. */
export function cleanEvent(e) {
  if (!e || typeof e !== 'object' || !KINDS.includes(e.kind)) return null;
  const out = { kind: e.kind, at: time(e.at) };
  if (e.n != null) out.n = Math.max(-1e6, Math.min(1e6, Math.floor(Number(e.n) || 0)));
  if (e.project != null) out.project = Math.min(MAX_PROJECTS - 1, int(e.project));
  if (e.session != null) out.session = Math.min(MAX_SESSIONS - 1, int(e.session));
  if (e.role != null) out.role = Math.min(MAX_ROLES - 1, int(e.role));
  if (e.to != null) out.to = Array.isArray(e.to) ? [...new Set(e.to.filter((p) => PLACES.includes(p)))].slice(0, PLACES.length) : [];
  return JSON.stringify(out) === JSON.stringify(e) ? out : null;
}
export const cleanEvents = (list) => (Array.isArray(list) ? list.slice(-MAX_EVENTS).map(cleanEvent).filter(Boolean) : []);
