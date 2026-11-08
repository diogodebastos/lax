// Lax's own initiative (lib/initiative.mjs) with a fake Claude on two throwaway repos: asleep it does nothing; awake it
// works on the least recently worked repo, on a branch of its own that's kept with its commit (the worktree goes, the
// repo's own checkout is untouched); the next run takes the other repo; a run that changes nothing leaves no branch.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const HOME = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lax-initiative-')));
const DESK = path.join(HOME, 'Desktop');
const GIT_ENV = { GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null' };
Object.assign(process.env, GIT_ENV, { LAX_HOME: HOME }); delete process.env.LAX_DATA;
const sh = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

for (const n of ['alpha', 'beta']) { const d = path.join(DESK, n); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'README.md'), n + '\n'); sh(HOME, 'init', '-q', '-b', 'main', d); sh(d, 'add', '-A'); sh(d, 'commit', '-qm', 'start'); }
fs.mkdirSync(path.join(DESK, 'not-a-repo'));

// The fake claude: commits a line to README.md unless LAX_TEST_NONE is set, then answers like a real run.
const FAKE = path.join(HOME, 'fake-claude.mjs');
fs.writeFileSync(FAKE, `#!/usr/bin/env node
import fs from 'node:fs'; import { execFileSync } from 'node:child_process';
const none = fs.existsSync(${JSON.stringify(path.join(HOME, 'none'))});
if (!none) { fs.appendFileSync('README.md', 'better\\n'); execFileSync('git', ['commit', '-qam', 'better readme']); }
const did = none ? { none: 'all good' } : { none: '', title: 'better readme', what: 'Added a line.', why: 'It was short.' };
console.log(JSON.stringify({ type: 'result', result: 'done\\n' + JSON.stringify({ did }) }));
`, { mode: 0o755 });

const { createInitiative, projects } = await import('../lib/initiative.mjs');
check('only repos are projects, never-worked ones first', JSON.stringify(projects(DESK, { alpha: 5 })) === '["beta","alpha"]');

const settings = { learns: false }, spent = [];
const budget = { may: () => ({ ok: true }), spent: (k) => spent.push(k) };
const ini = createInitiative({ budget, settings: () => settings, feed: () => {}, idle: () => true, desktop: DESK, mind: path.join(HOME, 'mind'), claude: FAKE });

check('asleep (💤), it does nothing', await ini.tick(true) === false && !spent.length);
settings.learns = true;
const first = await ini.tick(true);
const branches = sh(path.join(DESK, 'alpha'), 'branch', '--list', 'lax/own-*');
check('awake, it works on a project on a branch of its own', first?.project === 'alpha' && first.commits === 1 && branches.includes(first.branch), JSON.stringify(first));
check('…counted as its own work in the budget', spent.join() === 'initiative');
check('…the branch keeps its commit; the repo\'s checkout is untouched', sh(path.join(DESK, 'alpha'), 'log', '-1', '--format=%s', first.branch) === 'better readme'
  && fs.readFileSync(path.join(DESK, 'alpha', 'README.md'), 'utf8') === 'alpha\n' && sh(path.join(DESK, 'alpha'), 'branch', '--show-current') === 'main');
check('…and its worktree is gone', !sh(path.join(DESK, 'alpha'), 'worktree', 'list').includes('worktrees'));
check('right after, it waits (not idle long enough between runs)', await ini.tick() === false);

fs.writeFileSync(path.join(HOME, 'none'), '');
check('the next run takes the other project; nothing changed, no branch left', await ini.tick(true) === false
  && !sh(path.join(DESK, 'beta'), 'branch', '--list', 'lax/own-*'));
check('what it did is kept', JSON.parse(fs.readFileSync(path.join(HOME, 'initiative.json'), 'utf8')).done.length === 1);

fs.rmSync(HOME, { recursive: true, force: true });
console.log(failed ? `\n${failed} initiative check(s) failed` : '\nall initiative checks passed');
process.exit(failed ? 1 : 0);
