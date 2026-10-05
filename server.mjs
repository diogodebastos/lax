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
import { ensureHome } from './lib/home.mjs';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const DATA = process.env.LAX_DATA || path.join(ROOT, 'data'); // LAX_DATA: tests run a private Lax
// Optional local config (gitignored): { LAX_PUBLIC_URL, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET, ... }
try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(DATA, 'env.json'), 'utf8')))) process.env[k] ??= String(v); } catch {}
const PORT = Number(process.env.LAX_PORT || 7777);
// Tunnel only by default: nothing on the LAN can reach Lax, cloudflared connects over loopback.
const HOST = process.env.LAX_HOST || '127.0.0.1';
const PUBLIC_URL = (process.env.LAX_PUBLIC_URL || '').replace(/\/$/, '');
const DEFAULT_WORKDIR = process.env.LAX_WORKDIR || path.join(os.homedir(), 'REPOS');
// Lax's own home: the assistant runs there, with its CLAUDE.md (who it is + notes about you). Your repos are readable from it.
const LAX_HOME = process.env.LAX_HOME || path.join(os.homedir(), '.lax');

fs.mkdirSync(DATA, { recursive: true });
const tokenFile = path.join(DATA, 'token');
if (!fs.existsSync(tokenFile)) fs.writeFileSync(tokenFile, crypto.randomBytes(12).toString('hex'), { mode: 0o600 });
const TOKEN = fs.readFileSync(tokenFile, 'utf8').trim();

// ---------- memory ----------
const db = new DatabaseSync(path.join(DATA, 'lax.db'));
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

// Life menu settings — live on the Mac, edited from the phone.
const DEFAULTS = { name: 'Lax', color: '#D97757', voice: true, pitch: 1.6, speakDone: false,
  phoneApprovals: true, askTimeout: Number(process.env.LAX_ASK_TIMEOUT || 30) };
let settings = { ...DEFAULTS, ...kvGet('settings', {}) };
function updateSettings(b) {
  const clean = {};
  if (typeof b.name === 'string' && b.name.trim()) clean.name = b.name.trim().slice(0, 12);
  if (/^#[0-9a-f]{6}$/i.test(b.color || '')) clean.color = b.color;
  for (const k of ['voice', 'speakDone', 'phoneApprovals']) if (typeof b[k] === 'boolean') clean[k] = b[k];
  if (Number.isFinite(b.pitch)) clean.pitch = Math.min(2, Math.max(0.5, b.pitch));
  if ([15, 30, 60, 120].includes(b.askTimeout)) clean.askTimeout = b.askTimeout;
  settings = { ...settings, ...clean }; kvSet('settings', settings);
}
function rebirth() {
  db.exec('DELETE FROM events; DELETE FROM milestones;');
  pet = newPet(); voiceSessions = {}; kvSet('pet', pet); kvSet('voiceSessions', voiceSessions);
  milestone(`${settings.name} was born`);
}

// ---------- evolution (pure rules, no AI) ----------
const STAGES = [[1, 'sprout'], [3, 'blob'], [6, 'cube'], [10, 'brick'], [15, 'legend']];
const levelOf = (xp) => Math.floor(Math.sqrt(xp / 10)) + 1;
const stageOf = (lvl) => STAGES.filter(([l]) => lvl >= l).pop()[1];
function traits(p) {
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
    const st = stageOf(after), grew = st !== stageOf(before);
    const text = grew ? `${settings.name} evolved into a ${st}!` : `${settings.name} reached level ${after}!`;
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
  const level = levelOf(pet.xp), next = 10 * level * level;
  return { name: settings.name, born: pet.born, level, stage: stageOf(level), xp: pet.xp, prevXp: 10 * (level - 1) ** 2, nextXp: next,
    traits: traits(pet), mood: mood(pet), streak: pet.streak };
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
      feed(describeTool(n, h.tool_input), 'tool', project, sid);
      break;
    }
    case 'PostToolUse': {
      const r = h.tool_response; const err = r && (r.is_error || r.interrupted || (typeof r.exit_code === 'number' && r.exit_code !== 0));
      if (err) { pet.errors++; feed(`  ✗ ${h.tool_name} failed`, 'error', project, sid); broadcast('react', { state: 'error' }); }
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
      if (!mine) feed(`✓ ${project}: ${short(spoken(msg), 90)}`, 'done', project, sid);
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
    if (clients.size === 0 || !settings.phoneApprovals) return resolve({ decision: 'none' });
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
function clearRelays(match) {
  for (const [id, p] of pending) if (p.relay && match(channels.get(p.relay.cid) || {})) p.finish('none');
}
function channelEvent(b) {
  const c = channels.get(b.cid); if (!c) return false;
  c.active = Date.now();
  if (b.type === 'reply') {
    if (channelWait?.cid === b.cid) { clearTimeout(channelWait.timer); channelWait = null; }
    const text = String(b.text || '');
    feed(`↩ ${short(spoken(text), 90)}`, 'done', c.project, channelSession(c)); logEvent('', c.project, 'reply', short(text, 1000));
    broadcast('bubble', { id: 'ch' + Date.now(), kind: 'reply', text: short(text.replace(/```[\s\S]*?```/g, ' '), 400), say: spoken(text), speak: true });
  } else if (b.type === 'permission') {
    const id = 'relay-' + b.request_id;
    const bubble = { id, kind: 'permission', actions: true, speak: true, details: String(b.input_preview || ''),
      text: `${c.project} wants to: ${b.tool_name}${b.description ? ' — ' + short(b.description, 140) : ''}` };
    pending.set(id, { bubble, relay: { cid: b.cid }, finish(decision) {
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
// Voice goes into a live session (a claude-lax tab), or else to Lax itself: an assistant you can ask anything.
// It's one long-running headless Claude in LAX_WORKDIR that also knows what your sessions are doing.
let voiceRun = null;
const ASSISTANT = 'assistant:' + LAX_HOME; // its key in voiceSessions (a conversation only resumes in the folder it started in)
const tabLabel = (s) => `${s.project}·${s.where || 'cli'}`;
function sessionsBrief() {
  const list = sessionList().filter((s) => s.id !== voiceSessions[ASSISTANT]);
  if (!list.length) return 'No Claude Code sessions are running right now.';
  return list.map((s) => {
    const lines = recentFeed.filter((f) => f.session === s.id).slice(-6).map((f) => '    ' + f.line).join('\n');
    return `- ${tabLabel(s)} (${s.status}, active ${Math.round((Date.now() - s.ts) / 60000)} min ago, in ${s.cwd || '?'})${lines ? ':\n' + lines : ''}`;
  }).join('\n');
}
// Who Lax is lives in LAX_HOME/CLAUDE.md; this adds what changes per message.
const assistantPrompt = () => (settings.name !== 'Lax' ? `Your name is now ${settings.name}.\n` : '') +
  'The user is talking to you by voice: start with ONE short, plain sentence that can be read aloud.\n\n' +
  `Their Claude Code sessions right now (tab name, status, latest activity):\n${sessionsBrief()}`;
function talk(text) {
  const cid = pickChannel();
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
  const cwd = LAX_HOME, name = settings.name.toLowerCase();
  ensureHome(LAX_HOME, DEFAULT_WORKDIR);
  const args = ['-p', text, '--output-format', 'stream-json', '--verbose', '--add-dir', DEFAULT_WORKDIR, '--append-system-prompt', assistantPrompt()];
  if (voiceSessions[ASSISTANT]) args.push('--resume', voiceSessions[ASSISTANT]);
  pet.voice++; gainXp(3); save();
  feed(`> ${short(text, 90)}`, 'prompt', name);
  const child = spawn('claude', args, { cwd, env: { ...process.env, LAX_VOICE: '1', LAX_HOME }, stdio: ['ignore', 'pipe', 'pipe'] });
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
    voiceRun = null;
    const ok = result && !result.is_error;
    const say = ok ? spoken(result.result) : `Something went wrong. ${short(err || result?.result, 120)}`;
    broadcast('bubble', { id: 'voice' + Date.now(), kind: ok ? 'reply' : 'error', text: say, speak: true });
    feed(`↩ ${short(say, 90)}`, ok ? 'done' : 'error', name);
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
    channels.set(cid, { res, cwd, project: proj(cwd), sessionPid: Number(q.get('session_pid')) || null, active: Date.now() });
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
    case '/api/channel/event': return json(res, { ok: isLocal(req) && channelEvent(b) });
    case '/api/target':
      voiceTarget = b.target === 'auto' || channels.has(b.target) ? b.target : 'background'; pushState();
      return json(res, { ok: true, voiceTarget });
    case '/api/talk': return json(res, { ok: talk(String(b.text || '').slice(0, 2000)) });
    default: return json(res, { error: 'not found' }, 404);
  }
}).listen(PORT, HOST, () => {
  console.log(`Lax is awake on ${HOST}:${PORT}.\n  Mac:   http://localhost:${PORT}/?t=${TOKEN}\n  Phone: ${phoneUrl()}\n  Pair:  http://localhost:${PORT}/pair  (QR code)`);
});
