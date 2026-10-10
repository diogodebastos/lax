// Lax's mind on the website (Phase 6.1): the Mac sends the public shape of its mind (lib/mind-shape.mjs) and what it's
// doing to the Worker that serves lax.diogodebastos.com/demo/mind (demo/worker.mjs), which keeps the last of it so the
// page still shows Lax (asleep) with the Mac off. Sent a moment after something happens, at most every few seconds,
// and every 5 minutes anyway (that's how the page knows the Mac is awake). Without its key (~/.lax/secrets/mind-key)
// nothing is sent: tests, another machine.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { MIND, HOME, ARCHIVE, secret, readEnv } from './paths.mjs';
import { shape, cleanEvent, MAX_EVENTS } from './mind-shape.mjs';

const PROJECTS = path.join(MIND, 'projects'), EPISODES = path.join(MIND, 'episodes');
const bullets = (t) => String(t || '').split('\n').filter((l) => /^\s*[-*] /.test(l)).length;
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const mtime = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };

// How many times its mind changed this week: commits to the mind's history (notes, episodes, how it learns).
function changesThisWeek() { try { return Number(execFileSync('git', ['-C', MIND, 'rev-list', '--count', '--since=7.days', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()) || 0; } catch { return 0; } }

/** What Lax has, from its files, for shape(): counts and names only. */
export function readMind({ color, stage, sessions = [], heard = 0, spoke = 0, busy = false, owner = '' } = {}) {
  const files = []; const walk = (d) => { let l; try { l = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of l) e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.md') && files.push(e.name); };
  walk(EPISODES);
  let projects = []; try { projects = fs.readdirSync(PROJECTS).filter((f) => f.endsWith('.md')).map((f) => ({ name: f.slice(0, -3), notes: bullets(read(path.join(PROJECTS, f))) })); } catch {}
  let archive = 0; try { archive = Object.keys(JSON.parse(read(path.join(path.dirname(ARCHIVE), 'state.json'))).files || {}).length; } catch {}
  let skills = []; try { skills = JSON.parse(read(path.join(HOME, 'skills.json'))).skills || []; } catch {}
  return { color, stage, you: bullets(read(path.join(MIND, 'CLAUDE.md')).split(/^## Notes\s*$/m)[1]), projects, episodes: files, archive, skills,
    rules: Object.fromEntries(['learning', 'remembering', 'wishing'].map((k) => [k, mtime(path.join(MIND, k + '.md'))])), sessions,
    heard, spoke, busy, owner, changes: changesThisWeek() };
}

/** deps: { live: () => ({ color, stage, sessions }), allow: () => [project names], log, fetch } */
export function createPublicMind(deps) {
  const doFetch = deps.fetch || globalThis.fetch;
  const key = () => deps.key?.() ?? read(secret('mind-key')).trim();
  const origin = () => deps.origin?.() ?? (readEnv().LAX_PUBLIC_URL ? new URL(readEnv().LAX_PUBLIC_URL).origin : '');
  let events = [], recent = [], timer = null, last = 0, sent = '';
  const snapshot = () => shape(readMind(deps.live()), deps.allow());

  /** Something happened: kind (lib/mind-shape.mjs KINDS), n (how many), project (its name: sent as its place only). */
  function event(kind, { n, project } = {}) {
    const e = { kind, at: Date.now() };
    if (n != null) e.n = n;
    if (project != null) { const names = readMind({}).projects.sort((a, b) => b.notes - a.notes || a.name.localeCompare(b.name)).slice(0, 4).map((p) => p.name);
      const i = names.indexOf(project); if (i >= 0) e.project = i; }
    if (!cleanEvent(e)) return;
    events.push(e); if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
    recent = [...recent, e].slice(-50);
    soon(400);
  }
  /** Something may have changed (the phone's state was pushed): send if the shape moved. */
  const changed = () => soon(2000);
  function soon(ms) { if (timer) return; timer = setTimeout(push, Math.max(ms, last + 3000 - Date.now())); timer.unref?.(); }

  async function push(force = false) {
    timer = null;
    const k = key(), o = origin(); if (!k || !o) { events = []; return false; }
    const snap = snapshot(), body = JSON.stringify({ snap, events }), same = JSON.stringify({ ...snap, seen: 0 }) === sent;
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
  return { event, changed, push, snapshot, view, stop: () => clearInterval(beat) };
}
