// One headless Claude Code run (`claude -p`, your normal login), for the work Lax does by itself:
// reflecting (lib/brain.mjs), drafting and building what it learns (lib/learn.mjs). Always with a time limit.
import { spawn } from 'node:child_process';

// Who hears the plan usage each run reports (its rate_limit_event, lib/usage.mjs eventLimits): the server, once.
let usageSeen = () => {};
export const onRateLimit = (fn) => { usageSeen = fn; };

/** Resolves { ok, text, err } (never rejects). The run's own fence comes from `env` (see hooks/lax-hook.mjs).
 * awake: the Mac doesn't idle-sleep while it runs (a run started in a dark wake slept an hour mid-way, 2026-10-15). */
export function runClaude({ prompt, cwd, model, env = {}, allowedTools, maxTurns, timeoutMs = 10 * 60e3, claude, awake }) {
  const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose'];
  if (model) args.push('--model', model);
  if (allowedTools) args.push('--allowedTools', allowedTools);
  if (maxTurns) args.push('--max-turns', String(maxTurns));
  return new Promise((resolve) => {
    const child = spawn(claude || process.env.LAX_CLAUDE || 'claude', args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    if (awake && process.platform === 'darwin' && child.pid) spawn('caffeinate', ['-i', '-s', '-w', String(child.pid)], { stdio: 'ignore' }).on('error', () => {});
    let out = '', err = '', late = false;
    const timer = setTimeout(() => { late = true; child.kill('SIGTERM'); }, timeoutMs);
    child.stdout.on('data', (d) => (out += d)); child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => { err += e.message; });
    child.on('close', () => {
      clearTimeout(timer);
      let text = '', isError = false;
      // One JSON per line, the result last; a single JSON object (`--output-format json`) still reads the same.
      let r = null;
      for (const line of out.split('\n')) {
        let m; try { m = JSON.parse(line); } catch { continue; }
        if (m?.type === 'rate_limit_event') try { usageSeen(m.rate_limit_info); } catch {}
        if (m?.type === 'result') r = m;
      }
      if (!r) try { r = JSON.parse(out); } catch {}
      if (r) { text = r.result || ''; isError = !!r.is_error; } else text = out;
      if (late) err = `took longer than ${Math.round(timeoutMs / 60e3)} min. ${err}`;
      resolve({ ok: !!text && !isError && !late, text, err: err.trim() });
    });
  });
}

// Past the last 2000 characters only a "{" that opens a line can start it, and only so many are tried: trying every
// brace re-parsed the whole tail each time, and a long answer full of code froze the server (2026-10-14).
/** The last JSON object in a run's answer that has `key` (runs end with one line of JSON), or {}. */
export function lastJson(text, key) {
  const t = String(text || '');
  let tries = 0;
  for (let i = t.lastIndexOf('{'); i >= 0 && tries < 200; i = t.lastIndexOf('{', i - 1)) {
    if (i < t.length - 2000 && !/(^|\n)[ \t]*(```\w*[ \t]*\n?[ \t]*)?$/.test(t.slice(Math.max(0, i - 40), i))) continue;
    tries++;
    try { const o = JSON.parse(t.slice(i).replace(/\s*(```)?\s*$/, '')); if (o && key in o) return o; } catch {}
  }
  return {};
}
