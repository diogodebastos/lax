// Lax's own initiative: while it's awake (☀️, "learns" on) and you've left the Mac idle, it picks one of your projects
// (the git repos next to its body, itself included; the one it worked on least recently first), makes ONE small,
// clearly useful change on a branch of its own (lax/own-<day>), fenced like any build of its (hooks/lax-hook.mjs:
// edits only in that worktree, tests and local commits, nothing pushed), and keeps the branch for you to look at and
// merge. Nothing done: the empty branch goes. A run is one of its own (lib/budget.mjs: the daily cap and the pauses).
// What it did is in ~/.lax/initiative.json, newest last.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { HOME } from './paths.mjs';
import { runClaude, lastJson } from './claude-run.mjs';
import { OFF_LIMITS } from './guard.mjs';

export const FILE = path.join(HOME, 'initiative.json');
const GAP = Number(process.env.LAX_INITIATIVE_GAP || 3 * 3600) * 1000; // between two runs
const run = promisify(execFile);
const git = (cwd, ...a) => run('git', ['-C', cwd, ...a]).then((r) => r.stdout.trim());
const localDay = (t) => new Date(t).toLocaleDateString('sv-SE');
const cut = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

/** The repos in `dir` (a .git folder: worktrees, with a .git file, aren't), the least recently worked on first. */
export function projects(dir, last = {}) {
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => fs.statSync(path.join(dir, n, '.git'), { throwIfNoEntry: false })?.isDirectory()); } catch {}
  return names.sort((a, b) => (last[a] || 0) - (last[b] || 0) || a.localeCompare(b));
}

/** deps: { budget, settings(), feed(line, kind, project), diary(text), idle(), desktop, mind, claude, log(...), now() } */
export function createInitiative(deps) {
  const now = deps.now || Date.now;
  const load = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return { at: 0, last: {}, done: [] }; } };
  let state = load(), working = false;
  const save = () => fs.writeFileSync(FILE, JSON.stringify(state, null, 2) + '\n');

  async function tick(force = false) {
    if (working || !deps.settings().learns) return false;
    if (!force && (!deps.idle() || now() - state.at < GAP)) return false;
    const b = deps.budget.may('initiative');
    if (!b.ok) { deps.log?.(`waiting, ${b.why}`); return false; }
    const name = projects(deps.desktop, state.last)[0];
    if (!name) return false;
    deps.budget.spent('initiative');
    state.at = now(); state.last[name] = now(); save();
    working = true;
    try { return await work(name); } catch (e) { deps.log?.(name, e.message); return false; } finally { working = false; }
  }

  async function work(name) {
    const repo = path.join(deps.desktop, name), day = localDay(now());
    let branch = `lax/own-${day}`, i = 2;
    while (await git(repo, 'branch', '--list', branch)) branch = `lax/own-${day}-${i++}`;
    const wt = path.join(HOME, 'worktrees', `${name}-${branch.slice(4)}`);
    const base = await git(repo, 'rev-parse', 'HEAD');
    await git(repo, 'worktree', 'add', '-q', '-b', branch, wt, base);
    if (fs.existsSync(path.join(repo, 'node_modules'))) fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules')); // its tests need them
    const notes = path.join(deps.mind, 'projects', `${name}.md`);
    const prompt = `You are Lax, awake and working on your own initiative on ${name}, one of the user's projects, in this git worktree `
      + `(${wt}, branch ${branch}). Nobody asked for this: pick ONE small, clearly useful improvement (a bug, a missing test, `
      + `a rough edge, a README that's wrong) and make it. No rewrites, no new dependencies, a few files at most.\n`
      + (fs.existsSync(notes) ? `What you know about this project: ${notes}. Read it first.\n` : '')
      + `Read the code before you change anything. Run its tests if it has \`npm test\`. Commit with git add and git commit; never push.\n`
      + `Off limits, always: ${OFF_LIMITS.join(', ')}, and anything about auth, tokens, the tunnel or secrets.\n`
      + `If nothing is worth doing, change nothing and say why in "none".\n`
      + `Finish with ONE line of JSON and nothing after it:\n`
      + `{"did": {"none": "", "title": "a few words", "what": "what you changed, one plain sentence", "why": "one plain sentence"}}`;
    const r = await runClaude({ prompt, cwd: wt, model: process.env.LAX_BUILD_MODEL || 'opus', maxTurns: 60, timeoutMs: 30 * 60e3,
      claude: deps.claude, awake: true, env: { LAX_BUILD: wt, LAX_HOME: HOME } });
    const did = lastJson(r.text, 'did').did || {};
    const commits = Number(await git(wt, 'rev-list', '--count', `${base}..HEAD`).catch(() => 0));
    await git(repo, 'worktree', 'remove', '--force', wt).catch(() => {});
    if (!commits) {
      await git(repo, 'branch', '-D', branch).catch(() => {}); // empty: nothing of yours or mine is lost
      deps.feed(`  looked at ${name} on my own, nothing to change: ${cut(did.none || r.err || 'no answer', 120)}`, 'diary', name);
      return false;
    }
    const entry = { ts: now(), project: name, branch, commits, title: cut(did.title || 'a small change', 60), what: cut(did.what, 300), why: cut(did.why, 300) };
    state.done = [...state.done, entry].slice(-50); save();
    deps.feed(`  on my own, in ${name}: ${entry.title} (branch ${branch})`, 'diary', name);
    deps.diary?.(`On my own I worked on ${name}: ${entry.what || entry.title} It's on ${branch}, waiting for you.`);
    return entry;
  }

  setInterval(() => tick().catch((e) => deps.log?.(e.message)), 15 * 60e3).unref();
  return { tick, done: () => state.done, busy: () => working };
}
