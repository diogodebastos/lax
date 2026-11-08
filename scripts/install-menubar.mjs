// Puts the tiny Lax in the Mac menu bar (mac/LaxBar.swift) with a switch to turn the server on or off.
// Builds it into ~/Applications/Lax Bar.app with swiftc and starts it at login as a launchd agent. `--remove` uninstalls.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

if (process.platform !== 'darwin') { console.log('The menu bar is macOS only. On Linux: systemctl --user start|stop|restart digi-lax.server'); process.exit(0); }
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const APP = path.join(os.homedir(), 'Applications', 'Lax Bar.app');
const BIN = path.join(APP, 'Contents', 'MacOS', 'LaxBar');
const LABEL = 'digi-lax.bar';
const AGENT = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const DOMAIN = `gui/${process.getuid()}`;

try { execFileSync('launchctl', ['bootout', `${DOMAIN}/${LABEL}`], { stdio: 'ignore' }); } catch {}
if (process.argv.includes('--remove')) {
  fs.rmSync(AGENT, { force: true }); fs.rmSync(APP, { recursive: true, force: true });
  console.log('removed Lax from the menu bar');
  process.exit(0);
}

fs.mkdirSync(path.dirname(BIN), { recursive: true });
execFileSync('swiftc', ['-O', '-o', BIN, path.join(ROOT, 'mac', 'LaxBar.swift')], { stdio: 'inherit' });
fs.writeFileSync(path.join(APP, 'Contents', 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>${LABEL}</string>
  <key>CFBundleName</key><string>Lax Bar</string>
  <key>CFBundleExecutable</key><string>LaxBar</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSUIElement</key><true/>
</dict></plist>
`);
fs.writeFileSync(AGENT, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array><string>${BIN.replace(/&/g, '&amp;')}</string></array>
  <key>RunAtLoad</key><true/>
</dict></plist>
`);
execFileSync('launchctl', ['bootstrap', DOMAIN, AGENT]);
console.log(`Lax is in the menu bar  (${APP})`);
