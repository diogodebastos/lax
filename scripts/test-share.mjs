// Sharing (lib/share.mjs): WhatsApp numbers and links, who "Vera" means, and picking one by voice.
import { waNumber, waLink, contactChoices, pickOption } from '../lib/share.mjs';

let failed = 0;
const check = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`); if (!ok) failed++; };

check('numbers: +, 00 and local all become digits with the country code',
  ['+351 912 345 678', '00351912345678', '912 345 678', '+44 7700 900123'].map((n) => waNumber(n, '351')),
  ['351912345678', '351912345678', '351912345678', '447700900123']);
check('link: spaces as %20, not +', waLink('351912345678', 'hi there & you'), 'whatsapp://send?phone=351912345678&text=hi%20there%20%26%20you');
check('link without a contact', waLink(null, 'hi'), 'whatsapp://send?text=hi');

const silva = { name: 'Vera Silva', nickname: '', phones: [{ value: '+351 911 111 111', label: 'mobile' }] };
const costa = { name: 'Vera Costa', nickname: 'Veralicious', phones: [{ value: '912 345 678', label: 'mobile' }, { value: '213 456 123', label: 'work' }] };
check('one person, one number: no question', contactChoices([silva], 'vera').map((c) => c.label), ['Vera Silva']);
check('several: one choice per number, told apart', contactChoices([silva, costa], 'vera').map((c) => c.label),
  ['Vera Silva', 'Vera Costa (mobile …678)', 'Vera Costa (work …123)']);
check('a nickname said exactly wins over the rest', contactChoices([silva, costa], 'veralicious').map((c) => c.name), ['Vera Costa', 'Vera Costa']);

const L = ['Vera Silva', 'Vera Costa (mobile …678)', 'Vera Costa (work …123)'];
for (const [said, want] of [['Vera Silva', 0], ['silva', 0], ['Vera Costa (work …123)', 2], ['the second one', 1], ['the work one', 2],
  ['mobile', 1], ['the last one', 2], ['2', 1], ['first', 0], ['Costa work', 2]]) check(`"${said}" picks ${L[want]}`, pickOption(L, said), want);
check('a nickname picks its person', pickOption(['Vera Silva', 'Vera Costa'], 'Veralicious', ['', 'Veralicious']), 1);
check('a misheard nickname still does', pickOption(['Vera Silva', 'Vera Costa'], 'Verilicious', ['', 'Veralicious']), 1);
check('a misheard surname too', pickOption(['Vera Silva', 'Vera Costa'], 'Vera Kosta', ['', '']), 1);
check('short words must be exact: "Vero" is no one', pickOption(['Vera Silva', 'Vera Costa'], 'Vero', ['', '']), -1);
check('"Costa" alone is two people: no pick', pickOption(L, 'Costa'), -1);
check('nonsense: no pick', pickOption(L, 'banana'), -1);
check('nothing said: no pick', pickOption(L, ''), -1);

if (failed) { console.log(`\n${failed} share check(s) failed`); process.exit(1); }
console.log('\nall share checks passed');
