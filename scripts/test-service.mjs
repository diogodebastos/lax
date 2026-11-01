// The systemd unit Lax runs as on Linux (lib/service.mjs): restarted on a crash, and a restart stops only the server, so
// after-merge (which it started, detached) lives to check it's healthy or roll back. Quoting holds for odd folders.
import { unit } from '../lib/service.mjs';
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
const u = unit('digi-lax.server', ['/n/node', '--no-warnings', '/home/me/100% "lax"/server.mjs'], '/home/me/.lax/logs/server.log', '/home/me/100% "lax"', '/n:/usr/bin');
const exec = /^ExecStart=(.*)$/m.exec(u)?.[1] || '';
check('KillMode=process: a restart leaves after-merge alive', /^KillMode=process$/m.test(u));
check('Restart=always, from login', /^Restart=always$/m.test(u) && /^WantedBy=default\.target$/m.test(u));
check('ExecStart runs server.mjs', exec.includes('server.mjs'), exec);
check('% is escaped (systemd specifiers), quotes too', exec.includes('100%% \\"lax\\"/server.mjs') && /^WorkingDirectory=\/home\/me\/100%% "lax"$/m.test(u), exec);
check('PATH comes along', /^Environment="PATH=\/n:\/usr\/bin"$/m.test(u));
console.log(failed ? `\n${failed} service check(s) failed` : '\nall service checks passed');
process.exit(failed ? 1 : 0);
