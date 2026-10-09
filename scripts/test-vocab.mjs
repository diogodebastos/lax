// Lax hears you right (Phase 4.3): misheard words fixed (public/heard.js, the same code the phone runs), the best of the
// recognizer's guesses, pairs kept in vocab.json, "you keep mishearing X, it's Y", and the names Lax listens for.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fix, pick, readVocab, addHeard, allHeard, knownWords, teachCommand, dictatedNote, SEED } from '../lib/vocab.mjs';
import { voiceAction } from '../lib/actions.mjs';

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lax-vocab-'));
process.on('exit', () => fs.rmSync(TMP, { recursive: true, force: true }));

// Fixing.
const H = { 'physic ai': 'fisicai', lacks: 'Lax', 'edge kava': 'edge-cavai' };
check('a misheard name is fixed, any case', fix('Open Physic AI and run the tests', H).text === 'Open fisicai and run the tests');
check('…and said which', fix('open physic ai', H).fixed.join() === 'fisicai');
check('split by any spaces', fix('go to edge   kava now', H).text === 'go to edge-cavai now');
check('whole words only', fix('physicality and lackstar', H).text === 'physicality and lackstar');
check('punctuation next to it stays', fix('Hey lacks, how are you?', H).text === 'Hey Lax, how are you?');
check('longest first, one pass', fix('plan mouth', { plan: 'X', 'plan mouth': 'plan mode' }).text === 'plan mode'
  && fix('lacks', { lacks: 'Lax', lax: 'nope' }).text === 'Lax');
check('nothing to fix: the same text', fix('hello there', H).text === 'hello there' && !fix('hello there', H).fixed.length && fix('', H).text === '');

// The recognizer's guesses.
const W = ['Lax', 'fisicai', 'edge-cavai'];
check('the guess with a known name wins', pick(['open physics eye', 'open fisicai'], W, {}) === 'open fisicai');
check('…or a known mishearing', pick(['open physics eye', 'open physic ai'], W, H) === 'open physic ai');
check('a name split in two counts', pick(['talk to edge cave ai', 'talk to edge cavai'], W, {}) === 'talk to edge cavai');
check('none known: the best guess', pick(['run the tests', 'run the test'], W, H) === 'run the tests');
check('one guess, or none', pick(['only'], W, H) === 'only' && pick([], W, H) === '');

// Kept pairs.
const F = path.join(TMP, 'vocab.json');
check('no file: empty', JSON.stringify(readVocab(F)) === '{"heard":{},"words":[]}');
check('a pair is kept, normalised', addHeard(F, 'Physic AI.', 'fisicai')?.heard === 'physic ai' && readVocab(F).heard['physic ai'] === 'fisicai');
check('not a pair: same words, empty, too short', !addHeard(F, 'Lax', 'lax') && !addHeard(F, '', 'x') && !addHeard(F, 'ok', 'Lax'));
check('yours win over the built-in ones', allHeard({ heard: { aiko: 'Aiko' } }).aiko === 'Aiko' && allHeard({ heard: {} }).aiko === 'haiku');
check('quick actions still hear "plan mouth" (built-in pairs)', voiceAction('Plan mouth.') === 'plan mode' && SEED['plan mouth'] === 'plan mode');

// Teaching by voice.
const t1 = teachCommand('You keep mishearing physic AI, it\'s fisicai.');
check('"you keep mishearing X, it\'s Y"', t1?.heard === 'physic AI' && t1?.meant === 'fisicai', JSON.stringify(t1));
const t2 = teachCommand('when I say edge kava I mean edge-cavai');
check('"when I say X I mean Y"', t2?.heard === 'edge kava' && t2?.meant === 'edge-cavai', JSON.stringify(t2));
check('"Lax mishears lacks, it\'s Lax"', teachCommand('Lax mishears "lacks", it\'s "Lax"')?.heard === 'lacks');
check('plain talk is not teaching', !teachCommand('this means we are done') && !teachCommand('what did you hear?') && !teachCommand('run the tests'));

// The names it listens for.
fs.mkdirSync(path.join(TMP, 'mind', 'projects'), { recursive: true });
for (const f of ['fisicai.md', 'profile.md']) fs.writeFileSync(path.join(TMP, 'mind', 'projects', f), '');
for (const d of ['edge-cavai', 'lax', '.hidden']) fs.mkdirSync(path.join(TMP, 'repos', d), { recursive: true });
const words = knownWords({ name: 'Lax', sessions: ['lax', 'job-hunt'], mind: path.join(TMP, 'mind'), workdir: path.join(TMP, 'repos'),
  vocab: { heard: { 'physic ai': 'fisicai', 'v lish': 'Veralicious' }, words: ['Vera'] } });
check('its name, sessions, notes, words, folders; once each, no profile or dot folders',
  JSON.stringify(words) === JSON.stringify(['Lax', 'job-hunt', 'fisicai', 'Vera', 'Veralicious', 'edge-cavai']), JSON.stringify(words));
check('capped', knownWords({ sessions: Array.from({ length: 100 }, (_, i) => 'p' + i) }, 10).length === 10);
check('the note says dictated and names them', /Dictated by voice/.test(dictatedNote(words)) && dictatedNote(words).includes('Lax, job-hunt, fisicai'));

console.log(failed ? `\n${failed} check(s) failed` : '\nall vocab checks passed');
process.exit(failed ? 1 : 0);
