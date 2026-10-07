// Who may talk to Lax: its token, what only the Mac itself may call, and pairing a phone.
// Off limits to anything Lax builds by itself (lib/guard.mjs): a change here goes through you, by hand.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { secret, ensureDirs, readEnv } from './paths.mjs';

// Lax itself lives in ~/.lax (lib/paths.mjs): memory, secrets, mind, logs. This repo is only its body.
ensureDirs();
// Local config, a secret: { LAX_PUBLIC_URL, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET, ... }
for (const [k, v] of Object.entries(readEnv())) process.env[k] ??= String(v);
// Tunnel only by default: nothing on the LAN can reach Lax, cloudflared connects over loopback.
export const HOST = process.env.LAX_HOST || '127.0.0.1';
const PUBLIC_URL = (process.env.LAX_PUBLIC_URL || '').replace(/\/$/, '');

const tokenFile = secret('token');
if (!fs.existsSync(tokenFile)) fs.writeFileSync(tokenFile, crypto.randomBytes(12).toString('hex'), { mode: 0o600 });
export const TOKEN = fs.readFileSync(tokenFile, 'utf8').trim();
export const authed = (req, url) => (req.headers['x-lax-token'] || url.searchParams.get('t')) === TOKEN;

// Truly local: loopback AND not proxied. cloudflared also connects from 127.0.0.1, but adds cf-* headers.
export const isLocal = (req) => /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress)
  && !['cf-connecting-ip', 'cf-ray', 'x-forwarded-for', 'cf-access-jwt-assertion'].some((h) => h in req.headers);

const lanIp = () => Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
export const phoneUrl = (port) => `${PUBLIC_URL || `http://${lanIp()}:${port}`}/?t=${TOKEN}`;
// The Android app's pairing link: Lax URL + the Cloudflare Access service token for its background link.
const appPairUrl = (port) => 'lax://pair?' + new URLSearchParams({ u: phoneUrl(port),
  id: process.env.CF_ACCESS_CLIENT_ID || '', s: process.env.CF_ACCESS_CLIENT_SECRET || '' });

/** /pair: the QR codes that pair a phone, on the Mac only. */
export function pairPage(req, res, { root, port }) {
  if (!isLocal(req)) { res.writeHead(403); return res.end(); }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  return res.end(fs.readFileSync(path.join(root, 'public', 'pair.html'), 'utf8').replace('%%URL%%', phoneUrl(port)).replace('%%APP%%', appPairUrl(port)));
}
