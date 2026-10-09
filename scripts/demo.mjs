// The public demo on Cloudflare (lax.diogodebastos.com/demo, see demo/wrangler.jsonc).
//   node scripts/demo.mjs [ref]            build demo/dist from that commit (default HEAD)
//   node scripts/demo.mjs [ref] --deploy   …and deploy it (the pre-push hook does this for main)
// Built from git, not the working folder, so what's public is exactly what was pushed. Same paths as server.mjs's
// /demo route, which stays as the live local preview.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2), deploy = args.includes('--deploy'), ref = args.find((a) => !a.startsWith('--')) || 'HEAD';
const show = (f) => execFileSync('git', ['show', `${ref}:public/${f}`], { cwd: ROOT, encoding: 'utf8' });

const dist = path.join(ROOT, 'demo', 'dist');
fs.rmSync(dist, { recursive: true, force: true }); fs.mkdirSync(path.join(dist, 'demo'), { recursive: true });
fs.writeFileSync(path.join(dist, 'demo.html'), show('demo.html')); // served at /demo
fs.writeFileSync(path.join(dist, 'demo', 'app.html'), show('index.html').replace('src="lax.js', 'src="/demo/lax.js').replace('src="heard.js', 'src="/demo/heard.js')); // /demo/app
fs.writeFileSync(path.join(dist, 'demo', 'lax.js'), show('lax.js'));
fs.writeFileSync(path.join(dist, 'demo', 'heard.js'), show('heard.js'));
console.log(`demo built from ${ref}`);

if (deploy) execFileSync('npx', ['-y', 'wrangler@4', 'deploy', '--config', path.join(ROOT, 'demo', 'wrangler.jsonc')], { cwd: ROOT, stdio: 'inherit' });
