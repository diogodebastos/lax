// Know-how (Phase 6): a workflow you repeat becomes a skill Claude Code can run in every session. Lax drafts it in its
// mind (mind/skills/<name>/SKILL.md, from its weekly review or when you ask), offers it at a quiet moment with the whole
// text to read, and installs it (~/.claude/skills/lax-<name>/) only on your yes. Forgotten on request, from the phone or
// by voice. Guardrails in code, like wishes: one plain SKILL.md, no tool grants, nothing about Lax's secrets or about
// getting around permissions; the text you said yes to is exactly what's installed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { HOME, MIND, SECRETS, DB } from './paths.mjs';
import { commitMind } from './home.mjs';
import { verdict } from './learn.mjs';

export const DRAFTS = path.join(MIND, 'skills');
export const STATE = path.join(HOME, 'skills.json');
export const INSTALLED = path.resolve(process.env.LAX_SKILLS_DIR || path.join(os.homedir(), '.claude', 'skills'));
const MAX = 12000;
const cut = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex').slice(0, 16);
export const validName = (n) => /^[a-z0-9][a-z0-9-]{1,39}$/.test(String(n || ''));

/** The frontmatter of a SKILL.md, as { key: value } (null if it has none). */
export function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(String(text || ''));
  if (!m) return null;
  return Object.fromEntries(m[1].split('\n').map((l) => /^([\w-]+):\s*(.*)$/.exec(l)).filter(Boolean).map((x) => [x[1].toLowerCase(), x[2].trim()]));
}

// What a skill may never say: Lax's secrets and database, ways around permissions, piping the web into a shell, force pushes.
const NEVER = [
  [/\.lax\/secrets|\blife\.db\b/i, 'it mentions my secrets or my database'],
  [/dangerously-skip-permissions|bypassPermissions|--dangerously/i, 'it gets around permissions'],
  [/\b(?:curl|wget)\b[^\n|]*\|\s*(?:ba|z)?sh\b/i, 'it pipes something from the web into a shell'],
  [/\bgit\s+push\b[^\n]*(?:--force\b|\s-f\b)/i, 'it force-pushes'],
  [/\brm\s+-[a-z]*r[a-z]*f?\s+(?:~|\/|\$HOME)(?:\s|$)/i, 'it deletes a home or root folder'],
];
/** Is this draft fit to offer and install? '' when it is, or why not. */
export function check(name, dir = path.join(DRAFTS, String(name))) {
  if (!validName(name)) return `"${cut(name, 40)}" isn't a skill name (lowercase words with dashes)`;
  let files; try { files = fs.readdirSync(dir); } catch { return 'there is no draft'; }
  if (files.some((f) => f !== 'SKILL.md')) return 'a skill is one SKILL.md, nothing else';
  let text; try { text = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8'); } catch { return 'there is no SKILL.md'; }
  if (text.length > MAX) return `it's too long (${text.length} characters; at most ${MAX})`;
  const fm = frontmatter(text);
  if (!fm || !fm.name || !fm.description) return 'it needs a frontmatter with a name and a description';
  if (Object.keys(fm).some((k) => !['name', 'description'].includes(k))) return 'its frontmatter may only have a name and a description (no tool grants)';
  for (const p of [SECRETS, DB]) if (text.includes(p)) return 'it mentions my secrets or my database';
  for (const [re, why] of NEVER) if (re.test(text)) return why;
  return '';
}

/**
 * deps: { settings(), feed(line, kind, project), diary(text), say(text, kind), broadcast(type, data), pending (Map), quiet() → bool,
 *   gainXp(n), milestone(text), record(kind, text), log(...) }
 */
export function createSkills(deps) {
  const EVERY = Number(process.env.LAX_SKILL_EVERY || 3 * 3600) * 1000;
  const LATER = Number(process.env.LAX_SKILL_LATER || 24 * 3600) * 1000;
  const me = () => deps.settings().name.toLowerCase();
  const load = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return { skills: [], lastOffer: 0 }; } };
  let list = load();
  const save = () => fs.writeFileSync(STATE, JSON.stringify(list, null, 2) + '\n');
  for (const s of list.skills) if (s.status === 'proposed') s.status = 'new'; // a question on screen is gone after a restart
  const find = (name) => list.skills.find((s) => s.name === name);
  const draftText = (name) => { try { return fs.readFileSync(path.join(DRAFTS, name, 'SKILL.md'), 'utf8'); } catch { return ''; } };
  const target = (name) => path.join(INSTALLED, `lax-${name}`);

  /** A draft Lax wrote (its answer named it): checked, then waits for a quiet moment to be offered. */
  function drafted({ name, why }) {
    name = String(name || '').trim();
    const no = check(name), s = find(name);
    if (no) { deps.log?.(`skill ${name}: ${no}`); deps.record?.('skill refused', `${name}: ${no}`); return false; }
    if (s?.status === 'declined') return false; // you said no: not offered again
    if (s?.status === 'installed' && s.hash === hash(draftText(name))) return false; // nothing new
    const entry = { name, why: cut(why, 300), status: 'new', drafted: Date.now(), hash: hash(draftText(name)) };
    if (s) Object.assign(s, entry); else list.skills.push(entry);
    save(); deps.feed(`  skill drafted: ${name}`, 'diary', me());
    return true;
  }

  // ---------- offer by voice, at a quiet moment ----------
  let asking = null, askingName = '';
  function offer(s) {
    if (asking) deps.pending.get(asking)?.finish('none');
    const text = draftText(s.name), fm = frontmatter(text) || {};
    s.status = 'proposed'; s.offered = Date.now(); s.hash = hash(text); list.lastOffer = Date.now(); save();
    const id = `skill-${s.name}-${Date.now().toString(36)}`, say = `I could learn a skill: ${s.name}. ${cut(fm.description, 140)} Install it for every session?`;
    const bubble = { id, kind: 'question', project: me(), text: say, details: `${s.why ? 'Why: ' + s.why + '\n\n' : ''}${text}`, speak: true,
      questions: [{ question: say, header: 'skill', options: [
        { label: 'Yes', description: 'Install it for every Claude Code session' },
        { label: 'No', description: 'Don\'t offer it again' },
        { label: 'Later', description: 'Ask me tomorrow' }] }] };
    const timer = setTimeout(() => deps.pending.get(id)?.finish('none'), 10 * 60e3);
    asking = id; askingName = s.name;
    deps.pending.set(id, { bubble, finish(decision, answers) {
      if (!deps.pending.delete(id)) return;
      clearTimeout(timer); deps.broadcast('clear', { id });
      if (asking === id) { asking = null; askingName = ''; }
      answer(s.name, decision === 'answer' ? String(Object.values(answers || {})[0] || '') : '');
    } });
    deps.broadcast('bubble', bubble);
  }
  function answer(name, said) {
    const s = find(name); if (!s || s.status !== 'proposed') return;
    const v = verdict(said);
    if (!said) { s.status = 'later'; s.laterUntil = Date.now() + EVERY; return save(); }
    if (v === 'yes') return install(name);
    if (v === 'no') return decline(name);
    s.status = 'later'; s.laterUntil = Date.now() + LATER; save();
    deps.say(v === 'later' ? `Okay, I'll ask you tomorrow.` : `I'll keep it as a draft and ask you tomorrow. You can also look at it in my menu.`);
  }
  function tick() {
    if (!deps.settings().learns || asking || !deps.quiet() || Date.now() - (list.lastOffer || 0) < EVERY) return;
    const s = list.skills.find((x) => x.status === 'new' || (x.status === 'later' && Date.now() > (x.laterUntil || 0)));
    if (s) offer(s);
  }
  setInterval(tick, 60e3).unref();

  /** Your spoken answer to the skill question on screen. */
  function hears(text) {
    if (!asking || !deps.pending.has(asking)) return false;
    deps.feed(`> ${cut(text, 90)}`, 'prompt', me());
    deps.pending.get(asking).finish('answer', { q: text });
    return true;
  }

  // ---------- yes, no, forget ----------
  /** Installs what was offered, if it's still that text and still passes the guardrails. Returns why not, or ''. */
  function install(name) {
    const s = find(name);
    if (!s) return 'there is no such skill';
    const text = draftText(name), no = check(name);
    const why = no || (s.hash && s.hash !== hash(text) ? 'it changed since I showed it to you' : '');
    if (why) { s.status = no ? 'refused' : 'new'; s.why = no || s.why; save(); if (no) deps.record?.('skill refused', `${name}: ${no}`); deps.say(`I didn't install ${name}: ${why}.`, 'error'); return why; }
    const dir = target(name);
    fs.mkdirSync(dir, { recursive: true });
    // Installed as lax-<name>, so it's clear in every session where it came from.
    fs.writeFileSync(path.join(dir, 'SKILL.md'), text.replace(/^---\n([\s\S]*?)\n---\n/, (m, head) => `---\n${head.replace(/^name:.*$/m, `name: lax-${name}`)}\n---\n`));
    const first = !list.skills.some((x) => x.status === 'installed');
    s.status = 'installed'; s.installed = Date.now(); s.hash = hash(text); save();
    deps.feed(`✦ skill installed: lax-${name}`, 'done', me());
    deps.diary?.(`learned a skill: ${name}`); deps.gainXp?.(10);
    if (first) deps.milestone?.(`${deps.settings().name} learned its first skill: ${name}`);
    deps.record?.('skill installed', name);
    if (askingName === name) deps.pending.get(asking)?.finish('none'); // said yes in the menu while it was asking
    deps.say(`Installed. Every Claude Code session can use ${name} now.`);
    return '';
  }
  function decline(name) {
    const s = find(name); if (!s) return false;
    s.status = 'declined'; s.declined = Date.now(); save();
    if (askingName === name) deps.pending.get(asking)?.finish('none');
    deps.record?.('skill declined', name);
    deps.say(`Okay, I won't offer ${name} again.`);
    return true;
  }
  /** Gone everywhere: uninstalled, its draft removed from the mind. */
  function forget(name) {
    const s = find(name); if (!s || !validName(name)) return false;
    fs.rmSync(target(name), { recursive: true, force: true });
    fs.rmSync(path.join(DRAFTS, name), { recursive: true, force: true });
    commitMind(`forgot skill: ${name}`);
    list.skills = list.skills.filter((x) => x !== s); save();
    deps.record?.('forgot', `skill ${name}`);
    deps.feed(`  forgot skill: ${name}`, 'diary', me());
    return true;
  }
  /** Rebirth that wipes what it knows: every skill it installed, and its drafts. */
  function wipe() {
    for (const s of [...list.skills]) { fs.rmSync(target(s.name), { recursive: true, force: true }); }
    fs.rmSync(DRAFTS, { recursive: true, force: true });
    list = { skills: [], lastOffer: 0 }; save();
  }

  /** For the phone: every skill it has, with its description, and a draft's whole text (what a yes installs). */
  const view = () => list.skills.filter((s) => !['declined', 'refused'].includes(s.status)).map((s) => {
    const text = draftText(s.name);
    return { name: s.name, status: s.status, why: s.why, description: cut(frontmatter(text)?.description, 200), ...(s.status !== 'installed' && { text }) };
  });

  return { drafted, offer: (n) => find(n) && offer(find(n)), hears, tick, install, decline, forget, wipe, view,
    list: () => list.skills, asking: () => !!asking };
}
