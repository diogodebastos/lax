// Sharing (lib/share.mjs): WhatsApp numbers and links, who "Rita" means, and picking one by voice.
import { waNumber, waLink, contactChoices, pickOption, pressScript, sameName, chipIs } from '../lib/share.mjs';

let failed = 0;
const check = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`); if (!ok) failed++; };

check('numbers: +, 00 and local all become digits with the country code',
  ['+351 912 345 678', '00351912345678', '912 345 678', '+44 7700 900123'].map((n) => waNumber(n, '351')),
  ['351912345678', '351912345678', '351912345678', '447700900123']);
check('link: spaces as %20, not +', waLink('351912345678', 'hi there & you'), 'whatsapp://send?phone=351912345678&text=hi%20there%20%26%20you');
check('link without a contact', waLink(null, 'hi'), 'whatsapp://send?text=hi');

const silva = { name: 'Rita Silva', nickname: '', phones: [{ value: '+351 911 111 111', label: 'mobile' }] };
const costa = { name: 'Rita Costa', nickname: 'Ritalicious', phones: [{ value: '912 345 678', label: 'mobile' }, { value: '213 456 123', label: 'work' }] };
check('one person, one number: no question', contactChoices([silva], 'rita').map((c) => c.label), ['Rita Silva']);
check('several: one choice per number, told apart', contactChoices([silva, costa], 'rita').map((c) => c.label),
  ['Rita Silva', 'Rita Costa (mobile …678)', 'Rita Costa (work …123)']);
check('a nickname said exactly wins over the rest', contactChoices([silva, costa], 'ritalicious').map((c) => c.name), ['Rita Costa', 'Rita Costa']);

const L = ['Rita Silva', 'Rita Costa (mobile …678)', 'Rita Costa (work …123)'];
for (const [said, want] of [['Rita Silva', 0], ['silva', 0], ['Rita Costa (work …123)', 2], ['the second one', 1], ['the work one', 2],
  ['mobile', 1], ['the last one', 2], ['2', 1], ['first', 0], ['Costa work', 2]]) check(`"${said}" picks ${L[want]}`, pickOption(L, said), want);
check('a nickname picks its person', pickOption(['Rita Silva', 'Rita Costa'], 'Ritalicious', ['', 'Ritalicious']), 1);
check('a misheard nickname still does', pickOption(['Rita Silva', 'Rita Costa'], 'Ritolicious', ['', 'Ritalicious']), 1);
check('a misheard surname too', pickOption(['Rita Silva', 'Rita Costa'], 'Rita Kosta', ['', '']), 1);
check('short words must be exact: "Rito" is no one', pickOption(['Rita Silva', 'Rita Costa'], 'Rito', ['', '']), -1);
check('"Costa" alone is two people: no pick', pickOption(L, 'Costa'), -1);
check('nonsense: no pick', pickOption(L, 'banana'), -1);
check('nothing said: no pick', pickOption(L, ''), -1);

check('a chat named like what was said: first names, accents, emoji', ['Rui Pereira 🐼', 'João Luz', 'Nuno Ramos ACME', 'Rui Castro']
  .map((n) => [sameName(n, 'Rui'), sameName(n, 'joao'), sameName(n, 'nuno ramos'), sameName(n, 'Rui Pereira')]),
  [[true, false, false, true], [false, true, false, false], [false, false, true, false], [true, false, false, false]]);
check('nothing said is no one', sameName('Rui', ''), false);
check('file preview chip: short or full name, either way', [chipIs(['You'], '+351 900 000 000 (You)'), chipIs(['Inês Sá Brandão'], 'Inês'),
  chipIs(['Inês'], 'Inês Sá Brandão'), chipIs(['made by Lax', 'Rita'], 'Inês Sá Brandão'), chipIs([], 'Rita')], [true, true, true, false, false]);
check('WhatsApp keystrokes: activate first, numbers are pauses', pressScript(0.3, 'keystroke "v" using command down').split('\n'),
  ['tell application "WhatsApp" to activate', 'delay 0.3', 'tell application "System Events" to keystroke "v" using command down']);

if (failed) { console.log(`\n${failed} share check(s) failed`); process.exit(1); }
console.log('\nall share checks passed');
