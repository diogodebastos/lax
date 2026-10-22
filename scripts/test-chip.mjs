// Lax's sounds (public/chip.js, the same code the phone runs): a tune per state in its species' key, and a "done"
// jingle that grows with it, a voice at a time.
import '../public/chip.js';

const { tune, jingle, TUNES } = globalThis.LaxChip;
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
const beats = (notes) => (notes || []).reduce((a, [, b]) => a + b, 0);
const voices = (t) => ['lead', 'bass', 'harmony', 'drums'].filter((v) => t[v]).join('+');

const at = [[1, 'sprout'], [7, 'sprout'], [13, 'sprout'], [16, 'blob'], [36, 'cube'], [50, 'brick'], [100, 'legend']].map(([l, s]) => jingle(l, s));
check('a sprout says two notes, a third by level 7, a fourth by 13', at.slice(0, 3).map((t) => t.lead.length).join() === '2,3,4');
check('it grows: each stage longer than the last', at.every((t, i) => !i || beats(t.lead) > beats(at[i - 1].lead)), at.map((t) => beats(t.lead)).join(' < '));
check('…and a voice more: bass at blob, harmony at cube, drums at brick', at.map(voices).slice(2).join(' / ') === 'lead / lead+bass / lead+bass+harmony / lead+bass+harmony+drums / lead+bass+harmony+drums', at.map(voices).join(' / '));
check('…under 2.5 seconds even as a legend', beats(at.at(-1).lead) * 0.075 < 2.5, `${(beats(at.at(-1).lead) * 0.075).toFixed(2)} s`);
check('the bass and drums last as long as the tune', at.slice(3).every((t) => beats(t.bass) >= beats(t.lead) && (!t.drums || beats(t.drums) >= beats(t.lead))));

const fire = tune('done', { level: 20, stage: 'blob', species: { id: 'fire' } }), water = tune('done', { level: 20, stage: 'blob', species: { id: 'water' } });
check('in its species\' key: a fire Lax and a water one sound different', fire.root !== water.root && JSON.stringify(fire.lead) === JSON.stringify(water.lead), `${fire.root} / ${water.root}`);
check('…a pink one in the key of the one it copies', tune('done', { species: { id: 'pink', copy: 'water' } }).root === water.root);
check('…an egg, in a key of its own', tune('done', { species: null }).root === 60);
check('every state has its tune, and an unknown one is silent', ['needs', 'nudge', 'levelup', 'hatch', 'learned', 'error', 'yes', 'no', 'listen'].every((k) => TUNES[k] && tune(k).lead.length) && tune('nope') === undefined);

if (failed) { console.log(`\n${failed} chip check(s) failed`); process.exit(1); }
console.log('\nall chip checks passed');
