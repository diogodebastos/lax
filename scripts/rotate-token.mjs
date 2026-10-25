// npm run rotate-token: a new Lax token. Every link with the old one stops working (401): the phone pairs again.
// Lax restarts to take it; hooks, `lax` sessions and `lax watch` read the token as they go, so they carry on.
//   npm run rotate-token [-- --no-restart]
// Through the relay, a phone still trying the old link gets refused for a while after 20 tries (relay/worker.mjs), so
// pair again right away.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { secret, ensureDirs } from '../lib/paths.mjs';
import { restartArgs } from '../lib/service.mjs';

ensureDirs();
const file = secret('token');
fs.writeFileSync(file + '.new', crypto.randomBytes(12).toString('hex'), { mode: 0o600 });
fs.renameSync(file + '.new', file); // never half written
console.log('New token written. Old links now get 401.');
const PORT = Number(process.env.LAX_PORT || 7777);
if (!process.argv.includes('--no-restart')) {
  try { const [c, ...a] = restartArgs(); execFileSync(c, a, { stdio: 'ignore' }); console.log('Lax restarted with it.'); }
  catch { console.log('Restart Lax to use it (it reads the token when it starts).'); }
}
console.log(`Pair the phone again: http://localhost:${PORT}/pair (the app: scan its QR, or npm run android -- --pair).`);
