// One-shot, idempotent Cloudflare setup for Lax: Access (login in front) → tunnel → DNS.
// Needs ~/.lax/secrets/cf-setup-token: a short-lived API token with Access (apps/policies, service tokens,
// orgs/IdPs), Cloudflare Tunnel, and Zone DNS edit. Secrets are written to ~/.lax/secrets (0600), never printed.
//   LAX_HOSTNAME=lax.example.com LAX_OWNER_EMAIL=you@example.com node scripts/cf-setup.mjs
// Run again, the host comes from LAX_PUBLIC_URL and the email from LAX_OWNER_EMAIL, both kept in ~/.lax/secrets/env.json.
import fs from 'node:fs';
import path from 'node:path';
import { SECRETS, ensureDirs, readEnv } from '../lib/paths.mjs';
ensureDirs();

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = SECRETS;
const saved = readEnv();
const HOST = process.env.LAX_HOSTNAME || (saved.LAX_PUBLIC_URL ? new URL(saved.LAX_PUBLIC_URL).hostname : '');
const EMAIL = process.env.LAX_OWNER_EMAIL || saved.LAX_OWNER_EMAIL || '';
if (!HOST || !EMAIL) { console.error('Usage: LAX_HOSTNAME=lax.example.com LAX_OWNER_EMAIL=you@example.com node scripts/cf-setup.mjs'); process.exit(1); }
const ZONE = HOST.split('.').slice(-2).join('.');
const DEMO = process.env.LAX_DEMO_ROUTE || saved.LAX_DEMO_ROUTE; // only for a Lax with a public demo (scripts/demo.mjs)
const TOKEN = fs.readFileSync(path.join(DATA, 'cf-setup-token'), 'utf8').trim();

async function cf(method, p, body) {
  const r = await fetch('https://api.cloudflare.com/client/v4' + p, {
    method, headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({ success: false, errors: [{ message: `HTTP ${r.status}` }] }));
  if (!j.success) throw new Error(`${method} ${p}: ${JSON.stringify(j.errors)}`);
  return j.result;
}
const writeSecret = (name, data) => { const f = path.join(DATA, name); fs.writeFileSync(f, data, { mode: 0o600 }); fs.chmodSync(f, 0o600); };
const step = (s) => console.log('•', s);

// The zone tells us the account, so the token needs no account-read permission.
const zone = (await cf('GET', `/zones?name=${ZONE}`))[0];
if (!zone) throw new Error(`zone ${ZONE} not visible to this token`);
const A = { id: process.env.CF_ACCOUNT_ID || zone.account.id, name: zone.account.name };
step(`account: ${A.name}`);

// 1. Zero Trust org + one-time PIN login
try { const org = await cf('GET', `/accounts/${A.id}/access/organizations`); step(`zero trust org: ${org.auth_domain}`); }
catch (e) { console.error('\nZero Trust is not set up on this account yet (dashboard → Zero Trust → pick a team name + Free plan).\n', e.message); process.exit(2); }
let otp = (await cf('GET', `/accounts/${A.id}/access/identity_providers`)).find((i) => i.type === 'onetimepin');
if (!otp) otp = await cf('POST', `/accounts/${A.id}/access/identity_providers`, { name: 'One-time PIN', type: 'onetimepin', config: {} });
step('login method: one-time PIN');

// 2. Service token for the Android app (secret only available at creation)
const envFile = path.join(DATA, 'env.json');
const env = fs.existsSync(envFile) ? JSON.parse(fs.readFileSync(envFile, 'utf8')) : {};
let st = (await cf('GET', `/accounts/${A.id}/access/service_tokens`)).find((t) => t.name === 'lax-android');
if (st && !env.CF_ACCESS_CLIENT_SECRET) { await cf('DELETE', `/accounts/${A.id}/access/service_tokens/${st.id}`); st = null; } // lost secret → rotate
if (!st) {
  st = await cf('POST', `/accounts/${A.id}/access/service_tokens`, { name: 'lax-android', duration: 'forever' });
  Object.assign(env, { CF_ACCESS_CLIENT_ID: st.client_id, CF_ACCESS_CLIENT_SECRET: st.client_secret });
}
env.CF_ACCESS_SERVICE_TOKEN_ID = st.id;
env.LAX_PUBLIC_URL = `https://${HOST}`;
env.LAX_OWNER_EMAIL = EMAIL;
writeSecret('env.json', JSON.stringify(env, null, 2) + '\n');
step('service token lax-android → ~/.lax/secrets/env.json');

// 3. Reusable policies + the Access application (created BEFORE DNS, so the host is never exposed unprotected)
async function policy(name, decision, include) {
  const existing = (await cf('GET', `/accounts/${A.id}/access/policies`)).find((p) => p.name === name);
  const body = { name, decision, include, session_duration: '720h' };
  return existing ? cf('PUT', `/accounts/${A.id}/access/policies/${existing.id}`, body) : cf('POST', `/accounts/${A.id}/access/policies`, body);
}
const me = await policy('lax: owner', 'allow', [{ email: { email: EMAIL } }]);
const bot = await policy('lax: android service token', 'non_identity', [{ service_token: { token_id: st.id } }]);
const appBody = {
  name: 'Lax', domain: HOST, type: 'self_hosted', session_duration: '720h',
  allowed_idps: [otp.id], auto_redirect_to_identity: true, app_launcher_visible: false,
  policies: [{ id: me.id, precedence: 1 }, { id: bot.id, precedence: 2 }],
};
const app = (await cf('GET', `/accounts/${A.id}/access/apps`)).find((a) => a.domain === HOST);
await (app ? cf('PUT', `/accounts/${A.id}/access/apps/${app.id}`, appBody) : cf('POST', `/accounts/${A.id}/access/apps`, appBody));
step(`access app on ${HOST}: ${EMAIL} (email PIN) + service token`);

// 3b. A public demo, if this Lax has one (/demo and what it loads: static pages in demo mode, see server.mjs), is open to everyone.
// Everything else stays behind the app above: Access picks the most specific path, and the API still needs Lax's token.
if (DEMO) {
  const pub = await policy('lax: public demos', 'bypass', [{ everyone: {} }]);
  const demoBody = { name: 'Lax demos', domain: `${HOST}/demo`, type: 'self_hosted', app_launcher_visible: false, policies: [{ id: pub.id, precedence: 1 }] };
  const demoApp = (await cf('GET', `/accounts/${A.id}/access/apps`)).find((a) => a.name === demoBody.name);
  await (demoApp ? cf('PUT', `/accounts/${A.id}/access/apps/${demoApp.id}`, demoBody) : cf('POST', `/accounts/${A.id}/access/apps`, demoBody));
  step(`public: https://${HOST}/demo`);
}

// 4. Remotely-managed tunnel → 127.0.0.1:7777
let tunnel = (await cf('GET', `/accounts/${A.id}/cfd_tunnel?is_deleted=false&name=lax`))[0];
if (!tunnel) tunnel = await cf('POST', `/accounts/${A.id}/cfd_tunnel`, { name: 'lax', config_src: 'cloudflare' });
await cf('PUT', `/accounts/${A.id}/cfd_tunnel/${tunnel.id}/configurations`, {
  config: { ingress: [{ hostname: HOST, service: 'http://127.0.0.1:7777' }, { service: 'http_status:404' }] },
});
writeSecret('tunnel-token', await cf('GET', `/accounts/${A.id}/cfd_tunnel/${tunnel.id}/token`));
step(`tunnel lax (${tunnel.id}) → ~/.lax/secrets/tunnel-token`);

// 5. DNS
const target = `${tunnel.id}.cfargotunnel.com`;
const rec = (await cf('GET', `/zones/${zone.id}/dns_records?name=${HOST}`))[0];
const dns = { type: 'CNAME', name: HOST, content: target, proxied: true, comment: 'Lax tunnel' };
await (rec ? cf('PUT', `/zones/${zone.id}/dns_records/${rec.id}`, dns) : cf('POST', `/zones/${zone.id}/dns_records`, dns));
step(`dns ${HOST} → ${target}`);
console.log('\nDone. Next: npm run install-service (starts the tunnel agent).');
