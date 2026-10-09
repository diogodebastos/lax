// Where Lax itself lives. The repo is only Lax's body (code); everything that makes your Lax yours is here:
//   ~/.lax/
//     mind/          what Lax knows: the assistant's working folder, CLAUDE.md (who Lax is, its body, notes about you). Git-tracked.
//     life.db        what Lax has lived: vitals (XP, level, stats), milestones, the journal of every session it saw.
//                    Rebirth wipes it. The server owns it; the assistant never opens it.
//     settings.json  your preferences for it (name, voice, theme…). Kept on rebirth.
//     secrets/   token, env.json, tunnel-token… (0700). Off limits to the assistant.
//     logs/      server.log, tunnel.log
//     archive/transcripts/  every Claude Code transcript, kept past Claude Code's 30 days, secrets scrubbed (lib/archive.mjs)
// LAX_HOME moves it (tests use a throwaway one); LAX_DATA is the old name, still honoured.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const HOME = path.resolve(process.env.LAX_HOME || process.env.LAX_DATA || path.join(os.homedir(), '.lax'));
export const MIND = path.join(HOME, 'mind');
export const SECRETS = path.join(HOME, 'secrets');
export const LOGS = path.join(HOME, 'logs');
export const DB = path.join(HOME, 'life.db');
export const SETTINGS = path.join(HOME, 'settings.json');
export const ARCHIVE = path.join(HOME, 'archive', 'transcripts');
export const OLD_DB = path.join(HOME, 'lax.db'); // before life.db
export const secret = (name) => path.join(SECRETS, name);

export function ensureDirs() {
  for (const d of [HOME, MIND, LOGS]) fs.mkdirSync(d, { recursive: true });
  fs.mkdirSync(SECRETS, { recursive: true, mode: 0o700 }); fs.chmodSync(SECRETS, 0o700);
}
/** The Lax token (null if Lax hasn't run yet). */
export const readToken = () => { try { return fs.readFileSync(secret('token'), 'utf8').trim(); } catch { return null; } };
/** Local config: { LAX_PUBLIC_URL, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET, … } */
export const readEnv = () => { try { return JSON.parse(fs.readFileSync(secret('env.json'), 'utf8')); } catch { return {}; } };
