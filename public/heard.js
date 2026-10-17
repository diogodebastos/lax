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

  /** A name you spelled out ("F I S I C A I", "l-a-x", "L. A. X.") → one word, as Lax knows it if it does ("Lax").
   *  Three letters or more; single letters on their own ("a", "I") are left alone. */
  function spell(text, words) {
    const known = new Map((words || []).map((w) => [squash(w), w]));
    const spelled = [];
    const out = String(text || '').replace(/(?<![\p{L}\p{N}])\p{L}(?:[\s.\-]+\p{L}(?![\p{L}\p{N}])){2,}\.?/gu, (m) => {
      const w = m.replace(/[^\p{L}]/gu, '').toLowerCase(), as = known.get(w) || w;
      spelled.push(as); return as;
    });
    return { text: out, spelled };
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

  /** What you said, as Lax writes it: spelled names joined, then misheard ones fixed. fixed: the words it changed. */
  function hear(text, vocab) {
    const s = spell(text, vocab.words), f = fix(s.text, vocab.heard);
    return { text: f.text, fixed: [...s.spelled, ...f.fixed], spelled: s.spelled };
  }

  /** The phone's recognizer, on a long stretch, starts its words over with the newest part ("…buy two tickets" becomes
   *  "to show up in Lisbon"): the words so far would be lost. A correction keeps its opening (one of the first two words);
   *  starting over doesn't, and is shorter. */
  function restarted(before, now) {
    const b = norm(before).split(' ').filter(Boolean), n = norm(now).split(' ').filter(Boolean);
    return b.length >= 3 && n.length > 0 && n.length < b.length && b[0] !== n[0] && (n.length < 2 || b[1] !== n[1]);
  }

  globalThis.LaxHeard = { fix, pick, spell, hear, norm, squash, restarted };
})();
