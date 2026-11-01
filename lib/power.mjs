// The computer going to sleep and waking: on macOS lib/power.swift, built into ~/.lax/bin the first time and again when
// it changes; on Linux logind's PrepareForSleep, through gdbus. So the relay and the phone know at once, not a minute
// later. Without swiftc or gdbus it simply isn't there.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { HOME } from './paths.mjs';

const SRC = new URL('./power.swift', import.meta.url).pathname, BIN = path.join(HOME, 'bin', 'power');

/** Calls onSleep() just before the Mac sleeps and onWake() after. Returns { stop }. */
export function watchPower({ onSleep = () => {}, onWake = () => {}, log = () => {} } = {}) {
  if (process.platform === 'linux') return watchLinux({ onSleep, onWake, log });
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

// A delay lock (systemd-inhibit holding `cat` open) gives the second the Swift helper gives on macOS to tell the relay;
// ending cat's stdin lets the sleep go on. Without the lock it still works, only the goodbye may not get out.
function watchLinux({ onSleep, onWake, log }) {
  let child = null, lock = null, stopped = false, missing = false;
  const hold = () => {
    lock?.stdin.end();
    lock = spawn('systemd-inhibit', ['--what=sleep', '--mode=delay', '--who=Lax', '--why=telling the relay', 'cat'], { stdio: ['pipe', 'ignore', 'ignore'] });
    lock.on('error', () => {}); lock.stdin.on('error', () => {});
  };
  const start = () => {
    if (stopped || missing) return;
    hold();
    child = spawn('gdbus', ['monitor', '--system', '--dest', 'org.freedesktop.login1', '--object-path', '/org/freedesktop/login1'], { stdio: ['ignore', 'pipe', 'ignore'] });
    child.on('error', (e) => { missing = true; lock?.stdin.end(); log(`power: not watching sleep (${e.message})`); });
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d; let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const l = buf.slice(0, i); buf = buf.slice(i + 1);
        if (l.includes('PrepareForSleep (true')) { onSleep(); const held = lock; lock = null; setTimeout(() => held?.stdin.end(), 1000); }
        else if (l.includes('PrepareForSleep (false')) { onWake(); hold(); }
      }
    });
    child.on('exit', () => { child = null; lock?.stdin.end(); if (!stopped) setTimeout(start, 30e3); }); // no watcher, no lock
  };
  start();
  return { stop() { stopped = true; child?.kill(); lock?.stdin.end(); } };
}
