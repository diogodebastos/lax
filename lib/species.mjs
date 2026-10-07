// Lax's species: read from how you work while it's an egg, then kept. Pure functions (scripts/test-species.mjs).
// Each species has a line of forms by stage (sprout, blob, cube, brick, legend), after the familiar faces they nod to.
// The bars are first guesses, to tune on real eggs.

/** id -> name, colour, growth curve (lib/levels.mjs). */
export const SPECIES = {
  grass: { name: 'grass', color: '#5abf8e', curve: 'mediumSlow' },
  fire: { name: 'fire', color: '#D97757', curve: 'mediumSlow' },
  water: { name: 'water', color: '#5aa7e6', curve: 'mediumSlow' },
  electric: { name: 'electric', color: '#f6d23c', curve: 'mediumFast' },
  fox: { name: 'brown fox', color: '#a8754a', curve: 'mediumFast' },
  pink: { name: 'pink', color: '#f4a6c8', curve: 'mediumSlow' },
};
/** The fox's Lv50 forms. Its curve stays the fox's, so branching never moves its level. */
export const BRANCHES = {
  sun: { name: 'sun', color: '#c58fd8', form: 'gem', lift: 4 },
  moon: { name: 'moon', color: '#403e4a', form: 'rings', lift: 4 }, // not pure black: Lax must still show on a black screen
  coin: { name: 'coin cat', color: '#f2ede3', form: 'coin', lift: 6 },
};
// Forms per stage, and how far the level-100 crown rises to clear the last one.
const LINES = {
  grass: [['seed', 'seed', 'bud', 'bloom', 'bloom'], 9],
  fire: [['ember', 'ember', 'blaze', 'wings', 'wings'], 0],
  water: [['shell0', 'shell0', 'shell1', 'cannons', 'cannons'], 2],
  electric: [['pichu', 'pichu', 'spark', 'bolt', 'bolt'], 4],
  fox: [['kit', 'kit', 'ruff', 'ruff', 'ruff'], 4],
};
export const BRICK = 3; // stage index of level 50

/** When a species stands out (value / bar > 1). */
export const BARS = { electric: 0.25, fire: 150, water: 45, grass: 10, pink: 4 };
export const EGG_XP = 1000, EGG_DAYS = 3, RARE = 0.01, LIMIT_PCT = 95, LIMIT_DAYS = 3;
const GAP = 10 * 6e4; // a session is busy while something happened in it in the last 10 minutes
/** XP an event gave (server.mjs gainXp), for replaying history. */
export const EVENT_XP = { session: 2, tool: 1, done: 5 };

/** Local calendar day of a timestamp, YYYY-MM-DD. */
export const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** The busy stretches of each session: [from, to] between events less than 10 minutes apart. */
function busySpans(events) {
  const last = new Map(), spans = [], per = new Map();
  for (const e of events) {
    const p = last.get(e.session);
    if (p != null && e.ts - p < GAP && e.ts > p) { spans.push([p, e.ts]); per.set(e.session, (per.get(e.session) || 0) + e.ts - p); }
    last.set(e.session, e.ts);
  }
  return { spans, per };
}

/** How you worked, from journal rows {ts, session, repo, kind} in time order. */
export function signals(events) {
  const { spans, per } = busySpans(events);
  const pts = []; for (const [a, b] of spans) pts.push([a, 1], [b, -1]);
  pts.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let c = 0, prev = 0, busy = 0, three = 0;
  for (const [t, d] of pts) { if (c >= 1) busy += t - prev; if (c >= 3) three += t - prev; prev = t; c += d; }
  const mins = [...per.values()].filter((v) => v > 6e4).sort((a, b) => a - b);
  const count = (k) => events.filter((e) => e.kind === k).length;
  const sessions = new Set(events.map((e) => e.session)).size;
  return {
    busyH: busy / 36e5,
    three: busy ? three / busy : 0,
    toolsPerH: busy ? count('tool') / (busy / 36e5) : 0,
    sessionMin: mins.length ? mins[mins.length >> 1] / 6e4 : 0,
    promptsPerSession: sessions ? count('prompt') / sessions : 0,
    repos: new Set(events.map((e) => e.repo).filter(Boolean)).size,
  };
}
/** Each species' value over its bar. */
export const ratios = (s) => ({ electric: s.three / BARS.electric, fire: s.toolsPerH / BARS.fire, water: s.sessionMin / BARS.water,
  grass: s.promptsPerSession / BARS.grass, pink: s.repos / BARS.pink });
/** The species furthest past its bar, or the fox when none stands out. The copier can't copy itself (noPink). */
export function pick(s, { noPink = false } = {}) {
  let best = 'fox', top = 1;
  for (const [k, r] of Object.entries(ratios(s))) if (!(noPink && k === 'pink') && r > top) { best = k; top = r; }
  return best;
}
/** The fox at Lv50: the coin cat if you kept hitting the 5-hour limit, else sun or moon by when you're busy. */
export const branch = ({ dayH = 0, nightH = 0, limitDays = 0 }) => (limitDays >= LIMIT_DAYS ? 'coin' : dayH >= nightH ? 'sun' : 'moon');
/** Busy hours by day (06-18) and night (18-06). */
export function dayNight(events) {
  let dayH = 0, nightH = 0;
  for (const [a, b] of busySpans(events).spans) { const h = new Date(b).getHours(); if (h >= 6 && h < 18) dayH += (b - a) / 36e5; else nightH += (b - a) / 36e5; }
  return { dayH, nightH };
}

/** How far along the egg is, 0-1: 1000 XP or 3 worked days, whichever comes first. */
export const eggProgress = ({ eggXp = 0, eggDays = [] }) => Math.min(1, Math.max(eggXp / EGG_XP, eggDays.length / EGG_DAYS));
/** Hatch on 1000 XP, or once the third worked day is over. */
export const shouldHatch = ({ eggXp = 0, eggDays = [] }, today) => eggXp >= EGG_XP || (eggDays.length >= EGG_DAYS && !eggDays.includes(today));

/** What a species looks like at a stage: { form, color, lift }. sp = { id, branch, copy, rare }. */
export function formFor(sp, stage) {
  const id = sp?.id;
  if (id === 'plain') return { form: null, color: sp.color || SPECIES.fire.color, lift: 0 }; // no species: just a colour (picked by hand)
  if (id === 'pink') {
    const color = SPECIES.pink.color;
    if (sp.rare && stage >= BRICK) return { form: 'float', color, lift: 0 }; // it was the rare one all along
    return sp.copy ? { ...formFor({ id: sp.copy }, stage), color } : { form: null, color, lift: 0 };
  }
  if (id === 'fox' && stage >= BRICK && BRANCHES[sp.branch]) { const b = BRANCHES[sp.branch]; return { form: b.form, color: b.color, lift: b.lift }; }
  const line = LINES[id];
  if (!line) return { form: null, color: SPECIES.fire.color, lift: 0 };
  return { form: line[0][Math.max(0, Math.min(4, stage))], color: SPECIES[id].color, lift: line[1] };
}
/** The name it goes by: a branch's name from Lv50, never the rare one's secret. */
export const nameFor = (sp, stage) => sp?.id === 'plain' ? 'plain' : (sp?.id === 'fox' && stage >= BRICK && BRANCHES[sp.branch] ? BRANCHES[sp.branch].name : SPECIES[sp?.id]?.name || 'egg');
/** What Lax is right now, as one line for its mind (lib/home.mjs syncMindSelf), from petView(): so it can say what it is. */
export function selfLine(v) {
  if (!v.hatched) {
    const lead = v.egg?.lead && SPECIES[v.egg.lead] ? `; the ${SPECIES[v.egg.lead].name} speckles lead so far` : '';
    return `an egg, ${v.egg?.pct ?? 0}% of the way to hatching${lead}. You hatch at 1000 XP or after 3 worked days, into the species your egg time shows.`;
  }
  const sp = v.species, form = v.look?.form;
  const what = !sp || sp.id === 'plain' ? 'a Lax with no species, just a colour' : `a ${sp.name} Lax${form ? ` (${form.replace(/\d$/, '')} form)` : ''}`;
  return `${what}, level ${v.level}, ${v.stage} stage${v.picked ? '; your species was picked by hand in the Life menu' : ''}. ` +
    'Species come from how they work (lib/species.mjs); your form changes at levels 16, 36 and 50.';
}
/** "a brown fox", "an electric one": for milestones and the hatching bubble. */
export const aName = (id) => (id === 'fox' ? 'a brown fox' : `${/^[aeiou]/.test(SPECIES[id]?.name || '') ? 'an' : 'a'} ${SPECIES[id]?.name || 'new'} one`);
export const curveFor = (sp) => (sp?.id === 'plain' ? 'mediumFast' : SPECIES[sp?.id]?.curve || 'mediumSlow'); // plain: like a custom colour was

/**
 * Replays a Lax's history as if it had been an egg (re-hatching a Lax from before species).
 * Returns { at, species, copy, signals, eggXp, eggDays }: at = when it hatched (null: still an egg), from the events before it.
 */
export function replayEgg(events) {
  let xp = 0; const days = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i], d = dayKey(e.ts);
    if (!days.includes(d)) {
      if (days.length >= EGG_DAYS) return hatchFrom(events.slice(0, i), e.ts, xp, days); // the third day is over
      days.push(d);
    }
    xp += EVENT_XP[e.kind] || 0;
    if (xp >= EGG_XP) return hatchFrom(events.slice(0, i + 1), e.ts, xp, days);
  }
  return { at: null, species: null, copy: null, eggXp: xp, eggDays: days };
}
function hatchFrom(evs, at, eggXp, eggDays) { const s = signals(evs); return { at, species: pick(s), copy: pick(s, { noPink: true }), signals: s, eggXp, eggDays }; }
