// Runs Lax (and its Cloudflare tunnel, once configured) as macOS launchd agents:
// start at login, restart on crash, live outside any sandbox. `--remove` uninstalls.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const AGENTS = path.join(os.homedir(), 'Library', 'LaunchAgents');
const DOMAIN = `gui/${process.getuid()}`;
const remove = process.argv.includes('--remove');
// Prefer the stable Homebrew symlink so `brew upgrade node` doesn't break the agent.
const which = (...cands) => cands.find((c) => fs.existsSync(c));
const NODE = which('/usr/local/bin/node', '/opt/homebrew/bin/node') || process.execPath;
const CLOUDFLARED = which('/usr/local/bin/cloudflared', '/opt/homebrew/bin/cloudflared');
const PATH_ENV = [path.join(os.homedir(), '.local', 'bin'), '/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':');

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

const agents = [
  { label: 'com.diogodebastos.lax', args: [NODE, '--no-warnings', path.join(ROOT, 'server.mjs')], log: path.join(ROOT, 'data', 'server.log') },
];
const tunnelConfigured = fs.existsSync(path.join(os.homedir(), '.cloudflared', 'config.yml'));
if (CLOUDFLARED && tunnelConfigured) {
  agents.push({ label: 'com.diogodebastos.lax-tunnel', args: [CLOUDFLARED, 'tunnel', '--no-autoupdate', 'run', 'lax'], log: path.join(ROOT, 'data', 'tunnel.log') });
} else if (!remove) {
  console.log('(tunnel agent skipped: cloudflared or ~/.cloudflared/config.yml not found yet)');
}

fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
for (const { label, args, log } of remove ? [...agents, { label: 'com.diogodebastos.lax-tunnel' }] : agents) {
  const file = path.join(AGENTS, `${label}.plist`);
  try { execFileSync('launchctl', ['bootout', `${DOMAIN}/${label}`], { stdio: 'ignore' }); } catch {}
  if (remove) { fs.rmSync(file, { force: true }); console.log(`removed ${label}`); continue; }
  fs.writeFileSync(file, plist(label, args, log));
  execFileSync('launchctl', ['bootstrap', DOMAIN, file]);
  console.log(`running ${label}  (log: ${path.relative(ROOT, log)})`);
}
