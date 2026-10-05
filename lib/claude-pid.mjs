// The pid of the Claude Code session this process belongs to: the nearest ancestor named `claude`.
// Hooks and the lax channel both run under that process, so it ties them to the same session.
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export function claudePid(start = process.ppid, maxDepth = 6) {
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
