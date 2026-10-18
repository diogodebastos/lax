// What Lax may never change in its own body when it learns something by itself (lib/learn.mjs).
// Checked in code, twice (before the pull request and again before the merge), not only asked for in a prompt:
// how it's reached (auth, the token, pairing), the tunnel and its setup, its home's layout, and these guardrails.
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const OFF_LIMITS = [
  'lib/auth.mjs', 'lib/paths.mjs', 'lib/allow.mjs', 'lib/guard.mjs', 'lib/learn.mjs',
  'hooks/', 'scripts/git-hooks/',
  'scripts/cf-setup.mjs', 'scripts/install-launchd.mjs', 'scripts/move-home.mjs', 'scripts/after-merge.mjs',
  'public/pair.html', 'PairActivity.kt', 'LaxBridge.kt',
  // Phase 9 and 11: the relay and its Mac end, whose GitHub it may use, updating, setup, the token, and the consent in `lax`.
  'relay/', 'lib/relay.mjs', 'lib/upstream.mjs', 'scripts/update.mjs', 'scripts/setup.mjs', 'scripts/rotate-token.mjs', 'bin/claude-lax.mjs',
];
export const MAX_LINES = 800; // a wish is one small ability, not a rewrite

/** Is this path (relative to the repo) off limits? */
export function offLimits(file) {
  const f = String(file).replace(/\\/g, '/').replace(/^\.\//, '');
  return OFF_LIMITS.some((p) => p.endsWith('/') ? f.startsWith(p) : p.includes('/') ? f === p : path.basename(f) === p);
}

// package.json may only gain tests: `npm test` may get more `node scripts/test-*.mjs` at its end, nothing else changes.
const TEST_STEP = /^(\s*&&\s*node(\s+--no-warnings)?\s+scripts\/test-[\w-]+\.mjs)+$/;
export function packageOk(before, after) {
  try {
    const a = JSON.parse(before), b = JSON.parse(after), sa = a.scripts || {}, sb = b.scripts || {};
    const others = (s) => JSON.stringify(Object.entries(s).filter(([k]) => k !== 'test').sort());
    if (others(sa) !== others(sb)) return false;
    return sb.test === sa.test || (String(sb.test).startsWith(sa.test) && TEST_STEP.test(sb.test.slice(sa.test.length)));
  } catch { return false; }
}

/** A branch Lax built, checked against the guardrails: { ok, why }. */
export function checkBranch(root, branch, base = 'main') {
  const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  let stat;
  try { stat = git('diff', '--numstat', `${base}...${branch}`); } catch (e) { return { ok: false, why: `couldn't read the branch: ${String(e.stderr || e.message).trim().slice(0, 120)}` }; }
  let lines = 0; const touched = [];
  for (const row of stat.split('\n').filter(Boolean)) {
    const [add, del, file] = row.split('\t');
    lines += (Number(add) || 0) + (Number(del) || 0); touched.push(file);
  }
  const bad = touched.filter(offLimits);
  if (bad.length) return { ok: false, why: `it touches what I may never change: ${bad.join(', ')}` };
  if (touched.includes('package.json')) {
    const show = (ref) => { try { return git('show', `${ref}:package.json`); } catch { return ''; } };
    if (!packageOk(show(base), show(branch))) return { ok: false, why: 'it changes package.json beyond adding a test' };
  }
  if (lines > MAX_LINES) return { ok: false, why: `it's too big (${lines} lines; a wish is at most ${MAX_LINES})` };
  if (!touched.length) return { ok: false, why: 'it changed nothing' };
  return { ok: true, files: touched, lines };
}

// Wishes that are about how Lax is reached or protected: declined before anything is drafted.
// Checked on what was asked, not on a proposal (which says what stays off limits, and "tokens" can be a model's).
const SENSITIVE = /\b((?:lax|access|api|auth|cloudflare|tunnel|the) token|tunnel|cloudflared|access (?:policy|app|setup)|auth(?:entication|orization)?|password|secrets?|api key|credentials?|guardrails?|pairing)\b/i;
/** Why Lax won't learn this, or '' if it may. */
export function refuses(text) {
  const m = SENSITIVE.exec(String(text || ''));
  return m ? `it's about ${m[1].toLowerCase()}, which I never change by myself` : '';
}
