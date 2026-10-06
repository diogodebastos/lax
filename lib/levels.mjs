// Lax's levels: 1–100 on the "Medium Slow" curve, evolving at 16 and 36 (a certain fire-lizard starter would feel
// at home), then 50 and 100. Pure functions, so they're easy to test (scripts/test-levels.mjs).
export const MAX_LEVEL = 100;
export const STAGES = [[1, 'sprout'], [16, 'blob'], [36, 'cube'], [50, 'brick'], [100, 'legend']];
/** Total XP needed to reach level n. */
export const xpFor = (n) => (n <= 1 ? 0 : Math.floor((6 / 5) * n ** 3 - 15 * n ** 2 + 100 * n - 140));
export const levelOf = (xp) => { let n = 1; while (n < MAX_LEVEL && xpFor(n + 1) <= xp) n++; return n; };
/** Index into STAGES for a level. */
export const stageIdx = (lvl) => STAGES.filter(([l]) => lvl >= l).length - 1;
/** XP bar range for a level: [from, to]. Level 100 is a full bar. */
export const barFor = (xp) => { const l = levelOf(xp); return l >= MAX_LEVEL ? [0, Math.max(1, xp)] : [xpFor(l), xpFor(l + 1)]; };
