// npm run update: the project's new changes come into this Lax, and what it changed in itself (wishes it learned, fixes
// of its own) stays. Phase 9.
//   npm run update [-- --yes] [--no-restart]
// From `upstream` if this clone has one, else `origin`. Nothing of its own yet: main just moves forward. Changes of its
// own: the project is merged in on lax/update-<day>, in a worktree; a conflict is resolved by Claude inside the build
// fence (hooks/lax-hook.mjs: never auth, tokens or the guardrails, so those conflicts are yours); the tests must pass.
// Then main moves to it, Lax restarts, and if it doesn't come back healthy, main goes back (scripts/after-merge.mjs).
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { LOGS, ensureDirs } from '../lib/paths.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BODY = process.env.LAX_BODY || ROOT, CLAUDE = process.env.LAX_CLAUDE || 'claude';
const args = process.argv.slice(2), yes = args.includes('--yes'), restart = !args.includes('--no-restart');
const git = (...a) => execFileSync('git', ['-C', BODY, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const LAX_GIT = ['-c', 'user.name=Lax', '-c', 'user.email=lax@localhost'];
const say = (s) => console.log(s);
const stop = (s, code = 1) => { console.error(s); process.exit(code); };
async function ask(q) {
  if (yes) return true;
  if (!process.stdin.isTTY) stop(`${q} Run again with --yes to say yes.`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(`${q} [y/N] `)).trim().toLowerCase(); rl.close();
  return /^(y|yes|s|sim)$/.test(a);
}

// ---------- where things stand ----------
const remote = git('remote').split('\n').includes('upstream') ? 'upstream' : 'origin';
if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') stop('This Lax is not on main; switch back to main first.');
if (git('status', '--porcelain', '--untracked-files=no')) stop('This Lax has uncommitted changes; commit or stash them first.');
say(`Looking for news on ${remote}…`);
try { git('fetch', '-q', remote, 'main'); } catch (e) { stop(`Couldn't reach ${remote}: ${String(e.stderr || e.message).trim().split('\n').pop()}`); }
const REF = `${remote}/main`;
const behind = Number(git('rev-list', '--count', `main..${REF}`)), ahead = Number(git('rev-list', '--count', '--no-merges', `${REF}..main`));
if (!behind) { say('Up to date.'); process.exit(0); }
say(`\n${behind} new change${behind > 1 ? 's' : ''} from the project:`);
say(git('log', '--no-merges', '--format=  %s', '-15', `main..${REF}`));
if (behind > 15) say(`  …and ${behind - 15} more`);
if (ahead) say(`\nThis Lax has ${ahead} change${ahead > 1 ? 's' : ''} of its own, and keeps them.`);
if (!(await ask('\nUpdate?'))) stop('Nothing changed.', 0);
const prev = git('rev-parse', 'HEAD');

// ---------- bring them in ----------
let branch = null, wt = null;
if (!ahead) git('merge', '-q', '--ff-only', REF);
else {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  branch = `lax/update-${day}`; wt = path.join(path.dirname(BODY), `${path.basename(BODY)}-wt-update`);
  if (fs.existsSync(wt)) try { git('worktree', 'remove', '--force', wt); } catch {}
  try { git('branch', '-D', branch); } catch {}
  git('worktree', 'add', '-q', '-b', branch, wt, 'main');
  const nm = path.join(BODY, 'node_modules'); // the tests need the body's packages
  if (fs.existsSync(nm) && !fs.existsSync(path.join(wt, 'node_modules'))) fs.symlinkSync(nm, path.join(wt, 'node_modules'));
  const merge = spawnSync('git', ['-C', wt, ...LAX_GIT, 'merge', '--no-ff', '-m', `Lax updates: ${behind} change${behind > 1 ? 's' : ''} from ${remote}`, REF], { encoding: 'utf8' });
  if (merge.status !== 0) {
    const files = gitIn(wt, 'diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
    if (!files.length) stop(`The merge failed: ${(merge.stderr || merge.stdout).trim()}\nmain is as it was.`);
    say(`\nThe project and this Lax both changed ${files.join(', ')}. Lax is resolving it on ${branch}…`);
    const prompt = `You are Lax, updating your own body (this git worktree, ${wt}, branch ${branch}): the project's new changes are being merged into yours, and these files conflict: ${files.join(', ')}.\n`
      + 'Resolve each conflict so both survive: what the project changed, and what your own change was for. Read both sides and the history (git log) first. '
      + 'Change nothing else. Then `git add` the files, `git commit --no-edit`, and run `npm test`; if it fails because of the merge, fix that and commit again. '
      + 'If a conflict is in something you may not edit, stop and say which file: the person resolves that one.';
    const run = spawnSync(CLAUDE, ['-p', prompt, '--permission-mode', 'acceptEdits', '--allowedTools', 'Read', 'Edit', 'Bash(git:*)', 'Bash(npm test:*)'],
      { cwd: wt, encoding: 'utf8', env: { ...process.env, LAX_BUILD: wt }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 20 * 60e3 });
    const left = gitIn(wt, 'diff', '--name-only', '--diff-filter=U').replace(/\n/g, ', ')
      || (spawnSync('git', ['-C', wt, 'rev-parse', '-q', '--verify', 'MERGE_HEAD']).status === 0 ? 'the merge was not committed' : '');
    if (run.status !== 0 || left) stop(`Lax couldn't resolve it${left ? ` (${left})` : ''}. ${String(run.stdout || run.stderr).trim().split('\n').slice(-3).join(' ')}\nmain is as it was; the merge is on ${branch} in ${wt}.`);
    say(`Resolved:\n${gitIn(wt, 'diff', '--stat', `${REF}..HEAD`)}`);
  }
  say('\nRunning the tests…');
  const t = spawnSync('npm', ['test'], { cwd: wt, encoding: 'utf8', env: { ...process.env, LAX_BUILD: '' } });
  if (t.status !== 0) stop(`The tests fail after the update:\n${String(t.stdout + t.stderr).trim().split('\n').filter((l) => /✗|Error|failed/.test(l)).slice(0, 8).join('\n')}\nmain is as it was; the update is on ${branch} in ${wt}.`);
  if (!(await ask('The tests pass. Move main to it?'))) stop(`Nothing changed on main; the update waits on ${branch}.`, 0);
  git('merge', '-q', '--ff-only', branch);
  try { git('worktree', 'remove', '--force', wt); git('branch', '-d', branch); } catch {}
}
say(`\nmain: ${git('log', '-1', '--format=%h %s')}`);

// ---------- new packages, a restart, and back if it broke ----------
if (git('diff', '--name-only', prev, 'HEAD', '--', 'package.json', 'package-lock.json')) {
  say('New packages: npm install…');
  if (spawnSync('npm', ['install'], { cwd: BODY, stdio: 'inherit' }).status !== 0) { git('reset', '-q', '--keep', prev); stop('npm install failed, so main is back where it was.'); }
}
if (!restart) process.exit(0);
say('Restarting Lax…');
ensureDirs();
const log = path.join(LOGS, 'merge.log'), before = fs.existsSync(log) ? fs.statSync(log).size : 0;
spawnSync(process.execPath, [path.join(BODY, 'scripts', 'after-merge.mjs'), BODY, prev, 'update'], { stdio: 'ignore' });
const told = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').slice(before) : '';
if (/rolled back/.test(told)) stop(`Lax didn't come back healthy after the update, so main is back where it was. See ${log}.`);
say(/healthy/.test(told) ? 'Lax restarted and is healthy. Updated.' : `Updated; check that Lax restarted (${log}).`);
