// What speech hears instead of your words, fixed (Phase 4.3). One copy for both sides: the page loads it as a plain
// script (the live bubble shows the fixed words), the server imports it through lib/vocab.mjs. No exports, so it's
// a global: LaxHeard.
(() => {
  const norm = (s) => String(s || '').toLowerCase().replace(/[.,!?;:"“”]+/g, ' ').replace(/\s+/g, ' ').trim();
  const squash = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /** text, { "physic ai": "fisicai" } → { text: "…fisicai…", fixed: ["fisicai"] }. Whole words only, any case, longest
   *  first, one pass (a fix is never fixed again). */
  function fix(text, heard) {
    text = String(text || '');
    const keys = Object.keys(heard || {}).map(norm).filter(Boolean).sort((a, b) => b.length - a.length);
    if (!keys.length || !text) return { text, fixed: [] };
    const map = Object.fromEntries(Object.entries(heard).map(([k, v]) => [norm(k), v]));
    const re = new RegExp(`(?<![\\p{L}\\p{N}'])(?:${keys.map((k) => k.split(' ').map(esc).join('\\s+')).join('|')})(?![\\p{L}\\p{N}'])`, 'giu');
    const fixed = [];
    const out = text.replace(re, (m) => { const to = map[norm(m)]; fixed.push(to); return to; });
    return { text: out, fixed };
  }

  /** Of the recognizer's guesses (best first), the first that has one of your words or a known mishearing; else the best. */
  function pick(alts, words, heard) {
    alts = (alts || []).filter((a) => a && a.trim());
    if (alts.length < 2) return alts[0] || '';
    const known = new Set((words || []).map(squash).filter((w) => w.length >= 3));
    const has = (a) => fix(a, heard).fixed.length ||
      norm(a).split(' ').some((w, i, ws) => known.has(squash(w)) || (i && known.has(squash(ws[i - 1] + w))));
    return alts.find(has) || alts[0];
  }

  globalThis.LaxHeard = { fix, pick, norm };
})();
