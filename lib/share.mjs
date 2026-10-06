// Sharing on the Mac: get a file or text into a WhatsApp Desktop chat, ready to send. Lax only sends once you say so
// (the Send button on the phone, or Enter on the Mac).
// Contacts come from macOS Contacts (osascript asks for access once). Files go in by clipboard + Cmd+V (System Events,
// asks for Accessibility once); if the paste is refused, the file stays on the clipboard and Lax says so.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

const run = (cmd, args, timeout = 15000) => new Promise((resolve, reject) =>
  execFile(cmd, args, { timeout }, (err, stdout, stderr) => err ? reject(new Error((stderr || err.message).trim())) : resolve(stdout.trim())));
const osa = (script, ...args) => run('osascript', ['-e', script, ...args]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// "Veralicious" → people whose name or nickname contains it, with their phone numbers.
export async function findContacts(name) {
  // One `whose` query, read in bulk: asking person by person is an Apple Event each, far too slow for a real address book.
  // The long timeout covers the first run, when macOS asks for Contacts access.
  const out = await run('osascript', ['-l', 'JavaScript', '-e', `function run([q]) {
    const ps = Application('Contacts').people.whose({ _or: [{ name: { _contains: q } }, { nickname: { _contains: q } }] });
    const names = ps.name(), nicks = ps.nickname(), phones = ps.phones.value();
    return JSON.stringify(names.map((name, i) => ({ name, nickname: nicks[i] || '', phones: phones[i] || [] })));
  }`, name], 90000);
  return JSON.parse(out || '[]').filter((p) => p.phones.length);
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

// share({ file?, text?, to? }) → { ok, say, line, ready }. `say` is what Lax tells you; `line` goes in the feed;
// `ready` ({ what, who }) when the chat holds it, waiting for Enter: Lax asks you on the phone, then finishShare().
export async function share({ file, text, to } = {}) {
  if (file) {
    file = path.resolve(String(file).replace(/^~(?=\/|$)/, process.env.HOME));
    if (!fs.existsSync(file)) return { ok: false, say: `I can't find ${path.basename(file)}.` };
  }
  if (!file && !text) return { ok: false, say: 'Nothing to share: give me a file or some text.' };

  let person = null;
  if (to) {
    let found;
    try { found = await findContacts(String(to)); }
    catch (e) { return { ok: false, say: `I couldn't read your contacts (${e.message}). Allow Contacts access for the terminal in System Settings, Privacy.` }; }
    if (found.length > 1) {
      const exact = found.filter((p) => [p.name, p.nickname].some((s) => s.toLowerCase() === String(to).toLowerCase()));
      if (exact.length === 1) found = exact;
      else return { ok: false, choices: found.map((p) => p.name), say: `${found.length} contacts match ${to}: ${found.map((p) => p.name).join(', ')}. Which one?` };
    }
    person = found[0] || null;
  }

  const what = file ? path.basename(file) : 'text';
  const who = person ? person.name : 'WhatsApp';
  if (file) await copyFile(file);
  await run('open', [waLink(person && waNumber(person.phones[0]), text)]);
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

// Your answer to "Send it?": Enter sends what's waiting in the open chat, Escape drops the attachment.
export async function finishShare(send) {
  await osa('tell application "WhatsApp" to activate');
  await sleep(300);
  await osa(`tell application "System Events" to key code ${send ? 36 : 53}`);
}
