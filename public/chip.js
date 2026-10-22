// Lax's sounds (Phase 10): a tiny chiptune palette, one short tune per state, in its species' key. Its "done" jingle
// grows with it: two notes as a sprout, a whole phrase and a bass line as a blob, a harmony as a cube, drums as a brick,
// and a fanfare as a legend. tune() is pure (scripts/test-chip.mjs runs it); play() is the page's, with Web Audio.
(() => {
  // Its key: the root note of each species (MIDI), so a fire Lax and a water one don't sound the same.
  const ROOT = { fire: 60, water: 62, grass: 65, electric: 67, fox: 57, pink: 64 };
  const STAGE = { sprout: 0, blob: 1, cube: 2, brick: 3, legend: 4 };
  // Phrases, in semitones over the root: the done jingle is built from them, one more per stage.
  const PHRASES = [[0, 4, 7, 12], [9, 7, 4, 7], [5, 9, 12, 16], [14, 12, 11, 12]];
  const n = (offs, beats = 1) => offs.map((o) => [o, beats]); // notes, all the same length
  // Short tunes, per state: [offsets with their lengths] for the lead, and what goes under it.
  const TUNES = {
    needs: { lead: n([7, 12, 7]), wave: 'square' }, // a permission or a question: come here
    nudge: { lead: n([7]), wave: 'square' }, // one in another tab
    levelup: { lead: [...n([0, 4, 7]), [12, 3]], bass: [[-12, 6]] },
    hatch: { lead: [...n([0, 4, 7]), [null, 1], ...n([12, 16, 19]), [24, 4]], bass: [[-12, 3], [-5, 5]] },
    learned: { lead: n([7, 11, 14, 19], 0.5), wave: 'triangle' },
    error: { lead: [[3, 2], [-2, 3]], wave: 'triangle' },
    yes: { lead: n([7, 12]) }, no: { lead: n([-1, -5]), wave: 'triangle' },
    listen: { lead: n([12], 0.5) },
  };

  /** The done jingle for a Lax at this level and stage. */
  function jingle(level = 1, stage = 'sprout') {
    const s = STAGE[stage] ?? 0;
    // A sprout says two notes, one more every 6 levels; from blob, whole phrases, one more per stage.
    const lead = s === 0 ? n(PHRASES[0].slice(0, Math.min(4, 2 + Math.floor((level - 1) / 6))))
      : PHRASES.slice(0, s).flatMap((p) => n(p));
    // It lands: up through the leading tone to the octave; a legend climbs to the octave above in a fanfare.
    const end = s >= 4 ? [[16, 1], [19, 1], [24, 6]] : s ? [[11, 1], [12, 3]] : [];
    const t = { lead: [...lead, ...end] };
    const beats = t.lead.reduce((a, [, b]) => a + b, 0);
    if (s >= 1) t.bass = Array.from({ length: Math.ceil(beats / 2) }, (_, i) => [i % 4 === 3 ? -5 : -12, 2]); // root, root, root, fifth
    if (s >= 2) t.harmony = t.lead.map(([o, b], i) => [i === t.lead.length - 1 ? o + 4 : null, b]); // a third on the last note
    if (s >= 3) t.drums = Array.from({ length: Math.ceil(beats) }, (_, i) => [i % 2 ? null : 0, 1]); // on every other step
    if (s >= 4) t.harmony = t.lead.map(([o, b]) => [o === null ? null : o - 5, b]); // the legend's in two voices throughout
    return t;
  }

  /** What to play: a tune by name, or the done jingle; in the key of its species. */
  function tune(name, pet = {}) {
    const t = name === 'done' ? jingle(pet.level, pet.stage) : TUNES[name];
    return t && { ...t, root: ROOT[pet.species?.copy && pet.species.id === 'pink' ? pet.species.copy : pet.species?.id] ?? 60 };
  }

  // ---------- the page: Web Audio ----------
  const STEP = 0.075; // seconds per beat: quick, like a game's
  // Its voices: which part, on what wave (the lead's is the tune's own), how loud, and how many semitones up.
  const VOICES = [{ part: 'lead', gain: 0.05, shift: 12 }, { part: 'harmony', wave: 'square', gain: 0.03, shift: 12 },
    { part: 'bass', wave: 'triangle', gain: 0.08, shift: 0 }, { part: 'drums', wave: 'noise', gain: 0.025, shift: 0 }];
  const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
  let noise;
  /** Plays a tune on an AudioContext (ac), quietly. */
  function play(ac, t, vol = 1) {
    if (!t) return;
    const start = ac.currentTime + 0.01;
    const voice = (notes, wave, gain, shift = 0) => {
      let at = start;
      for (const [o, beats] of notes || []) {
        const len = beats * STEP;
        if (o !== null) {
          const v = ac.createGain(); v.gain.setValueAtTime(gain * vol, at); v.gain.exponentialRampToValueAtTime(0.001, at + len * 0.95);
          let src;
          if (wave === 'noise') {
            noise ||= (() => { const b = ac.createBuffer(1, ac.sampleRate * 0.1, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; })();
            src = ac.createBufferSource(); src.buffer = noise;
          } else { src = ac.createOscillator(); src.type = wave; src.frequency.value = hz(t.root + o + shift); }
          src.connect(v).connect(ac.destination); src.start(at); src.stop(at + len);
        }
        at += len;
      }
    };
    for (const v of VOICES) voice(t[v.part], v.wave || t.wave || 'square', v.gain, v.shift);
  }

  globalThis.LaxChip = { tune, jingle, play, TUNES, VOICES, STEP, hz };
})();
