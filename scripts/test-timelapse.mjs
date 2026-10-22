// The evolution timelapse (lib/timelapse.mjs): its story from milestones, and a GIF that decodes back to what was drawn.
import { story, timelapseGif, gif, speciesChanges } from '../lib/timelapse.mjs';
import { formFor } from '../lib/species.mjs';

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
const day = 864e5, t0 = Date.parse('2026-10-01T10:00:00Z'), m = (d, text) => ({ ts: t0 + d * day, text });
const fire = { id: 'fire' }, said = (f) => `${f.hatched ? `${f.level} ${f.stage} ${f.look.form}` : 'egg'}`;

// A Lax born today: an egg, it hatches, grows, evolves.
const young = story([m(0, 'Lax was born'), m(2, 'Lax hatched: a fire one!'), m(3, 'Lax reached level 2!'), m(3.5, '3-day streak'),
  m(9, 'Lax evolved into a blob!'), m(10, 'Lax reached level 17!')], fire, { hatched: true, level: 17, stage: 'blob', look: formFor(fire, 1), traits: ['glasses'] });
check('a new Lax: egg, hatched, its levels, its evolution, then today', young.map(said).join(' / ') === 'egg / 1 sprout ember / 2 sprout ember / 16 blob ember / 17 blob ember / 17 blob ember', young.map(said).join(' / '));
check('…a streak is no frame, and only today wears its traits', young.length === 6 && young.at(-1).today && young.at(-1).traits[0] === 'glasses' && young.slice(0, -1).every((f) => !f.traits.length));
check('…an egg is drawn grey, the rest in its species', young[0].look.color === '#8a8378' && young[1].look.color === formFor(fire, 0).color);

// A Lax from before species: it grew without one (its own words for stages), started over, then hatched again.
const old = story([m(0, 'Lax was born'), m(0.1, 'Lax reached level 2!'), m(0.2, 'Lax evolved into a cube!'), m(1, 'Lax started over on a new path'),
  m(1.5, 'Lax evolved into a blob!'), m(2, 'Lax reached level 19!'), m(3, 'Lax hatched again, as a brown fox'), m(3.1, 'Lax reached level 19!')],
  { id: 'fox' }, { hatched: true, level: 19, stage: 'blob', look: formFor({ id: 'fox' }, 1), traits: [] });
check('an old Lax: no egg, its own stages, then the fox from where it was', old.map(said).join(' / ') === '1 sprout null / 2 sprout null / 3 cube null / 4 blob null / 19 blob null / 19 blob kit / 19 blob kit', old.map(said).join(' / '));

// Its species picked by hand after hatching, read from its mind's history; a flip undone within minutes was a try.
const sec = (d) => Math.floor((t0 + d * day) / 1000);
const changes = speciesChanges([`${sec(1)} I am now an egg, 40% of the way`, `${sec(3)} I am now a brown fox Lax (kit form)`, `${sec(3.5)} I am now a fire Lax (ember form)`,
  `${sec(6)} I am now a water Lax (shell form)`, `${sec(6) + 120} I am now a fire Lax (ember form)`].join('\n'));
check('species changes from the mind: names to species, a two-minute try dropped', changes.map((c) => c.id).join() === 'fox,fire,fire', JSON.stringify(changes.map((c) => c.id)));
const picked = story([m(0, 'Lax was born'), m(2, 'Lax hatched: a brown fox!'), m(4, 'Lax reached level 2!')], { id: 'fox' },
  { hatched: true, level: 2, stage: 'sprout', look: formFor(fire, 0), traits: [] }, changes);
check('…it hatched a fox, became fire when picked, and grew as fire', picked.map(said).join(' / ') === 'egg / 1 sprout kit / 1 sprout ember / 2 sprout ember / 2 sprout ember', picked.map(said).join(' / '));

// The GIF: decoded here, its frames and pixels as drawn.
function decode(buf) {
  let p = 13; const bits = (buf[10] & 7) + 1, table = buf.subarray(p, p + 3 * (1 << bits)); p += 3 * (1 << bits);
  const w = buf.readUInt16LE(6), h = buf.readUInt16LE(8), frames = []; let loops = false, delay = 0;
  while (buf[p] !== 0x3b) {
    if (buf[p] === 0x21) { if (buf[p + 1] === 0xff) loops = buf.subarray(p + 3, p + 14).toString() === 'NETSCAPE2.0'; if (buf[p + 1] === 0xf9) delay = buf.readUInt16LE(p + 4) * 10;
      p += 2; while (buf[p]) p += buf[p] + 1; p++; continue; }
    p += 10; const min = buf[p++], data = []; while (buf[p]) { data.push(...buf.subarray(p + 1, p + 1 + buf[p])); p += buf[p] + 1; } p++;
    // LZW, the reader's way.
    const clear = 1 << min, out = []; let size = min + 1, dict = [], prev = null, acc = 0, n = 0;
    const reset = () => { dict = Array.from({ length: clear + 2 }, (_, i) => [i]); size = min + 1; prev = null; };
    reset();
    for (const byte of data) {
      acc |= byte << n; n += 8;
      while (n >= size) {
        const code = acc & ((1 << size) - 1); acc >>>= size; n -= size;
        if (code === clear) { reset(); continue; } if (code === clear + 1) { n = 0; break; }
        const entry = code < dict.length ? dict[code] : [...dict[prev], dict[prev][0]];
        out.push(...entry);
        if (prev !== null && dict.length < 4096) dict.push([...dict[prev], entry[0]]);
        if (dict.length === 1 << size && size < 12) size++;
        prev = code;
      }
    }
    frames.push({ px: out, delay });
  }
  return { w, h, loops, frames, color: (i) => [...table.subarray(i * 3, i * 3 + 3)] };
}
// Busy pixels (noise in a few colours) push the table past 4096 codes, so a clear happens mid-frame.
const W = 240, H = 160, noise = new Uint8Array(W * H * 3), flat = new Uint8Array(W * H * 3).fill(40);
let seed = 7; for (let i = 0; i < W * H; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; const c = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [9, 9, 9], [200, 100, 50]][seed % 5]; noise.set(c, i * 3); }
const g = decode(gif([[noise, 100], [flat, 2000]], W, H));
const same = (px, rgb) => px.every((k, i) => g.color(k).every((v, j) => v === rgb[i * 3 + j]));
check('a GIF that decodes back to every pixel, through a table reset', g.frames.length === 2 && g.frames[0].px.length === W * H && same(g.frames[0].px, noise) && same(g.frames[1].px, flat));
check('…looping, each frame its own time', g.loops && g.frames[0].delay === 100 && g.frames[1].delay === 2000);

const t = Date.now(), lapse = decode(timelapseGif(young, { name: 'Lax', color: formFor(fire, 1).color })), ms = Date.now() - t;
const flicker = lapse.frames.filter((f) => f.delay < 350).length;
check('the timelapse: 600 × 600, each look standing, a flicker at each evolution, today held', lapse.w === 600 && lapse.frames.length === young.length + flicker
  && flicker === 2 * 16 && lapse.frames.at(-1).delay === 3000, `${lapse.frames.length} frames, ${flicker} flickering, ${ms} ms`);

if (failed) { console.log(`\n${failed} timelapse check(s) failed`); process.exit(1); }
console.log('\nall timelapse checks passed');
