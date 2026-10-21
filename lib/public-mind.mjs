// Lax's mind on the website (Phase 6.1): the Mac sends the public shape of its mind (lib/mind-shape.mjs) and what it's
// doing to the Worker that serves <host>/demo/mind (demo/worker.mjs), which keeps the last of it so the
// page still shows Lax (asleep) with the Mac off. Sent a moment after something happens, at most every few seconds,
// and every 5 minutes anyway (that's how the page knows the Mac is awake). Without its key (~/.lax/secrets/mind-key)
// nothing is sent: tests, another machine.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { MIND, HOME, ARCHIVE, secret, readEnv } from './paths.mjs';
import { shape, cleanEvent, rolesOf, MAX_EVENTS } from './mind-shape.mjs';
import { workLog } from './roles.mjs';

const PROJECTS = path.join(MIND, 'projects'), EPISODES = path.join(MIND, 'episodes');
const bullets = (t) => String(t || '').split('\n').filter((l) => /^\s*[-*] /.test(l)).length;
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const mtime = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };

// How many times its mind changed this week: commits to the mind's history (notes, episodes, how it learns).
const git = (...a) => { try { return execFileSync('git', ['-C', MIND, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return ''; } };
function changesThisWeek() { return Number(git('rev-list', '--count', '--since=7.days', 'HEAD').trim()) || 0; }
// All time, from the same history: every change, and every reflection or weekly review (its dreams).
const changesEver = () => Number(git('rev-list', '--count', 'HEAD').trim()) || 0;
const dreamsEver = () => git('log', '--format=%s').split('\n').filter((s) => /^(learned from |weekly review)/.test(s)).length;
// What its notes about you got this week: the changes that touched them.
const youThisWeek = () => git('log', '--since=7.days', '--format=%H', '--', 'CLAUDE.md').split('\n').filter(Boolean).length;

/** What Lax has, from its files, for shape(): counts and names only. */
export function readMind({ color, stage, sessions = [], heard = 0, spoke = 0, dreams = 0, heardEver = 0, spokeEver = 0, busy = false, owner = '', doing = {} } = {}) {
  const week = (t) => Date.now() - (Number(t) || 0) < 7 * 864e5;
  const files = []; const walk = (d) => { let l; try { l = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of l) e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.md') && files.push(e.name); };
  walk(EPISODES);
  let projects = []; try { projects = fs.readdirSync(PROJECTS).filter((f) => f.endsWith('.md')).map((f) => ({ name: f.slice(0, -3), notes: bullets(read(path.join(PROJECTS, f))) })); } catch {}
  let archive = 0, archiveNew = 0; try { const f = Object.values(JSON.parse(read(path.join(path.dirname(ARCHIVE), 'state.json'))).files || {}); archive = f.length; archiveNew = f.filter((x) => week(x.kept)).length; } catch {}
  let skills = []; try { skills = JSON.parse(read(path.join(HOME, 'skills.json'))).skills || []; } catch {}
  // Its wishes still open (lib/wishes: not merged, not declined): what it can't do yet and would learn.
  let wishes = 0, wishesNew = 0; try { const l = JSON.parse(read(path.join(HOME, 'wishes.json'))).wishes || []; wishes = l.filter((w) => !['merged', 'declined'].includes(w.status)).length; wishesNew = l.filter((w) => week(w.first)).length; } catch {}
  // The roles you confirmed (lib/roles.mjs), each with the pieces of work its episodes record.
  let roles = []; try { const log = workLog(); roles = (JSON.parse(read(path.join(HOME, 'roles.json'))).roles || []).filter((r) => r.status === 'active')
    .map((r) => ({ name: r.name, work: log.filter((w) => w.role === r.name).map((w) => ({ day: w.day, where: w.where })) })); } catch {}
  return { color, stage, you: bullets(read(path.join(MIND, 'CLAUDE.md')).split(/^## Notes\s*$/m)[1]), projects, episodes: files, archive, skills,
    rules: Object.fromEntries(['learning', 'remembering', 'wishing'].map((k) => [k, mtime(path.join(MIND, k + '.md'))])), sessions,
    heard, spoke, dreams, busy, owner, doing, changes: changesThisWeek(), roles, wishes,
    fresh: { you: youThisWeek(), archive: archiveNew, skills: skills.filter((s) => week(s.drafted)).length, wishes: wishesNew },
    total: { heard: Math.max(heardEver, heard), spoke: Math.max(spokeEver, spoke), changes: changesEver(), dreams: dreamsEver() } };
}

/** Where a change in its mind went, from the files of its last commit (or the ones a recall's answer names):
 *  { to: ['you' | 'memory' | 'archive' | 'skills' | 'learning' | 'project'], project: the first project's name }. */
export function placesOf(files) {
  const to = new Set(); let project;
  for (const f of files) {
    if (/(^|\/)CLAUDE\.md$/.test(f)) to.add('you');
    else if (/(^|\/)projects\/([^/]+)\.md/.test(f)) { to.add('project'); project ??= /projects\/([^/]+)\.md/.exec(f)[1]; }
    else if (/(^|\/)episodes\//.test(f)) to.add('memory');
    else if (/\.jsonl\b|archive\/transcripts/.test(f)) to.add('archive');
    else if (/(^|\/)skills\//.test(f)) to.add('skills');
    else if (/(^|\/)(learning|remembering|wishing)\.md$/.test(f)) to.add('learning');
  }
  return { to: [...to], project };
}
/** The files its mind's last commit changed. */
export function lastCommitFiles() {
  try { return execFileSync('git', ['-C', MIND, 'show', '--name-only', '--format=', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean); } catch { return []; }
}
/** The files a recall's answer says it found it in (paths in its mind or its archive). */
export const filesIn = (answer) => String(answer || '').match(/[\w./~-]*(?:episodes\/[\w./-]+|projects\/[\w.-]+\.md|CLAUDE\.md|[\w-]+\.jsonl)/g) || [];

/** deps: { live: () => ({ color, stage, sessions, … }), allow: () => [project names], log, fetch } */
export function createPublicMind(deps) {
  const doFetch = deps.fetch || globalThis.fetch;
  const key = () => deps.key?.() ?? read(secret('mind-key')).trim();
  const origin = () => deps.origin?.() ?? (readEnv().LAX_PUBLIC_URL ? new URL(readEnv().LAX_PUBLIC_URL).origin : '');
  let events = [], recent = [], timer = null, last = 0, sent = '';
  const tools = new Map(); // session id → tool calls since the last push
  const allowRoles = () => deps.allowRoles?.() || [];
  const snapshot = () => shape(readMind(deps.live()), deps.allow(), Date.now(), allowRoles());

  /** Something happened: kind (lib/mind-shape.mjs KINDS), n (how many), project and role (their names: sent as their
   *  places only), to (where it went: lib/mind-shape.mjs PLACES). Fields in the order the Worker checks them. */
  function event(kind, { n, project, role, to } = {}) {
    const e = { kind, at: Date.now() };
    if (n != null) e.n = n;
    const mind = project != null || role != null ? readMind({}) : null;
    if (project != null) { const names = mind.projects.sort((a, b) => b.notes - a.notes || a.name.localeCompare(b.name)).slice(0, 4).map((p) => p.name);
      const i = names.indexOf(project); if (i >= 0) e.project = i; }
    if (role != null) { const i = rolesOf(mind).findIndex((r) => r.name === role); if (i < 0) return; e.role = i; }
    if (to) e.to = to;
    if (!cleanEvent(e)) return;
    if (kind !== 'tool') recent = [...recent, e].slice(-50);
    events.push(e); if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
    soon(400);
  }
  /** A tool call in one of your sessions (its id): sent as a count, with the session's place in the snapshot. */
  function tool(sid) { tools.set(sid, (tools.get(sid) || 0) + 1); soon(400); }
  /** Something may have changed (the phone's state was pushed): send if the shape moved. */
  const changed = (ms = 2000) => soon(ms);
  function soon(ms) { if (timer) return; timer = setTimeout(push, Math.max(ms, last + 1500 - Date.now())); timer.unref?.(); }

  async function push(force = false) {
    timer = null;
    const k = key(), o = origin(); if (!k || !o) { events = []; return false; }
    const live = deps.live(), snap = shape(readMind(live), deps.allow(), Date.now(), allowRoles());
    for (const [sid, n] of tools) { const i = (live.sessions || []).findIndex((s) => s.id === sid); if (i >= 0 && i < 6) events.push({ kind: 'tool', at: Date.now(), n: Math.min(n, 50), session: i }); }
    tools.clear();
    const body = JSON.stringify({ snap, events }), same = JSON.stringify({ ...snap, seen: 0 }) === sent;
    if (same && !events.length && !force) return false;
    const out = events; events = []; last = Date.now();
    try {
      const r = await doFetch(o + '/demo/mind/api/push', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + k }, body });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      sent = JSON.stringify({ ...snap, seen: 0 }); return true;
    } catch (e) { deps.log?.('push failed:', e.message); events = [...out, ...events].slice(-MAX_EVENTS); return false; }
  }
  // Every 5 minutes: the page shows Lax asleep after 10 minutes without word from the Mac.
  const beat = setInterval(() => push(true), 5 * 60e3); beat.unref?.();
  setTimeout(() => push(true), 5000).unref?.();

    // The same for the local preview (server.mjs serves /demo/mind/api/snap): the last events, as the Worker keeps them.
  const view = () => ({ snap: snapshot(), recent });
  /** A share card (lib/card.mjs), kept by the same Worker: its page's address, or null (no key, or it refused). */
  async function card(c, png) {
    const k = key(), o = origin(); if (!k || !o) return null;
    try {
      const r = await doFetch(o + '/demo/card/api/make', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + k },
        body: JSON.stringify({ card: c, png: png.toString('base64') }) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return `${o}/demo/card/${(await r.json()).id}`;
    } catch (e) { deps.log?.('card failed:', e.message); return null; }
  }
  return { event, tool, changed, push, snapshot, view, card, stop: () => clearInterval(beat) };
}
