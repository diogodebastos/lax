// npm run update (scripts/update.mjs), on throwaway repos: the project (a bare repo), this Lax (a clone of it) and a
// maintainer's clone that adds to the project. Up to date; only new changes (main moves forward); changes of its own and
// the project's (merged on a branch, both kept); a conflict Lax resolves (inside the build fence); one it can't (main
// untouched, the branch kept); tests that fail after the update (main untouched); uncommitted changes (refused).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lax-update-')));
process.on('exit', () => fs.rmSync(TMP, { recursive: true, force: true }));
const GIT_ENV = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
Object.assign(process.env, GIT_ENV);
const sh = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

const UP = path.join(TMP, 'project.git'), BODY = path.join(TMP, 'lax'), DEV = path.join(TMP, 'maintainer'), HOME = path.join(TMP, 'home');
execFileSync('git', ['init', '-q', '--bare', '-b', 'main', UP]);
execFileSync('git', ['clone', '-q', UP, DEV], { stdio: 'ignore' });
write(path.join(DEV, 'package.json'), JSON.stringify({ name: 'body', type: 'module', scripts: { test: 'node t.mjs' } }) + '\n');
write(path.join(DEV, 't.mjs'), "import fs from 'node:fs';\nif (fs.existsSync('f.txt') && fs.readFileSync('f.txt', 'utf8').includes('BROKEN')) { console.log('✗ broken'); process.exit(1); }\nconsole.log('ok');\n");
write(path.join(DEV, 'a.txt'), 'one\ntwo\nthree\n');
sh(DEV, 'add', '-A'); sh(DEV, 'commit', '-qm', 'the project'); sh(DEV, 'push', '-q', 'origin', 'main');
execFileSync('git', ['clone', '-q', UP, BODY], { stdio: 'ignore' });
const upstream = (file, text, msg) => { sh(DEV, 'pull', '-q', '--no-rebase', 'origin', 'main'); write(path.join(DEV, file), text); sh(DEV, 'add', '-A'); sh(DEV, 'commit', '-qm', msg); sh(DEV, 'push', '-q', 'origin', 'main'); };
const own = (file, text, msg) => { write(path.join(BODY, file), text); sh(BODY, 'add', '-A'); sh(BODY, 'commit', '-qm', msg); };

// A fake claude for conflicts: "resolve" writes both sides and commits; "fail" gives up.
const FAKE = path.join(TMP, 'fake-claude.mjs');
write(FAKE, `#!${process.execPath}
import fs from 'node:fs'; import { execFileSync } from 'node:child_process';
fs.writeFileSync(${JSON.stringify(path.join(TMP, 'claude.json'))}, JSON.stringify({ cwd: process.cwd(), build: process.env.LAX_BUILD, prompt: process.argv[process.argv.indexOf('-p') + 1] }));
if (process.env.FAKE_MODE === 'fail') { console.log('I may not edit that one.'); process.exit(1); }
fs.writeFileSync('a.txt', 'one, from both\\ntwo\\nthree\\n');
execFileSync('git', ['add', 'a.txt']); execFileSync('git', ['commit', '-q', '--no-edit']);
`); fs.chmodSync(FAKE, 0o755);

const update = (env = {}) => spawnSync(process.execPath, ['--no-warnings', path.join(ROOT, 'scripts', 'update.mjs'), '--yes', '--no-restart'],
  { encoding: 'utf8', env: { ...process.env, LAX_HOME: HOME, LAX_DATA: '', LAX_BODY: BODY, LAX_CLAUDE: FAKE, ...env } });
const main = () => sh(BODY, 'rev-parse', 'main'), upMain = () => sh(UP, 'rev-parse', 'main');
const contains = (a, b) => spawnSync('git', ['-C', BODY, 'merge-base', '--is-ancestor', a, b]).status === 0;

let r = update();
check('nothing new → "Up to date", nothing changes', r.status === 0 && /Up to date/.test(r.stdout), r.stdout + r.stderr);

upstream('b.txt', 'b\n', 'the project adds b');
r = update();
check('only the project changed → main moves forward to it', r.status === 0 && main() === upMain(), r.stdout.split('\n').slice(-2).join(' ') + r.stderr);
check('…and it said what was coming', /1 new change from the project/.test(r.stdout) && /the project adds b/.test(r.stdout));

own('c.txt', 'c\n', 'Lax learns: c'); upstream('d.txt', 'd\n', 'the project adds d');
r = update();
check('both changed → merged: the project\'s change and its own', r.status === 0 && read(path.join(BODY, 'c.txt')) && read(path.join(BODY, 'd.txt')) && contains(upMain(), 'main'), r.stderr);
check('…and it said it keeps its own', /1 change of its own, and keeps/.test(r.stdout));
check('…as one merge, by Lax', /^Lax updates: 1 change from origin$/.test(sh(BODY, 'log', '-1', '--format=%s')));
check('…the worktree and branch are gone', !fs.existsSync(`${BODY}-wt-update`) && !sh(BODY, 'branch', '--list', 'lax/update-*'));

own('a.txt', 'one, Lax\ntwo\nthree\n', 'Lax changes one'); upstream('a.txt', 'one, the project\ntwo\nthree\n', 'the project changes one');
r = update();
const c = JSON.parse(read(path.join(TMP, 'claude.json')) || '{}');
check('a conflict → Lax resolves it, both kept', r.status === 0 && read(path.join(BODY, 'a.txt')).startsWith('one, from both') && contains(upMain(), 'main'), r.stdout.split('\n').slice(-3).join(' ') + r.stderr);
check('…told which file, in its worktree, inside the build fence', /conflict: a\.txt/.test(c.prompt || '') && c.cwd === `${BODY}-wt-update` && c.build === c.cwd, JSON.stringify({ cwd: c.cwd, build: c.build }));

own('e.txt', 'e\n', 'Lax learns: e'); upstream('f.txt', 'BROKEN\n', 'the project breaks');
let before = main();
r = update();
check('the tests fail after the update → main is untouched', r.status !== 0 && main() === before && /tests fail/.test(r.stderr), r.stderr.split('\n')[0]);
check('…and the update waits on its branch', !!sh(BODY, 'branch', '--list', 'lax/update-*'));

upstream('f.txt', 'fine\n', 'the project fixes it'); own('a.txt', 'one, from both\ntwo, Lax\nthree\n', 'Lax changes two'); upstream('a.txt', 'one, from both\ntwo, the project\nthree\n', 'the project changes two');
before = main();
r = update({ FAKE_MODE: 'fail' });
check('a conflict it can\'t resolve → main is untouched, the merge waits', r.status !== 0 && main() === before && /couldn't resolve it/.test(r.stderr) && /lax\/update-/.test(r.stderr), r.stderr.split('\n')[0]);

write(path.join(BODY, 'c.txt'), 'changed by hand\n');
r = update();
check('uncommitted changes → refused, nothing touched', r.status !== 0 && /uncommitted/.test(r.stderr) && main() === before);

console.log(failed ? `\n${failed} update check(s) failed` : '\nall update checks passed');
process.exit(failed ? 1 : 0);
