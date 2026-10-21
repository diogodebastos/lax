// A share card (lib/card.mjs): the picture is a real 1200 × 630 PNG with Lax on it in its own colour, what it says
// passes the Worker's check (lib/mind-shape.mjs cleanCard), and anything more, or odd, doesn't.
import zlib from 'node:zlib';
import { cardOf, cardPng } from '../lib/card.mjs';
import { cleanCard } from '../lib/mind-shape.mjs';

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

const view = { name: 'Lax', born: Date.now() - 15.5 * 864e5, level: 26, stage: 'blob', hatched: true, species: { name: 'fire' },
  look: { form: 'ember', color: '#D97757', lift: 0 }, traits: ['glasses', 'cape'] };
const snap = { total: { heard: 194, spoke: 534, changes: 176 }, episodes: { total: 54 }, projects: [{ name: 'secret-project', notes: 9 }] };
const c = cardOf(view, snap);
check('what it says: who it is and four counts', c.name === 'Lax' && c.level === 26 && c.days === 15 && c.heard === 194 && c.memories === 54 && c.changes === 176, JSON.stringify({ ...c, look: undefined }));
check('…and nothing about your projects', !JSON.stringify(c).includes('secret-project'));
const kept = cleanCard({ ...c, look: undefined });
check('the Worker keeps it as it is', JSON.stringify(kept) === JSON.stringify({ ...c, look: undefined }));
check('…but not with anything more', cleanCard({ ...c, look: undefined, note: 'hi' }) === null && cleanCard(c) === null);
check('…nor odd values', [{ level: -1 }, { days: 1.5 }, { name: '<script>' }, { color: 'red' }, { stage: 'god' }, { heard: '9' }].every((x) => cleanCard({ ...c, look: undefined, ...x }) === null));

const png = cardPng(c);
check('the picture is a PNG, 1200 × 630', png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630, `${png.length} bytes`);
check('…small enough to send (under 100 KB)', png.length < 100e3);
// Unpack it: Lax's own colour is on it.
const idat = []; for (let i = 8; i < png.length;) { const n = png.readUInt32BE(i), t = png.toString('ascii', i + 4, i + 8); if (t === 'IDAT') idat.push(png.subarray(i + 8, i + 8 + n)); i += 12 + n; }
const raw = zlib.inflateSync(Buffer.concat(idat)); let body = 0;
for (let y = 0; y < 630; y++) for (let x = 0; x < 1200; x++) { const k = y * 3601 + 1 + x * 3; if (raw[k] === 0xd9 && raw[k + 1] === 0x77 && raw[k + 2] === 0x57) body++; }
check('…with Lax on it, in its colour', body > 5000, `${body} px`);

console.log(failed ? `\n${failed} card check(s) failed` : '\nall card checks passed');
process.exit(failed ? 1 : 0);
