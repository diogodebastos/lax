// lib/visuals.mjs: pages Lax makes to be seen, listed, read safely, and announced when written.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVisuals } from '../lib/visuals.mjs';

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? '✓' : '✗'} ${what}`); if (!ok) failed++; };

const mind = fs.mkdtempSync(path.join(os.tmpdir(), 'lax-visuals-'));
const v = createVisuals(mind);
const seen = [];
const w = v.watch((n) => seen.push(n));
check(fs.readFileSync(path.join(mind, '.gitignore'), 'utf8').includes('visuals/'), 'visuals/ is kept out of the mind\'s history');
v.watch(() => {})?.close();
check(fs.readFileSync(path.join(mind, '.gitignore'), 'utf8').match(/visuals\//g).length === 1, '…once');

fs.writeFileSync(path.join(v.dir, 'life.html'), '<canvas></canvas>');
fs.writeFileSync(path.join(v.dir, 'notes.txt'), 'not a page');
await new Promise((r) => setTimeout(r, 900));
check(seen.includes('life.html') && !seen.includes('notes.txt'), 'a new page is announced, other files are not');
check(v.list().map((x) => x.name).join() === 'life.html', 'the list has only pages');
check(v.read('life.html') === '<canvas></canvas>', 'a page is read');
check(v.read('../CLAUDE.md') === null && v.read('a/b.html') === null && v.read('x.htm') === null, 'nothing outside visuals/ is read');

fs.writeFileSync(path.join(v.dir, 'big.html'), 'x'.repeat(2 * 1024 * 1024 + 1));
check(v.read('big.html') === null, 'a page too big for the phone is not sent');

w?.close();
fs.rmSync(mind, { recursive: true, force: true });
console.log(failed ? `\n${failed} check(s) failed` : '\nall visuals checks passed');
process.exit(failed ? 1 : 0);
