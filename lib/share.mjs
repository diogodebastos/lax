// Sharing on the Mac. To a WhatsApp chat (the default): the file or text goes into the contact's chat in WhatsApp Desktop,
// and Lax only sends once you say so (the Send button on the phone, or Enter on the Mac). To any other app: the macOS
// share sheet (lib/share-sheet.swift), where you pick the app, or straight to AirDrop, Messages or Mail.
// Contacts come from macOS Contacts (osascript asks for access once), else from WhatsApp Desktop's own search. Files go in by clipboard + Cmd+V (System Events,
// asks for Accessibility once); if the paste is refused, the file stays on the clipboard and Lax says so.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { HOME } from './paths.mjs';

const run = (cmd, args, timeout = 15000) => new Promise((resolve, reject) =>
  execFile(cmd, args, { timeout }, (err, stdout, stderr) => err ? reject(new Error((stderr || err.message).trim())) : resolve(stdout.trim())));
const osa = (script, ...args) => run('osascript', ['-e', script, ...args]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// "Ritalicious" → people whose name or nickname contains it, with their phone numbers ({ value, label }).
export async function findContacts(name) {
  // One `whose` query, read in bulk: asking person by person is an Apple Event each, far too slow for a real address book.
  // The long timeout covers the first run, when macOS asks for Contacts access.
  const out = await run('osascript', ['-l', 'JavaScript', '-e', `function run([q]) {
    const ps = Application('Contacts').people.whose({ _or: [{ name: { _contains: q } }, { nickname: { _contains: q } }] });
    const names = ps.name(), nicks = ps.nickname(), values = ps.phones.value(), labels = ps.phones.label();
    return JSON.stringify(names.map((name, i) => ({ name, nickname: nicks[i] || '',
      phones: (values[i] || []).map((value, j) => ({ value, label: (labels[i] || [])[j] || '' })) })));
  }`, name], 90000);
  return JSON.parse(out || '[]').filter((p) => p.phones.length)
    .map((p) => ({ ...p, phones: p.phones.map((ph) => ({ ...ph, label: ph.label.replace(/^_\$!<(.*)>!\$_$/, '$1').toLowerCase() })) }));
}

// Who "Rita" means: one { name, nickname, phone } per person and number. A single one is the answer; several are a question.
// Labels tell them apart: the name, plus the number's label and last digits when one person has several.
export function contactChoices(found, to) {
  const exact = found.filter((p) => [p.name, p.nickname].some((s) => s.toLowerCase() === String(to).toLowerCase()));
  const people = exact.length ? exact : found;
  return people.flatMap((p) => p.phones.map((ph) => ({ name: p.name, nickname: p.nickname || '', phone: ph.value,
    label: p.phones.length > 1 ? `${p.name} (${ph.label || 'phone'} …${ph.value.replace(/\D/g, '').slice(-3)})` : p.name })));
}

// Edits between two words: speech gets names a letter or two wrong ("Ritolicious" for "Ritalicious").
function distance(a, b) {
  let row = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}
const sounds = (said, word) => word.includes(said) || (said.length >= 5 && distance(said, word) <= Math.floor(said.length / 5));

// Your answer to "Which Rita?", tapped or said: a label, part of one ("Silva", "the work one"), a nickname, a near miss
// of either, or "the second one". `aliases[i]` is more that names option i (its nickname). -1 when it can't tell.
const ORDINALS = [/\b(first|1st|1)\b/, /\b(second|two|2nd|2)\b/, /\b(third|three|3rd|3)\b/, /\b(fourth|four|4th|4)\b/, /\b(fifth|five|5th|5)\b/, /\b(sixth|six|6th|6)\b/];
export function pickOption(labels, answer, aliases = []) {
  const a = String(answer || '').toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim(), ls = labels.map((l) => l.toLowerCase());
  if (!a) return -1;
  if (ls.includes(a)) return ls.indexOf(a);
  if (/^\d$/.test(a)) return +a >= 1 && +a <= labels.length ? +a - 1 : -1; // "2" is the second, not a digit in a number
  const hits = ls.flatMap((l, j) => l.includes(a) ? [j] : []);
  if (hits.length === 1) return hits[0];
  const words = a.split(' ').filter((w) => w.length > 2 && !['the', 'one', 'her', 'his', 'him', 'that', 'send', 'to'].includes(w));
  const names = ls.map((l, j) => `${l} ${aliases[j] || ''}`.toLowerCase().split(/[^\p{L}\d]+/u).filter(Boolean));
  const score = names.map((ws) => words.filter((w) => ws.some((x) => sounds(w, x))).length), best = Math.max(...score);
  if (best > 0 && score.filter((n) => n === best).length === 1) return score.indexOf(best);
  if (/\blast\b/.test(a)) return labels.length - 1;
  const i = ORDINALS.findIndex((re) => re.test(a));
  return i >= 0 && i < labels.length ? i : -1;
}

// "+351 912 345 678", "00351…", "912345678" → "351912345678" (WhatsApp wants digits with the country code).
export function waNumber(phone, country = process.env.LAX_COUNTRY_CODE || '351') {
  let p = String(phone).replace(/[^\d+]/g, '');
  if (p.startsWith('00')) p = '+' + p.slice(2);
  if (p.startsWith('+')) return p.slice(1);
  return country + p.replace(/^0/, '');
}

export function waLink(number, text) {
  const qs = [number && `phone=${number}`, text && `text=${encodeURIComponent(text)}`].filter(Boolean); // %20, not +
  return `whatsapp://send?${qs.join('&')}`;
}

const IMAGE = { '.png': 'PNGf', '.jpg': 'JPEG', '.jpeg': 'JPEG', '.gif': 'GIFf', '.tif': 'TIFF', '.tiff': 'TIFF' };
async function copyFile(file) {
  const cls = IMAGE[path.extname(file).toLowerCase()];
  if (cls) await osa(`on run argv\nset the clipboard to (read (POSIX file (item 1 of argv)) as «class ${cls}»)\nend run`, file);
  else await osa(`on run argv\nset the clipboard to (POSIX file (item 1 of argv))\nend run`, file);
}

// share({ file?, text?, to?, app?, contact? }) → { ok, say, line?, ready?, pick?, done? }
//   say    what Lax tells you;  line  the feed line
//   ready  ({ what, who }) the WhatsApp chat holds it, waiting for Enter: Lax asks you on the phone, then finishShare()
//   pick   ({ question, options, contacts }) several contacts match: Lax asks which, then share() again with `contact`
//   check  (WhatsApp search) a screenshot of the chat it opened, to make sure it's the right person before sending
//   done   (share sheet) a promise of 'shared' | 'cancelled' | 'error: …' once you finish on the Mac
export async function share({ file, text, to, app = 'whatsapp', contact } = {}) {
  if (file) {
    file = path.resolve(String(file).replace(/^~(?=\/|$)/, process.env.HOME));
    if (!fs.existsSync(file)) return { ok: false, say: `I can't find ${path.basename(file)}.` };
  }
  if (!file && !text) return { ok: false, say: 'Nothing to share: give me a file or some text.' };
  const what = file ? path.basename(file) : 'text';
  app = String(app || 'whatsapp').toLowerCase();
  if (app !== 'whatsapp') return shareSheet(app, file, text, what);

  let person = contact || null; // { name, phone }
  if (!person && to) {
    let found = [];
    try { found = await findContacts(String(to)); } catch { /* no Contacts access: WhatsApp's own search, below */ }
    const choices = contactChoices(found, to);
    if (!choices.length) return shareBySearch(String(to), file, text, what);
    if (choices.length > 1) {
      const options = choices.slice(0, 6);
      return { ok: true, pick: { question: `Which ${to}?`, options: options.map((c) => c.label), contacts: options },
        say: `${choices.length} contacts match ${to}. I'm asking which one on the phone.` };
    }
    person = choices[0] || null;
  }

  const who = person ? person.name : 'WhatsApp';
  if (file) await copyFile(file);
  await run('open', [waLink(person && waNumber(person.phone), text)]);
  const line = `↗ ${what} → ${who} (WhatsApp, mac)`;

  if (!person) return { ok: true, line, say: `WhatsApp is open${file ? ' with the file on your clipboard: pick the chat and paste' : ''}.` };
  const ready = { what: file ? what : 'the message', who: person.name };
  if (!file) return { ok: true, line, ready, say: `${person.name}'s chat is open with the text typed in. Confirm on the phone, or press Enter.` };

  await sleep(2500); // let WhatsApp open the chat before pasting into it
  try {
    await osa('tell application "WhatsApp" to activate');
    await sleep(400);
    await osa('tell application "System Events" to keystroke "v" using command down');
  } catch {
    return { ok: true, line, say: `${person.name}'s chat is open and the file is on your clipboard. Press Command V, then Enter.` };
  }
  return { ok: true, line, ready, say: `${what} is in ${person.name}'s chat. Confirm on the phone, or press Enter.` };
}

// Keystrokes for WhatsApp Desktop, as one osascript: strings are System Events commands, numbers are pauses (seconds).
export const pressScript = (...steps) => ['tell application "WhatsApp" to activate', ...steps.map((s) =>
  typeof s === 'number' ? `delay ${s}` : `tell application "System Events" to ${s}`)].join('\n');
const PASTE = 'keystroke "v" using command down';
// Where to click in WhatsApp Desktop's window, in points: from its top-left corner, or (negative) its bottom-right.
const SPOTS = { SEARCH: [298, 54], COMPOSER: [-270, -26] };
export function clickIn(spot) {
  const [dx, dy] = SPOTS[spot], at = (d, o, s) => d < 0 ? `${o} + ${s} - ${-d}` : `${o} + ${d}`;
  return `tell application "WhatsApp" to activate\ndelay 0.3\ntell application "System Events" to tell process "WhatsApp"
  set {x, y} to position of front window
  set {w, h} to size of front window
  click at {${at(dx, 'x', 'w')}, ${at(dy, 'y', 'h')}}
end tell`;
}
// Through the clipboard, never typed: keystroke garbles accents ("João"), and the clipboard keeps them as they are.
const copyText = (t) => osa('on run argv\nset the clipboard to (item 1 of argv)\nend run', t);

// Most people live only in WhatsApp (your phone's contacts), not in the Mac's Contacts: then WhatsApp Desktop's own
// search finds the chat. Its first match opens, the text or file goes in, and a screenshot (`check`) lets the session
// see which chat it really is before Lax asks you to send. Nothing is sent here.
async function shareBySearch(to, file, text, what) {
  const line = `↗ ${what} → ${to} (WhatsApp search, mac)`;
  try {
    // The name openChat() read is who Lax asks you about. Then click the message box, paste.
    const found = await openChat(to);
    if (!found) return { ok: false, line, say: `I couldn't find ${to} in WhatsApp. Nothing is in any chat.` };
    to = found;
    if (file) await copyFile(file); else await copyText(text);
    await osa(clickIn('COMPOSER') + '\n' + pressScript(0.4, PASTE, 1));
  } catch (e) {
    return { ok: false, line, say: `I couldn't search WhatsApp for ${to} (${e.message.slice(0, 120)}). Allow Accessibility for me in System Settings, Privacy.` };
  }
  const check = path.join(os.tmpdir(), `lax-share-${Date.now()}.png`);
  await run('screencapture', ['-x', '-o', check]).catch(() => {});
  return { ok: true, line: `↗ ${what} → ${to} (WhatsApp search, mac)`, ready: { what: file ? what : 'the message', who: to },
    ...(fs.existsSync(check) && { check }),
    say: `I found ${to} in WhatsApp and put ${file ? what : 'the message'} in their chat. Confirm on the phone, or press Enter.` };
}

// Opens the chat of someone called `to` through WhatsApp's search; their full name as the chat shows it, or null.
// Keyboard focus in WhatsApp wanders (Cmd+F loses the name, pastes land in the search box, the arrows start from
// whatever was picked last, clicking a result does nothing). So: click the search box and type the name (pasted
// names don't filter), then step through the results with Down + Enter, reading the name at the top of each chat
// that opens, until it's someone called that. Enter here only ever lands in the search results, never in a message box.
export async function openChat(to) {
  await run('open', ['-a', 'WhatsApp']); await sleep(1500); // also brings back a closed window
  await osa(clickIn('SEARCH') + '\n' + pressScript(0.4, 'keystroke "a" using command down', 'key code 51', 0.2,
    `keystroke ${JSON.stringify(to)}`, 2));
  for (const key of [...Array(6).fill(125), ...Array(8).fill(126)]) { // down through the results, then back up
    await osa(pressScript(0.3, `key code ${key}`, 0.4, 'key code 36', 1.2));
    const name = await chatName();
    if (sameName(name, to)) return name;
  }
  return null;
}

// "Rui" is "Rui Pereira 🐼", "joao" is "João": every word said starts a word of the name, accents and case aside.
const plain = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export function sameName(name, said) {
  const words = plain(name).split(/[^\p{L}\d]+/u).filter(Boolean);
  const want = plain(said).split(/[^\p{L}\d]+/u).filter(Boolean);
  return !!want.length && want.every((w) => words.some((x) => x.startsWith(w)));
}

// The name at the top of the open chat, read off the screen (lib/ocr.swift; WhatsApp shows nothing to Accessibility).
async function chatName() {
  const [x, y, w] = (await osa('tell application "System Events" to tell process "WhatsApp" to get {position, size} of front window'))
    .split(/,\s*/).map(Number);
  const shot = path.join(os.tmpdir(), `lax-chat-${Date.now()}.png`);
  await run('screencapture', ['-x', `-R${x + 455},${y + 3},${w - 455 - 130},40`, shot]);
  try { return (await run(await ocrBinary(), [shot])).split('\n')[0] || ''; } finally { fs.rmSync(shot, { force: true }); }
}
const OCR_SRC = new URL('./ocr.swift', import.meta.url).pathname, OCR_BIN = path.join(HOME, 'bin', 'ocr');
async function ocrBinary() {
  const built = fs.existsSync(OCR_BIN) && fs.statSync(OCR_BIN).mtimeMs >= fs.statSync(OCR_SRC).mtimeMs;
  if (!built) { fs.mkdirSync(path.dirname(OCR_BIN), { recursive: true }); await run('swiftc', ['-O', OCR_SRC, '-o', OCR_BIN], 300000); }
  return OCR_BIN;
}

// The share sheet helper, built from lib/share-sheet.swift into ~/.lax/bin the first time (and again when it changes).
const SHEET_SRC = new URL('./share-sheet.swift', import.meta.url).pathname, SHEET_BIN = path.join(HOME, 'bin', 'share-sheet');
async function sheetBinary() {
  const built = fs.existsSync(SHEET_BIN) && fs.statSync(SHEET_BIN).mtimeMs >= fs.statSync(SHEET_SRC).mtimeMs;
  if (!built) { fs.mkdirSync(path.dirname(SHEET_BIN), { recursive: true }); await run('swiftc', ['-O', SHEET_SRC, '-o', SHEET_BIN], 300000); }
  return SHEET_BIN;
}
const SHEET_APPS = { any: 'picker', airdrop: 'airdrop', messages: 'messages', imessage: 'messages', mail: 'mail', email: 'mail' };
async function shareSheet(app, file, text, what) {
  const mode = SHEET_APPS[app];
  if (!mode) return { ok: false, say: `I can share with WhatsApp, AirDrop, Messages or Mail, or open the share menu. Not ${app}.` };
  let bin;
  try { bin = await sheetBinary(); } catch (e) { return { ok: false, say: `I couldn't build the share menu (${e.message.slice(0, 120)}).` }; }
  const done = run(bin, [mode, ...[file, text].filter(Boolean)], 660000).catch((e) => `error: ${e.message}`);
  const where = mode === 'picker' ? 'the share menu' : { airdrop: 'AirDrop', messages: 'Messages', mail: 'Mail' }[mode];
  return { ok: true, done, line: `↗ ${what} → ${where} (mac)`,
    say: mode === 'picker' ? `The share menu is open on the Mac. Pick where ${what} goes.` : `${where} is open on the Mac with ${what}. Finish it there.` };
}

// Your answer to "Send it?": Enter sends what's waiting in the open chat, Escape drops the attachment.
export async function finishShare(send) {
  await osa('tell application "WhatsApp" to activate');
  await sleep(300);
  await osa(`tell application "System Events" to key code ${send ? 36 : 53}`);
}

// The messages showing in the open chat, read off the screen: the window minus the chat list, header and message box.
export async function readChat() {
  const [x, y, w, h] = (await osa('tell application "System Events" to tell process "WhatsApp" to get {position, size} of front window'))
    .split(/,\s*/).map(Number);
  const shot = path.join(os.tmpdir(), `lax-read-${Date.now()}.png`);
  await run('screencapture', ['-x', `-R${x + 455},${y + 60},${w - 455},${h - 60 - 70}`, shot]);
  try { return await run(await ocrBinary(), [shot]); } finally { fs.rmSync(shot, { force: true }); }
}

// For Lax's assistant, which works through commands (lib/allow.mjs lets the first three run without asking you):
//   node lib/share.mjs open  <name>          opens their chat, prints the full name
//   node lib/share.mjs read  <name>          opens it and prints the messages on screen
//   node lib/share.mjs draft <name> <text>   puts the text (or --file <path>) in their message box. Never sends: always
//                                           follow it with `send`, so you approve or decline it on the phone
//   node lib/share.mjs send  <name>          presses Enter in their chat: this one always asks you on the phone first
export const SAFE = ['open', 'read', 'draft'];
async function cli([cmd, to, ...rest]) {
  if (!['open', 'read', 'draft', 'send'].includes(cmd) || !to) throw new Error('usage: node lib/share.mjs open|read|draft|send <name> [text | --file path]');
  if (cmd === 'send') {
    await run('open', ['-a', 'WhatsApp']); await sleep(1500); // its window may have been closed since the draft
    const name = await chatName();
    if (!sameName(name, to)) throw new Error(`The open chat is ${name || 'unknown'}, not ${to}. Nothing sent.`);
    await osa(clickIn('COMPOSER') + '\n' + pressScript(0.3, 'key code 36'));
    return `sent in ${name}'s chat`;
  }
  const name = await openChat(to);
  if (!name) throw new Error(`I couldn't find ${to} in WhatsApp.`);
  if (cmd === 'open') return name;
  if (cmd === 'read') return `${name}\n---\n${await readChat()}`;
  const file = rest[0] === '--file' && path.resolve(String(rest[1] || '').replace(/^~(?=\/|$)/, os.homedir()));
  if (file) { if (!fs.existsSync(file)) throw new Error(`I can't find ${file}.`); await copyFile(file); }
  else if (rest.join(' ').trim()) await copyText(rest.join(' '));
  else throw new Error('Nothing to draft: give some text or --file <path>.');
  // Replaces whatever was already typed there (an earlier draft), so it never goes out twice.
  await osa(clickIn('COMPOSER') + '\n' + pressScript(0.4, 'keystroke "a" using command down', 'key code 51', 0.2, PASTE, 1));
  // Every draft ends with a send, which asks you on the phone: you approve it there, or decline and it stays a draft.
  return `drafted in ${name}'s chat, not sent. Now run: node ${new URL(import.meta.url).pathname} send ${JSON.stringify(name)}`;
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === new URL(import.meta.url).pathname)
  cli(process.argv.slice(2)).then((out) => console.log(out), (e) => { console.error(e.message); process.exit(1); });
