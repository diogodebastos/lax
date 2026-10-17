// How Lax sees itself (Phase 6.2): its palette from its colour alone, readable on both pages; its body as SVG, drawn by
// the phone's own code (public/body.js); self.md seeded once and never overwritten; the `self` answer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lax-self-'));
process.env.LAX_HOME = TMP;
process.on('exit', () => fs.rmSync(TMP, { recursive: true, force: true }));
fs.mkdirSync(path.join(TMP, 'mind'), { recursive: true });
const { palette, css, contrast, portrait, self, ensureSelf, SELF_MD } = await import('../lib/self.mjs');

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
const lax = (o = {}) => ({ name: 'Lax', hatched: true, stage: 'blob', level: 23, traits: ['monocle', 'goggles'],
  look: { form: 'ember', color: '#D97757', lift: 0 }, species: { name: 'fire' }, ...o });

// The palette.
const fire = palette('#D97757');
check('its colour, and its edges as on the phone', fire.color === '#d97757' && fire.light === '#e4a089' && fire.dark === '#a35941');
check('a page made from its colour, dark and light', /^#1[0-9a-f]/.test(fire.themes.dark.bg) && /^#f[0-9a-f]/.test(fire.themes.light.bg));
for (const c of ['#D97757', '#5aa7e6', '#f6d23c', '#403e4a', '#f2ede3', '#5abf8e', '#f4a6c8']) {
  const p = palette(c), ok = ['dark', 'light'].every((t) => { const th = p.themes[t];
    return contrast(th.accent, th.bg) >= 4.5 && contrast(th.hi, th.bg) >= 4.5 && contrast(th.fg, th.bg) >= 7 && contrast(th.dim, th.bg) >= 4.5 && contrast(th.edge, th.bg) >= 2; });
  check(`${c}: accent, text and edges read on both pages`, ok);
}
check('the yellow one gets a darker accent on a light page', palette('#f6d23c').themes.light.accent !== '#f6d23c');
check('a bad colour falls back to fire', palette('nope').color === '#d97757');
const sheet = css(fire);
check('as CSS: dark first, light for a light screen', sheet.startsWith(':root { --color:#d97757;') && sheet.includes('@media (prefers-color-scheme: light)')
  && sheet.includes(`--accent:${fire.themes.light.accent};`));

// The body.
const svg = portrait(lax());
check('an SVG, crisp, cropped to the body', svg.startsWith('<svg') && svg.includes('shape-rendering="crispEdges"') && /viewBox="0 0 \d+ \d+"/.test(svg));
check('in its own colour', svg.includes('fill="#d97757"'));
const plain = lax({ look: { form: null, color: '#D97757' } }); // no ember tail: its flame is gold too
check('wearing what it wears (the monocle is gold)', portrait(plain).includes('fill="#ffd25a"'));
check('not what was switched off', !portrait(plain, { hide: ['monocle'] }).includes('fill="#ffd25a"'));
check('a water Lax is blue', portrait(lax({ look: { form: 'shell0', color: '#5aa7e6' } })).includes('fill="#5aa7e6"'));
const egg = portrait({ hatched: false, look: { color: '#5aa7e6' } });
check('an egg is an egg, speckled by what leads', egg.includes('fill="#f3e6cf"') && egg.includes('fill="#5aa7e6"'));
check('the same Lax, the same picture', portrait(lax()) === portrait(lax()));
check('nothing behind it: no page, no shadow', !portrait(lax()).includes('#000') && !portrait(lax()).includes('#2a2521'));

// self.md.
ensureSelf();
const seeded = fs.readFileSync(SELF_MD, 'utf8');
check('self.md is seeded', seeded.startsWith('# How I see myself') && seeded.includes('No emoji'));
fs.writeFileSync(SELF_MD, '# How I see myself\nMine now.\n'); ensureSelf();
check('…and never overwritten', fs.readFileSync(SELF_MD, 'utf8') === '# How I see myself\nMine now.\n');

// The `self` answer.
const s = self(lax({ traits: ['monocle', 'goggles', 'cape'] }), { hideTraits: ['cape'] });
check('who it is today', s.name === 'Lax' && s.species === 'fire' && s.stage === 'blob' && s.level === 23 && s.form === 'ember');
check('the companion is Lax until named, the app digi-lax (#23)', self(null).name === 'Lax' && self(null, { name: 'Ember' }).name === 'Ember'
  && (await import('../lib/names.mjs')).APP_NAME === 'digi-lax');
check('what it wears, without what was switched off', s.wears.join() === 'monocle,goggles');
check('palette, css, face, date and self.md', s.palette.color === '#d97757' && s.css.includes('--bg:') && s.face.startsWith('<svg')
  && /^\d{4}-\d{2}-\d{2}$/.test(s.date) && s.self_md.includes('Mine now'));
check('an egg says so', self({ hatched: false, look: { color: '#8a8378' } }).species === 'egg');

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nself: all good');
