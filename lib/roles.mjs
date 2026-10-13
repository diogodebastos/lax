// Roles, what Lax becomes (Phase 6.3). Lax does real work for you, and gets good at kinds of work: your researcher
// first; your lawyer, assistant or doctor can follow. A role is named after who does the work (researcher). Roles are not declared; they are what Lax has practised.
// - A role is a practice in the mind: roles/<role>.md, how Lax does that work, rewritten after each piece of it.
// - Its work is kept as episodes that say `role: <role>` (and `made:` what it produced), so recall finds it.
// - A new role is drafted by a reflection once that kind of work keeps coming back, offered at a quiet moment on the
//   phone, and only your yes makes it one of Lax's roles (~/.lax/roles.json).
import fs from 'node:fs';
import path from 'node:path';
import { HOME, MIND } from './paths.mjs';
import { commitMind } from './home.mjs';
import { verdict, laterFor } from './learn.mjs';

export const ROLES = path.join(MIND, 'roles');
export const STATE = path.join(HOME, 'roles.json');
const EPISODES = path.join(MIND, 'episodes');
export const validRole = (n) => /^[a-z][a-z-]{1,23}$/.test(String(n || ''));
const cut = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };

/** An episode's header lines: { title, when, where, kind, outcome, role, made }. */
export function header(text) {
  const h = (k) => new RegExp(`^${k}:[ \\t]*(.*)$`, 'm').exec(text)?.[1].trim() || '';
  return { title: /^#\s+(.+)$/m.exec(text)?.[1].trim() || '', when: h('when'), where: h('where'), kind: h('kind'), outcome: h('outcome'),
    role: h('role').toLowerCase(), made: h('made') };
}

/** Every piece of work a role did, from the episodes that say so, newest first: [{ role, file, day, where, outcome, made, title }]. */
export function workLog() {
  const out = [];
  const walk = (dir) => { let l; try { l = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of l) { const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) { const h = header(read(p).slice(0, 1500));
        if (validRole(h.role)) out.push({ role: h.role, file: path.relative(MIND, p), day: /(\d{4}-\d{2}-\d{2})/.exec(e.name)?.[1] || h.when.slice(0, 10),
          where: h.where, outcome: h.outcome, made: h.made, title: h.title }); } } };
  walk(EPISODES);
  return out.sort((a, b) => b.day.localeCompare(a.day) || b.file.localeCompare(a.file));
}
/** A role's practice (roles/<role>.md), or ''. */
export const practice = (role) => (validRole(role) ? read(path.join(ROLES, role + '.md')) : '');

/** What Lax is, in roles, for the session brief: the practice of each role that worked in this project (it's the one a
 *  session there needs), a line for the others. active: the role names you confirmed. */
export function rolesBrief(active, project, log = workLog()) {
  if (!active.length) return '';
  const here = active.filter((r) => log.some((w) => w.role === r && w.where === project));
  const there = active.filter((r) => !here.includes(r));
  return (here.map((r) => `\nHow Lax works as the user's ${r} (its practice, roles/${r}.md; follow it for this kind of work):\n${practice(r).trim().slice(0, 1800)}\n`).join('')
    + (there.length ? `\nLax's other roles: ${there.map((r) => `${r} (${path.join(ROLES, r + '.md')})`).join(', ')}.\n` : ''));
}

/**
 * deps: { settings(), feed(line, kind, project), diary(text), say(text, kind), broadcast(type, data), pending (Map), quiet() → bool,
 *   gainXp(n), milestone(text), record(kind, text), mind(kind, extra), log(...) }
 */
export function createRoles(deps) {
  const EVERY = Number(process.env.LAX_ROLE_EVERY || 3 * 3600) * 1000;
  const LATER = Number(process.env.LAX_ROLE_LATER || 24 * 3600) * 1000;
  const me = () => deps.settings().name.toLowerCase();
  const load = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return { roles: [], lastOffer: 0 }; } };
  let list = load();
  const save = () => fs.writeFileSync(STATE, JSON.stringify(list, null, 2) + '\n');
  for (const r of list.roles) if (r.status === 'proposed') r.status = 'new'; // a question on screen is gone after a restart
  const find = (name) => list.roles.find((r) => r.name === name);
  const active = () => list.roles.filter((r) => r.status === 'active').map((r) => r.name);

  /** A role a reflection drafted (roles/<name>.md, named in its answer): waits for a quiet moment to be offered. */
  function drafted({ name, why }) {
    name = String(name || '').trim().toLowerCase();
    if (!validRole(name)) { deps.log?.(`role ${cut(name, 30)}: not a role name`); return false; }
    if (!practice(name).trim()) { deps.log?.(`role ${name}: no roles/${name}.md`); return false; }
    const r = find(name);
    if (r && ['declined', 'active', 'new', 'proposed', 'later'].includes(r.status)) return false; // asked already, or it is one
    list.roles.push({ name, why: cut(why, 300), status: 'new', drafted: Date.now() }); save();
    deps.feed(`  role drafted: ${name}`, 'diary', me()); deps.mind?.('rules');
    return true;
  }

  // ---------- offer by voice, at a quiet moment ----------
  let asking = null, askingName = '';
  function offer(r) {
    if (asking) deps.pending.get(asking)?.finish('none');
    const n = workLog().filter((w) => w.role === r.name).length;
    r.status = 'proposed'; r.offered = Date.now(); list.lastOffer = Date.now(); save();
    const id = `role-${r.name}-${Date.now().toString(36)}`;
    const say = `I've worked as your ${r.name}${n > 1 ? ` ${n} times` : ''}. Shall I become your ${r.name}? I'd keep how I do it, and get better at it.`;
    const bubble = { id, kind: 'question', project: me(), text: say, details: `${r.why ? 'Why: ' + r.why + '\n\n' : ''}${practice(r.name)}`, speak: true,
      questions: [{ question: say, header: 'role', options: [
        { label: 'Yes', description: `Become your ${r.name}` },
        { label: 'No', description: 'Don\'t offer it again' },
        { label: 'Later', description: 'Ask me tomorrow' }] }] };
    const timer = setTimeout(() => deps.pending.get(id)?.finish('none'), 10 * 60e3);
    asking = id; askingName = r.name;
    deps.pending.set(id, { bubble, finish(decision, answers) {
      if (!deps.pending.delete(id)) return;
      clearTimeout(timer); deps.broadcast('clear', { id });
      if (asking === id) { asking = null; askingName = ''; }
      answer(r.name, decision === 'answer' ? String(Object.values(answers || {})[0] || '') : '');
    } });
    deps.broadcast('bubble', bubble);
  }
  function answer(name, said) {
    const r = find(name); if (!r || r.status !== 'proposed') return;
    const v = verdict(said);
    if (!said) { r.status = 'later'; r.laterUntil = Date.now() + EVERY; return save(); }
    if (v === 'yes') return take(name);
    if (v === 'no') return decline(name);
    const wait = laterFor(said) || LATER, days = Math.round(wait / 86400e3);
    r.status = 'later'; r.laterUntil = Date.now() + wait; save();
    deps.say(`Okay, I'll ask you again ${days > 1 ? `in ${days} days` : 'tomorrow'}.`);
  }
  function tick() {
    if (!deps.settings().learns || asking || !deps.quiet() || Date.now() - (list.lastOffer || 0) < EVERY) return;
    const r = list.roles.find((x) => x.status === 'new' || (x.status === 'later' && Date.now() > (x.laterUntil || 0)));
    if (r) offer(r);
  }
  setInterval(tick, 60e3).unref();

  /** Your spoken answer to the role question on screen. */
  function hears(text) {
    if (!asking || !deps.pending.has(asking)) return false;
    deps.feed(`> ${cut(text, 90)}`, 'prompt', me());
    deps.pending.get(asking).finish('answer', { q: text });
    return true;
  }

  // ---------- yes, no, forget ----------
  /** Your yes: it's one of Lax's roles from now on. Returns why not, or ''. */
  function take(name) {
    const r = find(name); if (!r) return 'there is no such role';
    if (!practice(name).trim()) { r.status = 'new'; save(); return 'its practice is gone from my mind'; }
    const first = !active().length;
    r.status = 'active'; r.since = Date.now(); save();
    commitMind(`I took on a role: ${name}`);
    deps.feed(`✦ new role: ${name}`, 'done', me()); deps.mind?.('practice', { role: name });
    deps.diary?.(`took on a role: ${name}`); deps.gainXp?.(20);
    deps.milestone?.(first ? `${deps.settings().name} took on its first role: ${name}` : `${deps.settings().name} took on a role: ${name}`);
    deps.record?.('role taken', name);
    if (askingName === name) deps.pending.get(asking)?.finish('none'); // said yes in the menu while it was asking
    deps.say(`Done. I'm your ${name} now.`);
    return '';
  }
  function decline(name) {
    const r = find(name); if (!r) return false;
    r.status = 'declined'; r.declined = Date.now(); save();
    if (askingName === name) deps.pending.get(asking)?.finish('none');
    deps.record?.('role declined', name);
    deps.say(`Okay, I won't offer ${name} again.`);
    return true;
  }
  /** Gone: no longer a role, its practice removed from the mind (its work stays, in the episodes). */
  function forget(name) {
    const r = find(name); if (!r || !validRole(name)) return false;
    fs.rmSync(path.join(ROLES, name + '.md'), { force: true });
    commitMind(`forgot role: ${name}`);
    list.roles = list.roles.filter((x) => x !== r); save();
    deps.record?.('forgot', `role ${name}`);
    deps.feed(`  forgot role: ${name}`, 'diary', me()); deps.mind?.('forget');
    return true;
  }
  /** Rebirth that wipes what it knows: its roles and their practice. */
  function wipe() { fs.rmSync(ROLES, { recursive: true, force: true }); list = { roles: [], lastOffer: 0 }; save(); }

  /** For the phone and the `self` tool: each role it has or offered, its work so far, and its practice. */
  const view = (log = workLog()) => list.roles.filter((r) => r.status !== 'declined').map((r) => {
    const work = log.filter((w) => w.role === r.name);
    return { name: r.name, status: r.status, why: r.why || '', since: r.since || null, work: work.length,
      projects: [...new Set(work.map((w) => w.where).filter(Boolean))], last: work[0]?.day || null, practice: practice(r.name) };
  });

  return { drafted, offer: (n) => find(n) && offer(find(n)), hears, tick, take, decline, forget, wipe, view, active,
    list: () => list.roles, asking: () => !!asking };
}
