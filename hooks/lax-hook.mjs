#!/usr/bin/env node
// Claude Code hook → Lax. Registered for all events in ~/.claude/settings.json.
// Fails fast and silently when Lax isn't running, so Claude Code is never slowed down.
import fs from 'node:fs';
import path from 'node:path';
import { claudePid } from '../lib/claude-pid.mjs';
import { MIND, SECRETS, DB, readToken } from '../lib/paths.mjs';
import { bashKind } from '../lib/allow.mjs';
import { offLimits } from '../lib/guard.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const URL_BASE = process.env.LAX_URL || 'http://127.0.0.1:7777';
const token = readToken();
if (!token) process.exit(0);

let input; try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
const post = (p, body, ms) => fetch(URL_BASE + p, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-lax-token': token },
  body: JSON.stringify(body), signal: AbortSignal.timeout(ms),
}).then((r) => r.json());

// Tools that never need a human in voice mode.
const SAFE = /^(Read|Glob|Grep|LS|TodoWrite|WebSearch|WebFetch|Task|Agent|ToolSearch|Skill|BashOutput|NotebookRead)$/;
const ev = input.hook_event_name;
// Where the session runs, for its tab label: mac (Claude desktop app), cli (terminal, claude-lax), api (headless: Lax's voice, SDK), web (cloud).
const entry = process.env.CLAUDE_CODE_ENTRYPOINT || '';
input.lax_where = process.env.LAX_VOICE === '1' || entry.startsWith('sdk') ? 'api'
  : entry === 'claude-desktop' ? 'mac' : process.env.CLAUDE_CODE_REMOTE ? 'web' : 'cli';

// Lax building something it learns (lib/learn.mjs), in a worktree of its body: fenced in. It may read (never its secrets
// or database), edit only inside that worktree and never what's off limits (lib/guard.mjs), and run only looking
// commands, tests and local git commits. Nothing leaves the Mac; your yes merges it later. Not a session of yours either.
// Drafting a wish (LAX_DRAFT) is the same fence, read-only.
if (process.env.LAX_BUILD) {
  if (ev === 'PreToolUse') {
    const WT = path.resolve(process.env.LAX_BUILD), ti = input.tool_input || {}, t = input.tool_name;
    const f = ti.file_path || ti.path || ti.notebook_path || '', abs = f && path.resolve(input.cwd || WT, f);
    const inside = (p, dir) => (p + path.sep).startsWith(dir + path.sep);
    const secret = (abs && (inside(abs, SECRETS) || abs === DB)) || [SECRETS, DB, '.lax/secrets', 'life.db'].some((p) => String(ti.command || '').includes(p));
    let ok = false, why = 'While building, Lax only reads, edits its worktree, runs tests and commits locally.';
    if (secret) why = 'Lax\'s secrets and database are never touched.';
    else if (/^(Read|Glob|Grep|LS|TodoWrite|Task|Agent|ToolSearch|WebSearch|WebFetch)$/.test(t)) ok = true;
    else if (process.env.LAX_DRAFT === '1') { // drafting a wish: it reads its body, changes nothing
      ok = t === 'Bash' && bashKind(String(ti.command || ''), input.cwd || WT) === 'read';
      why = 'While drafting a wish, Lax only reads.';
    } else if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(t)) {
      ok = !!abs && inside(abs, WT) && !offLimits(path.relative(WT, abs));
      if (abs && inside(abs, WT) && !ok) why = `${path.relative(WT, abs)} is off limits: Lax never changes it by itself.`;
    } else if (t === 'Bash') {
      const cmd = String(ti.command || ''), cwd = input.cwd || WT;
      const step = (p) => /^(npm (run )?test|node (--no-warnings )?scripts\/test-[\w-]+\.mjs|node --check \S+|git (add|commit|status|diff|log|show)\b.*)$/.test(p.trim());
      ok = inside(path.resolve(cwd), WT) && !!bashKind(cmd, cwd) && cmd.split(/&&|\|\||[|;]/).every((p) => !p.trim() || bashKind(p, cwd) === 'read' || step(p));
    }
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: ok ? 'allow' : 'deny',
      permissionDecisionReason: ok ? 'Lax\'s own worktree.' : why } }));
  }
  process.exit(0);
}

// Lax reflecting on a session (lib/brain.mjs): fenced in. It may read and write only inside its mind; nothing
// else (no shell, no web, not its body), and it isn't a session of yours: no tab, no feed, no XP.
if (process.env.LAX_REFLECT === '1') {
  if (ev === 'PreToolUse') {
    const ti = input.tool_input || {}, f = ti.file_path || ti.path || ti.notebook_path || '';
    const inMind = !!f && (path.resolve(f) + path.sep).startsWith(MIND + path.sep);
    const ok = /^(Read|Edit|Write|MultiEdit|Glob|Grep)$/.test(input.tool_name) && (inMind || (!f && /^(Glob|Grep)$/.test(input.tool_name)));
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: ok ? 'allow' : 'deny',
      permissionDecisionReason: ok ? 'Lax\'s own mind.' : 'While reflecting, Lax only reads and writes its own mind.' } }));
  }
  process.exit(0);
}

try {
  // A new session starts with what Lax knows about its project (and about you), if anything.
  if (ev === 'SessionStart' && process.env.LAX_VOICE !== '1') {
    const project = path.basename(input.cwd || '');
    const r = await fetch(`${URL_BASE}/api/brief?project=${encodeURIComponent(project)}`, { headers: { 'x-lax-token': token }, signal: AbortSignal.timeout(400) })
      .then((x) => x.json()).catch(() => ({}));
    if (r.text) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: r.text } }));
  }
  // Tie the session to its claude process (rare events only; ps costs a few ms) so the phone can match
  // session chips to live lax-channel sessions.
  if (ev === 'SessionStart' || ev === 'UserPromptSubmit' || ev === 'Stop') input.lax_session_pid = claudePid();
  await post('/api/hook', input, 400).catch(() => {});

  // Interactive sessions: offer the permission prompt on the phone first.
  if (ev === 'PermissionRequest') {
    // Which session is this? If it has a live lax channel, the channel relays tool approvals instead.
    const { decision, answers } = await post('/api/ask', { ...input, lax_session_pid: claudePid() }, 600000);
    // A question answered on the phone: allow the tool with the answers filled in, as the terminal UI would.
    if (decision === 'answer') {
      console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest',
        decision: { behavior: 'allow', updatedInput: { ...input.tool_input, answers } } } }));
    } else if (decision === 'allow' || decision === 'deny') {
      console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest',
        decision: decision === 'allow' ? { behavior: 'allow' } : { behavior: 'deny', message: 'Denied from Lax (phone).' } } }));
    }
  }

  // Lax's assistant (voice runs, headless: the phone is the only way to approve).
  // Its mind is its own; its secrets and its database are never its to touch, whatever the tool.
  const ti = input.tool_input || {}, file = ti.file_path || ti.notebook_path || ti.path || '';
  const within = (dir) => !!file && (path.resolve(file) + path.sep).startsWith(dir + path.sep);
  const cmd = String(ti.command || '');
  const privateHit = within(SECRETS) || (!!file && path.resolve(file) === DB)
    || [SECRETS, DB, '.lax/secrets', 'life.db', 'lax.db'].some((p) => cmd.includes(p));
  const decide = (permissionDecision, permissionDecisionReason) =>
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision, permissionDecisionReason } }));
  if (ev === 'PreToolUse' && input.tool_name === 'mcp__lax__gap') { // "I can't" → a wish: it only writes to Lax's wish list
    decide('allow', 'It only adds to Lax\'s wish list.');
  } else if (ev === 'PreToolUse' && process.env.LAX_VOICE === '1' && privateHit) {
    decide('deny', 'Off limits: Lax\'s secrets and database are never touched by the assistant.');
  } else if (ev === 'PreToolUse' && process.env.LAX_VOICE === '1' && /^(Edit|Write|MultiEdit)$/.test(input.tool_name) && within(MIND)) {
    decide('allow', 'Lax\'s own mind.');
  } else if (ev === 'PreToolUse' && process.env.LAX_VOICE === '1' && input.tool_name === 'Bash' && bashKind(cmd, input.cwd)) {
    decide('allow', bashKind(cmd, input.cwd) === 'read' ? 'Only looking (read-only command).' : 'A local step you can undo.');
  } else if (ev === 'PreToolUse' && process.env.LAX_VOICE === '1' && !SAFE.test(input.tool_name)) {
    const { decision, why } = await post('/api/ask', { ...input, lax_voice: true }, 120000);
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse',
      permissionDecision: decision === 'allow' ? 'allow' : 'deny',
      permissionDecisionReason: decision === 'allow' ? 'Approved from Lax.'
        : decision === 'deny' ? 'The user said no on the phone.'
        : why ? `Couldn't ask the user: ${why}.` : 'The user didn\'t answer on the phone in time.' } }));
  }
} catch { /* Lax asleep — let Claude Code carry on normally */ }
process.exit(0);
