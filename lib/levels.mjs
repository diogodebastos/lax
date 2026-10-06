// Lax's levels: 1–100, evolving at 16 and 36 (a certain fire-lizard starter would feel at home), then 50 and 100.
// The colour picks the growth curve, the way each of those familiar faces levels: Medium Slow for the three
// starters and the pink one, Medium Fast for the rest (and any custom colour).
// Pure functions, so they're easy to test (scripts/test-levels.mjs).
export const MAX_LEVEL = 100;
export const STAGES = [[1, 'sprout'], [16, 'blob'], [36, 'cube'], [50, 'brick'], [100, 'legend']];
/** Total XP needed to reach level n, per curve. */
export const CURVES = {
  mediumSlow: (n) => Math.floor((6 / 5) * n ** 3 - 15 * n ** 2 + 100 * n - 140),
  mediumFast: (n) => n ** 3,
};
/** The swatches, in menu order (public/lax.js shows the same list; the test keeps them in step). */
export const COLORS = [
  ['#5abf8e', 'mediumSlow'], // grass
  ['#D97757', 'mediumSlow'], // fire (Lax's own colour, the default)
  ['#5aa7e6', 'mediumSlow'], // water
  ['#f6d23c', 'mediumFast'], // electric
  ['#a8754a', 'mediumFast'], // brown fox
  ['#f2ede3', 'mediumFast'], // cat with a coin
  ['#f4a6c8', 'mediumSlow'], // pink, rare
];
export const curveOf = (color) => COLORS.find(([c]) => c.toLowerCase() === String(color).toLowerCase())?.[1] || 'mediumFast';
export const xpFor = (n, curve = 'mediumSlow') => (n <= 1 ? 0 : CURVES[curve](n));
export const levelOf = (xp, curve = 'mediumSlow') => { let n = 1; while (n < MAX_LEVEL && xpFor(n + 1, curve) <= xp) n++; return n; };
/** Index into STAGES for a level. */
export const stageIdx = (lvl) => STAGES.filter(([l]) => lvl >= l).length - 1;
/** XP bar range for a level: [from, to]. Level 100 is a full bar. */
export const barFor = (xp, curve = 'mediumSlow') => { const l = levelOf(xp, curve); return l >= MAX_LEVEL ? [0, Math.max(1, xp)] : [xpFor(l, curve), xpFor(l + 1, curve)]; };
