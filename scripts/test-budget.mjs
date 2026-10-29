// What Lax may spend of your plan by itself (lib/budget.mjs), in a throwaway home: the levels, your jobs, the daily cap,
// a window past its reset, and the Life menu's view.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'lax-budget-'));
process.env.LAX_HOME = HOME;
process.on('exit', () => fs.rmSync(HOME, { recursive: true, force: true }));
const { createBudget, LEVELS } = await import('../lib/budget.mjs');
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

let usage = null, settings = {}, t = new Date('2026-10-20T10:00:00').getTime();
const b = createBudget({ usage: () => usage, settings: () => settings, now: () => t });
const w = (pct, resets = t + 3600e3) => ({ pct, resets });

check('no usage known yet: Lax may work', b.may('reflect').ok && b.may('job').ok);
check('light is the default', b.view().level === 'light' && b.view().cap === LEVELS.light.cap);

usage = { five_hour: w(55), seven_day: w(10) };
let m = b.may('reflect');
check('light: its own work waits at 5h 50%, and says why', !m.ok && m.why === 'your 5-hour limit is at 55%', m.why);
check('…your jobs still run', b.may('job').ok);
settings = { budget: 'normal' };
check('normal: it works on until 75%', b.may('draft').ok);
usage = { five_hour: w(80), seven_day: w(10) };
check('…and waits past it', !b.may('nightly').ok);
usage = { five_hour: w(20), seven_day: w(88) };
check('the weekly limit counts too (normal: 80%)', b.may('review').why === 'your weekly limit is at 88%');
usage = { five_hour: w(79), seven_day: w(10) };
check('your jobs run up to 80%', b.may('job').ok);
usage = { five_hour: w(81), seven_day: w(10) };
m = b.may('job');
check('…and wait past it, so they never take you over', !m.ok && /5-hour limit is at 81%/.test(m.why));
check('talking to me still works at 81%', b.may('voice').ok);
usage = { five_hour: w(20), seven_day: w(96) };
m = b.may('voice');
check('…but not at 95%', !m.ok && m.why === 'your weekly limit is at 96%', m.why);
usage = { five_hour: w(99, t - 60e3), seven_day: w(10) };
check('a window past its reset counts as 0', b.may('reflect').ok && b.may('job').ok);

usage = null; settings = {};
for (let i = 0; i < LEVELS.light.cap; i++) b.spent(['reflect', 'draft', 'nightly', 'review'][i % 4]);
m = b.may('reflect');
check(`light: ${LEVELS.light.cap} of its own runs a day, then it waits`, !m.ok && m.why === `I've done my ${LEVELS.light.cap} runs for today`, m.why);
b.spent('job'); b.spent('job');
check('…your jobs and talking to me never count against it', b.may('voice').ok && b.may('job').ok && b.view().jobs === 2 && b.view().own === LEVELS.light.cap);
check('the Life menu says why it waits', b.view().paused === `I've done my ${LEVELS.light.cap} runs for today`);
settings = { budget: 'normal' };
check('normal gives it more', b.may('reflect').ok && b.view().cap === LEVELS.normal.cap);
t += 864e5;
settings = {};
check('a new day starts from 0', b.view().own === 0 && b.may('reflect').ok);
check('kept in ~/.lax/budget.json', JSON.parse(fs.readFileSync(path.join(HOME, 'budget.json'), 'utf8')).runs.job === 2);

console.log(failed ? `\n${failed} budget check(s) failed` : '\nall budget checks passed');
process.exit(failed ? 1 : 0);
