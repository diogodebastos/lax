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
import { ensureHome, commitMind, syncMindName, addMemoryLayout, addToolsAdvice } from './lib/home.mjs';
import { HOME, MIND, DB, OLD_DB, SETTINGS, secret, ensureDirs, readEnv } from './lib/paths.mjs';
import { MAX_LEVEL, STAGES, levelOf as levelOn, stageIdx, barFor as barOn, curveOf } from './lib/levels.mjs';
import { createBrain, ensureBrain, brief } from './lib/brain.mjs';
import { ACTIONS, voiceAction, sendAction, readStatus } from './lib/actions.mjs';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
// Lax itself lives in ~/.lax (lib/paths.mjs): memory, secrets, mind, logs. This repo is only its body.
ensureDirs();
// Local config, a secret: { LAX_PUBLIC_URL, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET, ... }
for (const [k, v] of Object.entries(readEnv())) process.env[k] ??= String(v);
const PORT = Number(process.env.LAX_PORT || 7777);
// Tunnel only by default: nothing on the LAN can reach Lax, cloudflared connects over loopback.
const HOST = process.env.LAX_HOST || '127.0.0.1';
const PUBLIC_URL = (process.env.LAX_PUBLIC_URL || '').replace(/\/$/, '');
const DEFAULT_WORKDIR = process.env.LAX_WORKDIR || path.join(os.homedir(), 'REPOS');

const tokenFile = secret('token');
if (!fs.existsSync(tokenFile)) fs.writeFileSync(tokenFile, crypto.randomBytes(12).toString('hex'), { mode: 0o600 });
const TOKEN = fs.readFileSync(tokenFile, 'utf8').trim();

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
const kvGet = (k, d) => { const r = db.prepare('SELECT value FROM kv WHERE key=?').get(k); return r ? JSON.parse(r.value) : d; };
const kvSet = (k, v) => db.prepare('INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, JSON.stringify(v));
const logEvent = (session, project, kind, text) =>
  db.prepare('INSERT INTO events(ts,session,project,kind,text) VALUES(?,?,?,?,?)').run(Date.now(), session || '', project || '', kind, text);
const milestone = (text) => db.prepare('INSERT INTO milestones(ts,text) VALUES(?,?)').run(Date.now(), text);

const newPet = () => ({
  name: 'Lax', born: Date.now(), xp: 0, tools: {}, langs: {}, sessions: 0, turns: 0,
  errors: 0, approvals: 0, denials: 0, voice: 0, streak: 0, lastDay: null, lastSeen: Date.now(),
});
let pet = kvGet('pet', null) || newPet();
let voiceSessions = kvGet('voiceSessions', {}); // cwd -> claude session id
if (!kvGet('pet', null)) { milestone('Lax was born'); }
// Phase 3.7 moved Lax to a new level curve (it went from brick back to sprout): note it once.
if (!kvGet('newPath', false)) { if (kvGet('pet', null)) milestone(`${readSettings().name || 'Lax'} started over on a new path`); kvSet('newPath', true); }

// Life menu settings — live on the Mac, edited from the phone.
const DEFAULTS = { name: 'Lax', color: '#D97757', voice: true, pitch: 1.6, speakDone: false,
  phoneApprovals: true, askTimeout: Number(process.env.LAX_ASK_TIMEOUT || 30), theme: 'system', learns: true };
// Preferences live in settings.json, a plain file you can read; rebirth leaves them alone.
function readSettings() { try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); } catch { return {}; } }
const writeSettings = (s) => fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + '\n');
if (!fs.existsSync(SETTINGS) && kvGet('settings', null)) { writeSettings(kvGet('settings', {})); db.prepare('DELETE FROM kv WHERE key=?').run('settings'); }
let settings = { ...DEFAULTS, ...readSettings() };
syncMindName(settings.name);
function updateSettings(b) {
  const clean = {};
  if (typeof b.name === 'string' && b.name.trim()) clean.name = b.name.trim().slice(0, 12);
  if (/^#[0-9a-f]{6}$/i.test(b.color || '') && !pet.color) clean.color = b.color;
  for (const k of ['voice', 'speakDone', 'phoneApprovals', 'learns']) if (typeof b[k] === 'boolean') clean[k] = b[k];
  if (Number.isFinite(b.pitch)) clean.pitch = Math.min(2, Math.max(0.5, b.pitch));
  if ([15, 30, 60, 120].includes(b.askTimeout)) clean.askTimeout = b.askTimeout;
  if (['system', 'light', 'dark'].includes(b.theme)) clean.theme = b.theme;
  const renamed = clean.name && clean.name !== settings.name;
  settings = { ...settings, ...clean }; writeSettings(settings);
  if (renamed) syncMindName(settings.name); // its mind knows its new name
}
function rebirth() {
  db.exec('DELETE FROM events; DELETE FROM milestones;');
  pet = newPet(); voiceSessions = {}; kvSet('pet', pet); kvSet('voiceSessions', voiceSessions);
  milestone(`${settings.name} was born`);
}

// ---------- evolution (pure rules, no AI) ----------
// Lax's colour picks its growth curve (lib/levels.mjs), so changing colour can move its level.
const levelOf = (xp) => levelOn(xp, curveOf(settings.color));
const barFor = (xp) => barOn(xp, curveOf(settings.color));
// Never de-evolve: a stage, once reached, is kept (pet.stageReached), even if the curve ever changes again.
const stageOf = (lvl) => STAGES[Math.max(stageIdx(lvl), pet.stageReached || 0)][1];
// From level 50 Lax has evolved into its colour's form (public/lax.js), so the colour is kept for good.
const COLOR_SET_AT = STAGES.findIndex(([l]) => l === 50);
const colorSet = () => Math.max(stageIdx(levelOf(pet.xp)), pet.stageReached || 0) >= COLOR_SET_AT;
// The colour is pinned in Lax's life (pet.color), not just its settings, so editing settings.json can't change it either.
function pinColor() {
  if (!pet.color && colorSet()) { pet.color = settings.color; kvSet('pet', pet); }
  if (pet.color && settings.color !== pet.color) { settings = { ...settings, color: pet.color }; writeSettings(settings); }
}
pinColor();
// Traits (headband, glasses, cape…) show from level 10: a young Lax is just itself.
const TRAITS_FROM = 10;
function traits(p) {
  if (levelOf(p.xp) < TRAITS_FROM) return [];
  const t = [];
  const top = Object.entries(p.tools).sort((a, b) => b[1] - a[1])[0];
  const total = Object.values(p.tools).reduce((a, b) => a + b, 0);
  if (total >= 30 && top) {
    const cls = { Bash: 'headband', Edit: 'glasses', Write: 'glasses', MultiEdit: 'glasses',
      WebFetch: 'antenna', WebSearch: 'antenna', Read: 'monocle', Grep: 'monocle', Glob: 'monocle', Task: 'cape', Agent: 'cape' }[top[0]];
    if (cls) t.push(cls);
  }
  if ((p.tools.__tests || 0) >= 10) t.push('goggles');
  if (p.errors >= 10) t.push('scar');
  if (p.streak >= 5) t.push('flame');
  return [...new Set(t)];
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
  const before = levelOf(pet.xp);
  pet.xp += n;
  const after = levelOf(pet.xp);
  if (after > before) {
    const grew = stageIdx(after) > Math.max(stageIdx(before), pet.stageReached || 0);
    pet.stageReached = Math.max(pet.stageReached || 0, stageIdx(after)); pinColor();
    const st = stageOf(after);
    const text = after === MAX_LEVEL ? `${settings.name} reached level 100! A legend.`
      : grew ? `${settings.name} evolved into a ${st}!` : `${settings.name} reached level ${after}!`;
    milestone(text);
    broadcast('bubble', { id: 'lvl' + Date.now(), kind: 'levelup', text, speak: true });
  }
}
function touchDay() {
  const today = new Date().toISOString().slice(0, 10);
  if (pet.lastDay !== today) {
    const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    pet.streak = pet.lastDay === y ? pet.streak + 1 : 1;
    pet.lastDay = today;
    if ([3, 7, 14, 30, 100].includes(pet.streak)) milestone(`${pet.streak}-day streak`);
  }
  pet.lastSeen = Date.now();
}
function petView() {
  const level = levelOf(pet.xp), [prevXp, nextXp] = barFor(pet.xp);
  return { name: settings.name, born: pet.born, level, stage: stageOf(level), xp: pet.xp, prevXp, nextXp,
    traits: traits(pet), mood: mood(pet), streak: pet.streak, colorSet: !!pet.color };
}
let saveTimer;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { kvSet('pet', pet); kvSet('voiceSessions', voiceSessions); }, 500); };

// ---------- live state ----------
const clients = new Set();
const sessions = new Map(); // session_id -> {project, status, ts}
const pending = new Map(); // ask id -> {resolve, bubble}
function broadcast(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) c.write(msg);
}
function sessionList() {
  const cutoff = Date.now() - 6 * 36e5;
  return [...sessions.entries()].filter(([id, s]) => s.ts > cutoff && id !== voiceSessions[ASSISTANT]).map(([id, s]) => ({ id, ...s }));
}
const stateMsg = () => ({ pet: petView(), sessions: sessionList(), voiceBusy: !!voiceRun, thinking: !!channelWait, settings,
  channels: channelList(), voiceTarget });
const pushState = () => broadcast('state', stateMsg());
// session: which Claude Code session a line belongs to, so the phone can show one session's tab at a time.
const recentFeed = []; // what the assistant knows about your sessions
const feed = (line, kind = 'tool', project, session) => {
  const f = { line, kind, project, session, ts: Date.now() };
  recentFeed.push(f); if (recentFeed.length > 300) recentFeed.shift();
  broadcast('feed', f);
};
// The hook-side session a lax channel runs in (matched by the claude process pid).
const channelSession = (c) => c?.sessionPid ? [...sessions.entries()].find(([, s]) => s.pid === c.sessionPid)?.[0] : undefined;
// The terminal shows replies and results in full (capped), so you can check them on the phone; bubbles stay short.
const clip = (t, n = 4000) => { t = String(t ?? '').trim(); return t.length > n ? t.slice(0, n) + '\n…' : t; };
const proj = (cwd) => (cwd ? path.basename(cwd) : '?');
const short = (s, n = 60) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

function describeTool(name, input = {}) {
  switch (name) {
    case 'Bash': return `$ ${short(input.command, 80)}`;
    case 'Read': case 'Edit': case 'Write': case 'MultiEdit': case 'NotebookEdit':
      return `${name} ${short(path.basename(input.file_path || input.notebook_path || ''), 50)}`;
    case 'Grep': return `Grep "${short(input.pattern, 30)}"`;
    case 'Glob': return `Glob ${short(input.pattern, 40)}`;
    case 'WebFetch': return `Fetch ${short(input.url, 50)}`;
    case 'WebSearch': return `Search "${short(input.query, 40)}"`;
    case 'Task': case 'Agent': return `Agent: ${short(input.description || input.prompt, 50)}`;
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
  const sid = h.session_id, project = proj(h.cwd);
  const s = sessions.get(sid) || { project, status: 'idle', ts: 0 };
  s.ts = Date.now(); s.project = project; if (h.cwd) s.cwd = h.cwd; if (h.lax_where) s.where = h.lax_where; if (h.lax_session_pid) s.pid = h.lax_session_pid;
  sessions.set(sid, s);
  touchDay();
  const mine = sid && sid === voiceSessions[ASSISTANT]; // Lax's own assistant: talk() already shows what you said and the answer
  if (/^(PostToolUse|PostToolUseFailure|Stop|UserPromptSubmit)$/.test(h.hook_event_name)) clearRelays((c) => c.cwd === h.cwd);
  brain.onEvent(sid, h.hook_event_name); // a quiet session after real work → Lax reflects on it
  switch (h.hook_event_name) {
    case 'SessionStart':
      pet.sessions++; gainXp(2); s.status = 'idle';
      feed(`● session ${project}`, 'session', project, sid); logEvent(sid, project, 'session', h.source || 'start');
      break;
    case 'UserPromptSubmit':
      s.status = 'working'; if (!mine) feed(`> ${short(h.prompt, 90)}`, 'prompt', project, sid);
      logEvent(sid, project, 'prompt', short(h.prompt, 500));
      break;
    case 'PreToolUse': {
      s.status = 'working'; const n = h.tool_name;
      pet.tools[n] = (pet.tools[n] || 0) + 1; gainXp(1);
      if (n === 'Bash' && /\b(test|pytest|jest|vitest|cargo test|go test)\b/.test(h.tool_input?.command || '')) pet.tools.__tests = (pet.tools.__tests || 0) + 1;
      const ext = (h.tool_input?.file_path || '').split('.').pop();
      if (/^(Edit|Write|MultiEdit)$/.test(n) && LANG[ext]) pet.langs[LANG[ext]] = (pet.langs[LANG[ext]] || 0) + 1;
      feed(describeTool(n, h.tool_input), 'tool', project, sid); logEvent(sid, project, 'tool', describeTool(n, h.tool_input));
      break;
    }
    case 'PostToolUse': {
      const r = h.tool_response; const err = r && (r.is_error || r.interrupted || (typeof r.exit_code === 'number' && r.exit_code !== 0));
      if (err) { pet.errors++; feed(`  ✗ ${h.tool_name} failed`, 'error', project, sid); broadcast('react', { state: 'error' }); }
      // A shell command's output, like a terminal: the first lines under the command.
      if (h.tool_name === 'Bash' && r) {
        const out = String(r.stdout || r.stderr || '').replace(/\s+$/, ''), lines = out ? out.split('\n') : [];
        if (lines.length) feed(lines.slice(0, 12).map((l) => '  ' + short(l, 160)).join('\n') + (lines.length > 12 ? `\n  … ${lines.length - 12} more lines` : ''), 'out', project, sid);
      }
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
      if (!mine) feed(`✓ ${project}: ${clip(msg, 1500) || 'done'}`, 'done', project, sid);
      logEvent(sid, project, 'done', short(msg, 1000));
      if (!(voiceRun && voiceRun.sessionId === sid)) // voice runs speak their own result
        broadcast('bubble', { id: 'done-' + sid + Date.now(), kind: 'done', text: `${project}: ${spoken(msg) || 'done!'}`, session: sid, speak: false });
      break;
    }
    case 'SessionEnd':
      sessions.delete(sid); feed(`○ ${project} ended`, 'session', project, sid);
      break;
  }
  save(); pushState();
}

// A hook is waiting for the human: show the bubble, resolve when the phone answers (or time out).
// Decisions: allow | deny | answer (AskUserQuestion, with answers) | none (fall back to the terminal).
function ask(h) {
  return new Promise((resolve) => {
    // Lax's own assistant (h.lax_voice) has no terminal: its requests always come to the phone, whatever "ask me on the phone"
    // (which is about your terminal sessions) says. If it can't be asked, say why.
    if (clients.size === 0) return resolve({ decision: 'none', why: 'no phone is connected to Lax' });
    if (!settings.phoneApprovals && !h.lax_voice) return resolve({ decision: 'none', why: 'phone approvals are off' });
    // Sessions with a live lax channel relay tool approvals themselves (no duplicate bubble); questions still come here.
    if (h.tool_name !== 'AskUserQuestion' && h.lax_session_pid && [...channels.values()].some((c) => c.sessionPid === h.lax_session_pid))
      return resolve({ decision: 'none' });
    const id = crypto.randomBytes(6).toString('hex'), project = proj(h.cwd);
    const questions = h.tool_name === 'AskUserQuestion' && Array.isArray(h.tool_input?.questions) ? h.tool_input.questions : null;
    const bubble = questions
      ? { id, kind: 'question', session: h.session_id, project, questions, text: `${project}: ${questions[0].question}`, speak: true }
      : { id, kind: 'permission', session: h.session_id, text: `${project} wants to: ${describeTool(h.tool_name, h.tool_input)}`, speak: true, actions: true };
    // Questions are worth waiting longer for: they need reading.
    const timer = setTimeout(() => finish('none'), Math.min(600, settings.askTimeout * (questions ? 4 : 1)) * 1000);
    function finish(decision, answers) {
      clearTimeout(timer); pending.delete(id); broadcast('clear', { id });
      const ss = sessions.get(h.session_id); if (ss?.status === 'waiting') { ss.status = 'working'; pushState(); }
      if (decision === 'allow' || decision === 'answer') pet.approvals++; else if (decision === 'deny') pet.denials++;
      const line = { allow: '✓ approved from phone', deny: '✗ denied from phone', answer: '✓ answered from phone' }[decision];
      if (line) { feed(`  ${line}`, decision === 'deny' ? 'error' : 'done', project, h.session_id); save(); }
      resolve(answers ? { decision, answers } : { decision });
    }
    pending.set(id, { finish, bubble });
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
// terminal). Sharing's questions ("Which Vera?", "Send it?") stay: the session keeps working while they wait.
function clearRelays(match) {
  for (const [id, p] of pending) if (p.relay?.settles && match(channels.get(p.relay.cid) || {})) p.finish('none');
}
function channelEvent(b) {
  const c = channels.get(b.cid); if (!c) return false;
  c.active = Date.now();
  if (b.type === 'reply') {
    if (channelWait?.cid === b.cid) { clearTimeout(channelWait.timer); channelWait = null; }
    const text = String(b.text || '');
    feed(`↩ ${clip(text)}`, 'done', c.project, channelSession(c)); logEvent(channelSession(c) || '', c.project, 'reply', short(text, 1000));
    broadcast('bubble', { id: 'ch' + Date.now(), kind: 'reply', session: channelSession(c), text: short(text.replace(/```[\s\S]*?```/g, ' '), 400), say: spoken(text), speak: true });
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
      text: `${c.project} wants to: ${b.tool_name}${b.description ? ' — ' + short(b.description, 140) : ''}` };
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
const ASSISTANT = 'assistant:' + MIND; // its key in voiceSessions (a conversation only resumes in the folder it started in)

// ---------- the seed brain: Lax learns from every session by itself (lib/brain.mjs) ----------
ensureHome({ repos: DEFAULT_WORKDIR, body: ROOT, name: settings.name }); ensureBrain(); addMemoryLayout(); addToolsAdvice();
const brain = createBrain({ db, settings: () => settings, feed, broadcast, gainXp: (n) => { gainXp(n); save(); pushState(); },
  sessionInfo: (sid) => sessions.get(sid), skip: (sid) => sid === voiceSessions[ASSISTANT], claude: process.env.LAX_CLAUDE,
  log: (...a) => console.log('[brain]', ...a) });
const tabLabel = (s) => `${s.project}·${s.where || 'cli'}`;
function sessionsBrief() {
  const list = sessionList().filter((s) => s.id !== voiceSessions[ASSISTANT]);
  if (!list.length) return 'No Claude Code sessions are running right now.';
  return list.map((s) => {
    const lines = recentFeed.filter((f) => f.session === s.id).slice(-6).map((f) => '    ' + f.line).join('\n');
    return `- ${tabLabel(s)} (${s.status}, active ${Math.round((Date.now() - s.ts) / 60000)} min ago, in ${s.cwd || '?'})${lines ? ':\n' + lines : ''}`;
  }).join('\n');
}
// Who Lax is lives in its mind (~/.lax/mind/CLAUDE.md); this adds what changes per message.
const assistantPrompt = () =>
  'The user is talking to you by voice: start with ONE short, plain sentence that can be read aloud.\n\n' +
  `Their Claude Code sessions right now (tab name, status, latest activity):\n${sessionsBrief()}`;
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
// Several contacts match: "Which Vera?" on the phone. The answer (tapped or said) goes back to the channel, which shares on.
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
function talk(text) {
  const cid = pickChannel();
  if (cid && quickAction(cid, voiceAction(text))) return true; // "clear", "stop"… (anything longer is a message)
  if (cid) { // into the running session
    const c = channels.get(cid);
    sendChannel(cid, 'message', { chat_id: crypto.randomBytes(3).toString('hex'), text });
    clearTimeout(channelWait?.timer);
    channelWait = { cid, timer: setTimeout(() => { channelWait = null; pushState(); }, 180000) };
    pet.voice++; gainXp(3); save();
    feed(`> ${short(text, 90)}`, 'prompt', c.project, channelSession(c)); pushState();
    return true;
  }
  if (voiceRun) return false;
  const cwd = MIND, name = settings.name.toLowerCase();
  ensureHome({ repos: DEFAULT_WORKDIR, body: ROOT, name: settings.name });
  const args = ['-p', text, '--output-format', 'stream-json', '--verbose', '--add-dir', DEFAULT_WORKDIR, '--append-system-prompt', assistantPrompt()];
  if (voiceSessions[ASSISTANT]) args.push('--resume', voiceSessions[ASSISTANT]);
  pet.voice++; gainXp(3); save();
  feed(`> ${short(text, 90)}`, 'prompt', name);
  const child = spawn(process.env.LAX_CLAUDE || 'claude', args, { cwd, env: { ...process.env, LAX_VOICE: '1', LAX_HOME: HOME }, stdio: ['ignore', 'pipe', 'pipe'] });
  voiceRun = { child, cwd, sessionId: voiceSessions[ASSISTANT] || null };
  broadcast('react', { state: 'thinking' }); pushState();
  let buf = '', result = null;
  child.stdout.on('data', (d) => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.type === 'system' && m.subtype === 'init') { voiceSessions[ASSISTANT] = m.session_id; voiceRun.sessionId = m.session_id; save(); }
      if (m.type === 'result') result = m;
    }
  });
  let err = ''; child.stderr.on('data', (d) => { err += d; });
  child.on('close', (code) => {
    commitMind(); // whatever Lax learned or changed in its mind, with history, described by what changed
    voiceRun = null;
    const ok = result && !result.is_error;
    const say = ok ? spoken(result.result) : `Something went wrong. ${short(err || result?.result, 120)}`;
    broadcast('bubble', { id: 'voice' + Date.now(), kind: ok ? 'reply' : 'error', text: say, speak: true });
    feed(`↩ ${ok ? clip(result.result) : say}`, ok ? 'done' : 'error', name); // the full answer; the bubble says the short one
    if (!ok) { pet.errors++; if (voiceSessions[ASSISTANT] && /session|resume/i.test(err)) delete voiceSessions[ASSISTANT]; }
    save(); pushState();
  });
  return true;
}

// ---------- http ----------
const lanIp = () => Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
const phoneUrl = () => `${PUBLIC_URL || `http://${lanIp()}:${PORT}`}/?t=${TOKEN}`;
// The Android app's pairing link: Lax URL + the Cloudflare Access service token for its background link.
const appPairUrl = () => 'lax://pair?' + new URLSearchParams({ u: phoneUrl(),
  id: process.env.CF_ACCESS_CLIENT_ID || '', s: process.env.CF_ACCESS_CLIENT_SECRET || '' });
// Truly local: loopback AND not proxied. cloudflared also connects from 127.0.0.1, but adds cf-* headers.
const isLocal = (req) => /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress)
  && !['cf-connecting-ip', 'cf-ray', 'x-forwarded-for', 'cf-access-jwt-assertion'].some((h) => h in req.headers);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const body = (req) => new Promise((res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { try { res(JSON.parse(b || '{}')); } catch { res({}); } }); });
const json = (res, obj, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const authed = (req.headers['x-lax-token'] || url.searchParams.get('t')) === TOKEN;

  if (url.pathname === '/pair') {
    if (!isLocal(req)) { res.writeHead(403); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(ROOT, 'public', 'pair.html'), 'utf8').replace('%%URL%%', phoneUrl()).replace('%%APP%%', appPairUrl()));
  }
  if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
    const f = path.join(ROOT, 'public', url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
    if (!f.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    // no-store: Cloudflare would otherwise cache .js/.css at the edge and serve stale bodies to the phone.
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    return fs.createReadStream(f).pipe(res);
  }
  if (!authed) return json(res, { error: 'bad token' }, 401);

  if (url.pathname === '/api/stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    clients.add(res); req.on('close', () => clients.delete(res));
    res.write(`event: state\ndata: ${JSON.stringify(stateMsg())}\n\n`);
    for (const p of pending.values()) res.write(`event: bubble\ndata: ${JSON.stringify(p.bubble)}\n\n`);
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
  if (url.pathname === '/api/brief') return json(res, { text: brief(url.searchParams.get('project') || '', settings.name) });
  if (url.pathname === '/api/memory') return json(res, { pet: petView(), raw: pet, voiceProject: pickChannel() ? channels.get(pickChannel()).project : 'assistant',
    milestones: db.prepare('SELECT ts,text FROM milestones ORDER BY id DESC LIMIT 50').all() });
  if (req.method !== 'POST') return json(res, { error: 'method' }, 405);
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
    case '/api/rebirth': rebirth(); broadcast('reborn', {}); pushState(); return json(res, { ok: true });
    case '/api/diag': console.log(`[phone ${new Date().toISOString().slice(11, 19)}] ${JSON.stringify(b).slice(0, 600)}`); return json(res, { ok: true });
    case '/api/brain/reflect': return json(res, { ok: isLocal(req) && !!b.session && (brain.enqueue(String(b.session)), true) }); // local only: reflect now
    case '/api/channel/event': return json(res, { ok: isLocal(req) && channelEvent(b) });
    case '/api/target':
      voiceTarget = b.target === 'auto' || channels.has(b.target) ? b.target : 'background'; pushState();
      return json(res, { ok: true, voiceTarget });
    case '/api/action': return json(res, { ok: quickAction(String(b.cid || ''), voiceAction(b.action)) });
    case '/api/talk': return json(res, { ok: talk(String(b.text || '').slice(0, 2000)) });
    default: return json(res, { error: 'not found' }, 404);
  }
}).listen(PORT, HOST, () => {
  console.log(`Lax is awake on ${HOST}:${PORT}.\n  Mac:   http://localhost:${PORT}/?t=${TOKEN}\n  Phone: ${phoneUrl()}\n  Pair:  http://localhost:${PORT}/pair  (QR code)`);
});
