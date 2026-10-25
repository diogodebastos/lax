// How Lax runs in the background: a launchd agent on macOS, a systemd user service on Linux (scripts/install-launchd.mjs
// writes them). Off limits (lib/guard.mjs): after-merge restarts Lax through this, and rolls back if it doesn't come back.
import os from 'node:os';
import path from 'node:path';

export const SERVER = 'digi-lax.server', TUNNEL = 'digi-lax.tunnel';
export const LINUX = process.platform === 'linux';
export const serviceFile = (label) => LINUX ? path.join(os.homedir(), '.config', 'systemd', 'user', `${label}.service`)
  : path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
/** argv that restarts it now (launchctl's kickstart -k; systemd's restart). */
export const restartArgs = (label = SERVER) => LINUX ? ['systemctl', '--user', 'restart', `${label}.service`]
  : ['launchctl', 'kickstart', '-k', `gui/${process.getuid()}/${label}`];
/** argv that stops it until it's installed again. */
export const stopArgs = (label = SERVER) => LINUX ? ['systemctl', '--user', 'stop', `${label}.service`]
  : ['launchctl', 'bootout', `gui/${process.getuid()}/${label}`];
