// What Lax makes to be seen (a simulation, a chart, an animation): one HTML page each in its mind's visuals/, written
// by itself without asking. A new or changed one opens in a window on the phone (public/lax.js), in a sandboxed frame:
// its scripts run, but it can't read Lax's token, its talk, or speak to the Mac as you.
import fs from 'node:fs';
import path from 'node:path';

export const NAME = /^[\w-]{1,60}\.html$/;
const MAX = 2 * 1024 * 1024; // a page bigger than this isn't sent to the phone

export function createVisuals(mind) {
  const dir = path.join(mind, 'visuals');
  const list = () => {
    try {
      return fs.readdirSync(dir).filter((f) => NAME.test(f))
        .map((f) => ({ name: f, at: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.at - a.at);
    } catch { return []; }
  };
  const read = (name) => {
    if (!NAME.test(String(name))) return null;
    try { const f = path.join(dir, name), s = fs.statSync(f); return s.isFile() && s.size <= MAX ? fs.readFileSync(f, 'utf8') : null; } catch { return null; }
  };
  /** Makes visuals/ and keeps it out of the mind's history (pages, not notes). onNew(name) when one is written. */
  function watch(onNew) {
    fs.mkdirSync(dir, { recursive: true });
    const ignore = path.join(mind, '.gitignore');
    const had = fs.existsSync(ignore) ? fs.readFileSync(ignore, 'utf8') : '';
    if (!/^visuals\/$/m.test(had)) fs.writeFileSync(ignore, had + (had && !had.endsWith('\n') ? '\n' : '') + 'visuals/\n');
    const timers = new Map(); // an editor writes in bursts: wait until it's done
    try {
      return fs.watch(dir, (_, f) => {
        if (!f || !NAME.test(f)) return;
        clearTimeout(timers.get(f));
        timers.set(f, setTimeout(() => { timers.delete(f); if (read(f) !== null) onNew(f); }, 400));
      });
    } catch { return null; }
  }
  return { dir, list, read, watch };
}
