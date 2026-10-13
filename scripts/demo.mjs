// The public demo on Cloudflare (lax.diogodebastos.com/demo, see demo/wrangler.jsonc).
//   node scripts/demo.mjs [ref]            build demo/dist (pages) and demo/build (the Worker) from that commit (default HEAD)
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
fs.writeFileSync(path.join(dist, 'demo', 'app.html'), show('index.html').replace('src="lax.js', 'src="/demo/lax.js').replace('src="heard.js', 'src="/demo/heard.js').replace('src="body.js', 'src="/demo/body.js')); // /demo/app
fs.writeFileSync(path.join(dist, 'demo', 'lax.js'), show('lax.js'));
fs.writeFileSync(path.join(dist, 'demo', 'heard.js'), show('heard.js'));
fs.writeFileSync(path.join(dist, 'demo', 'body.js'), show('body.js'));
// Lax's mind, live (/demo/mind): the page and what it loads, and the Worker that keeps it (from demo/ and lib/).
fs.writeFileSync(path.join(dist, 'demo', 'mind.html'), show('mind.html'));
for (const f of ['mind-view.js', 'net.js', 'favicon.svg']) fs.writeFileSync(path.join(dist, 'demo', f), show(f));
const build = path.join(ROOT, 'demo', 'build'), git = (f) => execFileSync('git', ['show', `${ref}:${f}`], { cwd: ROOT, encoding: 'utf8' });
fs.rmSync(build, { recursive: true, force: true }); fs.mkdirSync(build, { recursive: true });
fs.writeFileSync(path.join(build, 'worker.mjs'), git('demo/worker.mjs').replace("'../lib/mind-shape.mjs'", "'./mind-shape.mjs'"));
fs.writeFileSync(path.join(build, 'mind-shape.mjs'), git('lib/mind-shape.mjs'));
console.log(`demo built from ${ref}`);

if (deploy) execFileSync('npx', ['-y', 'wrangler@4', 'deploy', '--config', path.join(ROOT, 'demo', 'wrangler.jsonc')], { cwd: ROOT, stdio: 'inherit' });
