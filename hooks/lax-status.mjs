#!/usr/bin/env node
// Claude Code status line → Lax. Shows your plan usage under the prompt, and hands it to Lax for the phone.
// Registered as "statusLine" in ~/.claude/settings.json by scripts/install-hooks.mjs (only if you had none).
import fs from 'node:fs';
import { readToken } from '../lib/paths.mjs';
import { readUsage, usageLine } from '../lib/usage.mjs';

let input = {}; try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch {}
const usage = readUsage(input.rate_limits);
console.log(usage ? usageLine(usage) : String(input.model?.display_name || ''));

// Also this session's model and how full its context is: the phone shows them under the session's tab.
const cw = input.context_window || {}, ctx = Number.isFinite(cw.used_percentage) ? cw.used_percentage
  : cw.current_usage && cw.context_window_size ? 100 * Object.values(cw.current_usage).filter(Number.isFinite).reduce((a, n) => a + n, 0) / cw.context_window_size : undefined;
const token = readToken();
if (token && input.session_id) await fetch((process.env.LAX_URL || 'http://127.0.0.1:7777') + '/api/usage', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-lax-token': token },
  body: JSON.stringify({ rate_limits: input.rate_limits, session_id: input.session_id, model: input.model?.display_name, ctx }), signal: AbortSignal.timeout(300),
}).catch(() => {}); // Lax asleep: the terminal still shows it
