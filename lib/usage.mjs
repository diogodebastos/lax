// Your Claude plan usage (the 5-hour and weekly limits), as Claude Code's status line sees it (hooks/lax-status.mjs).
// Claude Code hands the status line { rate_limits: { five_hour: { used_percentage, resets_at }, seven_day: {…} } },
// resets_at in seconds. Nothing here asks Anthropic anything: it's what your own terminal already knows.
const WINDOWS = { five_hour: ['5h', '5-hour limit'], seven_day: ['7d', 'weekly limit'] };

export function readUsage(rl) {
  if (!rl || typeof rl !== 'object') return null;
  const u = {};
  for (const k of Object.keys(WINDOWS)) {
    const w = rl[k], p = Number(w?.used_percentage);
    if (w == null || !Number.isFinite(p)) continue;
    const r = Number(w.resets_at);
    u[k] = { pct: Math.round(Math.min(100, Math.max(0, p))), resets: Number.isFinite(r) && r > 0 ? r * 1000 : null };
  }
  return Object.keys(u).length ? u : null;
}

// When a limit resets, said plainly: "in 2h 10m" today-ish, else "Fri 10:00".
export function resetsIn(ms, now = Date.now()) {
  if (!ms) return '';
  const min = Math.max(0, Math.round((ms - now) / 60000));
  if (min < 60) return `in ${min}m`;
  if (min < 24 * 60) return `in ${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}`;
  const d = new Date(ms);
  return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// The terminal's status line: "5h 23% · 7d 41%".
export const usageLine = (u) => Object.entries(WINDOWS).filter(([k]) => u?.[k]).map(([k, [s]]) => `${s} ${u[k].pct}%`).join(' · ');

// For Lax's assistant: a sentence it can answer "how much usage do I have left?" with.
export function usageText(u, now = Date.now()) {
  const parts = Object.entries(WINDOWS).filter(([k]) => u?.[k]).map(([k, [, name]]) => {
    const r = resetsIn(u[k].resets, now);
    return `${name} ${u[k].pct}% used${r ? ` (resets ${r})` : ''}`;
  });
  if (!parts.length) return 'unknown (no Claude Code terminal has reported it yet).';
  const age = u.ts ? Math.round((now - u.ts) / 60000) : null;
  return parts.join('; ') + (age != null ? `, as of ${age} min ago.` : '.');
}
