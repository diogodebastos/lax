// Whose repo is this body's origin? A Lax only goes to GitHub (issues, branches, pull requests, pushing main) when
// origin is its person's own: one they can push to. A clone of the project (how everyone else gets their Lax) keeps
// all of it on the Mac, so nobody's Lax files issues or pushes on the repo it came from. LAX_GITHUB=1/0 decides instead.
import { execFile } from 'node:child_process';

const known = new Map();
/** true when the person can push to the body's origin (gh says WRITE, MAINTAIN or ADMIN). No gh, or not logged in: false. */
export function ownsOrigin(body, gh = process.env.LAX_GH || 'gh') {
  if (process.env.LAX_GITHUB === '1') return Promise.resolve(true);
  if (process.env.LAX_GITHUB === '0') return Promise.resolve(false);
  if (known.has(body)) return Promise.resolve(known.get(body));
  return new Promise((resolve) => execFile(gh, ['repo', 'view', '--json', 'viewerPermission', '-q', '.viewerPermission'], { cwd: body, timeout: 15000 },
    (err, out) => { if (err) return resolve(false); // offline, or no gh: not now, and asked again next time
      known.set(body, /^(WRITE|MAINTAIN|ADMIN)$/.test(String(out).trim())); resolve(known.get(body)); }));
}
