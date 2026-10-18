// Setting up a Lax (Phase 9). `npm run setup` checks Node and Claude Code, then opens a Claude Code conversation in this
// clone that sets Lax up with you, step by step (scripts/setup.md is what it's told). The steps are here, each one safe
// to run again:
//   node scripts/setup.mjs status         what's done, what's left (--json for the conversation)
//   node scripts/setup.mjs <step>         deps, workdir [<folder>], hooks, channel, service, whisper, relay, pair
//   node scripts/setup.mjs --all          every step but whisper, in order, without the conversation
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { HOME, MIND, secret, readEnv, readToken, ensureDirs } from '../lib/paths.mjs';
import { BIN as WHISPER, MODEL as WHISPER_MODEL } from '../lib/whisper.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = Number(process.env.LAX_PORT || 7777), LAX = `http://127.0.0.1:${PORT}`;
const AGENTS = path.join(os.homedir(), 'Library', 'LaunchAgents'), SERVICE = 'digi-lax.server';
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
const node = (script, ...args) => run(process.execPath, ['--no-warnings', path.join(ROOT, 'scripts', script), ...args]);
const wrangler = (args, opts) => sh('npx', ['-y', 'wrangler@4', ...args], { cwd: ROOT, ...opts });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (s) => console.log(s);

function setEnv(changes) { // ~/.lax/secrets/env.json: Lax's local config (lib/auth.mjs loads it)
  ensureDirs();
  const env = { ...readEnv(), ...changes };
  for (const [k, v] of Object.entries(env)) if (v == null) delete env[k];
  fs.writeFileSync(secret('env.json'), JSON.stringify(env, null, 2) + '\n', { mode: 0o600 }); fs.chmodSync(secret('env.json'), 0o600);
}
async function healthy(wait = 20e3) {
  for (const end = Date.now() + wait; Date.now() < end; await sleep(500)) {
    try { if ((await (await fetch(`${LAX}/api/health`, { signal: AbortSignal.timeout(2000) })).json()).ok) return true; } catch {}
  }
  return false;
}
const restart = () => { try { sh('launchctl', ['kickstart', '-k', `gui/${process.getuid()}/${SERVICE}`]); return true; } catch { return false; } };

// ---------- what's done ----------
const nodeOk = () => { const [a, b] = process.versions.node.split('.').map(Number); return a > 22 || (a === 22 && b >= 13); };
const claudeVersion = () => { try { return sh('claude', ['--version']).trim(); } catch { return ''; } };
async function status() {
  const env = readEnv(), settings = read(path.join(os.homedir(), '.claude', 'settings.json'));
  const relayUrl = env.LAX_RELAY_URL || '';
  return {
    node: { ok: nodeOk(), detail: process.versions.node, need: '22.13 or newer' },
    claude: { ok: !!claudeVersion(), detail: claudeVersion() || 'not found', need: 'Claude Code, logged in' },
    deps: { ok: fs.existsSync(path.join(ROOT, 'node_modules', 'node-pty')), detail: 'npm install' },
    workdir: { ok: !!env.LAX_WORKDIR, detail: env.LAX_WORKDIR || `not chosen (would be ${path.dirname(ROOT)})` },
    hooks: { ok: settings.includes(path.join(ROOT, 'hooks', 'lax-hook.mjs')), detail: 'Claude Code tells Lax what every session does' },
    channel: { ok: read(path.join(os.homedir(), '.local', 'bin', 'lax')).includes(ROOT), detail: '`lax`, `/lax`, and the channel that lets you talk into a session' },
    service: { ok: read(path.join(AGENTS, `${SERVICE}.plist`)).includes(ROOT) && await healthy(1500), detail: 'Lax runs in the background, from login' },
    home: { ok: fs.existsSync(path.join(MIND, 'CLAUDE.md')), detail: HOME },
    whisper: { ok: fs.existsSync(WHISPER) && fs.existsSync(WHISPER_MODEL), detail: 'optional: better hearing, on the Mac (~600 MB)' },
    relay: { ok: !!relayUrl && !!read(secret('relay-key')), detail: relayUrl || 'the phone reaches Lax through your own Worker (a free Cloudflare account)' },
    phone: { ok: !!env.LAX_PUBLIC_URL, detail: env.LAX_PUBLIC_URL ? `pairs through ${env.LAX_PUBLIC_URL}` : 'on this Mac only, at localhost' },
  };
}

// ---------- the steps ----------
const STEPS = {
  deps() { if (!fs.existsSync(path.join(ROOT, 'node_modules', 'node-pty'))) run('npm', ['install']); say('deps: installed'); },
  workdir(dir) {
    const d = path.resolve(dir ? dir.replace(/^~(?=$|\/)/, os.homedir()) : path.dirname(ROOT));
    if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) throw new Error(`${d} is not a folder`);
    setEnv({ LAX_WORKDIR: d }); say(`workdir: ${d} (Lax reads your projects there; editing needs your yes)`);
  },
  hooks() { node('install-hooks.mjs'); },
  channel() { node('install-channel.mjs'); },
  async service() {
    node('install-launchd.mjs');
    say(await healthy() ? `service: Lax is awake on ${LAX}` : 'service: Lax did not answer yet; see ~/.lax/logs/server.log');
  },
  whisper() { node('whisper.mjs'); if (restart()) say('whisper: Lax restarted to use it'); },
  async relay() {
    // Logged in to Cloudflare (a browser window, once), the Worker deployed on workers.dev, its key on both ends.
    let who = ''; try { who = wrangler(['whoami']); } catch (e) { who = String(e.stdout || ''); }
    if (/not authenticated|not logged in/i.test(who)) { say('relay: logging in to Cloudflare in your browser…'); run('npx', ['-y', 'wrangler@4', 'login']); }
    say('relay: deploying the Worker…');
    let out = '';
    try { out = wrangler(['deploy', '--config', path.join(ROOT, 'relay', 'wrangler.jsonc')]); }
    catch (e) {
      out = `${e.stdout || ''}${e.stderr || ''}`;
      if (/workers\.dev subdomain/i.test(out)) throw new Error('your account has no workers.dev subdomain yet: Cloudflare dashboard → Workers & Pages → pick one, then run this again');
      if (/more than one account|multiple accounts/i.test(out)) throw new Error('several Cloudflare accounts: run again with CLOUDFLARE_ACCOUNT_ID=<the one> (see `npx wrangler whoami`)');
      throw new Error(out.trim().split('\n').slice(-5).join('\n'));
    }
    const url = /https:\/\/lax-relay\.[a-z0-9-]+\.workers\.dev/i.exec(out)?.[0];
    if (!url) throw new Error('deployed, but its workers.dev address was not in wrangler\'s output:\n' + out.slice(-500));
    if (!read(secret('relay-key'))) { ensureDirs(); fs.writeFileSync(secret('relay-key'), execFileSync('openssl', ['rand', '-hex', '24'], { encoding: 'utf8' }).trim(), { mode: 0o600 }); }
    wrangler(['secret', 'put', 'RELAY_KEY', '--config', path.join(ROOT, 'relay', 'wrangler.jsonc')], { input: read(secret('relay-key')), stdio: ['pipe', 'pipe', 'pipe'] });
    const env = readEnv();
    setEnv({ LAX_RELAY_URL: url, LAX_PUBLIC_URL: env.LAX_PUBLIC_URL || url }); // a Lax with its own domain keeps pairing there
    say(`relay: ${url}`);
    if (!restart()) return say('relay: start Lax (`node scripts/setup.mjs service`) and it links');
    await healthy();
    for (let i = 0; i < 20; i++) {
      try { if ((await fetch(`${url}/?t=${readToken()}`, { signal: AbortSignal.timeout(5000) })).status === 200) return say('relay: Lax answers through it'); } catch {}
      await sleep(1000);
    }
    say('relay: deployed, but Lax does not answer through it yet; see ~/.lax/logs/server.log');
  },
  pair() {
    const url = `http://localhost:${PORT}/pair`;
    try { sh('open', [url]); } catch {}
    say(`pair: ${url} (opened in your browser). Scan the QR with the phone, or open Lax right here: http://localhost:${PORT}/?t=…`);
  },
};

// ---------- npm run setup ----------
const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'status') {
  const s = await status();
  if (rest.includes('--json')) say(JSON.stringify(s, null, 2));
  else for (const [k, v] of Object.entries(s)) say(`${v.ok ? '✓' : '·'} ${k.padEnd(8)} ${v.detail}`);
} else if (cmd === '--all') {
  for (const k of ['deps', 'workdir', 'hooks', 'channel', 'service', 'relay', 'pair']) await STEPS[k]();
} else if (STEPS[cmd]) {
  try { await STEPS[cmd](...rest); } catch (e) { console.error(`${cmd}: ${e.message}`); process.exit(1); }
} else if (!cmd) {
  if (!nodeOk()) { console.error(`Lax needs Node 22.13 or newer (this is ${process.versions.node}).`); process.exit(1); }
  if (!claudeVersion()) { console.error('Lax needs Claude Code: https://claude.com/claude-code, then log in once with `claude`.'); process.exit(1); }
  STEPS.deps();
  say('\nLax sets itself up with you now, in a Claude Code conversation.\n');
  const r = spawnSync('claude', ['Set me up.', '--append-system-prompt', read(path.join(ROOT, 'scripts', 'setup.md')),
    '--allowedTools', 'Bash(node scripts/setup.mjs:*)', 'Read'], { cwd: ROOT, stdio: 'inherit' });
  process.exit(r.status ?? 0);
} else {
  console.error(`unknown step: ${cmd}. Steps: status, ${Object.keys(STEPS).join(', ')}, --all`); process.exit(1);
}
