// Sharing on the Mac. To a WhatsApp chat (the default): the file or text goes into the contact's chat in WhatsApp Desktop,
// and Lax only sends once you say so (the Send button on the phone, or Enter on the Mac). To any other app: the macOS
// share sheet (lib/share-sheet.swift), where you pick the app, or straight to AirDrop, Messages or Mail.
// Contacts come from macOS Contacts (osascript asks for access once). Files go in by clipboard + Cmd+V (System Events,
// asks for Accessibility once); if the paste is refused, the file stays on the clipboard and Lax says so.
import fs from 'node:fs';
import path from 'node:path';
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
    let found;
    try { found = await findContacts(String(to)); }
    catch (e) { return { ok: false, say: `I couldn't read your contacts (${e.message}). Allow Contacts access for the terminal in System Settings, Privacy.` }; }
    const choices = contactChoices(found, to);
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

  if (!person) {
    return { ok: true, line, say: to
      ? `I couldn't find ${to} in your contacts. WhatsApp is open${file ? ' with the file on your clipboard: pick the chat and paste' : ''}.`
      : `WhatsApp is open${file ? ' with the file on your clipboard: pick the chat and paste' : ''}.` };
  }
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
