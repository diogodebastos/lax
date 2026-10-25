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

const uq = (s) => `"${String(s).replace(/[\\"]/g, '\\$&').replace(/%/g, '%%')}"`;
// KillMode=process: a restart stops only the server, not what it started detached (scripts/after-merge.mjs, which is
// the one restarting it and must live to check it's healthy, or roll back).
/** The systemd user unit that runs `args` from `root`, with `PATH=pathEnv`, logging to `log`. */
export const unit = (label, args, log, root, pathEnv) => `[Unit]
Description=Lax (${label})
StartLimitIntervalSec=0

[Service]
ExecStart=${args.map(uq).join(' ')}
WorkingDirectory=${root.replace(/%/g, '%%')}
Environment=${uq(`PATH=${pathEnv}`)}
Restart=always
RestartSec=5
KillMode=process
StandardOutput=append:${log.replace(/%/g, '%%')}
StandardError=append:${log.replace(/%/g, '%%')}

[Install]
WantedBy=default.target
`;
