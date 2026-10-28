// Whisper on the Mac (Phase 4.4): the phone's recording becomes a WAV, a short message gets a short window, your names
// go as the prompt, what Whisper adds on its own is dropped. With whisper-server set up (scripts/whisper.mjs) and macOS's
// `say`, a real round trip: a spoken sentence with Lax's names comes back written right.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as whisper from '../lib/whisper.mjs';

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

const pcm = Buffer.alloc(16000 * 2 * 3); // 3 s of silence
const w = whisper.wav(pcm);
check('a WAV around the PCM', w.length === pcm.length + 44 && w.toString('ascii', 0, 4) === 'RIFF' && w.toString('ascii', 8, 12) === 'WAVE'
  && w.readUInt32LE(24) === 16000 && w.readUInt16LE(22) === 1 && w.readUInt16LE(34) === 16 && w.readUInt32LE(40) === pcm.length);
check('its length in seconds', whisper.seconds(pcm) === 3);
check('a short message, a short window', whisper.audioCtx(3) === 278 && whisper.audioCtx(10) === 628);
check('a long one, the whole window', whisper.audioCtx(28) === 0 && whisper.audioCtx(60) === 0 && whisper.audioCtx(27) <= 1500);
check('the language alone', whisper.langCode('pt-PT') === 'pt' && whisper.langCode('en-US') === 'en' && whisper.langCode('') === 'en' && whisper.langCode(undefined) === 'en');
check('names as the prompt', whisper.prompt(['Lax', 'fisicai']) === 'Lax, fisicai.' && whisper.prompt([]) === '');
check('what Whisper adds is dropped', whisper.clean(' [BLANK_AUDIO]\n') === '' && whisper.clean(' Lax, run the tests. (music)\n') === 'Lax, run the tests.');
check('a sentence said twice, once', whisper.clean('Close. Close.') === 'Close.' && whisper.clean('Run it. Run it! Then push.') === 'Run it. Then push.'
  && whisper.clean('Yes. No. Yes.') === 'Yes. No. Yes.');
{ const tone = (secs, amp) => { const b = Buffer.alloc(Math.round(16000 * secs) * 2); for (let i = 0; i < b.length / 2; i++) b.writeInt16LE(Math.round(amp * Math.sin(i / 5)), i * 2); return b; };
  const t = whisper.trimSilence(Buffer.concat([tone(1, 0), tone(2, 8000), tone(2, 50)]));
  check('the quiet at either end is cut, a margin kept', Math.abs(whisper.seconds(t) - 2.6) < 0.05, `${whisper.seconds(t)}s`);
  check('all quiet: nothing', whisper.trimSilence(tone(2, 50)).length === 0); }
check('not running: null, so the phone\'s words go', (await whisper.transcribe(pcm)) === null);
// A browser that records you (the iPhone's Home Screen app) sends the same as the Android app: 16 kHz PCM16 (public/heard.js).
{ await import('../public/heard.js');
  const chunk = (n, v) => new Float32Array(n).fill(v), pcm16 = (b64) => { const b = Buffer.from(b64, 'base64'); return Array.from({ length: b.length / 2 }, (_, i) => b.readInt16LE(i * 2)); };
  const s = pcm16(LaxHeard.pcm16k([chunk(4096, 0.5), chunk(4096, 0.5), chunk(4096, 0.5)], 48000));
  check('a browser\'s 48 kHz recording, at 16 kHz', s.length === 4096 && s.every((v) => v === Math.trunc(0.5 * 0x7fff)), `${s.length} samples`);
  check('and from 44.1 kHz', pcm16(LaxHeard.pcm16k([chunk(44100, 0)], 44100)).length === 16000);
  const loud = pcm16(LaxHeard.pcm16k([chunk(300, 3), chunk(300, -3)], 48000));
  check('too loud is clipped, never wrapped', loud[0] === 0x7fff && loud.at(-1) === -0x7fff);
  check('nothing recorded: nothing', LaxHeard.pcm16k([], 48000) === ''); }

if (whisper.available() && process.platform === 'darwin') {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lax-whisper-'));
  try {
    execFileSync('say', ['-v', 'Daniel', '-o', path.join(TMP, 'a.aiff'), 'Lax, open the fisicai project and run the tests.']);
    execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', path.join(TMP, 'a.aiff'), path.join(TMP, 'a.wav')]);
    const f = fs.readFileSync(path.join(TMP, 'a.wav')), data = f.indexOf('data'), spoken = f.subarray(data + 8, data + 8 + f.readUInt32LE(data + 4));
    whisper.start({ port: 7790 });
    for (let i = 0; i < 100 && !whisper.running(); i++) await new Promise((r) => setTimeout(r, 200));
    const t0 = Date.now(), text = await whisper.transcribe(spoken, { lang: 'en-US', words: ['Lax', 'fisicai'], timeout: 20000 });
    check('a spoken sentence comes back with its names right', /\bLax\b/.test(text || '') && /fisicai/.test(text || ''), `${JSON.stringify(text)} in ${Date.now() - t0}ms`);
  } finally { whisper.stop(); fs.rmSync(TMP, { recursive: true, force: true }); }
} else console.log('- whisper not set up here: no round trip (node scripts/whisper.mjs)');

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall whisper tests passed');
