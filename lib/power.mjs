// The Mac going to sleep and waking (lib/power.swift, built into ~/.lax/bin the first time, and again when it changes).
// So the relay and the phone know at once, not a minute later. Without swiftc it simply isn't there.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { HOME } from './paths.mjs';

const SRC = new URL('./power.swift', import.meta.url).pathname, BIN = path.join(HOME, 'bin', 'power');

/** Calls onSleep() just before the Mac sleeps and onWake() after. Returns { stop }. */
export function watchPower({ onSleep = () => {}, onWake = () => {}, log = () => {} } = {}) {
  let child = null, stopped = false;
  const built = () => fs.existsSync(BIN) && fs.statSync(BIN).mtimeMs >= fs.statSync(SRC).mtimeMs;
  const start = () => {
    if (stopped) return;
    child = spawn(BIN, [], { stdio: ['ignore', 'pipe', 'ignore'] });
    let buf = '';
    child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l === 'sleep') onSleep(); else if (l === 'wake') onWake(); } });
    child.on('exit', () => { child = null; if (!stopped) setTimeout(start, 30e3); });
  };
  if (built()) start();
  else {
    fs.mkdirSync(path.dirname(BIN), { recursive: true });
    execFile('swiftc', ['-O', SRC, '-o', BIN], { timeout: 300e3 }, (e) => { if (e) log(`power: not built (${e.message.split('\n')[0]})`); else start(); });
  }
  return { stop() { stopped = true; child?.kill(); } };
}
