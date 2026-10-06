// Lax's level curves (lib/levels.mjs): Medium Slow or Medium Fast by colour, max 100, evolutions at 16 / 36 / 50 / 100.
import fs from 'node:fs';
import { xpFor, levelOf, stageIdx, barFor, STAGES, COLORS, curveOf } from '../lib/levels.mjs';

let failed = 0;
const check = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`); if (!ok) failed++; };
const stage = (xp) => STAGES[stageIdx(levelOf(xp))][1];

check('level 1 at 0 XP', levelOf(0), 1);
check('table: XP for 5 / 16 / 36 / 50 / 100', [5, 16, 36, 50, 100].map((n) => xpFor(n)), [135, 2535, 40007, 117360, 1059860]);
check('2534 XP is level 15, still a sprout', [levelOf(2534), stage(2534)], [15, 'sprout']);
check('2535 XP is level 16: evolves', [levelOf(2535), stage(2535)], [16, 'blob']);
check('level 36: cube', [levelOf(40007), stage(40007)], [36, 'cube']);
check('level 50: brick', [levelOf(117360), stage(117360)], [50, 'brick']);
check('level 100: legend', [levelOf(1059860), stage(1059860)], [100, 'legend']);
check('capped at 100', levelOf(2e6), 100);
check('today\'s Lax (1387 XP): level 13, sprout', [levelOf(1387), stage(1387)], [13, 'sprout']);
check('XP bar inside a level', barFor(1387), [xpFor(13), xpFor(14)]);
check('XP bar is full at 100', barFor(2e6), [0, 2e6]);
let mono = true; for (let n = 2; n <= 100; n++) if (xpFor(n) <= xpFor(n - 1)) mono = false;
check('the curve always goes up', mono, true);

check('Medium Fast: level 16 / 100 at 4096 / 1e6 XP', [16, 100].map((n) => xpFor(n, 'mediumFast')), [4096, 1000000]);
check('1387 XP on Medium Fast is level 11', levelOf(1387, 'mediumFast'), 11);
check('swatch curves, in order', COLORS.map(([, c]) => c), ['mediumSlow', 'mediumSlow', 'mediumSlow', 'mediumFast', 'mediumFast', 'mediumFast', 'mediumSlow']);
check('the default colour (any case) stays Medium Slow', curveOf('#d97757'), 'mediumSlow');
check('a custom colour is Medium Fast', curveOf('#123456'), 'mediumFast');
const ui = fs.readFileSync(new URL('../public/lax.js', import.meta.url), 'utf8').match(/const COLORS = (\[.*?\]);/)[1];
check('the phone shows the same swatches', JSON.parse(ui.replace(/'/g, '"')), COLORS.map(([c]) => c));

console.log(failed ? `\n${failed} check(s) failed` : '\nall level checks passed');
process.exit(failed ? 1 : 0);
