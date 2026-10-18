// Your own domain (the other way in, next to the relay): a Cloudflare Tunnel to lax.<your domain>, behind Access.
//   node scripts/domain.mjs link                       the dashboard link that pre-fills the API token it needs
//   node scripts/domain.mjs <host> <email> [--token-from-clipboard]
// The token: open the link, create it (set it to expire soon), copy it, then run with --token-from-clipboard. It goes
// straight from the clipboard to ~/.lax/secrets/cf-setup-token (0600), never through the conversation, and the clipboard
// is cleared. Then: cloudflared into ~/.lax-tools (no Homebrew, checked against its release's checksum), the tunnel,
// Access and DNS (scripts/cf-setup.mjs), the tunnel's background service, and a check that Lax answers there. On
// success the token file is deleted: it can do a lot, and running this again only needs a new one.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { secret, ensureDirs, readEnv, readToken } from '../lib/paths.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const TOOLS = process.env.LAX_TOOLS || path.join(os.homedir(), '.lax-tools');
export const CLOUDFLARED = path.join(TOOLS, 'cloudflared');
const say = (s) => console.log(s);

// What scripts/cf-setup.mjs calls, as the dashboard's permission keys (a label without its _read/_write; write is edit).
const PERMISSIONS = [
  { key: 'access', type: 'edit' }, // Access: Apps and Policies
  { key: 'access_acct', type: 'edit' }, // Access: Organizations, Identity Providers, and Groups (the email PIN login)
  { key: 'access_service_token', type: 'edit' }, // Access: Service Tokens (the app's background link)
  { key: 'argotunnel', type: 'edit' }, // Cloudflare Tunnel
  { key: 'dns', type: 'edit' }, // the tunnel's hostname
  { key: 'zone', type: 'read' }, // finding the zone, and through it the account
];
export const tokenLink = () => 'https://dash.cloudflare.com/profile/api-tokens?' + new URLSearchParams({
  permissionGroupKeys: JSON.stringify(PERMISSIONS), accountId: '*', zoneId: 'all', name: 'Lax setup (delete after)' });

/** cloudflared for this Mac, from Cloudflare's latest GitHub release: the archive checked against GitHub's digest of it,
 *  and the binary inside against the SHA-256 the release notes list (they're of the binary, not the archive). */
export async function installCloudflared() {
  if (fs.existsSync(CLOUDFLARED)) return CLOUDFLARED;
  const asset = `cloudflared-darwin-${process.arch === 'arm64' ? 'arm64' : 'amd64'}.tgz`;
  const rel = await (await fetch('https://api.github.com/repos/cloudflare/cloudflared/releases/latest', { headers: { accept: 'application/vnd.github+json' } })).json();
  const a = rel.assets?.find((x) => x.name === asset), archive = /^sha256:([0-9a-f]{64})$/.exec(a?.digest || '')?.[1];
  const binary = new RegExp(`${asset.replace(/\./g, '\\.')}\\s*:\\s*([0-9a-f]{64})`, 'i').exec(rel.body || '')?.[1];
  if (!a || !archive || !binary) throw new Error(`no ${asset} with published checksums in cloudflared ${rel.tag_name || '(latest)'}`);
  say(`cloudflared ${rel.tag_name}: downloading…`);
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
  const buf = Buffer.from(await (await fetch(a.browser_download_url)).arrayBuffer());
  if (sha(buf) !== archive) throw new Error(`${asset}: checksum ${sha(buf)}, GitHub says ${archive}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lax-cloudflared-'));
  try {
    fs.writeFileSync(path.join(tmp, asset), buf); execFileSync('tar', ['xzf', path.join(tmp, asset), '-C', tmp]);
    const got = sha(fs.readFileSync(path.join(tmp, 'cloudflared')));
    if (got !== binary) throw new Error(`cloudflared: checksum ${got}, the release notes say ${binary}`);
    fs.mkdirSync(TOOLS, { recursive: true }); fs.copyFileSync(path.join(tmp, 'cloudflared'), CLOUDFLARED); fs.chmodSync(CLOUDFLARED, 0o755);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  return CLOUDFLARED;
}

/** A Cloudflare API token from the clipboard into secrets/cf-setup-token, checked, then the clipboard cleared. */
export async function tokenFromClipboard() {
  const t = execFileSync('pbpaste', { encoding: 'utf8' }).trim();
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(t)) throw new Error("the clipboard doesn't hold an API token: copy it from the dashboard and run this again");
  const ok = (await (await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', { headers: { authorization: `Bearer ${t}` } })).json()).success;
  if (!ok) throw new Error('Cloudflare says that token is not valid (or not active yet)');
  ensureDirs(); fs.writeFileSync(secret('cf-setup-token'), t, { mode: 0o600 }); fs.chmodSync(secret('cf-setup-token'), 0o600);
  spawnSync('pbcopy', { input: '' });
  say('token: saved to ~/.lax/secrets/cf-setup-token, clipboard cleared');
}

async function main([host, email, ...rest]) {
  if (host === 'link' || !host) { say(`Create the token here (everything is pre-filled; set it to expire soon):\n${tokenLink()}`); return; }
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || '')) throw new Error('usage: node scripts/domain.mjs <lax.your-domain> <your email> [--token-from-clipboard]');
  if (rest.includes('--token-from-clipboard')) await tokenFromClipboard();
  if (!fs.existsSync(secret('cf-setup-token'))) throw new Error(`no API token yet. Create it here, copy it, then run again with --token-from-clipboard:\n${tokenLink()}`);
  await installCloudflared(); say(`cloudflared: ${CLOUDFLARED}`);
  const run = (script, env = {}) => { const r = spawnSync(process.execPath, ['--no-warnings', path.join(ROOT, 'scripts', script)], { stdio: 'inherit', env: { ...process.env, ...env } }); if (r.status !== 0) throw new Error(`${script} failed`); };
  run('cf-setup.mjs', { LAX_HOSTNAME: host, LAX_OWNER_EMAIL: email });
  run('install-launchd.mjs');
  const env = readEnv(), url = `https://${host}`;
  for (let i = 0; i < 30; i++) { // the tunnel and DNS take a moment
    try { const r = await fetch(`${url}/?t=${readToken()}`, { headers: { 'CF-Access-Client-Id': env.CF_ACCESS_CLIENT_ID || '', 'CF-Access-Client-Secret': env.CF_ACCESS_CLIENT_SECRET || '' }, signal: AbortSignal.timeout(8000) });
      if (r.status === 200) { fs.rmSync(secret('cf-setup-token'), { force: true });
        say(`\nLax answers at ${url}, behind Access (${email}, an email PIN). The phone now pairs through it: http://localhost:7777/pair\nThe API token file is deleted; delete the token in the dashboard too (My Profile → API Tokens).`); return; } } catch {}
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error(`set up, but ${url} doesn't answer yet; npm run doctor in a minute, and see ~/.lax/logs/tunnel.log`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2)).catch((e) => { console.error(`domain: ${e.message}`); process.exit(1); });
