// What Lax may spend of your Claude plan by itself (Phase 9). Every background run asks first: Lax's own work (its
// reflections, the weekly review, drafting a wish, the nightly fix, its work on your projects) and the jobs you scheduled. What you ask for
// yourself (talking to it, a recall, a build you said yes to) never asks here.
//   Lax's own work, by the "own work" setting:  light (the default): 8 runs a day, paused at 5h 50% or week 70%
//                                               normal: 24 runs a day, paused at 5h 75% or week 80%
//   Your jobs: no cap (you asked for them), paused at 80% of either window, so they never take you over.
//   Talking to me: refused at 95% of either window (your plan is a company one: past 100% it spends extra credits).
// The plan's numbers are what your terminal's status line or Lax's own last run saw (lib/usage.mjs): every voice
// answer and background run refreshes them. A window past its reset counts as 0.
// "learns" off in the Life menu still stops Lax's own work altogether.
import fs from 'node:fs';
import path from 'node:path';
import { HOME } from './paths.mjs';

export const LEVELS = { light: { cap: 8, five: 50, week: 70 }, normal: { cap: 24, five: 75, week: 80 } };
export const JOBS = { five: 80, week: 80 };
export const VOICE = { five: 95, week: 95 };
export const OWN = ['reflect', 'review', 'draft', 'nightly', 'initiative'];
const FILE = () => path.join(HOME, 'budget.json');
const today = (t = Date.now()) => new Date(t).toLocaleDateString('sv-SE');

/** deps: { usage() → { five_hour: { pct, resets }, seven_day: … } | null, settings() → { budget }, now() } */
export function createBudget(deps) {
  const now = deps.now || Date.now;
  const load = () => { try { const b = JSON.parse(fs.readFileSync(FILE(), 'utf8')); return b.day === today(now()) ? b : { day: today(now()), runs: {} }; } catch { return { day: today(now()), runs: {} }; } };
  const level = () => LEVELS[deps.settings().budget] || LEVELS.light;
  const pct = (w) => (!w ? 0 : w.resets && now() > w.resets ? 0 : w.pct || 0);
  const ownToday = (b) => OWN.reduce((n, k) => n + (b.runs[k] || 0), 0);

  /** May a run of this kind start now? { ok } or { ok: false, why } (why is said plainly, for the feed or aloud). */
  function may(kind) {
    const u = deps.usage() || {}, five = pct(u.five_hour), week = pct(u.seven_day);
    const lim = kind === 'voice' ? VOICE : kind === 'job' ? JOBS : level();
    if (five >= lim.five) return { ok: false, why: `your 5-hour limit is at ${five}%` };
    if (week >= lim.week) return { ok: false, why: `your weekly limit is at ${week}%` };
    if (OWN.includes(kind) && ownToday(load()) >= level().cap) return { ok: false, why: `I've done my ${level().cap} runs for today` };
    return { ok: true };
  }
  /** A run of this kind started: counted for today. */
  function spent(kind) {
    const b = load(); b.runs[kind] = (b.runs[kind] || 0) + 1;
    try { fs.writeFileSync(FILE(), JSON.stringify(b) + '\n'); } catch {}
  }
  /** For the Life menu: { level, own, cap, jobs, paused } (paused: why Lax's own work waits right now, or ''). */
  function view() {
    const b = load(), m = may('reflect');
    return { level: deps.settings().budget in LEVELS ? deps.settings().budget : 'light', own: ownToday(b), cap: level().cap, jobs: b.runs.job || 0, paused: m.ok ? '' : m.why };
  }
  return { may, spent, view };
}
