// Stuck processes (lib/stuck.mjs): a hung test that ignores SIGTERM and has a child shows on the list with its age and
// folder, Stop kills it and its child, and a process that isn't on the list (an unrelated sleep) is refused.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { list, stop, etimeSeconds } from '../lib/stuck.mjs';

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

check('ps ages read right', etimeSeconds('03:04') === 184 && etimeSeconds('02:03:04') === 7384 && etimeSeconds('1-00:00:05') === 86405);

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lax-stuck-')));
fs.mkdirSync(path.join(dir, 'scripts'));
fs.writeFileSync(path.join(dir, 'scripts', 'test-hang.mjs'), `import { spawn } from 'node:child_process';
process.on('SIGTERM', () => {}); spawn('sleep', ['300'], { stdio: 'ignore' }); setInterval(() => {}, 1000);`);
const hang = spawn(process.execPath, ['scripts/test-hang.mjs'], { cwd: dir, stdio: 'ignore' });
const other = spawn('sleep', ['300'], { stdio: 'ignore' });
process.on('exit', () => { for (const c of [hang, other]) try { c.kill('SIGKILL'); } catch {} fs.rmSync(dir, { recursive: true, force: true }); });
await sleep(600);

const found = list().find((p) => p.pid === hang.pid);
check('a hung test shows, named by its script, with its age and folder', found?.what === 'test-hang' && found.secs >= 0 && found.cwd === dir, JSON.stringify(found));
check('…its child sleep doesn\'t show on its own, nor does an unrelated sleep', !list().some((p) => p.pid === other.pid));
check('…and never the hub itself', !list({ not: [hang.pid] }).some((p) => p.pid === hang.pid));

const kid = (await import('node:child_process')).execFileSync('pgrep', ['-P', String(hang.pid)], { encoding: 'utf8' }).trim().split('\n').map(Number)[0];
check('a process not on the list is refused', (await stop(other.pid)).ok === false && alive(other.pid));
const t0 = Date.now(), r = await stop(hang.pid, { grace: 500 });
check('Stop: it ignored SIGTERM, so SIGKILL after the grace', r.ok && !alive(hang.pid) && Date.now() - t0 >= 500, JSON.stringify(r));
check('…and its child went too', kid > 0 && !alive(kid));

console.log(failed ? `\n${failed} stuck check(s) failed` : '\nall stuck checks passed');
process.exit(failed ? 1 : 0);
