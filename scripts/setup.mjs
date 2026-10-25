// Setting up a Lax (Phase 9). `npm run setup` checks Node and Claude Code, then opens a Claude Code conversation in this
// clone that sets Lax up with you, step by step (scripts/setup.md is what it's told). The steps are here, each one safe
// to run again:
//   node scripts/setup.mjs status         what's done, what's left (--json for the conversation)
//   node scripts/setup.mjs <step>         deps, workdir [<folder>], hooks, channel, service, whisper, relay [<name>], android, domain, pair
//   node scripts/setup.mjs --all          every step but whisper, in order, without the conversation
//   node scripts/setup.mjs doctor [--fix] npm run doctor: is it all working? (--fix: secrets' permissions)
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { HOME, MIND, SECRETS, secret, readEnv, readToken, ensureDirs } from '../lib/paths.mjs';
import { BIN as WHISPER, MODEL as WHISPER_MODEL } from '../lib/whisper.mjs';
import { SDK, jdkHome } from './android-tools.mjs';
import { EVENTS } from '../hooks/timeouts.mjs';
import { SERVER, serviceFile, restartArgs } from '../lib/service.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MACHINE = process.platform === 'darwin' ? 'Mac' : 'computer';
const PORT = Number(process.env.LAX_PORT || 7777), LAX = `http://127.0.0.1:${PORT}`;
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
// Only this clone's service: a second clone on the same Mac never restarts the first's Lax.
const restart = () => { if (!read(serviceFile(SERVER)).includes(`${ROOT}/`)) return false; try { const [c, ...a] = restartArgs(); sh(c, a); return true; } catch { return false; } };

// ---------- what's done ----------
// Lax's hooks in ~/.claude/settings.json: this clone's, on every event, with today's timeouts (hooks/timeouts.mjs).
function hooksState(text) {
  let hooks = {}; try { hooks = JSON.parse(text).hooks || {}; } catch {}
  const mine = path.join(ROOT, 'hooks', 'lax-hook.mjs'), found = (ev) => (hooks[ev] || []).flatMap((g) => g.hooks || []).find((h) => String(h.command).includes(mine));
  const missing = Object.keys(EVENTS).filter((ev) => !found(ev)), old = Object.keys(EVENTS).filter((ev) => found(ev) && found(ev).timeout !== EVENTS[ev]);
  return missing.length === Object.keys(EVENTS).length ? { ok: false, detail: 'Claude Code tells Lax what every session does' }
    : missing.length || old.length ? { ok: false, detail: `installed, but ${missing.length ? `missing ${missing.join(', ')}` : `with old timeouts (${old.join(', ')})`}: npm run install-hooks` }
    : { ok: true, detail: 'Claude Code tells Lax what every session does' };
}

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
    hooks: hooksState(settings),
    channel: { ok: read(path.join(os.homedir(), '.local', 'bin', 'lax')).includes(ROOT), detail: '`lax`, `/lax`, and the channel that lets you talk into a session' },
    service: { ok: read(serviceFile(SERVER)).includes(ROOT) && await healthy(1500), detail: 'Lax runs in the background, from login' },
    home: { ok: fs.existsSync(path.join(MIND, 'CLAUDE.md')), detail: HOME },
    whisper: { ok: fs.existsSync(WHISPER) && fs.existsSync(WHISPER_MODEL), detail: `optional: better hearing, on the ${MACHINE} (~600 MB)` },
    android: { ok: !!jdkHome() && fs.existsSync(path.join(SDK, 'platform-tools')), detail: 'optional: what building the Android app needs (~1 GB, no Homebrew)' },
    relay: { ok: !!relayUrl && !!read(secret('relay-key')), detail: relayUrl || 'the phone reaches Lax through your own Worker (a free Cloudflare account)' },
    phone: { ok: !!env.LAX_PUBLIC_URL, detail: env.LAX_PUBLIC_URL ? `pairs through ${env.LAX_PUBLIC_URL}` : `on this ${MACHINE} only, at localhost` },
  };
}

// ---------- npm run doctor: what's set up, and does it work ----------
async function doctor(fix) {
  const s = await status(), env = readEnv(), token = readToken(), checks = [];
  const add = (name, ok, detail, needed = true) => checks.push({ name, ok, detail, needed });
  for (const k of ['node', 'claude', 'deps', 'hooks', 'service', 'home']) add(k, s[k].ok, s[k].detail);
  add('channel', s.channel.ok, s.channel.detail, false);
  add('mind', fs.existsSync(path.join(MIND, '.git')), `${MIND}, with its history`);
  // Secrets: the folder 0700, every file 0600 (lib/paths.mjs). --fix tightens them.
  const loose = [];
  if (fs.existsSync(SECRETS)) {
    if ((fs.statSync(SECRETS).mode & 0o777) !== 0o700) loose.push(SECRETS);
    for (const f of fs.readdirSync(SECRETS)) { const p = path.join(SECRETS, f); if (fs.statSync(p).isFile() && fs.statSync(p).mode & 0o077) loose.push(p); }
  }
  if (fix) for (const p of loose) fs.chmodSync(p, p === SECRETS ? 0o700 : 0o600);
  add('secrets', fix || !loose.length, loose.length ? `${fix ? 'tightened' : 'readable by others (npm run doctor -- --fix)'}: ${loose.map((p) => path.basename(p)).join(', ')}` : 'only yours (0700, files 0600)');
  // The ways in, end to end: the page answers with the token.
  const reach = async (url, headers = {}) => { try { return (await fetch(`${url}/?t=${token}`, { headers, signal: AbortSignal.timeout(10000) })).status; } catch (e) { return e.cause?.code || e.message; } };
  if (env.LAX_RELAY_URL) { const r = await reach(env.LAX_RELAY_URL); add('relay', r === 200, r === 200 ? env.LAX_RELAY_URL : r === 503 ? `deployed, but the ${MACHINE} is not linked (is Lax running? see its log)` : `${env.LAX_RELAY_URL}: ${r}`); }
  if (env.LAX_PUBLIC_URL && env.LAX_PUBLIC_URL !== env.LAX_RELAY_URL) {
    const r = await reach(env.LAX_PUBLIC_URL, env.CF_ACCESS_CLIENT_ID ? { 'CF-Access-Client-Id': env.CF_ACCESS_CLIENT_ID, 'CF-Access-Client-Secret': env.CF_ACCESS_CLIENT_SECRET } : {});
    add('tunnel', r === 200, r === 200 ? env.LAX_PUBLIC_URL : `${env.LAX_PUBLIC_URL}: ${r}`);
  }
  if (!env.LAX_PUBLIC_URL) add('phone', false, 'no way in from a phone yet (node scripts/setup.mjs relay)', false);
  if (s.whisper.ok) { let ok = false; try { ok = (await (await fetch(`http://127.0.0.1:${PORT + 1}/health`, { signal: AbortSignal.timeout(3000) })).json()).status === 'ok'; } catch {} add('whisper', ok, ok ? `hearing on the ${MACHINE}` : 'set up, but not answering (it starts with Lax)', false); }
  for (const c of checks) say(`${c.ok ? '✓' : c.needed ? '✗' : '·'} ${c.name.padEnd(8)} ${c.detail}`);
  const bad = checks.filter((c) => c.needed && !c.ok);
  say(bad.length ? `\n${bad.length} thing${bad.length > 1 ? 's' : ''} to fix.` : '\nAll good.');
  return bad.length ? 1 : 0;
}

// ---------- the steps ----------
// node-pty has no Linux prebuild, so npm install compiles it; without these it fails and the whole install with it.
// A PATH scan, not `which`: minimal Fedora has none.
function toolchain() {
  if (process.platform !== 'linux') return;
  const need = ['make', 'g++', 'python3'].filter((t) => !(process.env.PATH || '').split(':').some((d) => d && fs.existsSync(path.join(d, t))));
  if (!need.length) return;
  const rel = (read('/etc/os-release').match(/^(ID|ID_LIKE)=.*$/gm) || []).join(' ');
  const apt = 'sudo apt install build-essential python3', dnf = 'sudo dnf install gcc-c++ make python3';
  const cmd = /fedora|rhel|centos/.test(rel) ? dnf : /debian|ubuntu/.test(rel) ? apt : `${apt}   (or: ${dnf})`;
  console.error(`Lax compiles one part of itself (node-pty) and needs ${need.join(', ')} for it. Install them, then run this again:\n  ${cmd}`);
  process.exit(1);
}

const STEPS = {
  deps() { if (!fs.existsSync(path.join(ROOT, 'node_modules', 'node-pty'))) { toolchain(); run('npm', ['install']); } say('deps: installed'); },
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
  android(...a) { node('android-tools.mjs', ...a); }, // --accept-licenses: Google's SDK licenses, once you've said yes
  domain(...a) { node('domain.mjs', ...a); }, // link | <host> <email> [--token-from-clipboard]: your own domain, behind Access
  async relay(name) {
    // Logged in to Cloudflare (a browser window, once), the Worker deployed on workers.dev, its key on both ends.
    // Its name is lax-relay unless given (a second Lax on the same account needs its own, or it takes over the first's).
    name = name || process.env.LAX_RELAY_NAME || readEnv().LAX_RELAY_NAME || 'lax-relay';
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(name)) throw new Error(`${name} can't be a Worker's name (lowercase letters, digits and -)`);
    const config = ['--config', path.join(ROOT, 'relay', 'wrangler.jsonc'), '--name', name];
    let who = ''; try { who = wrangler(['whoami']); } catch (e) { who = String(e.stdout || ''); }
    if (/not authenticated|not logged in/i.test(who)) { say('relay: logging in to Cloudflare in your browser…'); run('npx', ['-y', 'wrangler@4', 'login']); }
    say('relay: deploying the Worker…');
    node('demo.mjs'); // its public face's pages (demo/dist), from this clone's last commit
    let out = '';
    try { out = wrangler(['deploy', ...config]); }
    catch (e) {
      out = `${e.stdout || ''}${e.stderr || ''}`;
      if (/workers\.dev subdomain/i.test(out)) throw new Error('your account has no workers.dev subdomain yet: Cloudflare dashboard → Workers & Pages → pick one, then run this again');
      if (/more than one account|multiple accounts/i.test(out)) throw new Error('several Cloudflare accounts: run again with CLOUDFLARE_ACCOUNT_ID=<the one> (see `npx wrangler whoami`)');
      throw new Error(out.trim().split('\n').slice(-5).join('\n'));
    }
    const url = new RegExp(`https://${name}\\.[a-z0-9-]+\\.workers\\.dev`, 'i').exec(out)?.[0];
    if (!url) throw new Error('deployed, but its workers.dev address was not in wrangler\'s output:\n' + out.slice(-500));
    if (!read(secret('relay-key'))) { ensureDirs(); fs.writeFileSync(secret('relay-key'), crypto.randomBytes(24).toString('hex'), { mode: 0o600 }); }
    const env = readEnv(), put = (key, value) => wrangler(['secret', 'put', key, ...config], { input: value, stdio: ['pipe', 'pipe', 'pipe'] });
    put('RELAY_KEY', read(secret('relay-key')));
    // Its public face: with your own domain's demo (LAX_DEMO_ROUTE), the relay's /demo goes there; without, the relay
    // keeps Lax's mind itself, pushed by the Mac with its mind key.
    if (env.LAX_DEMO_ROUTE && env.LAX_PUBLIC_URL) put('PUBLIC_HOME', new URL(env.LAX_PUBLIC_URL).origin);
    else {
      if (!read(secret('mind-key'))) { ensureDirs(); fs.writeFileSync(secret('mind-key'), crypto.randomBytes(24).toString('hex'), { mode: 0o600 }); }
      put('MIND_KEY', read(secret('mind-key')));
    }
    setEnv({ LAX_RELAY_URL: url, LAX_RELAY_NAME: name === 'lax-relay' ? null : name, LAX_PUBLIC_URL: env.LAX_PUBLIC_URL || url }); // a Lax with its own domain keeps pairing there
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
    // xdg-open detached and without pipes: the browser it starts inherits them, and setup would wait on it.
    if (process.platform === 'linux') spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
    else try { sh('open', [url]); } catch {}
    say(`pair: ${url} (opened in your browser). Scan the QR with the phone, or open Lax right here: http://localhost:${PORT}/?t=…`);
  },
};

// ---------- npm run setup ----------
const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'status') {
  const s = await status();
  if (rest.includes('--json')) say(JSON.stringify(s, null, 2));
  else for (const [k, v] of Object.entries(s)) say(`${v.ok ? '✓' : '·'} ${k.padEnd(8)} ${v.detail}`);
} else if (cmd === 'doctor') {
  process.exit(await doctor(rest.includes('--fix')));
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
