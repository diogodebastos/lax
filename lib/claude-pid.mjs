// The pid of the Claude Code session this process belongs to: the nearest ancestor named `claude`.
// Hooks and the lax channel both run under that process, so it ties them to the same session.
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export function claudePid(start = process.ppid, maxDepth = 6) {
  if (process.env.LAX_SESSION_PID) return Number(process.env.LAX_SESSION_PID); // tests: a session without a real claude above it
  let pid = start;
  for (let i = 0; i < maxDepth && pid > 1; i++) {
    let out;
    try { out = execFileSync('ps', ['-o', 'ppid=,comm=', '-p', String(pid)], { encoding: 'utf8' }).trim(); } catch { return null; }
    const m = out.match(/^(\d+)\s+(.*)$/);
    if (!m) return null;
    if (path.basename(m[2]) === 'claude') return pid;
    pid = Number(m[1]);
  }
  return null;
}

// The command line a Claude Code session was started with (to tell whether it loaded the lax channel).
export function processArgs(pid) {
  try { return execFileSync('ps', ['-o', 'args=', '-p', String(pid)], { encoding: 'utf8' }).trim(); } catch { return ''; }
}

// Which of these pids are still a running Claude Code (a reused pid that's something else isn't).
export function claudeAlive(pids) {
  const want = [...new Set(pids.filter((p) => Number.isInteger(p) && p > 1))], alive = new Set();
  if (!want.length) return alive;
  let out = '';
  try { out = execFileSync('ps', ['-o', 'pid=,comm=', '-p', want.join(',')], { encoding: 'utf8' }); } catch (e) { out = e.stdout || ''; } // ps exits 1 if any is gone
  for (const line of out.split('\n')) { const m = line.trim().match(/^(\d+)\s+(.*)$/); if (m && path.basename(m[2]) === 'claude') alive.add(Number(m[1])); }
  return alive;
}
