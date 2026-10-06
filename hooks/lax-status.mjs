#!/usr/bin/env node
// Claude Code status line → Lax. Shows your plan usage under the prompt, and hands it to Lax for the phone.
// Registered as "statusLine" in ~/.claude/settings.json by scripts/install-hooks.mjs (only if you had none).
import fs from 'node:fs';
import { readToken } from '../lib/paths.mjs';
import { readUsage, usageLine } from '../lib/usage.mjs';

let input = {}; try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch {}
const usage = readUsage(input.rate_limits);
console.log(usage ? usageLine(usage) : String(input.model?.display_name || ''));

const token = readToken();
if (usage && token) await fetch((process.env.LAX_URL || 'http://127.0.0.1:7777') + '/api/usage', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-lax-token': token },
  body: JSON.stringify({ rate_limits: input.rate_limits }), signal: AbortSignal.timeout(300),
}).catch(() => {}); // Lax asleep: the terminal still shows it
