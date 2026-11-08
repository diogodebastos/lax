// Processes that may be stuck, for the phone's menu: headless Claude runs (`claude -p`), test runs (`npm test`,
// `node scripts/test-*.mjs`) and the throwaway Lax servers tests start. Only yours, never the hub itself or a live
// session (an interactive `claude` isn't one of these kinds). Stop: SIGTERM, then SIGKILL after a grace, children too.
import { execFileSync } from 'node:child_process';

const KINDS = [ // the program must be the command itself, not a word in a shell's command line
  [/^(\S*\/)?claude\s(.*\s)?(-p|--print)(\s|$)/, 'claude -p'],
  [/^((\S*\/)?npm|(\S*\/)?node\s+\S*npm-cli\.js)\s+(run\s+)?test\b/, 'npm test'],
  [/^(\S*\/)?node\s(.*\s)?(\S*\/)?scripts\/(test-[\w-]+)\.mjs\b/, null], // named by its script
  [/^(\S*\/)?node\s(.*\s)?(\S*\/)?server\.mjs\b/, 'a test Lax'],
];

/** "1-02:03:04", "02:03:04", "03:04" → seconds. */
export const etimeSeconds = (t) => {
  const [d, rest] = String(t).includes('-') ? String(t).split('-') : [0, String(t)];
  return Number(d) * 86400 + rest.split(':').map(Number).reduce((s, n) => s * 60 + n, 0);
};

function ps() {
  let out = '';
  try { out = execFileSync('ps', ['-U', String(process.getuid()), '-o', 'pid=,ppid=,etime=,args='], { encoding: 'utf8', maxBuffer: 8e6 }); } catch (e) { out = e.stdout || ''; }
  return out.split('\n').map((l) => l.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/)).filter(Boolean)
    .map(([, pid, ppid, etime, args]) => ({ pid: Number(pid), ppid: Number(ppid), secs: etimeSeconds(etime), args }));
}

function cwds(pids) {
  const m = new Map(); if (!pids.length) return m;
  let out = '';
  try { out = execFileSync('lsof', ['-a', '-d', 'cwd', '-Fn', '-p', pids.join(',')], { encoding: 'utf8', timeout: 3000 }); } catch (e) { out = e.stdout || ''; }
  let pid = 0;
  for (const l of out.split('\n')) if (l[0] === 'p') pid = Number(l.slice(1)); else if (l[0] === 'n' && pid) m.set(pid, l.slice(1));
  return m;
}

/** [{ pid, what, secs, cwd }], oldest first. Never this process or what started it (the hub, or the npm test running
 * this); not: more pids never listed. */
export function list({ not = [], withCwd = true } = {}) {
  const all = ps(), skip = new Set(not), out = [], parent = new Map(all.map((p) => [p.pid, p.ppid]));
  for (let q = process.pid, i = 0; q > 1 && i < 20; q = parent.get(q), i++) skip.add(q);
  for (const p of all) {
    if (skip.has(p.pid)) continue;
    for (const [re, name] of KINDS) {
      const m = p.args.match(re); if (!m) continue;
      out.push({ pid: p.pid, what: name || m[4], secs: p.secs }); break;
    }
  }
  // A test inside `npm test` shows once, as the npm test (stopping it stops them all). Only tests group: a hung test a
  // `claude -p` or a Lax started is what you'd stop, not the whole run.
  const listed = new Set(out.filter((p) => p.what === 'npm test' || p.what.startsWith('test-')).map((p) => p.pid));
  const under = (pid) => { for (let q = parent.get(pid), i = 0; q > 1 && i < 20; q = parent.get(q), i++) if (listed.has(q)) return true; return false; };
  const top = out.filter((p) => !under(p.pid)).sort((a, b) => b.secs - a.secs);
  const dirs = withCwd ? cwds(top.map((p) => p.pid)) : new Map();
  return top.map((p) => ({ ...p, cwd: dirs.get(p.pid) || '' }));
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

/** Stop one that's on the list right now (a pid that isn't, or was reused, is refused), and everything under it. */
export async function stop(pid, { not, grace = 4000 } = {}) {
  pid = Number(pid);
  if (!list({ not, withCwd: false }).some((p) => p.pid === pid)) return { ok: false, why: 'not on the list' };
  const all = ps(), kids = (q) => all.filter((p) => p.ppid === q).flatMap((p) => [p.pid, ...kids(p.pid)]);
  const tree = [pid, ...kids(pid)];
  for (const p of tree) try { process.kill(p, 'SIGTERM'); } catch {}
  for (let t = 0; t < grace && tree.some(alive); t += 100) await new Promise((r) => setTimeout(r, 100));
  for (const p of tree) if (alive(p)) try { process.kill(p, 'SIGKILL'); } catch {}
  await new Promise((r) => setTimeout(r, 100));
  return { ok: !alive(pid) };
}
