#!/usr/bin/env node
// Claude Code hook → Lax. Registered for all events in ~/.claude/settings.json.
// Fails fast and silently when Lax isn't running, so Claude Code is never slowed down.
import fs from 'node:fs';
import path from 'node:path';
import { claudePid } from '../lib/claude-pid.mjs';
import { MIND, SECRETS, DB, readToken } from '../lib/paths.mjs';

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
const SAFE = /^(Read|Glob|Grep|LS|TodoWrite|WebSearch|WebFetch|Task|Agent)$/;
const ev = input.hook_event_name;
// Where the session runs, for its tab label: mac (Claude desktop app), cli (terminal, claude-lax), api (headless: Lax's voice, SDK), web (cloud).
const entry = process.env.CLAUDE_CODE_ENTRYPOINT || '';
input.lax_where = process.env.LAX_VOICE === '1' || entry.startsWith('sdk') ? 'api'
  : entry === 'claude-desktop' ? 'mac' : process.env.CLAUDE_CODE_REMOTE ? 'web' : 'cli';

try {
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
    || [SECRETS, DB, '.lax/secrets', 'lax.db'].some((p) => cmd.includes(p));
  const decide = (permissionDecision, permissionDecisionReason) =>
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision, permissionDecisionReason } }));
  if (ev === 'PreToolUse' && process.env.LAX_VOICE === '1' && privateHit) {
    decide('deny', 'Off limits: Lax\'s secrets and database are never touched by the assistant.');
  } else if (ev === 'PreToolUse' && process.env.LAX_VOICE === '1' && /^(Edit|Write|MultiEdit)$/.test(input.tool_name) && within(MIND)) {
    decide('allow', 'Lax\'s own mind.');
  } else if (ev === 'PreToolUse' && process.env.LAX_VOICE === '1' && !SAFE.test(input.tool_name)) {
    const { decision } = await post('/api/ask', input, 120000);
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse',
      permissionDecision: decision === 'allow' ? 'allow' : 'deny',
      permissionDecisionReason: decision === 'allow' ? 'Approved from Lax.' : 'Not approved from Lax (denied or timed out).' } }));
  }
} catch { /* Lax asleep — let Claude Code carry on normally */ }
process.exit(0);
