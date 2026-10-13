// Lax's species (lib/species.mjs): what it hatches as, its lines, the egg, the copier, the fox's branches.
import fs from 'node:fs';
import { SPECIES, BRANCHES, signals, ratios, pick, branch, dayNight, eggProgress, shouldHatch, formFor, nameFor, replayEgg, dayKey, aName, curveFor, selfLine } from '../lib/species.mjs';

let failed = 0;
const check = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`); if (!ok) failed++; };
const MIN = 6e4, T0 = new Date('2026-10-05T10:00').getTime();
// A session busy for `mins` minutes from `start`: an event every `every` minutes.
const run = (session, start, mins, { every = 2, kind = 'tool', repo = '/r/a', prompts = 1 } = {}) => {
  const out = []; for (let m = 0; m <= mins; m += every) out.push({ ts: start + m * MIN, session, repo, kind });
  for (let i = 0; i < prompts; i++) out.push({ ts: start + i * MIN + 1, session, repo, kind: 'prompt' });
  return out; };
const sorted = (...xs) => xs.flat().sort((a, b) => a.ts - b.ts);

// Signals: only busy time counts.
const idle = sorted({ ts: T0, session: 'a', repo: '/r/a', kind: 'prompt' }, { ts: T0 + 3 * 36e5, session: 'a', repo: '/r/a', kind: 'done' });
check('an open but idle session is not busy', signals(idle).busyH, 0);
const one = signals(run('a', T0, 60));
check('an hour of events is an hour busy', Math.round(one.busyH * 100) / 100, 1);
check('median busy minutes per session', Math.round(one.sessionMin), 60);
check('tools per busy hour', Math.round(one.toolsPerH), 31);
const par = signals(sorted(run('a', T0, 60), run('b', T0, 60), run('c', T0, 60)));
check('three at once the whole time', Math.round(par.three * 100), 100);
const two = signals(sorted(run('a', T0, 60), run('b', T0, 60)));
check('two at once is not three', two.three, 0);
check('repos are counted once', signals(sorted(run('a', T0, 10, { repo: '/r/a' }), run('b', T0, 10, { repo: '/r/a' }), run('c', T0, 10, { repo: '/r/b' }))).repos, 2);

// Pick: furthest past its bar, else the fox.
const base = { busyH: 5, three: 0, toolsPerH: 0, sessionMin: 0, promptsPerSession: 0, repos: 0 };
check('nothing stands out: fox', pick(base), 'fox');
check('3+ at once 30%: electric', pick({ ...base, three: 0.3 }), 'electric');
check('200 tools an hour: fire', pick({ ...base, toolsPerH: 200 }), 'fire');
check('an hour-long session: water', pick({ ...base, sessionMin: 60 }), 'water');
check('12 prompts a session: grass', pick({ ...base, promptsPerSession: 12 }), 'grass');
check('5 repos: pink', pick({ ...base, repos: 5 }), 'pink');
check('the furthest past its bar wins', pick({ ...base, toolsPerH: 160, sessionMin: 90 }), 'water');
check('the copier never copies pink', pick({ ...base, repos: 9, toolsPerH: 200 }, { noPink: true }), 'fire');
check('the copier copies the fox when nothing stands out', pick({ ...base, repos: 9 }, { noPink: true }), 'fox');
check('ratios are value over bar', ratios({ ...base, three: 0.25, toolsPerH: 75 }).electric + ratios({ ...base, toolsPerH: 75 }).fire, 1.5);

// The egg.
check('egg: halfway on XP', eggProgress({ eggXp: 500, eggDays: ['a'] }), 0.5);
check('egg: two of three days', Math.round(eggProgress({ eggXp: 10, eggDays: ['a', 'b'] }) * 100), 67);
check('egg: full at 1000 XP', shouldHatch({ eggXp: 1000, eggDays: ['a'] }, 'a'), true);
check('egg: not during the third day', shouldHatch({ eggXp: 10, eggDays: ['a', 'b', 'c'] }, 'c'), false);
check('egg: once the third day is over', shouldHatch({ eggXp: 10, eggDays: ['a', 'b', 'c'] }, 'd'), true);
check('egg: days off do not count', shouldHatch({ eggXp: 10, eggDays: ['a', 'b'] }, 'z'), false);

// Lines.
const line = (sp) => [0, 1, 2, 3, 4].map((st) => formFor(sp, st).form);
check('grass line', line({ id: 'grass' }), ['seed', 'seed', 'bud', 'bloom', 'bloom']);
check('fire line', line({ id: 'fire' }), ['ember', 'ember', 'blaze', 'wings', 'wings']);
check('water line', line({ id: 'water' }), ['shell0', 'shell0', 'shell1', 'cannons', 'cannons']);
check('electric line', line({ id: 'electric' }), ['pichu', 'pichu', 'spark', 'bolt', 'bolt']);
check('fox line, no branch yet', line({ id: 'fox' }), ['kit', 'kit', 'ruff', 'ruff', 'ruff']);
check('fox to moon at 50', line({ id: 'fox', branch: 'moon' }), ['kit', 'kit', 'ruff', 'rings', 'rings']);
check('moon colour from 50', [formFor({ id: 'fox', branch: 'moon' }, 2).color, formFor({ id: 'fox', branch: 'moon' }, 3).color], [SPECIES.fox.color, BRANCHES.moon.color]);
check('pink copies in pink', [formFor({ id: 'pink', copy: 'fire' }, 2).form, formFor({ id: 'pink', copy: 'fire' }, 2).color], ['blaze', SPECIES.pink.color]);
check('pink with nothing to copy is plain', formFor({ id: 'pink' }, 1).form, null);
check('the rare one copies until 50, then its true form', line({ id: 'pink', copy: 'water', rare: true }), ['shell0', 'shell0', 'shell1', 'float', 'float']);
check('the crown clears the bloom', formFor({ id: 'grass' }, 4).lift, 9);
check('names: the fox goes by its branch from 50', [nameFor({ id: 'fox', branch: 'coin' }, 2), nameFor({ id: 'fox', branch: 'coin' }, 3)], ['brown fox', 'coin cat']);
check('names: the rare one is just pink', nameFor({ id: 'pink', rare: true }, 4), 'pink');
check('a name for the bubble', [aName('fox'), aName('electric'), aName('grass')], ['a brown fox', 'an electric one', 'a grass one']);

check('plain: no form, its own colour', formFor({ id: 'plain', color: '#3fb8b0' }, 3), { form: null, color: '#3fb8b0', lift: 0 });
check('plain levels like a custom colour did', curveFor({ id: 'plain' }), 'mediumFast');

// The fox's branch.
check('coin cat: the 5-hour limit on 3 days', branch({ dayH: 9, nightH: 1, limitDays: 3 }), 'coin');
check('sun: busier by day', branch({ dayH: 9, nightH: 1, limitDays: 2 }), 'sun');
check('moon: busier at night', branch({ dayH: 7.3, nightH: 10.5 }), 'moon');
const dn = dayNight(sorted(run('a', new Date('2026-10-05T10:00').getTime(), 60), run('b', new Date('2026-10-05T22:00').getTime(), 120)));
check('busy hours by day and night', [Math.round(dn.dayH), Math.round(dn.nightH)], [1, 2]);

// Re-hatching from history: the egg takes the first 1000 XP (or three worked days).
const day = 864e5;
const slow = sorted(run('a', T0, 30), run('b', T0 + day, 30), run('c', T0 + 2 * day, 30), run('d', T0 + 3 * day, 30));
const r1 = replayEgg(slow);
check('a light week hatches when day 3 is over', [r1.at === T0 + 3 * day, r1.eggDays.length, r1.species], [true, 3, 'fox']);
// Four short sessions at a time, one after another, all morning.
const busy = sorted(...Array.from({ length: 16 }, (_, k) => Array.from({ length: 4 }, (_, i) => run(`s${k}-${i}`, T0 + k * 21 * MIN, 20, { every: 1 }))).flat());
const r2 = replayEgg(busy);
check('a busy morning hatches on 1000 XP, from its events so far', [r2.at < T0 + 6 * 36e5, r2.eggXp >= 1000, r2.species], [true, true, 'electric']);
check('too little history: still an egg', replayEgg(run('a', T0, 10)).at, null);
check('local days', dayKey(new Date('2026-10-05T23:59').getTime()), '2026-10-05');

// The phone draws every form the lines use (public/body.js, its body's drawing).
const ui = fs.readFileSync(new URL('../public/body.js', import.meta.url), 'utf8');
const forms = new Set(['grass', 'fire', 'water', 'electric', 'fox'].flatMap((id) => line({ id })).concat(Object.values(BRANCHES).map((b) => b.form), ['float']));
check('the phone draws every form', [...forms].filter((f) => !ui.includes(`f === '${f}'`)), []);

// What Lax's mind is told it is (selfLine).
check('an egg knows it is an egg, and what leads', selfLine({ hatched: false, egg: { pct: 62, lead: 'water' } }).split('.')[0],
  'an egg, 62% of the way to hatching; the water speckles lead so far');
check('a hatched one knows its species, form and level', selfLine({ hatched: true, species: { id: 'fire', name: 'fire' }, look: { form: 'ember' }, level: 7, stage: 'sprout', picked: true }).split('. ')[0],
  'a fire Lax (ember form), level 7, sprout stage; your species was picked by hand in the Life menu');
check('the fox by its branch name', selfLine({ hatched: true, species: { id: 'fox', name: 'moon' }, look: { form: 'rings' }, level: 52, stage: 'brick' }).split('. ')[0],
  'a moon Lax (rings form), level 52, brick stage');
check('no species: just a colour', selfLine({ hatched: true, species: { id: 'plain', name: 'plain' }, look: {}, level: 3, stage: 'sprout' }).split('. ')[0],
  'a Lax with no species, just a colour, level 3, sprout stage');

console.log(failed ? `\n${failed} check(s) failed` : '\nall species checks passed');
process.exit(failed ? 1 : 0);
