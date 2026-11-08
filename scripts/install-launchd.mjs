// Runs Lax (and its Cloudflare tunnel, once configured) in the background: launchd agents on macOS, systemd user
// services on Linux (lib/service.mjs). Start at login, restart on crash, live outside any sandbox. `--remove` uninstalls.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { LOGS, secret, ensureDirs } from '../lib/paths.mjs';
import { SERVER, TUNNEL, LINUX, serviceFile, unit } from '../lib/service.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DOMAIN = `gui/${process.getuid()}`;
const remove = process.argv.includes('--remove');
// Prefer the stable Homebrew symlink so `brew upgrade node` doesn't break the agent.
const which = (...cands) => cands.find((c) => fs.existsSync(c));
// On Linux, the node running this: it passed setup's version check, and a stray /usr/local/bin/node may be old.
const NODE = LINUX ? process.execPath : which('/usr/local/bin/node', '/opt/homebrew/bin/node') || process.execPath;
const CLOUDFLARED = which(path.join(process.env.LAX_TOOLS || path.join(os.homedir(), '.lax-tools'), 'cloudflared'), '/usr/local/bin/cloudflared', '/opt/homebrew/bin/cloudflared', '/usr/bin/cloudflared'); // scripts/domain.mjs, else Homebrew's or the .deb/.rpm's
// The server spawns `claude` by PATH and every hook is `node …`: systemd's own PATH has neither when they came from nvm
// or ~/.local/bin, and then voice runs fail and Lax's fence hook silently never runs. So this shell's PATH comes along.
const PATH_ENV = LINUX ? [...new Set([path.dirname(process.execPath), path.join(os.homedir(), '.local', 'bin'), ...(process.env.PATH || '').split(':'), '/usr/local/bin', '/usr/bin', '/bin'])].filter(Boolean).join(':')
  : [path.join(os.homedir(), '.local', 'bin'), '/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const plist = (label, args, log) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key><array>${args.map((a) => `<string>${esc(a)}</string>`).join('')}</array>
  <key>WorkingDirectory</key><string>${esc(ROOT)}</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${PATH_ENV}</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>StandardOutPath</key><string>${esc(log)}</string>
  <key>StandardErrorPath</key><string>${esc(log)}</string>
</dict></plist>
`;

// Before Phase 9 the labels were com.diogodebastos.lax(-tunnel): installing clears them, so an upgrade has one of each.
const OLD = ['com.diogodebastos.lax', 'com.diogodebastos.lax-tunnel'];
const agents = [
  { label: SERVER, args: [NODE, '--no-warnings', path.join(ROOT, 'server.mjs')], log: path.join(LOGS, 'server.log') },
];
// Remotely-managed tunnel (scripts/cf-setup.mjs) → ~/.lax/secrets/tunnel-token; or a locally-managed one in ~/.cloudflared.
const tokenFile = secret('tunnel-token');
const tunnelArgs = fs.existsSync(tokenFile) ? ['tunnel', '--no-autoupdate', 'run', '--token-file', tokenFile]
  : fs.existsSync(path.join(os.homedir(), '.cloudflared', 'config.yml')) ? ['tunnel', '--no-autoupdate', 'run', 'lax'] : null;
if (CLOUDFLARED && tunnelArgs) {
  agents.push({ label: TUNNEL, args: [CLOUDFLARED, ...tunnelArgs], log: path.join(LOGS, 'tunnel.log') });
} else if (!remove) {
  console.log('(tunnel agent skipped: run scripts/cf-setup.mjs first)');
}

ensureDirs();
if (LINUX) {
  const sc = (...a) => execFileSync('systemctl', ['--user', ...a], { stdio: 'ignore' });
  try { sc('show-environment'); } catch { console.error('no systemd user session here: run `npm start` in a terminal instead'); process.exit(1); }
  fs.mkdirSync(path.dirname(serviceFile(SERVER)), { recursive: true });
  for (const { label, args, log } of remove ? [...agents, { label: TUNNEL }] : agents) {
    const file = serviceFile(label);
    try { sc('disable', '--now', `${label}.service`); } catch {}
    if (remove) { fs.rmSync(file, { force: true }); console.log(`removed ${label}`); continue; }
    fs.writeFileSync(file, unit(label, args, log, ROOT, PATH_ENV));
    sc('daemon-reload'); sc('enable', '--now', `${label}.service`);
    console.log(`running ${label}  (log: ${log})`);
  }
  if (remove) try { sc('daemon-reload'); } catch {}
  process.exit(0);
}
for (const label of OLD) {
  const file = serviceFile(label);
  if (!fs.existsSync(file)) continue;
  try { execFileSync('launchctl', ['bootout', `${DOMAIN}/${label}`], { stdio: 'ignore' }); } catch {}
  fs.rmSync(file, { force: true }); console.log(`removed the old ${label}`);
}
for (const { label, args, log } of remove ? [...agents, { label: TUNNEL }] : agents) {
  const file = serviceFile(label);
  try { execFileSync('launchctl', ['bootout', `${DOMAIN}/${label}`], { stdio: 'ignore' }); } catch {}
  if (remove) { fs.rmSync(file, { force: true }); console.log(`removed ${label}`); continue; }
  fs.writeFileSync(file, plist(label, args, log));
  execFileSync('launchctl', ['bootstrap', DOMAIN, file]);
  console.log(`running ${label}  (log: ${log})`);
}
