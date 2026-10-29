// Whisper on the Mac: the phone sends what it recorded while you talked, and Whisper (whisper.cpp, the "small" model)
// writes it down with your names as a prompt. Better than the phone's recognizer on names and on Portuguese; the phone's
// words still show live while you talk, and are sent as they are when Whisper isn't there or takes too long.
// whisper-server is kept running (the model loaded: ~1.5s for a short message on the Intel Mac, ~600 MB of RAM).
// `node scripts/whisper.mjs` builds it into ~/.lax-tools; LAX_WHISPER_BIN / LAX_WHISPER_MODEL point elsewhere.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const TOOLS = path.join(os.homedir(), '.lax-tools');
export const BIN = process.env.LAX_WHISPER_BIN || path.join(TOOLS, 'whisper.cpp/build/bin/whisper-server');
export const MODEL = process.env.LAX_WHISPER_MODEL || path.join(TOOLS, 'whisper/ggml-small.bin');
const RATE = 16000; // the phone records 16 kHz mono, 16-bit

/** A WAV file around raw PCM (16 kHz mono s16le), as whisper-server takes it. */
export function wav(pcm) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export const seconds = (pcm) => pcm.length / (RATE * 2);
// Whisper encodes 30s windows (1500 frames) even for a 5s message; a shorter window for a short one is ~3x faster
// on this CPU. A little room past the end, or it drops the last word.
export const audioCtx = (secs) => (secs >= 28 ? 0 : Math.min(1500, Math.ceil(secs * 50) + 128));
/** "pt-PT" → "pt": Whisper takes the language alone. */
export const langCode = (lang) => (String(lang || 'en').toLowerCase().match(/^[a-z]{2}/) || ['en'])[0];
/** Your names, as the text Whisper thinks came just before: it spells them like that. */
export const prompt = (words = []) => (words.length ? words.slice(0, 60).join(', ') + '.' : '');
/** What Whisper wrote, without what it adds on its own: [BLANK_AUDIO], (music), line breaks, a sentence said twice
 *  ("close" came back as "Close. Close."). */
export function clean(t) {
  const s = String(t || '').replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = s.match(/[^.!?…]+[.!?…]*/g) || [];
  const key = (p) => p.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return parts.filter((p, i) => !i || key(p) !== key(parts[i - 1])).join('').trim();
}

/** Without the quiet at either end (the phone sends ~2s after your last word): silence makes Whisper repeat
 *  itself or invent words. A little margin is kept so a soft first or last word isn't cut. */
export function trimSilence(pcm, { floor = 500, margin = 0.3 } = {}) {
  const win = RATE / 50, n = Math.floor(pcm.length / 2 / win); // 20 ms windows
  const loud = (w) => { let sum = 0; for (let i = w * win; i < (w + 1) * win; i++) { const v = pcm.readInt16LE(i * 2); sum += v * v; } return Math.sqrt(sum / win) > floor; };
  let a = 0, b = n - 1;
  while (a < n && !loud(a)) a++;
  while (b > a && !loud(b)) b--;
  if (a >= n) return pcm.subarray(0, 0);
  const m = Math.round(margin * 50);
  return pcm.subarray(Math.max(0, a - m) * win * 2, Math.min(n, b + 1 + m) * win * 2);
}

let child = null, port = 0, ready = false, restarts = 0, log = () => {};

export const available = () => fs.existsSync(BIN) && fs.existsSync(MODEL);
export const running = () => ready;

/** Start whisper-server next to Lax (once; it restarts itself if it dies, a few times). */
export function start({ port: p = 7778, threads = Math.max(2, os.cpus().length), onLog } = {}) {
  if (onLog) log = onLog;
  if (child || !available()) return false;
  port = p; ready = false;
  spawnSync('pkill', ['-f', `whisper-server .*--port ${port}( |$)`]); // one left behind by a Lax that was killed
  const me = child = spawn(BIN, ['-m', MODEL, '--host', '127.0.0.1', '--port', String(port), '-t', String(threads), '-nt'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  child.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
  // Ready once the model is loaded (its stdout is buffered, so ask rather than read it).
  const poll = setInterval(async () => {
    if (child !== me) return clearInterval(poll);
    try { if ((await (await fetch(`http://127.0.0.1:${port}/health`)).json()).status === 'ok') { clearInterval(poll); ready = true; restarts = 0; log('whisper ready'); } } catch {}
  }, 300);
  child.on('exit', (code) => {
    clearInterval(poll); if (child !== me) return;
    child = null; ready = false;
    if (restarts >= 5) return log(`whisper stopped (${code})${code ? ': ' + err.split('\n').slice(-3).join(' ') : ''}`);
    restarts++; setTimeout(() => start(), 2000 * restarts);
  });
  return true;
}
export function stop() { const c = child; child = null; ready = false; c?.kill(); }

/** PCM → text, or null (not running, too slow, failed): the phone's words go instead. */
export async function transcribe(pcm, { lang, words = [], timeout } = {}) {
  if (!ready || !pcm?.length) return null;
  pcm = trimSilence(pcm);
  timeout ??= 8000 + seconds(pcm) * 500; // a long message takes longer: up to half its length, on a slow Mac
  if (seconds(pcm) < 0.3) return null;
  const f = new FormData();
  f.append('file', new Blob([wav(pcm)], { type: 'audio/wav' }), 'heard.wav');
  f.append('language', langCode(lang));
  f.append('prompt', prompt(words));
  f.append('audio_ctx', String(audioCtx(seconds(pcm))));
  f.append('response_format', 'json');
  try {
    const r = await fetch(`http://127.0.0.1:${port}/inference`, { method: 'POST', body: f, signal: AbortSignal.timeout(timeout) });
    if (!r.ok) return null;
    return clean((await r.json()).text) || null;
  } catch { return null; }
}
