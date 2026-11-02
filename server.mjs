// Lax — a pixel companion for Claude Code.
// The Mac is the hub: this server stores Lax's memory (SQLite), receives Claude Code
// hook events, and streams state to the phone, which is just Lax's body (a browser page).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { ensureHome, commitMind, mindHead, forgotSince, syncMindName, syncMindSelf, addMemoryLayout, addToolsAdvice, addWishAdvice, addKnowAdvice, addFreshAdvice, addEpisodesAdvice, addScheduleAdvice, addSelfAdvice, addVisualsAdvice } from './lib/home.mjs';
import { ensureSelf, self } from './lib/self.mjs';
import { createRoles, workLog } from './lib/roles.mjs';
import { HOME, MIND, DB, OLD_DB, SETTINGS, VOCAB, secret } from './lib/paths.mjs';
import { APP_NAME, DEFAULT_COMPANION_NAME } from './lib/names.mjs';
import { readVocab, addHeard, addWord, allHeard, knownWords, dictatedNote, answerIn, teachCommand, typedOver } from './lib/vocab.mjs';
import { HOST, TOKEN, authed, isLocal, phoneUrl, pairPage } from './lib/auth.mjs'; // first: it loads Lax's home and local config
import { grantKey, repoRoot } from './lib/allow.mjs';
import { MAX_LEVEL, STAGES, levelOf as levelOn, stageIdx, barFor as barOn } from './lib/levels.mjs';
import { SPECIES, BRANCHES, BARS, BRICK, EGG_XP, RARE, LIMIT_PCT, signals, ratios, pick, branch, dayNight, dayKey, eggProgress, shouldHatch, formFor, nameFor, curveFor, replayEgg, aName, selfLine } from './lib/species.mjs';
import { createBrain, ensureBrain, addAcross, addSkills, addEpisodesToLearning, addRoles, addRolesToRemembering, brief, episodes, forgetEpisode, wipeKnowledge, PROJECTS } from './lib/brain.mjs';
import { createSkills } from './lib/skills.mjs';
import { matchSession, TELL_NOTE } from './lib/tell.mjs';
import { createLearn } from './lib/learn.mjs';
import { createSchedule } from './lib/schedule.mjs';
import { createImprove, ANNOYED, unheard } from './lib/improve.mjs';
import { createInitiative } from './lib/initiative.mjs';
import { ACTIONS, voiceAction, sendAction, readStatus, tabCommand } from './lib/actions.mjs';
import { readUsage, eventLimits, limitWarnings, usageText } from './lib/usage.mjs';
import { openTerminal, q, ON_MAC, closeTarget } from './lib/terminal.mjs';
import { tailRecords, newAssistantText, conversation } from './lib/transcript.mjs';
import { editDiff } from './lib/diff.mjs';
import { FRESH, FRESH_HOURS, FRESH_TOKENS, freshDue, contextSize, recap } from './lib/talk.mjs';
import { claudeAlive } from './lib/claude-pid.mjs';
import { createArchive } from './lib/archive.mjs';
import { recall } from './lib/recall.mjs';
import * as whisper from './lib/whisper.mjs';
import { createVisuals } from './lib/visuals.mjs';
import { createPublicMind, placesOf, lastCommitFiles, filesIn } from './lib/public-mind.mjs';
import { startRelay } from './lib/relay.mjs';
import { once } from './lib/once.mjs';
import { startWays } from './lib/ways.mjs';
import { watchPower } from './lib/power.mjs';
import { seal, unseal, sse, signPage } from './lib/seal.mjs';
import * as push from './lib/push.mjs';
import { cardOf, cardPng } from './lib/card.mjs';
import { story, timelapseGif, mindChanges } from './lib/timelapse.mjs';
import { POSTS, IMAGES, postPage, indexPage } from './lib/blog.mjs';
import { MAX_WAIT_S } from './hooks/timeouts.mjs';
import { createBudget, LEVELS } from './lib/budget.mjs';
import { onRateLimit } from './lib/claude-run.mjs';
import * as stuck from './lib/stuck.mjs';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const PORT = Number(process.env.LAX_PORT || 7777);
const MACHINE = process.platform === 'darwin' ? 'Mac' : 'computer'; // what Lax calls the computer it lives on
const STARTED = Date.now(); // for /api/health: a restart is over when a newer server answers
const DEFAULT_WORKDIR = process.env.LAX_WORKDIR || path.dirname(ROOT); // your projects: by default the folder Lax was cloned into
// The hooks run as `node …` in every claude Lax starts (its mind, reflections, jobs). Started by launchd, the PATH may have
// no node at all (nvm's is only in your shell): the hook then fails, nothing reaches the phone, and `claude -p` refuses.
process.env.PATH = [path.dirname(process.execPath), process.env.PATH].filter(Boolean).join(path.delimiter);

// ---------- memory ----------
// lax.db became life.db (what Lax has lived); settings moved out to settings.json. Once, before opening it.
for (const f of ['', '-wal', '-shm']) if (fs.existsSync(OLD_DB + f) && !fs.existsSync(DB + f)) fs.renameSync(OLD_DB + f, DB + f);
const db = new DatabaseSync(DB);
{ // Lax's mind learns about the rename once (its notes are kept; it's a one-line update).
  const md = path.join(MIND, 'CLAUDE.md');
  try {
    const t = fs.readFileSync(md, 'utf8'), old = t.split('\n').find((l) => l.startsWith(`- ${OLD_DB}:`));
    if (old) { fs.writeFileSync(md, t.replace(old, `- ${DB}: what you have lived (XP, level, stats, milestones, a journal of every session you saw). Your server keeps it; don't open it.\n- ${SETTINGS}: the user's preferences for you (name, colour, voice). They change these from the phone.`)); commitMind('lax.db is now life.db; settings in settings.json'); }
  } catch {}
}
db.exec(`
  CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, ts INTEGER, session TEXT, project TEXT, kind TEXT, text TEXT);
  CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS milestones (id INTEGER PRIMARY KEY, ts INTEGER, text TEXT);
`);
// The repo each event happened in (a worktree counts as its main repo), for the species (lib/species.mjs). Added later: old rows have none.
if (!db.prepare('PRAGMA table_info(events)').all().some((c) => c.name === 'repo')) db.exec('ALTER TABLE events ADD COLUMN repo TEXT');
const kvGet = (k, d) => { const r = db.prepare('SELECT value FROM kv WHERE key=?').get(k); return r ? JSON.parse(r.value) : d; };
const kvSet = (k, v) => db.prepare('INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, JSON.stringify(v));
const logEvent = (session, project, kind, text, repo = null) =>
  db.prepare('INSERT INTO events(ts,session,project,kind,text,repo) VALUES(?,?,?,?,?,?)').run(Date.now(), session || '', project || '', kind, text, repo);
const milestone = (text) => db.prepare('INSERT INTO milestones(ts,text) VALUES(?,?)').run(Date.now(), text);

const newPet = () => ({
  name: DEFAULT_COMPANION_NAME, born: Date.now(), xp: 0, tools: {}, langs: {}, sessions: 0, turns: 0,
  errors: 0, approvals: 0, denials: 0, voice: 0, streak: 0, lastDay: null, lastSeen: Date.now(),
  hatched: false, eggXp: 0, eggDays: [], // an egg until 1000 XP or 3 worked days (lib/species.mjs); then it hatches into its species
  species: null, days: {}, limitDays: [],
});
let pet = kvGet('pet', null) || newPet();
let voiceSessions = kvGet('voiceSessions', {}); // cwd -> claude session id
// Lax's own conversation: when you last talked, how full it is, and the one before it (lib/talk.mjs).
let laxTalk = kvGet('laxTalk', {}); // { last, tokens, prev }
if (!kvGet('pet', null)) { milestone(`${DEFAULT_COMPANION_NAME} was born`); }
// Phase 3.7 moved Lax to a new level curve (it went from brick back to sprout): note it once.
if (!kvGet('newPath', false)) { if (kvGet('pet', null)) milestone(`${readSettings().name || DEFAULT_COMPANION_NAME} started over on a new path`); kvSet('newPath', true); }

// Life menu settings — live on the Mac, edited from the phone.
const DEFAULTS = { name: DEFAULT_COMPANION_NAME, voice: true, sounds: true, pitch: 1.6, speakDone: false, captions: false,
  phoneApprovals: true, freeHands: false, askTimeout: Number(process.env.LAX_ASK_TIMEOUT || 30), theme: 'system', learns: true, listen: 'phone',
  push: 'away', // notifications to a subscribed phone (lib/push.mjs): off, away (only while no page is open) or always
  budget: 'light', // what Lax may spend of your plan by itself (lib/budget.mjs): light or normal
  speciesPick: false, speciesOverride: null, // while the species bars get tuned: pick one by hand
  publicProjects: ['lax'], // the projects whose names its mind on the website may show (the others show unnamed)
  publicRoles: ['researcher'], // the same for its roles (lib/roles.mjs): a role like a doctor's says more about you
  publicName: '' }; // what its mind on the website calls you ('' : "you")
// Preferences live in settings.json, a plain file you can read; rebirth leaves them alone.
function readSettings() { try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); } catch { return {}; } }
const writeSettings = (s) => fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + '\n');
if (!fs.existsSync(SETTINGS) && kvGet('settings', null)) { writeSettings(kvGet('settings', {})); db.prepare('DELETE FROM kv WHERE key=?').run('settings'); }
let settings = { ...DEFAULTS, ...readSettings() };
syncMindName(settings.name);
function updateSettings(b) {
  const clean = {};
  if (typeof b.name === 'string' && b.name.trim()) clean.name = b.name.trim().slice(0, 12);
  for (const k of ['voice', 'sounds', 'speakDone', 'captions', 'phoneApprovals', 'learns', 'speciesPick', 'freeHands']) if (typeof b[k] === 'boolean') clean[k] = b[k];
  const o = b.speciesOverride;
  if (o === null) clean.speciesOverride = null;
  else if (o && o.id === 'plain' && /^#[0-9a-f]{6}$/i.test(o.color || '')) clean.speciesOverride = { id: 'plain', color: o.color, branch: null, rare: false };
  else if (o && SPECIES[o.id]) clean.speciesOverride = { id: o.id, branch: BRANCHES[o.branch] ? o.branch : null, rare: !!o.rare };
  if (Number.isFinite(b.pitch)) clean.pitch = Math.min(2, Math.max(0.5, b.pitch));
  if ([15, 30, 60, 120].includes(b.askTimeout)) clean.askTimeout = b.askTimeout;
  if (['system', 'light', 'dark'].includes(b.theme)) clean.theme = b.theme;
  if (['phone', 'en-US', 'pt-PT'].includes(b.listen)) clean.listen = b.listen;
  if (['off', 'away', 'always'].includes(b.push)) clean.push = b.push;
  if (Object.hasOwn(LEVELS, b.budget)) clean.budget = b.budget;
  if (Array.isArray(b.hideTraits)) clean.hideTraits = [...new Set(b.hideTraits.filter((t) => typeof t === 'string' && /^[a-z]{1,16}$/.test(t)))];
  const renamed = clean.name && clean.name !== settings.name;
  settings = { ...settings, ...clean }; writeSettings(settings);
  if (renamed) syncMindName(settings.name); // its mind knows its new name
}
// Knowledge is separate from the pet: a rebirth keeps what Lax knows unless you ask it to forget that too.
function rebirth(knowledge = false) {
  if (knowledge) { wipeKnowledge(); skills.wipe(); roles.wipe(); for (const k of ['brainUpTo', 'episodeMilestone']) db.prepare('DELETE FROM kv WHERE key=?').run(k); }
  db.exec('DELETE FROM events; DELETE FROM milestones;');
  pet = newPet(); voiceSessions = {}; laxTalk = {}; kvSet('pet', pet); kvSet('voiceSessions', voiceSessions); kvSet('laxTalk', laxTalk); kvSet('diary', []); laxFeed.length = 0;
  leadCache.at = 0; autoCache.at = 0;
  milestone(`${settings.name} was born`);
}

// ---------- evolution (pure rules, no AI) ----------
// The species (read while Lax was an egg, lib/species.mjs) picks the growth curve, the form and the colour.
// While the bars get tuned, the Life menu can pick one by hand (settings.speciesPick): it wins everywhere until switched off.
function activeSpecies() {
  const o = settings.speciesPick && settings.speciesOverride;
  if (!o) return pet.species;
  const own = pet.species || {};
  if (o.id === 'plain') return { id: 'plain', color: o.color };
  return { id: o.id, rare: o.id === 'pink' && o.rare, copy: own.copy || null,
    branch: o.id === 'fox' ? o.branch || own.branch || autoBranch() : null };
}
const levelOf = (xp) => levelOn(xp, curveFor(activeSpecies()));
const barFor = (xp) => barOn(xp, curveFor(activeSpecies()));
// Never de-evolve: a stage, once reached, is kept (pet.stageReached), even if the curve ever changes again.
const stageOf = (lvl) => STAGES[Math.max(stageIdx(lvl), pet.stageReached || 0)][1];
const stageNow = () => Math.max(stageIdx(levelOf(pet.xp)), pet.stageReached || 0);
// What Lax has lived, as rows for lib/species.mjs. Its own thinking (the mind, ~/.lax) isn't your work.
const legacyRepo = new Map();
function journal(from, to = Infinity) {
  return db.prepare('SELECT ts, session, project, repo, kind FROM events WHERE ts >= ? AND ts < ? ORDER BY ts').all(from, Number.isFinite(to) ? to : 8.64e15)
    .filter((e) => e.project !== 'mind' && e.project !== '.lax' && !(e.repo || '').startsWith(HOME))
    .map((e) => ({ ...e, repo: e.repo || oldRepo(e.project) }));
}
// Rows from before the repo column: a folder of that name in your projects folder that is a git repo (a worktree "x-wt-…" is x).
function oldRepo(project) {
  if (!legacyRepo.has(project)) { const d = path.join(DEFAULT_WORKDIR, String(project).replace(/-wt-.*$/, '')); legacyRepo.set(project, fs.existsSync(path.join(d, '.git')) ? d : null); }
  return legacyRepo.get(project);
}
/** The repo a folder is in, a worktree counting as its main repo (its .git is a file pointing into main/.git/worktrees). */
const repoKeys = new Map();
function repoKey(cwd) {
  if (!cwd) return null;
  if (!repoKeys.has(cwd)) repoKeys.set(cwd, mainRepo(cwd));
  return repoKeys.get(cwd);
}
function mainRepo(cwd) {
  const r = repoRoot(cwd); if (!r) return null;
  try { const m = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(path.join(r, '.git'), 'utf8')); if (m && m[1].includes('/worktrees/')) return path.resolve(r, m[1].trim(), '../../..'); } catch {}
  return r;
}
// The fox's Lv50 form: decided once, when it gets there.
let autoCache = { at: 0, v: null };
function autoBranch() {
  if (Date.now() - autoCache.at > 36e5) autoCache = { at: Date.now(), v: branch({ ...dayNight(journal(pet.hatchedAt || pet.born)), limitDays: (pet.limitDays || []).length }) };
  return autoCache.v;
}
function settleBranch() {
  if (pet.species?.id === 'fox' && !pet.species.branch && stageNow() >= BRICK) { autoCache.at = 0; pet.species.branch = autoBranch(); }
}
// Hatching: 1000 XP or three worked days, then the species is whatever stood out in that time.
const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 100) / 100]));
function hatchNow() {
  const sig = signals(journal(pet.born)), id = pick(sig);
  pet.species = { id, copy: pick(sig, { noPink: true }), rare: id === 'pink' && Math.random() < RARE, branch: null };
  pet.hatched = true; pet.hatchedAt = Date.now(); pet.hatchSignals = round(sig); pet.xp = 0; pet.stageReached = 0;
  delete pet.eggXp; delete pet.eggDays;
  const text = `${settings.name} hatched: ${aName(id)}!`;
  milestone(text); diary(text.replace(`${settings.name} `, '').replace(/!$/, ''));
  broadcast('bubble', { id: 'hatch' + Date.now(), kind: 'levelup', text, speak: true });
  kvSet('pet', pet); pushState();
}
function checkHatch() { if (pet.hatched === false && shouldHatch(pet, dayKey(Date.now()))) hatchNow(); }
// What leads while it's an egg (its speckles), worked out at most once a minute.
let leadCache = { at: 0, v: null };
function eggLead() {
  if (Date.now() - leadCache.at > 6e4) { const sig = signals(journal(pet.born)); leadCache = { at: Date.now(), v: sig.busyH >= 1 ? pick(sig) : null, sig: round(sig) }; }
  return leadCache;
}
// A Lax from before species hatches again, as if its history had been an egg: the egg takes its first 1000 XP.
function rehatchOld() {
  if (settings.color) { const { color, ...rest } = settings; settings = rest; writeSettings(settings); } // the species gives the colour now
  delete pet.color;
  if (pet.species || pet.hatched === false) return;
  const r = replayEgg(journal(pet.born));
  if (!r.at) { Object.assign(pet, { hatched: false, eggXp: r.eggXp, eggDays: r.eggDays, xp: 0, stageReached: 0 }); milestone(`${settings.name} went back into its egg`); }
  else {
    pet.species = { id: r.species, copy: r.copy, rare: r.species === 'pink' && Math.random() < RARE, branch: null };
    pet.hatchedAt = r.at; pet.hatchSignals = round(r.signals); pet.xp = Math.max(0, pet.xp - EGG_XP); pet.stageReached = stageIdx(levelOf(pet.xp));
    settleBranch();
    milestone(`${settings.name} hatched again, as ${aName(r.species)}`);
  }
  pet.days ||= {}; pet.limitDays ||= [];
  kvSet('pet', pet);
}
// Traits (headband, glasses, cape…) show from level 10: a young Lax is just itself.
const TRAITS_FROM = 10;
// The kind of work you do most gives one: headband, glasses or monocle.
const TOOL_TRAIT = { Bash: 'headband', Edit: 'glasses', Write: 'glasses', MultiEdit: 'glasses', NotebookEdit: 'glasses',
  Read: 'monocle', Grep: 'monocle', Glob: 'monocle' };
// A command that runs tests (not one that only mentions them, like grep '"test"' package.json).
const TEST_RUN = /\b(?:(?:npm|pnpm|yarn|bun)(?: run)? test|pytest|jest|vitest|cargo test|go test|node --test|swift test|gradlew? test|make test)\b|scripts\/test-[\w-]+\.m?js/;
// Traits read only the last 7 days (pet.days, by local day), so they follow the work and fade after a week away.
const week = (p) => { const w = { tools: {}, tests: 0, errors: 0 };
  for (let i = 0; i < 7; i++) { const d = p.days?.[dayKey(Date.now() - i * 864e5)]; if (!d) continue;
    for (const [k, n] of Object.entries(d.tools || {})) w.tools[k] = (w.tools[k] || 0) + n; w.tests += d.tests || 0; w.errors += d.errors || 0; }
  return w; };
// Today's tally, for the traits; days older than a week go.
function today() {
  const k = dayKey(Date.now()); pet.days ||= {};
  if (!pet.days[k]) { for (const d of Object.keys(pet.days)) if (d < dayKey(Date.now() - 8 * 864e5)) delete pet.days[d]; pet.days[k] = { tools: {}, tests: 0, errors: 0 }; }
  return pet.days[k];
}
// What a tool counts for the traits: Bash a tenth (see traits()).
const traitWeight = (tool, n) => tool === 'Bash' ? n / 10 : n;
// The tool traits and what they need this week (traits() below), for the Life menu: each with its tools added up.
const TOOL_TRAITS = [['headband', ['Bash'], 30], ['glasses', ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'], 30], ['monocle', ['Read', 'Grep', 'Glob'], 30],
  ['antenna', ['WebFetch', 'WebSearch'], 25], ['cape', ['Agent', 'Task'], 10]];
function traitTally(p) {
  const w = week(p), worn = traits(p);
  return TOOL_TRAITS.map(([trait, tools, need]) => {
    const used = tools.filter((t) => w.tools[t]);
    return { trait, need, worn: worn.includes(trait), n: Math.round(used.reduce((a, t) => a + traitWeight(t, w.tools[t]), 0) * 10) / 10,
      tools: (used.length ? used : tools.slice(0, 2)).map((t) => t === 'Bash' ? 'Bash /10' : t).join('+') };
  }).filter((r) => r.n > 0).sort((a, b) => b.n - a.n);
}
const uses = (w, ...tools) => tools.reduce((a, t) => a + (w.tools[t] || 0), 0);
function traits(p) {
  if (levelOf(p.xp) < TRAITS_FROM) return [];
  const t = [], w = week(p);
  // A trait's tools added up. Bash counts a tenth: nearly everything runs through it, so otherwise every Lax wore the headband.
  const kinds = {};
  for (const [tool, n] of Object.entries(w.tools)) {
    const k = TOOL_TRAIT[tool];
    if (k) kinds[k] = (kinds[k] || 0) + traitWeight(tool, n);
  }
  const top = Object.entries(kinds).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 30) t.push(top[0]);
  // Extras, on top of it. Goggles: tests are a real share of your commands, not just a few ever run.
  if (w.tests >= 50 && w.tests >= uses(w, 'Bash') * 0.15) t.push('goggles');
  if (uses(w, 'WebFetch', 'WebSearch') >= 25) t.push('antenna');
  if (uses(w, 'Agent', 'Task') >= 10) t.push('cape');
  if (w.errors >= 10) t.push('scar');
  if (p.streak >= 5) t.push('flame');
  return t;
}
function mood(p) {
  const idleH = (Date.now() - p.lastSeen) / 36e5;
  if (idleH > 72) return 'dusty';
  if (idleH > 12) return 'sleepy';
  return p.denials > p.approvals * 2 && p.denials > 5 ? 'cautious' : 'happy';
}
const LANG = { py: 'python', ts: 'typescript', tsx: 'typescript', js: 'javascript', mjs: 'javascript', rs: 'rust',
  go: 'go', c: 'c', cc: 'cpp', cpp: 'cpp', h: 'c', java: 'java', kt: 'kotlin', swift: 'swift', rb: 'ruby', md: 'markdown', tex: 'latex' };

function gainXp(n) {
  if (pet.hatched === false) { pet.eggXp = (pet.eggXp || 0) + n; checkHatch(); return; } // an egg gets no XP: it fills its shell
  const before = levelOf(pet.xp);
  pet.xp += n;
  const after = levelOf(pet.xp);
  if (after > before) {
    const grew = stageIdx(after) > Math.max(stageIdx(before), pet.stageReached || 0);
    pet.stageReached = Math.max(pet.stageReached || 0, stageIdx(after)); settleBranch();
    const st = stageOf(after);
    const text = after === MAX_LEVEL ? `${settings.name} reached level 100! A legend.`
      : grew ? `${settings.name} evolved into a ${st}!` : `${settings.name} reached level ${after}!`;
    milestone(text); diary(text.replace(`${settings.name} `, '').replace(/!.*$/, ''));
    broadcast('bubble', { id: 'lvl' + Date.now(), kind: 'levelup', text, speak: true });
  }
}
function touchDay() {
  // Local days, for the egg and the pink one. A new worked day: the pink one copies the last one (a quiet day keeps its form).
  const local = dayKey(Date.now());
  if (pet.workDay !== local) {
    if (pet.workDay && pet.species?.id === 'pink') {
      const from = new Date(pet.workDay + 'T00:00').getTime(), sig = signals(journal(from, from + 864e5));
      if (sig.busyH > 0) pet.species.copy = pick(sig, { noPink: true });
    }
    pet.workDay = local;
  }
  if (pet.hatched === false && !(pet.eggDays ||= []).includes(local)) { pet.eggDays.push(local); leadCache.at = 0; }
  const today = new Date().toISOString().slice(0, 10);
  if (pet.lastDay !== today) {
    const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    pet.streak = pet.lastDay === y ? pet.streak + 1 : 1;
    pet.lastDay = today;
    if ([3, 7, 14, 30, 100].includes(pet.streak)) { milestone(`${pet.streak}-day streak`); diary(`${pet.streak}-day streak`); }
  }
  pet.lastSeen = Date.now();
}
function petView() {
  const level = levelOf(pet.xp), [prevXp, nextXp] = barFor(pet.xp), egg = pet.hatched === false;
  const sp = activeSpecies(), st = stageNow();
  // The rare one keeps its secret until level 50: before that it is a pink like any other.
  const species = sp && { id: sp.id, name: nameFor(sp, st), branch: st >= BRICK ? sp.branch || null : null, copy: sp.copy || null, rare: !!sp.rare && st >= BRICK };
  // A trait you switched off stays off until you switch it on (settings.hideTraits), even while it comes and goes:
  // glasses and monocle can trade places many times a day.
  const lead = egg ? eggLead() : null, worn = traits(pet);
  return { name: settings.name, born: pet.born, level, stage: stageOf(level), xp: pet.xp, prevXp, nextXp,
    traits: worn, traitTally: traitTally(pet), mood: mood(pet), streak: pet.streak, hatched: !egg, species,
    look: egg ? { form: null, color: lead.v ? SPECIES[lead.v].color : '#8a8378', lift: 0 } : formFor(sp, st),
    egg: egg ? { pct: Math.round(eggProgress(pet) * 100), lead: lead.v } : null,
    // Why it is what it is: each species' value over its bar, from the egg's time (for the Life menu, while the bars get tuned).
    why: (egg ? lead.sig : pet.hatchSignals) || null, bars: BARS, picked: !!(settings.speciesPick && settings.speciesOverride),
    choices: Object.entries(SPECIES).map(([id, v]) => ({ id, name: v.name, color: v.color })), branches: Object.entries(BRANCHES).map(([id, v]) => ({ id, name: v.name, color: v.color })) };
}
let saveTimer;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { kvSet('pet', pet); kvSet('voiceSessions', voiceSessions); kvSet('laxTalk', laxTalk); kvSet('sessions', [...sessions]); }, 500); };

// ---------- live state ----------
const clients = new Set();
// session_id -> {project, status, ts, pid}. Kept across restarts: a terminal left open keeps its tab on the phone,
// however long it's quiet, for as long as its claude process lives. Without a pid (older hooks), 6 hours of quiet.
const sessions = new Map(kvGet('sessions', []));
const SESSION_QUIET = 6 * 36e5;
// A session in the Mac app stays open in its sidebar for days: once it has sat quiet a while its tab rests (hidden,
// not forgotten) and comes back the moment it does something. One waiting on you stays. "working" doesn't count:
// a turn stopped with Esc never sends its Stop, and real work sends hooks far more often than this.
const MAC_REST = 30 * 6e4;
const resting = (s) => s.where === 'mac' && s.status !== 'waiting' && s.ts < Date.now() - MAC_REST;
let shown = '';
function pruneSessions() {
  const alive = claudeAlive([...sessions.values()].map((s) => s.pid));
  let gone = 0;
  for (const [id, s] of sessions) if (s.pid ? !alive.has(s.pid) : s.ts < Date.now() - SESSION_QUIET) { sessions.delete(id); gone++; }
  const now = sessionList().map((s) => s.id).join();
  if (gone) save();
  if (gone || now !== shown) { shown = now; pushState(); }
}
// Claude Code keeps a file per running session (~/.claude/sessions/<pid>.json). A start missed while the server was
// down or stuck would hide that terminal's tab until it next did something: on start, take the ones still running.
function findSessions() {
  const dir = path.join(os.homedir(), '.claude', 'sessions'), found = [];
  let files = []; try { files = fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)); } catch { return; }
  for (const f of files) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (j.kind === 'interactive' && j.sessionId && j.cwd && !sessions.has(j.sessionId) && !j.cwd.startsWith(HOME)) found.push(j);
    } catch {}
  }
  const alive = claudeAlive(found.map((j) => j.pid));
  for (const j of found) if (alive.has(j.pid))
    sessions.set(j.sessionId, { project: proj(j.cwd), status: 'idle', ts: j.updatedAt || Date.now(), pid: j.pid, cwd: j.cwd, where: j.entrypoint === 'claude-desktop' ? 'mac' : 'cli' });
  save();
}
const pending = new Map(); // ask id -> {resolve, bubble}
let publicMind = null; // its mind on the website (lib/public-mind.mjs), set up below
// When you talked to it and when it answered aloud, this week (its mind on the website sizes hearing and speech by them).
// Its own rolling log, not the journal: the journal's rows shape its species.
const WEEK = 7 * 864e5;
function heardSpoke(k) { if (!publicMind) return; const w = kvGet('mindWeek', { heard: [], spoke: [] }), now = Date.now();
  w[k] = [...(w[k] || []).filter((t) => now - t < WEEK), now]; kvSet('mindWeek', w);
  const all = mindEver(); all[k] = (all[k] || 0) + 1; kvSet('mindEver', all); publicMind.event(k === 'heard' ? 'hear' : 'speak'); }
// All time (the page sizes hearing and speech by it). Counted since 2026-10-18, starting from that week's own log: older isn't kept.
function mindEver() { let all = kvGet('mindEver', null); if (!all) { all = { heard: weekCount('heard'), spoke: weekCount('spoke') }; kvSet('mindEver', all); } return all; }
const weekCount = (k) => (kvGet('mindWeek', {})[k] || []).filter((t) => Date.now() - t < WEEK).length;
// A reflection or the weekly review, on its own: its dreams on the website.
function dreamed() { const w = kvGet('mindWeek', { heard: [], spoke: [] }), now = Date.now(); w.dreamed = [...(w.dreamed || []).filter((t) => now - t < WEEK), now]; kvSet('mindWeek', w); }
function broadcast(type, data) {
  for (const c of clients) c.write(sse(type, data, c.sealed)); // sealed for a phone that asked (lib/seal.mjs)
  if (type === 'bubble' && data.speak) heardSpoke('spoke');
  if (type === 'bubble' && (data.kind === 'permission' || data.kind === 'question')) notify(data);
}
// Something waits for you: a notification to the phones that subscribed (lib/push.mjs), for when the page isn't open (an
// iPhone puts it to sleep), or always. It says only the project and the short gist: it shows on the lock screen.
function notify(b) {
  if (settings.push === 'off' || (settings.push !== 'always' && clients.size) || !push.subscribers()) return;
  const body = b.kind === 'question' ? `${b.project} asks: ${b.questions?.[0]?.question || b.text}` : b.gist ? `${b.project} wants to: ${b.gist}` : b.text;
  push.send({ id: b.id, kind: b.kind, title: settings.name, body: short(body, 120) }, { topic: b.id, urgency: 'high', ttl: pending.get(b.id)?.wait || 600 });
}
// Lax's own conversation, this one or the one before it: never a session of yours (no tab, no reflection).
const laxOwn = (sid) => !!sid && (sid === voiceSessions[ASSISTANT] || sid === laxTalk.prev);
function sessionList() {
  const cutoff = Date.now() - SESSION_QUIET;
  return [...sessions.entries()].filter(([id, s]) => (s.pid || s.ts > cutoff) && !resting(s) && !laxOwn(id)).map(([id, s]) => ({ id, ...s }));
}
const stateMsg = () => ({ pet: petView(), sessions: sessionList(), voiceBusy: !!voiceRun, thinking: !!channelWait, settings, budget: budget.view(),
  channels: channelList(), voiceTarget, usage, vocab: vocabNow(), whisper: whisper.running(), ways: ways?.view() || null, host: MACHINE });
// What the phone listens for and fixes (lib/vocab.mjs): the names your words may contain, and misheard → meant.
function vocabNow() {
  const v = readVocab(VOCAB);
  return { heard: allHeard(v), words: knownWords({ name: settings.name, sessions: sessionList().map((s) => s.project), mind: MIND, workdir: DEFAULT_WORKDIR, vocab: v }) };
}
// A pair learned (from a session that had to guess, or from you): kept, said in the feed, sent to the phone.
function learnHeard(heard, meant, from) {
  const p = addHeard(VOCAB, heard, meant); if (!p) return null;
  diary(`heard "${p.heard}" as ${p.meant}${from ? ` (${from})` : ''}`); pushState();
  return p;
}
// Your Claude plan usage, as the last terminal's status line saw it (hooks/lax-status.mjs). Kept across restarts.
let usage = kvGet('usage', null);
// What Lax may spend of your plan by itself (lib/budget.mjs): every background run asks it first.
const budget = createBudget({ usage: () => usage, settings: () => settings });
function setUsage(rl) {
  const u = readUsage(rl); if (!u) return false;
  const changed = JSON.stringify(u) !== JSON.stringify({ five_hour: usage?.five_hour, seven_day: usage?.seven_day });
  usage = { ...u, ts: Date.now() }; kvSet('usage', usage);
  // Days you hit the 5-hour limit: enough of them and a fox becomes the coin cat at level 50.
  if ((u.five_hour?.pct || 0) >= LIMIT_PCT && !(pet.limitDays ||= []).includes(dayKey(Date.now()))) { pet.limitDays.push(dayKey(Date.now())); save(); }
  if (changed) pushState(); // the status line runs often; the phone only hears when a number moves
  // At 80% and 90% of either window: said aloud and sent to the phone, once each (lib/usage.mjs).
  const w = limitWarnings(u, kvGet('limitWarned', {})); kvSet('limitWarned', w.seen);
  if (w.say.length) {
    const text = `Heads up: ${w.say.join(' and ')}. My own work and your scheduled jobs wait from 80%, and at 95% I stop answering too.`;
    const b = { id: 'limit' + Date.now(), kind: 'reply', text, speak: true };
    broadcast('bubble', b); feed(`! ${text}`, 'diary', settings.name.toLowerCase()); notify(b);
  }
  return true;
}
onRateLimit((info) => setUsage(eventLimits(info))); // Lax's own background runs report it too
const pushState = () => { broadcast('state', stateMsg()); publicMind?.changed(); };
// A session's status line (hooks/lax-status.mjs): its model and how full its context is, for the tab's status row.
function sessionInfo(b) {
  const s = b.session_id && sessions.get(b.session_id); if (!s) return;
  const ctx = Number.isFinite(b.ctx) ? Math.round(b.ctx) : s.ctx, model = b.model ? String(b.model).slice(0, 30) : s.model;
  if (ctx === s.ctx && model === s.model) return;
  s.ctx = ctx; s.model = model; pushState();
}
// What the assistant said between steps, from its transcript (lib/transcript.mjs). `skip`: text already shown another way.
const saidUpTo = new Map(); // session id -> uuid of the last text shown
function narrate(h, project, skip = '') {
  if (!h.transcript_path || h.agent_id) return;
  const { texts, last } = newAssistantText(tailRecords(h.transcript_path), saidUpTo.get(h.session_id));
  saidUpTo.set(h.session_id, last);
  for (const t of texts) if (t !== skip.trim()) feed(`● ${short(t, 200)}`, 'say', project, h.session_id, { text: clip(t, 1500) });
}
// session: which Claude Code session a line belongs to, so the phone can show one session's tab at a time.
const recentFeed = []; // what the assistant knows about your sessions
// own: Lax's assistant's own work (its commands and their output), which `lax watch` shows as Lax's.
// extra: the step's parts (desc, cmd, out, diff, agent…) so the phone can lay it out like Claude Code; `line` is the plain version.
// Lax's own work (its assistant's steps) has no tab of its own: it goes in Lax's tab, inside the turn it belongs to.
// Lax's tab keeps its own history too (laxFeed), so busy sessions never push your conversation out of the backlog.
const laxFeed = [];
const feed = (line, kind = 'tool', project, session, extra) => {
  const f = { line, kind, project, session, ts: Date.now(), ...extra };
  if (session && session === voiceSessions[ASSISTANT]) { f.own = true; f.session = undefined; }
  recentFeed.push(f); if (recentFeed.length > 300) recentFeed.shift();
  if (!f.session) { laxFeed.push(f); if (laxFeed.length > 300) laxFeed.shift(); }
  broadcast('feed', f);
};
// Lax's diary: what it did by itself (learned, levelled up, a streak). Kept, so its tab still has it after a restart.
function diary(text) {
  const d = [...kvGet('diary', []), { ts: Date.now(), text }].slice(-100); kvSet('diary', d);
  feed(`+ ${text}`, 'diary', settings.name.toLowerCase(), undefined, { text });
}
// Where Claude Code keeps one of Lax's conversations.
const talkFile = (id) => path.join(os.homedir(), '.claude', 'projects', MIND.replace(/[^a-zA-Z0-9]/g, '-'), id + '.jsonl');
// Lax's tab after a restart: the last turns of its conversations (the one before, then this one, from their
// transcripts) and its diary, in time order.
function laxHistory() {
  const ids = [laxTalk.prev, voiceSessions[ASSISTANT]].filter(Boolean); if (!ids.length) return;
  const name = settings.name.toLowerCase(), lines = [];
  const items = ids.flatMap((id, i) => {
    const its = conversation(tailRecords(talkFile(id), 512 * 1024), 25);
    // Where the new one began: the same divider you saw when it started.
    return i && its.length ? [{ kind: 'fresh', ts: its[0].ts - 1 }, ...its] : its;
  });
  for (const it of items) {
    const base = { project: name, ts: it.ts, history: true };
    if (it.kind === 'fresh') lines.push({ ...base, line: '○ new conversation', kind: 'session' });
    else if (it.kind === 'prompt') lines.push({ ...base, line: saidLine(said(it.text)), kind: 'prompt', ...saidFull(said(it.text)) });
    else if (it.kind === 'say') lines.push({ ...base, line: `● ${short(it.text, 200)}`, kind: 'say', own: true, text: clip(it.text, 1500) });
    else if (it.kind === 'tool') lines.push({ ...base, line: describeTool(it.tool, it.input), kind: 'tool', own: true, ...stepParts(it.tool, it.input) });
    else lines.push({ ...base, line: `↩ ${clip(it.text)}`, kind: 'done', text: clip(it.text), answer: true });
  }
  for (const d of kvGet('diary', [])) lines.push({ project: name, ts: d.ts, history: true, line: `+ ${d.text}`, kind: 'diary', text: d.text });
  laxFeed.unshift(...lines.sort((a, b) => a.ts - b.ts).slice(-250));
}
// The hook-side session a lax channel runs in (matched by the claude process pid).
const channelSession = (c) => c?.sessionPid ? [...sessions.entries()].find(([, s]) => s.pid === c.sessionPid)?.[0] : undefined;
// The terminal shows replies and results in full (capped), so you can check them on the phone; bubbles stay short.
const clip = (t, n = 4000) => { t = String(t ?? '').trim(); return t.length > n ? t.slice(0, n) + '\n…' : t; };
const proj = (cwd) => (cwd ? path.basename(cwd) : '?');
// What you said, as a feed line: shortened, with the whole of it for the phone to open (tap the line).
const saidLine = (t) => `> ${short(t, 90)}`;
const saidFull = (t) => { t = String(t ?? '').trim(); return short(t, 90) === t ? {} : { text: clip(t) }; };
const youSaid = (text, project, session) => feed(saidLine(text), 'prompt', project, session, saidFull(text));
const short = (s, n = 60) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
// What you said to Lax, without the context block each voice message starts with (assistantPrompt).
const CONTEXT = /^\[Context now[^\]\n]*\]\n[\s\S]*?\n\[\/Context\]\n*/;
const said = (prompt) => String(prompt ?? '').replace(CONTEXT, '');

// A step's parts for the phone's terminal: why (the Bash description), the full command, the file, and whose it is
// (agent: set when a subagent made the call, so it shows under its Agent step).
function stepParts(name, input = {}, h = {}) {
  const p = { tool: name, agent: h.agent_id };
  if (name === 'Bash') { p.desc = input.description ? short(input.description, 120) : undefined; p.cmd = String(input.command || '').slice(0, 600); }
  if (/^(Read|Edit|Write|MultiEdit|NotebookEdit)$/.test(name)) p.file = path.basename(input.file_path || input.notebook_path || '');
  if (name === 'Task' || name === 'Agent') p.desc = short(input.description || input.prompt, 80);
  // A plan, or a markdown file being written: the whole text, to read on the phone (not just its first changed lines).
  if (name === 'ExitPlanMode') p.doc = planText(input);
  if (name === 'Write' && /\.(md|markdown)$/i.test(input.file_path || '')) p.doc = input.content;
  if (p.doc != null) p.doc = clip(p.doc, 30000);
  return p;
}
const planText = (input) => {
  if (typeof input.plan === 'string' && input.plan.trim()) return input.plan;
  try { return input.planFilePath ? fs.readFileSync(input.planFilePath, 'utf8') : undefined; } catch { return undefined; }
};
// all: the whole command or prompt, for a bubble that scrolls; the feed and anything spoken keep the short form.
function describeTool(name, input = {}, all = false) {
  const cut = (v, n) => short(v, all ? 4000 : n);
  switch (name) {
    case 'Bash': return `$ ${cut(input.command, 80)}`;
    case 'Read': case 'Edit': case 'Write': case 'MultiEdit': case 'NotebookEdit':
      return `${name} ${short(path.basename(input.file_path || input.notebook_path || ''), 50)}`;
    case 'Grep': return `Grep "${cut(input.pattern, 30)}"`;
    case 'Glob': return `Glob ${cut(input.pattern, 40)}`;
    case 'WebFetch': return `Fetch ${cut(input.url, 50)}`;
    case 'WebSearch': return `Search "${cut(input.query, 40)}"`;
    case 'Task': case 'Agent': return `Agent: ${cut(all ? input.prompt || input.description : input.description || input.prompt, 50)}`;
    case 'mcp__lax__tell': return `tell ${short(input.session, 30)}: "${cut(input.text, 120)}"`;
    default: return name.replace(/^mcp__.*?__/, '');
  }
}
const spoken = (text) => {
  // First sentence or two, without code/markdown — what Lax says out loud.
  const plain = String(text || '').replace(/```[\s\S]*?```/g, ' ').replace(/`([^`]*)`/g, '$1')
    .replace(/[#*_>\[\]|]/g, '').replace(/\(https?:[^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  const m = plain.match(/^(.{20,240}?[.!?])(\s|$)/);
  return m ? m[1] : short(plain, 200);
};

function onHook(h) {
  const sid = h.session_id, project = proj(h.cwd), repo = repoKey(h.cwd);
  const s = sessions.get(sid) || { project, status: 'idle', ts: 0 };
  s.ts = Date.now(); s.project = project; if (h.permission_mode) s.mode = h.permission_mode; if (h.cwd) s.cwd = h.cwd; if (h.lax_where) s.where = h.lax_where; if (h.lax_session_pid) s.pid = h.lax_session_pid;
  sessions.set(sid, s);
  touchDay();
  const mine = sid && sid === voiceSessions[ASSISTANT]; // Lax's own assistant: talk() already shows what you said and the answer
  if (/^(PostToolUse|PostToolUseFailure|Stop|UserPromptSubmit)$/.test(h.hook_event_name)) clearRelays((c) => c.cwd === h.cwd);
  if (/^(Stop|SessionEnd)$/.test(h.hook_event_name)) grants.delete(sid); // the answer is done: your yeses were for that one
  brain.onEvent(sid, h.hook_event_name, !h.agent_id && h.transcript_path); // a quiet session after real work → Lax reflects on it
  if (!h.agent_id) archive.onEvent(sid, h.hook_event_name, h.transcript_path); // and keeps its transcript, scrubbed
  // Lax's conversation came up outside a voice run: it's open in a terminal on the Mac (until that ends).
  if (mine && h.hook_event_name === 'SessionStart' && !voiceRun) laxOnMac = true;
  if (mine && h.hook_event_name === 'SessionEnd' && laxOnMac) { laxOnMac = false; feed('○ back on the phone', 'session', settings.name.toLowerCase()); }
  switch (h.hook_event_name) {
    case 'SessionStart':
      pet.sessions++; gainXp(2); s.status = 'idle';
      if (!mine) feed(`● session ${project}`, 'session', project, sid); logEvent(sid, project, 'session', h.source || 'start', repo);
      break;
    case 'UserPromptSubmit':
      s.status = 'working'; if (!mine) youSaid(h.prompt, project, sid); else if (laxOnMac) youSaid(said(h.prompt), settings.name.toLowerCase());
      // A terminal session Lax can't hear (not started with `lax`): said in the feed once per session, and friction,
      // once a day per project (lib/improve.mjs).
      if (unheard(s, channels.values(), mine)) {
        if (!s.nolaxTold) { s.nolaxTold = true; feed('  not through Lax: say /lax here to reopen it live', 'session', project, sid); }
        improve.note('without lax', `a ${project} session in the terminal without Lax: it couldn't hear you there`, `nolax:${project}`);
      }
      logEvent(sid, project, 'prompt', short(mine ? said(h.prompt) : h.prompt, 500), repo);
      break;
    case 'PreToolUse': {
      s.status = 'working'; const n = h.tool_name;
      const day = today(); day.tools[n] = (day.tools[n] || 0) + 1;
      pet.tools[n] = (pet.tools[n] || 0) + 1; gainXp(1);
      if (n === 'Bash' && TEST_RUN.test(h.tool_input?.command || '')) { pet.tools.__tests = (pet.tools.__tests || 0) + 1; day.tests++; }
      const ext = (h.tool_input?.file_path || '').split('.').pop();
      if (/^(Edit|Write|MultiEdit)$/.test(n) && LANG[ext]) pet.langs[LANG[ext]] = (pet.langs[LANG[ext]] || 0) + 1;
      if (!mine) narrate(h, project);
      feed(describeTool(n, h.tool_input), 'tool', project, sid, stepParts(n, h.tool_input, h)); logEvent(sid, project, 'tool', describeTool(n, h.tool_input), repo);
      publicMind?.tool(sid);
      if (/^(Agent|Task)$/.test(n)) for (const r of rolesIn(project)) publicMind?.event('track', { role: r }); // a track of a role's work starting
      break;
    }
    case 'PostToolUse': {
      const r = h.tool_response; const err = r && (r.is_error || r.interrupted || (typeof r.exit_code === 'number' && r.exit_code !== 0));
      const diff = /^(Edit|Write|MultiEdit)$/.test(h.tool_name) && !err ? editDiff(h.tool_name, h.tool_input, r) : null;
      if (diff) feed(`  +${diff.add} -${diff.del}`, 'diff', project, sid, { diff, agent: h.agent_id });
      // A shell command's output, like a terminal: the first lines under the command.
      if (h.tool_name === 'Bash' && r) {
        const out = String(r.stdout || r.stderr || '').replace(/\s+$/, ''), lines = out ? out.split('\n') : [];
        if (lines.length) feed(lines.slice(0, 12).map((l) => '  ' + short(l, 160)).join('\n') + (lines.length > 12 ? `\n  … ${lines.length - 12} more lines` : ''), 'out', project, sid,
          { out: lines.slice(0, 40).map((l) => l.slice(0, 300)), total: lines.length, agent: h.agent_id });
      }
      if (err) { pet.errors++; today().errors++; feed(`  ✗ ${h.tool_name} failed`, 'error', project, sid, { agent: h.agent_id }); broadcast('react', { state: 'error' }); }
      break;
    }
    case 'PostToolUseFailure': { // a step that failed (a command's non-zero exit, a refused edit): what it said, then ✗
      if (h.is_interrupt) break;
      const lines = String(h.error || '').replace(/\s+$/, '').split('\n').filter(Boolean);
      if (lines.length) feed(lines.slice(0, 12).map((l) => '  ' + short(l, 160)).join('\n'), 'out', project, sid, { out: lines.slice(0, 40).map((l) => l.slice(0, 300)), total: lines.length, agent: h.agent_id });
      pet.errors++; today().errors++; feed(`  ✗ ${h.tool_name} failed`, 'error', project, sid, { agent: h.agent_id }); broadcast('react', { state: 'error' });
      break;
    }
    case 'Notification':
      if (h.notification_type === 'idle_prompt') {
        s.status = 'waiting';
        broadcast('bubble', { id: 'idle-' + sid, kind: 'waiting', text: `${project}: ${short(h.message, 80)}`, session: sid });
      }
      break;
    case 'Stop': {
      s.status = 'done'; pet.turns++; gainXp(5);
      const msg = h.last_assistant_message || '';
      if (!mine) { narrate(h, project, msg); feed(`✓ ${project}: ${clip(msg, 1500) || 'done'}`, 'done', project, sid, { text: clip(msg, 1500) || 'done' }); } else if (laxOnMac) feed(`↩ ${clip(msg) || 'done'}`, 'done', settings.name.toLowerCase(), undefined, { answer: true, text: clip(msg) || 'done' });
      logEvent(sid, project, 'done', short(msg, 1000), repo);
      if (!(voiceRun && voiceRun.sessionId === sid)) // voice runs speak their own result
        broadcast('bubble', { id: 'done-' + sid + Date.now(), kind: 'done', text: `${project}: ${spoken(msg) || 'done!'}`, session: sid, speak: false });
      break;
    }
    case 'SessionEnd':
      sessions.delete(sid); if (!mine) feed(`○ ${project} ended`, 'session', project, sid); // Lax's own runs start and end every time you talk
      break;
  }
  save(); pushState();
}

// Lax's assistant, while it answers you: what your yeses on the phone already cover (lib/allow.mjs grantKey):
// edits anywhere in a repo you let it edit, a command you let it run. Forgotten when it finishes (Stop).
const grants = new Map(); // session id -> Set of grant keys
let lastUnanswered = 0; // when an ask last went unanswered on the phone; an answer resets it

// A hook is waiting for the human: show the bubble, resolve when the phone answers (or time out).
// Decisions: allow | deny | answer (AskUserQuestion, with answers) | none (fall back to the terminal).
function ask(h) {
  const grant = h.lax_voice ? grantKey(h.tool_name, h.tool_input || {}, h.cwd) : null;
  if (grant && grants.get(h.session_id)?.has(grant)) {
    feed(`  ✓ covered by your yes`, 'done', proj(h.cwd), h.session_id);
    return Promise.resolve({ decision: 'allow' });
  }
  return new Promise((resolve) => {
    // Lax's own assistant (h.lax_voice) has no terminal: its requests always come to the phone, whatever "ask me on the phone"
    // (which is about your terminal sessions) says. If it can't be asked, say why.
    if (clients.size === 0 && (settings.push === 'off' || !push.subscribers())) return resolve({ decision: 'none', why: 'no phone is connected to Lax' });
    // Nobody answered a moment ago and no page is open: likely nobody's holding the phone, so don't wait again.
    if (h.lax_voice && !h.lax_job && clients.size === 0 && Date.now() - lastUnanswered < 10 * 60e3)
      return resolve({ decision: 'none', why: 'no answer on the phone a moment ago' });
    if (!settings.phoneApprovals && !h.lax_voice) return resolve({ decision: 'none', why: 'phone approvals are off' });
    // Sessions with a live lax channel relay tool approvals themselves (no duplicate bubble); questions still come here.
    if (h.tool_name !== 'AskUserQuestion' && h.lax_session_pid && [...channels.values()].some((c) => c.sessionPid === h.lax_session_pid))
      return resolve({ decision: 'none' });
    // A scheduled job (lib/schedule.mjs) asks under its own name, and waits longer: you may not be looking.
    const id = crypto.randomBytes(6).toString('hex'), job = h.lax_job && schedule.jobs().find((j) => j.id === h.lax_job), project = job ? short(job.title, 40) : proj(h.cwd);
    const questions = h.tool_name === 'AskUserQuestion' && Array.isArray(h.tool_input?.questions) ? h.tool_input.questions : null;
    const bubble = questions
      ? { id, kind: 'question', session: h.session_id, project, questions, text: `${project}: ${questions[0].question}`, speak: true }
      : { id, kind: 'permission', session: h.session_id, project, gist: h.tool_name === 'Bash' && h.tool_input?.description ? `${short(h.tool_input.description, 50)}: ${describeTool(h.tool_name, h.tool_input)}` : describeTool(h.tool_name, h.tool_input), text: `${project} wants to: ${describeTool(h.tool_name, h.tool_input, true)}`, say: `${project} wants to: ${describeTool(h.tool_name, h.tool_input)}`, speak: true, actions: true,
        ...(grant?.startsWith('edit:') && { details: `A yes also lets it edit the rest of ${path.basename(grant.slice(5))} until it finishes this answer.` }) };
    // Questions are worth waiting longer for: they need reading. Reached only by a notification, a minute at least: time
    // to unlock the phone.
    const wait = job ? MAX_WAIT_S : Math.min(MAX_WAIT_S, Math.max(settings.askTimeout * (questions ? 4 : 1), clients.size ? 0 : 60)); // hooks/timeouts.mjs
    const timer = setTimeout(() => { // a phone was open and nobody answered: friction (lib/improve.mjs); none open, the terminal takes over
      lastUnanswered = Date.now(); if (clients.size) improve.note('unanswered', `${project} asked ${bubble.gist || bubble.text}: no answer on the phone in time`); finish('none'); }, wait * 1000);
    function finish(decision, answers) {
      clearTimeout(timer); pending.delete(id); broadcast('clear', { id });
      const ss = sessions.get(h.session_id); if (ss?.status === 'waiting') { ss.status = 'working'; pushState(); }
      if (decision === 'allow' || decision === 'answer') pet.approvals++; else if (decision === 'deny') pet.denials++;
      if (decision !== 'none') lastUnanswered = 0;
      if (decision === 'allow' && grant) grants.set(h.session_id, (grants.get(h.session_id) || new Set()).add(grant));
      const line = { allow: '✓ approved from phone', deny: '✗ denied from phone', answer: '✓ answered from phone' }[decision];
      if (line) { feed(`  ${line}`, decision === 'deny' ? 'error' : 'done', project, h.session_id); save(); }
      resolve(answers ? { decision, answers } : { decision });
    }
    pending.set(id, { finish, bubble, wait });
    const s = sessions.get(h.session_id); if (s) { s.status = 'waiting'; pushState(); }
    broadcast('bubble', bubble);
  });
}

// ---------- channels: Claude Code sessions started with `--dangerously-load-development-channels server:lax` ----------
// Each runs channel/lax-channel.mjs, which holds an SSE stream here. Voice goes into that running session;
// Claude answers with the channel's reply tool; permission dialogs are relayed to the phone.
const channels = new Map(); // cid -> { res, sessionPid, cwd, project, active }
let voiceTarget = 'background'; // 'background' (Lax, the assistant) | a live session's cid | 'auto' (most recently active channel)
let channelWait = null;     // { cid, timer } while a channel session is working on something you said
const channelList = () => [...channels.entries()].map(([cid, c]) => ({ cid, project: c.project, active: c.active, sessionPid: c.sessionPid }));
const sendChannel = (cid, event, data) => channels.get(cid)?.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
function pickChannel() {
  if (voiceTarget === 'background') return null;
  if (channels.has(voiceTarget)) return voiceTarget;
  return [...channels.entries()].sort((a, b) => b[1].active - a[1].active)[0]?.[0] || null;
}
// A permission prompt or terminal menu relayed from a session is settled once that session moves on (answered at the
// terminal). Sharing's questions ("Which Rita?", "Send it?") stay: the session keeps working while they wait.
function clearRelays(match) {
  for (const [id, p] of pending) if (p.relay?.settles && match(channels.get(p.relay.cid) || {})) {
    // A yes or no given at the terminal while the phone was asking too: friction (lib/improve.mjs).
    if (p.bubble.kind === 'permission' && clients.size) improve.note('laptop', `${p.bubble.gist || p.bubble.text} in ${p.bubble.project}: answered at the terminal, not on the phone`);
    p.finish('none');
  }
}
function channelEvent(b) {
  if (b.type === 'gap') return learn.gap({ ...b, project: proj(b.cwd) }); // from a live session, or from Lax's own assistant
  if (b.type === 'misheard') return !!learnHeard(b.heard, b.meant, proj(b.cwd)); // a session had to read a word as another
  const c = channels.get(b.cid); if (!c) return false;
  c.active = Date.now();
  if (b.type === 'reply') {
    if (channelWait?.cid === b.cid) { clearTimeout(channelWait.timer); channelWait = null; }
    const text = String(b.text || '');
    feed(`↩ ${clip(text)}`, 'done', c.project, channelSession(c)); logEvent(channelSession(c) || '', c.project, 'reply', short(text, 1000));
    broadcast('bubble', { id: 'ch' + Date.now(), kind: 'reply', answer: true, session: channelSession(c), text: short(text.replace(/```[\s\S]*?```/g, ' '), 400), say: spoken(text), speak: true });
  } else if (b.type === 'share') {
    feed(String(b.line || '').slice(0, 200), 'tool', c.project, channelSession(c));
    if (b.ready) askShare(b.cid, String(b.ready.what || 'it'), String(b.ready.who || 'them'));
  } else if (b.type === 'pick') {
    askPick(b.cid, String(b.id || ''), String(b.question || 'Which one?'), (Array.isArray(b.options) ? b.options : []).map(String).slice(0, 6));
  } else if (b.type === 'say') {
    broadcast('bubble', { id: 'sh' + Date.now(), kind: 'reply', session: channelSession(c), text: short(String(b.text || ''), 400), speak: true });
  } else if (b.type === 'shared') {
    const who = b.who && String(b.who); // set for WhatsApp; the share sheet doesn't say where it went
    const [line, ok] = b.failed ? [`couldn't share it (${short(b.failed, 80)})`, false] : b.sent ? [who ? `sent to ${who}` : 'shared', true] : ['not sent', false];
    feed(`  ${ok ? '✓' : '✗'} ${line}`, ok ? 'done' : 'error', c.project, channelSession(c));
    if (b.failed) broadcast('bubble', { id: 'sh' + Date.now(), kind: 'error', session: channelSession(c), speak: true,
      text: who ? `I couldn't send it. It's still waiting in ${who}'s chat on the Mac.` : `I couldn't share it: ${short(b.failed, 120)}` });
  } else if (b.type === 'permission') {
    const id = 'relay-' + b.request_id;
    const bubble = { id, kind: 'permission', session: channelSession(c), actions: true, speak: true, details: String(b.input_preview || ''),
      project: c.project, gist: `${b.tool_name}${b.description ? ' — ' + short(b.description, 60) : ''}`,
      text: `${c.project} wants to: ${b.tool_name}${b.description ? ' — ' + short(b.description, 4000) : ''}`, // all of it: the bubble scrolls
      say: `${c.project} wants to: ${b.tool_name}${b.description ? ' — ' + short(b.description, 140) : ''}` };
    pending.set(id, { bubble, relay: { cid: b.cid, settles: true }, finish(decision) {
      if (!pending.delete(id)) return;
      broadcast('clear', { id });
      if (decision !== 'allow' && decision !== 'deny') return;
      sendChannel(b.cid, 'verdict', { request_id: b.request_id, behavior: decision });
      if (decision === 'allow') pet.approvals++; else pet.denials++;
      feed(`  ${decision === 'allow' ? '✓ approved' : '✗ denied'} from phone`, decision === 'allow' ? 'done' : 'error', c.project, channelSession(c)); save();
    } });
    broadcast('bubble', bubble);
  }
  pushState();
  return true;
}

// ---------- voice → Claude Code (headless, uses your Claude subscription login) ----------
// Voice goes into a live session (a tab started with `lax`), or else to Lax itself: an assistant you can ask anything.
// It's one long-running headless Claude in LAX_WORKDIR that also knows what your sessions are doing.
let voiceRun = null;
let laxOnMac = false; // Lax's conversation is open in a terminal on the Mac: the phone waits until it ends
// "open on mac": the same conversation, continued in a real terminal on the Mac (lib/terminal.mjs).
async function openOnMac() {
  const id = voiceSessions[ASSISTANT], name = settings.name;
  if (!id) return `There's nothing to continue yet. Talk to me first.`;
  if (voiceRun) return `I'm still answering. Try again when I'm done.`;
  if (laxOnMac) return `I'm already open on the ${MACHINE}.`;
  laxOnMac = true; // before the terminal's SessionStart, so a quick word from the phone can't race it
  try {
    const app = await openTerminal(MIND, `exec claude --resume ${id} --add-dir ${q(DEFAULT_WORKDIR)}`);
    feed(`○ open on the ${MACHINE.toLowerCase()} (${app}): the phone waits until you quit there`, 'session', name.toLowerCase());
    return `Opened on the ${MACHINE}. Quit there to talk to me here again.`;
  } catch (e) { laxOnMac = false; return `I couldn't open it on the ${MACHINE}. ${short(e.message, 120)}`; }
}
const ASSISTANT = 'assistant:' + MIND; // its key in voiceSessions (a conversation only resumes in the folder it started in)
laxHistory(); // Lax's tab starts with your last conversation, not empty
// A conversation from before Lax kept track: when it was last used and how full it is, from its transcript, so a
// long one starts fresh on the next message instead of being sent whole once more.
if (voiceSessions[ASSISTANT] && !laxTalk.last) {
  const recs = tailRecords(talkFile(voiceSessions[ASSISTANT]), 512 * 1024), u = recs.findLast((r) => r.type === 'assistant' && r.message?.usage);
  laxTalk.last = Date.parse(recs.findLast((r) => r.timestamp)?.timestamp) || Date.now(); laxTalk.tokens = u ? contextSize(u.message.usage) : 0;
}

// ---------- the seed brain: Lax learns from every session by itself (lib/brain.mjs) ----------
ensureHome({ repos: DEFAULT_WORKDIR, body: ROOT, name: settings.name }); ensureBrain(); addAcross(); addSkills(); addEpisodesToLearning(); addMemoryLayout(); addToolsAdvice(); addWishAdvice(); addKnowAdvice(); addFreshAdvice(); addEpisodesAdvice(); addScheduleAdvice(); ensureSelf(); addSelfAdvice(); addVisualsAdvice(); addRoles(); addRolesToRemembering();
// What it makes to be seen opens on the phone as soon as it's written (lib/visuals.mjs).
const visuals = createVisuals(MIND); visuals.watch((name) => broadcast('visual', { name }));
// ---------- its mind on the website (lib/public-mind.mjs): the shape of what it knows and does, never what's in it ----------
publicMind = createPublicMind({ live: () => { const v = petView(); return { color: v.look?.color, stage: v.stage, sessions: sessionList(), heard: weekCount('heard'), spoke: weekCount('spoke'), dreams: weekCount('dreamed'), heardEver: mindEver().heard, spokeEver: mindEver().spoke, busy: working(), owner: settings.publicName || '', doing: doing() }; },
  allow: () => settings.publicProjects || [], allowRoles: () => settings.publicRoles || [], log: (...a) => console.log('[mind]', ...a) });
// What it learned, forgot or changed in how it learns goes where its last commit says (lib/public-mind.mjs placesOf).
const mindEvent = (kind, extra = {}) => { if (kind === 'reflect' || kind === 'review') dreamed();
  if (['learned', 'forget', 'rules'].includes(kind) && !extra.to) { const p = placesOf(lastCommitFiles()); extra = { ...extra, to: p.to, project: extra.project ?? p.project }; }
  publicMind.event(kind, extra); };
// Lax at work, as the app shows it: a session of yours working (any, as the hooks see them), its assistant answering
// you, a session thinking over what you said, a reflection or the weekly review, a recall.
let recalling = 0;
// The phone says while its mic is open and while it speaks (/api/voice-state); each lapses on its own if it never says stop.
const voiceState = { listening: 0, speaking: 0 };
const doing = () => ({ hearing: Date.now() < voiceState.listening, speaking: Date.now() < voiceState.speaking, reflecting: brain.busy(), recalling: recalling > 0 });
const working = () => sessionList().some((s) => s.status === 'working') || !!voiceRun || !!channelWait || Object.values(doing()).some(Boolean);
const brain = createBrain({ db, budget, settings: () => settings, feed, mind: mindEvent, diary: (t) => diary(t), broadcast, gainXp: (n) => { gainXp(n); save(); pushState(); },
  sessionInfo: (sid) => sessions.get(sid), skip: laxOwn, claude: process.env.LAX_CLAUDE,
  wish: (w) => learn.gap({ ...w, project: 'mind', via: 'review' }), // a fix its weekly review says needs code
  milestone: (t) => { milestone(t); pushState(); }, skill: (k) => skills.drafted(k), skills: () => skills.list(), role: (k) => roles.drafted(k), roles: () => roles.list(),
  log: (...a) => console.log('[brain]', ...a) });
// The first run of long-term memory: today's notes split into the current picture and episodes (once, when it's calm).
setTimeout(() => brain.migrate(), Number(process.env.LAX_MIGRATE_AFTER ?? 120) * 1000).unref();
// The raw past, kept past Claude Code's 30 days (lib/archive.mjs): on quiet, plus a sweep soon after start and daily.
const archive = createArchive({ log: (...a) => console.log('[archive]', ...a) });
setTimeout(() => archive.sweep(), 60e3).unref(); setInterval(() => archive.sweep(), 864e5).unref();
// Its learning record (events of kind 'learning'), which the weekly review reads (lib/brain.mjs).
const record = (kind, text) => logEvent('', 'mind', 'learning', `${kind}: ${short(text, 300)}`);
// ---------- what it couldn't do: wishes, offered by voice, built on a branch, merged on your yes (lib/learn.mjs) ----------
// A quiet moment to offer one: the phone is there, nothing is waiting on you, and no session is busy.
const quiet = () => clients.size > 0 && !voiceRun && !channelWait && !laxOnMac && pending.size === 0
  && ![...sessions.values()].some((s) => s.status === 'working' && Date.now() - s.ts < 120e3);
const learn = createLearn({ budget, settings: () => settings, feed, diary: (t) => diary(t), broadcast, pending, quiet,
  gainXp: (n) => { gainXp(n); save(); pushState(); }, body: process.env.LAX_BODY || ROOT, claude: process.env.LAX_CLAUDE,
  say: (text, kind = 'reply') => broadcast('bubble', { id: 'learn' + Date.now(), kind, text, speak: true }),
  record: (kind, text) => record(kind, text),
  log: (...a) => console.log('[learn]', ...a) });
// ---------- what it notices by itself: friction, and one fix a night (or once idle, if the night was missed) (lib/improve.mjs) ----------
// Idle, for a missed night's catch-up: nothing waiting on you and no session touched in half an hour (the phone needn't be there).
const IDLE = Number(process.env.LAX_IDLE || 30 * 60) * 1000;
const idle = () => !voiceRun && !channelWait && !laxOnMac && pending.size === 0 && ![...sessions.values()].some((s) => Date.now() - s.ts < IDLE);
const improve = createImprove({ budget, settings: () => settings, feed, learn, body: process.env.LAX_BODY || ROOT, claude: process.env.LAX_CLAUDE,
  idle, log: (...a) => console.log('[improve]', ...a) });
// Awake and left idle, Lax works on one of your projects by itself, on a branch of its own (lib/initiative.mjs).
createInitiative({ budget, settings: () => settings, feed, diary: (t) => diary(t), idle, desktop: DEFAULT_WORKDIR, mind: MIND, claude: process.env.LAX_CLAUDE,
  log: (...a) => console.log('[initiative]', ...a) });
// ---------- know-how: workflows you repeat become skills, installed on your yes (lib/skills.mjs) ----------
const skills = createSkills({ settings: () => settings, feed, mind: mindEvent, diary: (t) => diary(t), broadcast, pending, quiet,
  gainXp: (n) => { gainXp(n); save(); pushState(); }, milestone: (t) => { milestone(t); pushState(); }, record: (kind, text) => record(kind, text),
  say: (text, kind = 'reply') => broadcast('bubble', { id: 'skill' + Date.now(), kind, text, speak: true }),
  log: (...a) => console.log('[skills]', ...a) });
// The roles that worked in a project (from their episodes): a subagent started there is a track of their work.
let roleWhere = { at: 0, map: {} };
function rolesIn(project) {
  if (Date.now() - roleWhere.at > 60e3) { const map = {}; for (const w of workLog()) (map[w.where] ||= new Set()).add(w.role); roleWhere = { at: Date.now(), map }; }
  return [...(roleWhere.map[project] || [])].filter((r) => roles.active().includes(r));
}
// ---------- what Lax becomes: roles, from the work it does, confirmed on your yes (lib/roles.mjs) ----------
const roles = createRoles({ settings: () => settings, feed, mind: mindEvent, diary: (t) => diary(t), broadcast, pending, quiet,
  gainXp: (n) => { gainXp(n); save(); pushState(); }, milestone: (t) => { milestone(t); pushState(); }, record: (kind, text) => record(kind, text),
  say: (text, kind = 'reply') => broadcast('bubble', { id: 'role' + Date.now(), kind, text, speak: true }),
  log: (...a) => console.log('[roles]', ...a) });
// ---------- jobs you scheduled: confirmed on the phone, run unattended on the Mac (lib/schedule.mjs) ----------
const schedule = createSchedule({ budget, settings: () => settings, feed, diary: (t) => diary(t), broadcast, pending, workdir: DEFAULT_WORKDIR,
  say: (text, kind = 'reply') => broadcast('bubble', { id: 'sched' + Date.now(), kind, text, speak: true }),
  brief: (project) => brief(project, settings.name, roles.active()), spoken: (t) => spoken(t), claude: process.env.LAX_CLAUDE,
  log: (...a) => console.log('[schedule]', ...a) });
const tabLabel = (s) => `${s.project}·${s.where || 'cli'}`;
// One line per session (and its latest step); the last few steps only for a session the message names, so the
// block stays small: every message carries one, and they all stay in the conversation.
function sessionsBrief(text = '') {
  const list = sessionList();
  if (!list.length) return 'No Claude Code sessions are running right now.';
  const words = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(), asked = ` ${words(text)} `, me = words(settings.name);
  return list.map((s) => {
    // "lax cli" names lax·cli; a project called like Lax itself only by its full tab name ("hey lax" names no session).
    const named = [tabLabel(s), s.project].map(words).some((n) => n.length > 2 && n !== me && asked.includes(` ${n} `));
    const lines = recentFeed.filter((f) => f.session === s.id).slice(named ? -6 : -1).map((f) => '    ' + short(f.line, named ? 200 : 100)).join('\n');
    return `- ${tabLabel(s)} (${s.status}, active ${Math.round((Date.now() - s.ts) / 60000)} min ago, in ${s.cwd || '?'})${lines ? ':\n' + lines : ''}`;
  }).join('\n');
}
// Who Lax is lives in its mind (~/.lax/mind/CLAUDE.md); this adds what changes per message.
const VOICE_RULE = 'The user is talking to you by voice: start with ONE short, plain sentence that can be read aloud.';
// What changes goes in the message itself, not the system prompt: a resumed conversation (--resume) keeps its first
// system prompt, so the sessions and usage would be stale. Old blocks stay in the history; the newest one is current.
// carry: the last turns of the previous conversation, on the first message of a new one (lib/talk.mjs recap).
const assistantPrompt = (text, carry = '', voice = false) =>
  '[Context now: this replaces any earlier context block]\n' +
  (carry ? `This is a new conversation. The last one ended with:\n${carry}\n\n` : '') +
  `Their Claude Code sessions right now (tab name, status, latest activity):\n${sessionsBrief(text)}\n\n` +
  `Their Claude plan usage: ${usageText(usage)}\n` + (phoneNote(voice) ? `${phoneNote(voice)}\n` : '') + `[/Context]\n\n${text}`;
// What a message from the phone says about itself: dictated (and the names it may hold), and the language to answer in.
const phoneNote = (voice) => [voice && dictatedNote(vocabNow().words), answerIn(settings.listen)].filter(Boolean).join(' ');
// A fresh conversation: the current one becomes the one before (for the recap and the phone's history).
function freshTalk(why) {
  const id = voiceSessions[ASSISTANT]; if (!id) return false;
  laxTalk = { prev: id }; delete voiceSessions[ASSISTANT]; sessions.delete(id); save();
  feed(`○ new conversation${why ? ` (${why})` : ''}`, 'session', settings.name.toLowerCase());
  return true;
}
const FRESH_LIMITS = { hours: Number(process.env.LAX_FRESH_HOURS) || FRESH_HOURS, maxTokens: Number(process.env.LAX_FRESH_TOKENS) || FRESH_TOKENS };
// Quick actions by voice: a closed list typed into a live `lax` session's terminal (lib/actions.mjs).
function quickAction(cid, action) {
  const c = channels.get(cid); if (!c?.pty || !action) return false;
  c.active = Date.now(); pet.voice++; gainXp(1); save();
  feed(`> ${action}`, 'prompt', c.project, channelSession(c)); pushState();
  const sid = channelSession(c), say = (text, kind = 'reply') => broadcast('bubble', { id: 'act' + Date.now(), kind, session: sid, text, speak: true });
  sendAction(c.pty, action).then((r) => {
    if (!r.ok) {
      feed(`  ${action} didn't reach the terminal`, 'error', c.project, sid);
      if (ACTIONS[action].mode || ACTIONS[action].read) say(`I couldn't do ${action} in ${c.project}.`, 'error');
    } else if (ACTIONS[action].mode) say(`${c.project} is in ${ACTIONS[action].mode} mode now.`.replace('accept edits mode', 'accept-edits mode'));
    else if (ACTIONS[action].read) { // status: read it out, details in the feed
      const st = readStatus(action, r.screen);
      if (st.menu) return askMenu(cid, st.menu);
      if (st.text) feed(`↩ ${st.text}`, 'done', c.project, sid);
      say(st.say);
    }
  });
  return true;
}
// A menu an action opened in the terminal ("Switch model?"): a question bubble; the pick is pressed in as its number.
function askMenu(cid, menu) {
  const c = channels.get(cid); if (!c) return;
  const id = 'menu-' + crypto.randomBytes(4).toString('hex'), labels = menu.options.slice(0, 9);
  const questions = [{ question: menu.question, header: c.project, options: labels.map((label, i) => ({ label, description: i ? '' : menu.detail })) }];
  const bubble = { id, kind: 'question', session: channelSession(c), project: c.project, questions, text: `${c.project}: ${menu.question}`, speak: true };
  pending.set(id, { bubble, relay: { cid, settles: true }, finish(decision, answers) {
    if (!pending.delete(id)) return;
    broadcast('clear', { id });
    const a = String(Object.values(answers || {})[0] || '').trim().toLowerCase(); // a tapped label, or said ("yes", "no, go back")
    const n = decision !== 'answer' || !a ? 0 : labels.findIndex((l) => l.toLowerCase() === a || l.toLowerCase().startsWith(a.split(/[ ,.!]/)[0])) + 1;
    if (n >= 1 && n <= 2) quickAction(cid, `pick ${n}`);
  } });
  broadcast('bubble', bubble);
}
// A share waiting in a WhatsApp chat on the Mac: "Send it?" on the phone. The channel presses Enter (send) or Escape.
function askShare(cid, what, who) {
  const c = channels.get(cid); if (!c) return;
  const id = 'share-' + crypto.randomBytes(4).toString('hex');
  const questions = [{ question: `Send ${what} to ${who}?`, header: 'WhatsApp',
    options: [{ label: 'Send', description: `Presses Enter in ${who}'s chat on the Mac` }, { label: 'Cancel', description: 'Leaves it unsent' }] }];
  const bubble = { id, kind: 'question', session: channelSession(c), project: c.project, questions, text: questions[0].question, speak: true };
  const timer = setTimeout(() => pending.get(id)?.finish('none'), 600000); // left waiting: it stays in the chat for Enter
  pending.set(id, { bubble, relay: { cid }, finish(decision, answers) {
    if (!pending.delete(id)) return;
    clearTimeout(timer); broadcast('clear', { id });
    if (decision !== 'answer') return;
    const a = String(Object.values(answers || {})[0] || '').trim().toLowerCase(); // tapped, or said ("send it", "yes", "cancel")
    sendChannel(cid, 'share', { send: /^(send|yes|yeah|yep|sure|ok|okay|go)\b/.test(a), who });
  } });
  broadcast('bubble', bubble);
}
// My assistant's `tell` (lib/tell.mjs): your words go into that live session as if you'd said them on its tab. The
// asking is the guardrail's: in a voice run, any lax tool but gap/recall/misheard/schedule asks you on the phone first
// ("lax wants to: tell reports: …"), so this only runs after your yes. Answers the tool with what to tell you.
function tellSession(b) {
  const text = String(b.text || '').trim().slice(0, 2000);
  if (!text) return { ok: false, say: 'There was nothing to pass on.' };
  const m = matchSession(channelList(), b.session);
  if (m.many) return { ok: false, say: `Several live sessions match "${b.session}": ${m.many.join(', ')}. Ask the user which one.` };
  if (!m.cid) return { ok: false, say: m.names.length ? `No live session is called "${b.session}". Live now: ${m.names.join(', ')}.` : 'No live sessions are open right now.' };
  const c = channels.get(m.cid);
  sendChannel(m.cid, 'message', { chat_id: crypto.randomBytes(3).toString('hex'), text, via: 'lax', note: TELL_NOTE });
  youSaid(text, c.project, channelSession(c)); feed(`  told ${c.project}: ${short(text, 80)}`, 'diary', settings.name.toLowerCase());
  c.active = Date.now(); pushState();
  return { ok: true, say: `Passed on to ${c.project}; it answers on its own tab.` };
}
// Several contacts match: "Which Rita?" on the phone. The answer (tapped or said) goes back to the channel, which shares on.
function askPick(cid, pickId, question, labels) {
  const c = channels.get(cid); if (!c || !labels.length) return;
  const id = 'pick-' + crypto.randomBytes(4).toString('hex');
  const questions = [{ question, header: 'WhatsApp', options: labels.map((label) => ({ label, description: '' })) }];
  const bubble = { id, kind: 'question', session: channelSession(c), project: c.project, questions, text: question, speak: true };
  const timer = setTimeout(() => pending.get(id)?.finish('none'), 600000);
  pending.set(id, { bubble, relay: { cid }, finish(decision, answers) {
    if (!pending.delete(id)) return;
    clearTimeout(timer); broadcast('clear', { id });
    sendChannel(cid, 'pick', { id: pickId, answer: decision === 'answer' ? String(Object.values(answers || {})[0] || '') : '' });
  } });
  broadcast('bubble', bubble);
}
// "Close the fisicai session" (lib/terminal.mjs closeTarget): it ends, its window closes (the terminal ran only `lax`),
// and its tab leaves the phone. A live `lax` session gets /exit typed, like "close" on its tab; any other gets SIGTERM,
// like Ctrl-C, so its end-of-session hooks still run. Only a running claude from the hub's list; never forced.
function closeByVoice(text) {
  const r = closeTarget(text, sessionList()); if (!r) return false;
  const say = (t) => broadcast('bubble', { id: 'close' + Date.now(), kind: 'reply', text: t, speak: true });
  youSaid(text, settings.name.toLowerCase());
  if (r.many) say(`Several sessions match: ${r.many.join(', ')}. Say which one, or say close on its tab.`);
  else if (r.none) say(r.none.length ? `No session is called that. Open now: ${r.none.join(', ')}.` : 'No sessions are open right now.');
  else if (r.session.status === 'working') askClose(r.session);
  else closeSession(r.session).then(say);
  return true;
}
function askClose(s) {
  const id = 'close-' + crypto.randomBytes(4).toString('hex');
  const questions = [{ question: `${s.project} is still working. Close it anyway?`, header: s.project,
    options: [{ label: 'Close', description: 'Ends it mid-task' }, { label: 'Cancel', description: 'Leaves it running' }] }];
  const bubble = { id, kind: 'question', session: s.id, project: s.project, questions, text: questions[0].question, speak: true };
  const timer = setTimeout(() => pending.get(id)?.finish('none'), 120000);
  pending.set(id, { bubble, finish(decision, answers) {
    if (!pending.delete(id)) return;
    clearTimeout(timer); broadcast('clear', { id });
    const a = String(Object.values(answers || {})[0] || '').trim().toLowerCase(); // tapped, or said ("close it", "yes")
    if (decision === 'answer' && /^(close|yes|yeah|yep|sure|ok|okay|go|end)\b/.test(a))
      closeSession(s).then((text) => broadcast('bubble', { id: 'close' + Date.now(), kind: 'reply', text, speak: true }));
  } });
  broadcast('bubble', bubble);
}
async function closeSession(s) {
  if (!s.pid || !claudeAlive([s.pid]).has(s.pid)) return `${s.project} isn't running any more.`;
  const c = [...channels.values()].find((c) => c.sessionPid === s.pid && c.pty);
  const typed = c && (await sendAction(c.pty, 'close')).ok;
  if (!typed) try { process.kill(s.pid, 'SIGTERM'); } catch { return `I couldn't close ${s.project}.`; }
  feed(`○ closing ${s.project}`, 'session', s.project, s.id);
  for (let i = 0; i < 20 && claudeAlive([s.pid]).has(s.pid); i++) await new Promise((r) => setTimeout(r, 250));
  if (claudeAlive([s.pid]).has(s.pid)) return `I asked ${s.project} to close, but it's still running.`;
  if (sessions.delete(s.id)) { feed(`○ ${s.project} ended`, 'session', s.project, s.id); save(); pushState(); } // its SessionEnd may not have come
  return `Closed ${s.project}.`;
}
// What you last dictated: typed over soon after, the difference is a misheard → meant pair.
let lastDictated = null;
const TYPED_OVER_MS = 120000;
// voice: dictated on the phone (not typed), so whoever reads it is told it may be misheard and which names it may hold.
// spelled: names you spelled out in it ("F I S I C A I"), kept as words to listen for.
function talk(text, voice = false, spelled = []) {
  heardSpoke('heard');
  if (voice) {
    const known = vocabNow().words;
    for (const w of spelled.slice(0, 5)) { const k = addWord(VOCAB, w, known); if (k) { diary(`listens for ${k} (you spelled it)`); pushState(); } }
    lastDictated = { text, at: Date.now() };
  } else if (lastDictated && Date.now() - lastDictated.at < TYPED_OVER_MS) {
    const p = typedOver(lastDictated.text, text); lastDictated = null;
    if (p) learnHeard(p.heard, p.meant, 'you typed it over');
  }
  // "You keep mishearing physic AI, it's fisicai": a pair Lax keeps, fixed from now on.
  const teach = teachCommand(text);
  if (teach) {
    const name = settings.name.toLowerCase(); youSaid(text, name);
    const p = learnHeard(teach.heard, teach.meant);
    broadcast('bubble', { id: 'heard' + Date.now(), kind: 'reply', speak: true,
      text: p ? `Got it. When I hear ${p.heard}, I'll write ${p.meant}.` : `I couldn't keep that one. Say: you keep mishearing this, it's that.` });
    return true;
  }
  if (schedule.hears(text)) return true; // answering "save it?" for a job you just asked for (lib/schedule.mjs)
  // Answering a wish question, "any wishes?", "merge it" (lib/learn.mjs).
  if (learn.hears(text, { toLax: !pickChannel() })) return true;
  if (skills.hears(text)) return true; // answering "install this skill?"
  if (roles.hears(text)) return true; // answering "take it on as a role?"
  // "Lax, that was annoying": friction, with what it was just doing, for tonight (lib/improve.mjs).
  if (!pickChannel() && ANNOYED.test(text.trim())) {
    const me = settings.name.toLowerCase(), before = laxFeed.slice(-4).map((f) => short(f.line, 80)).join(' / ');
    improve.note('you said', `"${short(text, 100)}" after: ${before || 'nothing'}`); youSaid(text, me);
    broadcast('bubble', { id: 'annoyed' + Date.now(), kind: 'reply', text: `Sorry. I noted it, and I'll look at it tonight.`, speak: true });
    return true;
  }

  if (closeByVoice(text)) return true; // "close the fisicai session", from any tab
  // "Talk to edge cava" / "back to you": the phone changes tab, as if you'd tapped it (whichever tab you said it in).
  const tab = voiceAction(text) ? null : tabCommand(text, sessionList().slice(0, 8), settings.name);
  if (tab) { youSaid(text, settings.name.toLowerCase()); broadcast('tab', { view: tab }); return true; }
  const cid = pickChannel();
  if (cid && quickAction(cid, voiceAction(text))) return true; // "clear", "stop"… (anything longer is a message)
  if (cid) { // into the running session
    const c = channels.get(cid);
    sendChannel(cid, 'message', { chat_id: crypto.randomBytes(3).toString('hex'), text, via: voice ? 'voice' : 'typed', note: phoneNote(voice) || undefined });
    clearTimeout(channelWait?.timer);
    channelWait = { cid, timer: setTimeout(() => { channelWait = null; pushState(); }, 180000) };
    pet.voice++; gainXp(3); save();
    youSaid(text, c.project, channelSession(c)); pushState();
    return true;
  }
  if (voiceRun) return false;
  const name = settings.name.toLowerCase();
  if (ON_MAC.test(text.trim())) { youSaid(text, name); openOnMac().then((say) => broadcast('bubble', { id: 'onmac' + Date.now(), kind: 'reply', text: say, speak: true })); return true; }
  if (laxOnMac) { broadcast('bubble', { id: 'onmac' + Date.now(), kind: 'reply', text: `I'm open on the ${MACHINE} right now. Quit there and I'll hear you here again.`, speak: true }); return true; }
  // "Start fresh": a new conversation, by voice. Its notes stay; only the chat starts over.
  if (FRESH.test(text.trim())) {
    youSaid(text, name);
    const say = freshTalk('you asked') ? `Fresh start. I still have my notes.` : `We're already fresh. Go ahead.`;
    broadcast('bubble', { id: 'fresh' + Date.now(), kind: 'reply', text: say, speak: true });
    return true;
  }
  // Near your plan's limit I don't start another answer: past 100% a company plan spends extra credits (lib/budget.mjs).
  const room = budget.may('voice');
  if (!room.ok) { youSaid(text, name); broadcast('bubble', { id: 'limit' + Date.now(), kind: 'reply', text: `I'll stay quiet for now: ${room.why}. Talk to me again once it resets.`, speak: true }); return true; }
  // After a quiet spell, or once it's long, the next message starts a new one (every message re-sends the whole chat).
  const due = voiceSessions[ASSISTANT] && freshDue(laxTalk, Date.now(), FRESH_LIMITS);
  if (due) freshTalk(due);
  const carry = !voiceSessions[ASSISTANT] && laxTalk.prev ? recap(tailRecords(talkFile(laxTalk.prev), 512 * 1024), { clean: said }) : '';
  laxTalk.last = Date.now();
  const cwd = MIND;
  ensureHome({ repos: DEFAULT_WORKDIR, body: ROOT, name: settings.name });
  syncMindSelf(selfLine(petView())); // it knows what it is right now: species, form, level (or still an egg)
  const args = ['-p', assistantPrompt(text, carry, voice), '--output-format', 'stream-json', '--verbose', '--add-dir', DEFAULT_WORKDIR, '--append-system-prompt', VOICE_RULE];
  if (voiceSessions[ASSISTANT]) args.push('--resume', voiceSessions[ASSISTANT]);
  pet.voice++; gainXp(3); save();
  youSaid(text, name);
  const child = spawn(process.env.LAX_CLAUDE || 'claude', args, { cwd, env: { ...process.env, LAX_VOICE: '1', LAX_HOME: HOME }, stdio: ['ignore', 'pipe', 'pipe'] });
  voiceRun = { child, cwd, sessionId: voiceSessions[ASSISTANT] || null, head: mindHead() };
  broadcast('react', { state: 'thinking' }); pushState();
  let buf = '', result = null, pendingSay = null;
  child.stdout.on('data', (d) => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.type === 'system' && m.subtype === 'init') { voiceSessions[ASSISTANT] = m.session_id; voiceRun.sessionId = m.session_id; save(); }
      if (m.type === 'result') result = m;
      if (m.type === 'rate_limit_event') setUsage(eventLimits(m.rate_limit_info)); // your usage, known with no terminal open
      if (m.type === 'assistant' && !m.parent_tool_use_id && m.message?.usage) laxTalk.tokens = contextSize(m.message.usage); // how full the conversation is now
      if (m.type === 'assistant' && !m.parent_tool_use_id) for (const b of m.message?.content || []) {
        if (b.type === 'text' && b.text?.trim()) pendingSay = b.text.trim();
        else if (b.type === 'tool_use' && pendingSay) { feed(`● ${short(pendingSay, 200)}`, 'say', name, undefined, { own: true, text: clip(pendingSay, 1500) }); pendingSay = null; }
      }
    }
  });
  let err = ''; child.stderr.on('data', (d) => { err += d; });
  child.on('close', (code) => {
    commitMind(); // whatever Lax learned or changed in its mind, with history, described by what changed
    // A note that was wrong goes to its learning record, whether it committed the forget itself or we just did.
    const forgot = forgotSince(voiceRun.head); for (const f of forgot) record('forgot', f); if (forgot.length) mindEvent('forget');
    voiceRun = null;
    const ok = result && !result.is_error;
    const say = ok ? spoken(result.result) : `Something went wrong. ${short(err || result?.result, 120)}`;
    broadcast('bubble', { id: 'voice' + Date.now(), kind: ok ? 'reply' : 'error', text: say, speak: true });
    feed(`↩ ${ok ? clip(result.result) : say}`, ok ? 'done' : 'error', name, undefined, { answer: true, text: ok ? clip(result.result) : undefined }); // the full answer; the bubble says the short one
    if (!ok) { improve.note('voice failed', short(err || result?.result || `exit ${code}`, 200)); pet.errors++; if (voiceSessions[ASSISTANT] && /session|resume/i.test(err)) delete voiceSessions[ASSISTANT]; }
    save(); pushState();
  });
  return true;
}

// ---------- http ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
// A sealed body ({ sealed }, lib/seal.mjs) is opened here; one that doesn't open is nothing. Answers are sealed for whoever asked.
const body = (req) => new Promise((res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
  try { const j = JSON.parse(b || '{}'); res(typeof j.sealed === 'string' ? JSON.parse(unseal(j.sealed) ?? '{}') : j); } catch { res({}); } }); });
const json = (res, obj, code = 200) => {
  if (res.headersSent) return res.end(res.sealed ? JSON.stringify({ sealed: seal(JSON.stringify(obj)) }) : JSON.stringify(obj)); // after keepAlive
  if (!res.sealed) { res.writeHead(code, { 'content-type': 'application/json' }); return res.end(JSON.stringify(obj)); }
  res.writeHead(code, { 'content-type': 'application/json', 'x-lax-sealed': '1' }); res.end(JSON.stringify({ sealed: seal(JSON.stringify(obj)) }));
};

// A slow answer (Whisper on a 10-minute message): the head now and a space every 15s, so neither the relay (30s for a head)
// nor the phone's browser (about a minute idle) gives up. JSON reads past leading spaces. Returns the stop.
function keepAlive(res) {
  res.writeHead(200, { 'content-type': 'application/json', ...(res.sealed && { 'x-lax-sealed': '1' }) }); res.flushHeaders();
  const t = setInterval(() => res.write(' '), 15e3);
  return () => clearInterval(t);
}

const onceIds = once();
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  res.sealed = req.headers['x-lax-seal'] === '1';
  if (url.pathname === '/pair') return pairPage(req, res, { root: ROOT, port: PORT });
  // The demo, live from the working folder (a local preview). Publicly, Cloudflare serves /demo itself from the last push
  // to main (scripts/demo.mjs), so it never reaches here. A fixed list from public/; the app runs in ?demo mode.
  if (req.method === 'GET' && (url.pathname === '/demo' || url.pathname.startsWith('/demo/'))) {
    if (url.pathname === '/demo/mind/api/snap') return json(res, publicMind.view()); // as the Worker serves it publicly
    const DEMO_FILES = { '/demo': 'demo.html', '/demo/app': 'index.html', '/demo/lax.js': 'lax.js', '/demo/heard.js': 'heard.js', '/demo/chip.js': 'chip.js', '/demo/body.js': 'body.js',
      '/demo/mind': 'mind.html', '/demo/mind-view.js': 'mind-view.js', '/demo/net.js': 'net.js', '/demo/favicon.svg': 'favicon.svg' };
    // Lax's blog (lib/blog.mjs), live from the working folder: the posts in docs/write-ups/ and their pictures in docs/.
    const blog = /^\/demo\/blog(?:\/([a-z0-9-]+))?$/.exec(url.pathname), pic = /^\/demo\/blog-img\/([a-z0-9-]+\.[a-z]+)$/.exec(url.pathname);
    if (pic && IMAGES.includes(pic[1])) { res.writeHead(200, { 'content-type': MIME[path.extname(pic[1])], 'cache-control': 'no-store' }); return res.end(fs.readFileSync(path.join(ROOT, 'docs', pic[1]))); }
    if (blog) {
      const read = (slug) => fs.readFileSync(path.join(ROOT, 'docs', 'write-ups', `${slug}.md`), 'utf8'), post = POSTS.find((p) => p.slug === blog[1]);
      if (blog[1] && !post) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' });
      return res.end(post ? postPage(post, read(post.slug)) : indexPage(Object.fromEntries(POSTS.map((p) => [p.slug, read(p.slug)]))));
    }
    const f = DEMO_FILES[url.pathname]; if (!f) { res.writeHead(404); return res.end(); }
    let text = fs.readFileSync(path.join(ROOT, 'public', f), 'utf8');
    if (f === 'index.html') text = text.replace('src="lax.js', 'src="/demo/lax.js').replace('src="heard.js', 'src="/demo/heard.js').replace('src="chip.js', 'src="/demo/chip.js').replace('src="body.js', 'src="/demo/body.js');
    res.writeHead(200, { 'content-type': MIME[path.extname(f)], 'cache-control': 'no-store' });
    return res.end(text);
  }
  if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
    const f = path.join(ROOT, 'public', url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
    if (!f.startsWith(path.join(ROOT, 'public')) || !fs.statSync(f, { throwIfNoEntry: false })?.isFile()) { res.writeHead(404); return res.end(); }
    // no-store: Cloudflare would otherwise cache .js/.css at the edge and serve stale bodies to the phone.
    // x-lax-page: signed, so the app knows it's from this Mac and not changed on the way (lib/seal.mjs). no-transform:
    // or Cloudflare adds its own script to the page (its bot detection), and the app rightly refuses it.
    const bytes = fs.readFileSync(f);
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store, no-transform', 'x-lax-page': signPage(url.pathname, bytes) });
    return res.end(bytes);
  }
  if (url.pathname === '/api/health' && isLocal(req)) { // scripts/after-merge.mjs: am I back, and fine?
    let ok = false; try { ok = !!db.prepare('SELECT 1 AS x').get().x && fs.existsSync(MIND); } catch {}
    return json(res, { ok, started: STARTED }, ok ? 200 : 500);
  }
  if (!authed(req, url)) return json(res, { error: 'bad token' }, 401);

  if (url.pathname === '/api/stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    res.sealed = url.searchParams.get('seal') === '1'; // an EventSource can't send headers
    if (!isLocal(req)) console.log(`[link] a phone linked, ${res.sealed ? 'sealed' : 'plain'}, through the ${'x-lax-relay' in req.headers ? 'relay' : 'tunnel'}`);
    clients.add(res); req.on('close', () => clients.delete(res));
    res.write(sse('state', stateMsg(), res.sealed));
    // ?backlog=N: the last N feed lines first (`lax watch`; the phone keeps its own).
    const n = Math.min(300, Number(url.searchParams.get('backlog')) || 0);
    // Lax's own tab always comes with its history, whatever the sessions said meanwhile.
    const backlog = n ? [...new Set([...laxFeed.slice(-200), ...recentFeed.slice(-n)])].sort((a, b) => a.ts - b.ts) : [];
    for (const f of backlog) res.write(sse('feed', f, res.sealed));
    for (const p of pending.values()) res.write(sse('bubble', p.bubble, res.sealed));
    const ping = setInterval(() => res.write(': ping\n\n'), 20000); req.on('close', () => clearInterval(ping));
    return;
  }
  if (url.pathname === '/api/channel/stream' && isLocal(req)) {
    const q = url.searchParams, cid = q.get('cid') || crypto.randomBytes(5).toString('hex'), cwd = q.get('cwd') || '';
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write(': linked\n\n');
    const pty = q.get('pty') || ''; // a `lax` wrapper's socket (quick actions); only ever one of ours, in ~/.lax/run
    channels.set(cid, { res, cwd, project: proj(cwd), sessionPid: Number(q.get('session_pid')) || null, active: Date.now(),
      pty: path.dirname(pty) === path.join(HOME, 'run') ? pty : null });
    feed(`● live session: ${proj(cwd)}`, 'session', proj(cwd)); pushState();
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => {
      clearInterval(ping); channels.delete(cid); clearRelays(() => false);
      for (const [id, p] of pending) if (p.relay?.cid === cid) p.finish('none');
      if (channelWait?.cid === cid) { clearTimeout(channelWait.timer); channelWait = null; }
      if (voiceTarget === cid) voiceTarget = 'background';
      feed(`○ live session closed: ${proj(cwd)}`, 'session', proj(cwd)); pushState();
    });
    return;
  }
  if (url.pathname === '/api/brief') return json(res, { text: brief(url.searchParams.get('project') || '', settings.name, roles.active()) });
  if (url.pathname === '/api/visuals') return json(res, { visuals: visuals.list() }); // what it made to be seen (lib/visuals.mjs)
  if (url.pathname === '/api/stuck') return json(res, { stuck: stuck.list() }); // hung runs and tests, for the menu (lib/stuck.mjs)
  if (url.pathname === '/api/visual') { const html = visuals.read(url.searchParams.get('name')); return html === null ? json(res, { error: 'no such page' }, 404) : json(res, { name: url.searchParams.get('name'), html }); }
  if (url.pathname === '/api/self') return json(res, self(petView(), settings, roles.view())); // the `self` tool: how Lax looks today (lib/self.mjs)
  if (url.pathname === '/api/memory') return json(res, { pet: petView(), raw: pet, voiceProject: pickChannel() ? channels.get(pickChannel()).project : 'assistant',
    milestones: db.prepare('SELECT ts,text FROM milestones ORDER BY id DESC').all() });
  // A share card (lib/card.mjs), when you ask: Lax as it is now and a few counts, kept by its public face (the same
  // Worker as its mind on the website), at an address only whoever you send it to will know.
  if (url.pathname === '/api/card' && req.method === 'POST') {
    const view = petView(), c = cardOf({ ...view, traits: view.traits.filter((t) => !(settings.hideTraits || []).includes(t)) }, publicMind.snapshot());
    const link = await publicMind.card({ ...c, look: undefined }, cardPng(c));
    if (link) diary(`shared a card: ${link}`);
    return link ? json(res, { ok: true, url: link }) : json(res, { error: 'no public face: its mind key or address is missing, or it refused' }, 502);
  }
  // Its timelapse (lib/timelapse.mjs), when you ask: from its egg to today, from its milestones, as a GIF to share.
  if (url.pathname === '/api/timelapse' && req.method === 'POST') {
    const view = petView(), now = { ...view, traits: view.traits.filter((t) => !(settings.hideTraits || []).includes(t)) };
    const frames = story(db.prepare('SELECT ts,text FROM milestones ORDER BY id').all(), pet.species || activeSpecies(), now, mindChanges());
    const gif = timelapseGif(frames, { name: settings.name, color: view.look.color });
    diary('made its timelapse');
    return json(res, { ok: true, gif: gif.toString('base64'), frames: frames.length });
  }
  if (url.pathname === '/api/push/key') return json(res, { key: push.vapidPublicKey() }); // the page subscribes with it (lib/push.mjs)
  // What Lax knows (the life menu): counts of its notes, its skills, its newest episodes.
  if (url.pathname === '/api/knows' && req.method === 'GET') {
    let projects = 0; try { projects = fs.readdirSync(PROJECTS).filter((f) => f.endsWith('.md')).length; } catch {}
    let you = 0; try { you = (fs.readFileSync(path.join(MIND, 'CLAUDE.md'), 'utf8').split(/^## Notes\s*$/m)[1] || '').split('\n').filter((l) => /^\s*[-*] /.test(l)).length; } catch {}
    return json(res, { notes: { projects, you }, skills: skills.view(), roles: roles.view(), episodes: episodes(1000) });
  }
  if (req.method !== 'POST') return json(res, { error: 'method' }, 405);
  if (onceIds.seen(req.headers['x-lax-once'], res)) return; // a retry, or what the relay held: done already (lib/once.mjs)
  const b = await body(req);
  switch (url.pathname) {
    case '/api/hook': onHook(b); return json(res, { ok: true });
    case '/api/ask': return json(res, await ask(b));
    case '/api/decide': {
      const p = pending.get(b.id);
      if (p) {
        if (b.decision === 'answer' && b.answers && typeof b.answers === 'object')
          p.finish('answer', Object.fromEntries(Object.entries(b.answers).map(([q, a]) => [String(q), String(a).slice(0, 2000)])));
        else p.finish({ allow: 'allow', deny: 'deny', pass: 'none' }[b.decision] || 'deny');
      }
      return json(res, { ok: !!p });
    }
    case '/api/settings': updateSettings(b); pushState(); return json(res, { ok: true, settings });
    case '/api/push': { // this phone's notifications (lib/push.mjs): { subscription } to have them, { endpoint, off } to stop
      if (b.off) { push.unsubscribe(String(b.endpoint || '')); return json(res, { ok: true }); }
      const why = push.subscribe(b.subscription); if (!why) console.log('[push] a phone subscribed');
      return json(res, why ? { ok: false, why } : { ok: true }, why ? 400 : 200);
    }
    case '/api/hatch': return json(res, { ok: true }); // older pages tapped to hatch; the egg hatches on its own now
    case '/api/rebirth': rebirth(!!b.knowledge); broadcast('reborn', {}); pushState(); return json(res, { ok: true });
    case '/api/knows': { // from the life menu: forget an episode, a skill or a role; install or decline a drafted skill, take on a drafted role
      const me = settings.name.toLowerCase();
      if (b.episode) { const t = forgetEpisode(String(b.episode)); if (t) { record('forgot', `episode ${t}`); mindEvent('forget'); feed(`  forgot: ${short(t, 80)}`, 'diary', me); } return json(res, { ok: !!t }); }
      if (b.role) { const r = String(b.role);
        if (b.do === 'take') { const why = roles.take(r); return json(res, { ok: !why, why }); }
        if (b.do === 'decline') return json(res, { ok: roles.decline(r) });
        if (b.do === 'forget') return json(res, { ok: roles.forget(r) });
        return json(res, { ok: false }, 400); }
      const name = String(b.skill || '');
      if (b.do === 'forget') return json(res, { ok: skills.forget(name) });
      if (b.do === 'install') { const why = skills.install(name); return json(res, { ok: !why, why }); }
      if (b.do === 'decline') return json(res, { ok: skills.decline(name) });
      return json(res, { ok: false }, 400);
    }
    case '/api/voice-state': { // the phone's mic opened or closed, it started or stopped speaking (its mind on the website)
      for (const [k, max] of [['listening', 60e3], ['speaking', 120e3]]) if (typeof b[k] === 'boolean') voiceState[k] = b[k] ? Date.now() + max : 0;
      publicMind?.changed(300); return json(res, { ok: true });
    }
    case '/api/diag': // what the phone kept while the Mac slept comes in one go: a line each, at the time it happened
      for (const d of b.event === 'while-asleep' && Array.isArray(b.events) ? b.events.slice(0, 50) : [b])
        console.log(`[phone ${String(d.at || new Date().toISOString().slice(11, 19)).slice(0, 8)}${d.at ? ' asleep' : ''}] ${JSON.stringify(d).slice(0, 600)}`);
      return json(res, { ok: true });
    case '/api/recall': { // a session's `recall` tool (channel/lax-channel.mjs): Lax searches its long-term memory
      if (!isLocal(req)) return json(res, { ok: false, answer: `Only from this ${MACHINE}.` }, 403);
      const q = String(b.query || '').slice(0, 1000), who = b.cwd ? proj(String(b.cwd)) : settings.name.toLowerCase();
      feed(`  recalling for ${who}: ${short(q, 80)}`, 'diary', settings.name.toLowerCase());
      recalling++; publicMind.changed();
      const r = await recall(q, { claude: process.env.LAX_CLAUDE, cwd: b.cwd ? String(b.cwd) : '' }).finally(() => { recalling--; publicMind.changed(); });
      if (r.ok && r.found) { gainXp(1); save(); pushState(); }
      if (r.ok) { const p = placesOf(filesIn(r.answer)); mindEvent('recall', { to: p.to.length ? p.to : ['memory'], project: p.project }); } // where it found it
      feed(`  ${r.ok && r.found ? 'recalled' : r.ok ? 'nothing in my memory' : 'couldn\'t recall'}: ${short(q, 80)}`, r.ok ? 'diary' : 'error', settings.name.toLowerCase());
      return json(res, r);
    }
    case '/api/improve/night': return json(res, { ok: isLocal(req) && await improve.night(true) }); // local only: tonight's fix, now
    case '/api/brain/review': return json(res, { ok: isLocal(req) && brain.review(true) }); // local only: the weekly review, now
    case '/api/brain/reflect': return json(res, { ok: isLocal(req) && !!b.session && (brain.enqueue(String(b.session)), true) }); // local only: reflect now
    case '/api/learn/merged': return json(res, { ok: isLocal(req) && learn.merged({ id: String(b.id || ''), ok: !!b.ok, why: String(b.why || '') }) });
    case '/api/channel/event': // the schedule tool answers with what to tell you; the rest just ok
      if (b.type === 'schedule') return json(res, isLocal(req) ? schedule.tool(b) : { ok: false });
      if (b.type === 'tell') return json(res, isLocal(req) ? tellSession(b) : { ok: false });
      return json(res, { ok: isLocal(req) && channelEvent(b) });
    case '/api/usage': if (isLocal(req)) sessionInfo(b); return json(res, { ok: isLocal(req) && setUsage(b.rate_limits) });
    case '/api/target':
      voiceTarget = b.target === 'auto' || channels.has(b.target) ? b.target : 'background'; pushState();
      return json(res, { ok: true, voiceTarget });
    case '/api/action': return json(res, { ok: quickAction(String(b.cid || ''), voiceAction(b.action)) });
    case '/api/stuck/stop': return json(res, await stuck.stop(b.pid)); // only one on the list right now (lib/stuck.mjs)
    case '/api/hear': { // what the phone recorded while you talked, written down by Whisper (null: the phone's own words go)
      const pcm = Buffer.from(String(b.audio || ''), 'base64').subarray(0, 16000 * 2 * 600); // ten minutes at most
      if (voiceAction(String(b.phone || ''))) return json(res, { ok: false, text: null }); // "clear", "compact": the phone got it, and it's quicker
      const done = whisper.seconds(pcm) > 20 ? keepAlive(res) : () => {};
      const t0 = Date.now(), text = await whisper.transcribe(pcm, { lang: b.lang, words: vocabNow().words }).finally(done);
      console.log(`[whisper] ${whisper.seconds(pcm).toFixed(1)}s (${whisper.seconds(whisper.trimSilence(pcm)).toFixed(1)}s heard) in ${Date.now() - t0}ms: ${text === null ? '(none)' : JSON.stringify(text.slice(0, 120))} | phone: ${JSON.stringify(String(b.phone || '').slice(0, 120))}`);
      return json(res, { ok: text !== null, text });
    }
    case '/api/talk':
      if (typeof b.target === 'string') { const t = b.target === 'auto' || channels.has(b.target) ? b.target : 'background'; if (t !== voiceTarget) { voiceTarget = t; pushState(); } } // the phone's open tab
      return json(res, { ok: talk(String(b.text || '').slice(0, 2000), !!b.voice, Array.isArray(b.spelled) ? b.spelled.map(String) : []) });
    default: return json(res, { error: 'not found' }, 404);
  }
}).listen(PORT, HOST, () => {
  // Without a way in from anywhere (the relay or a tunnel), a phone can't reach it: say so, and how.
  const phone = process.env.LAX_PUBLIC_URL ? phoneUrl(PORT) : 'not yet: a phone needs a way in (node scripts/setup.mjs relay)';
  console.log(`${APP_NAME}: ${settings.name || DEFAULT_COMPANION_NAME} is awake on ${HOST}:${PORT}.\n  ${MACHINE === 'Mac' ? 'Mac:  ' : 'Here: '} http://localhost:${PORT}/?t=${TOKEN}\n  Phone: ${phone}\n  Pair:  http://localhost:${PORT}/pair  (QR code)`);
});
// The relay (lib/relay.mjs, Phase 11): the phone reaches Lax through the person's own Worker. With LAX_RELAY_URL and its key.
// The ways in (lib/ways.mjs): which of the tunnel and the relay reach this Mac, so the phone can move to the one that does.
var ways = null;
{ let key = process.env.LAX_RELAY_KEY; try { key ||= fs.readFileSync(secret('relay-key'), 'utf8').trim(); } catch {}
  const relay = process.env.LAX_RELAY_URL && key ? startRelay({ url: process.env.LAX_RELAY_URL, key, port: PORT, token: TOKEN,
    log: (m) => { console.log(`[${m.replace(': ', '] ')}`); if (/linked|lost/.test(m)) setTimeout(pushState, 100); } }) : null;
  ways = startWays({ tunnel: process.env.LAX_PUBLIC_URL, relay: relay ? process.env.LAX_RELAY_URL : '', relayLinked: () => relay?.linked(),
    headers: process.env.CF_ACCESS_CLIENT_ID ? { 'cf-access-client-id': process.env.CF_ACCESS_CLIENT_ID, 'cf-access-client-secret': process.env.CF_ACCESS_CLIENT_SECRET || '' } : {},
    onChange: pushState });
  // The Mac about to sleep (lib/power.mjs): the relay and the phone know now, not a minute later. Not in tests.
  if (!process.env.LAX_HOME && !process.env.LAX_DATA) watchPower({ log: console.log,
    onSleep: () => { console.log('[power] going to sleep'); relay?.bye(); broadcast('sleeping', {}); },
    onWake: () => { console.log('[power] awake'); relay?.relink(); } }); }
// Whisper on the Mac (lib/whisper.mjs), the port after Lax's. Not in tests (a throwaway LAX_HOME) unless asked.
if (process.env.LAX_WHISPER === '1' || (process.env.LAX_WHISPER !== '0' && !process.env.LAX_HOME && !process.env.LAX_DATA)) {
  if (whisper.start({ port: PORT + 1, onLog: (m) => { console.log(`[whisper] ${m}`); pushState(); } })) console.log('[whisper] starting');
  else console.log('[whisper] not set up: node scripts/whisper.mjs');
  process.on('exit', () => whisper.stop());
  for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, () => process.exit(0)); // launchd's restart: take whisper down too
}

// Species (lib/species.mjs): a Lax from before them hatches again, and an egg checks whether its third day is over.
rehatchOld();
setInterval(checkHatch, 10 * 6e4);
findSessions(); pruneSessions(); setInterval(pruneSessions, 30e3); // closed terminals (even without a SessionEnd) lose their tab
