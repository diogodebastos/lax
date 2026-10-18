// Build the Lax Android app and install it on the phone over USB.
//   npm run android              build + install + launch
//   npm run android -- --pair    also send the pairing link (Lax URL + Access service token) over adb; tap "pair ▶" on the phone
//   npm run android -- --build   build only
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readToken, readEnv } from '../lib/paths.mjs';
import { SDK, jdkHome } from './android-tools.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const APP = path.join(ROOT, 'android');
const args = new Set(process.argv.slice(2));
const brew = (() => { try { return execFileSync('brew', ['--prefix'], { encoding: 'utf8' }).trim(); } catch { return '/usr/local'; } })();

// JDK 17 (the system Java is too old for the Android Gradle plugin) and the Android SDK: the ones in ~/.lax-tools
// (scripts/android-tools.mjs, no Homebrew), else Homebrew's.
const JAVA_HOME = process.env.JAVA_HOME?.includes('17') ? process.env.JAVA_HOME
  : jdkHome() || `${brew}/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`;
const ANDROID_HOME = process.env.ANDROID_HOME || (fs.existsSync(path.join(SDK, 'platform-tools')) ? SDK : `${brew}/share/android-commandlinetools`);
for (const [name, dir] of [['JDK 17', JAVA_HOME], ['Android SDK', ANDROID_HOME]])
  if (!fs.existsSync(dir)) { console.error(`${name} not found at ${dir}. Get both with: node scripts/setup.mjs android`); process.exit(1); }
fs.writeFileSync(path.join(APP, 'local.properties'), `sdk.dir=${ANDROID_HOME}\n`);
const env = { ...process.env, JAVA_HOME, ANDROID_HOME, PATH: `${JAVA_HOME}/bin:${ANDROID_HOME}/platform-tools:${process.env.PATH}` };
const run = (cmd, a, opts = {}) => execFileSync(cmd, a, { stdio: 'inherit', env, ...opts });

run('./gradlew', ['--quiet', 'assembleDebug'], { cwd: APP });
const apk = path.join(APP, 'app/build/outputs/apk/debug/app-debug.apk');
console.log(`built ${path.relative(ROOT, apk)}`);
if (args.has('--build')) process.exit(0);

const adb = (...a) => run('adb', a);
adb('install', '-r', apk);

if (args.has('--pair')) {
  const token = readToken(), cfg = readEnv();
  if (!token || !cfg.LAX_PUBLIC_URL) { console.error('No Lax token or LAX_PUBLIC_URL in ~/.lax/secrets, so there\'s nothing to pair with.'); process.exit(1); }
  const link = 'lax://pair?' + new URLSearchParams({ u: `${cfg.LAX_PUBLIC_URL.replace(/\/$/, '')}/?t=${token}`,
    id: cfg.CF_ACCESS_CLIENT_ID || '', s: cfg.CF_ACCESS_CLIENT_SECRET || '' });
  // adb shell joins its arguments into one remote shell command: single-quote the link (it has no quotes of its own).
  run('adb', ['shell', `am start -a android.intent.action.VIEW -n com.diogodebastos.lax/.PairActivity -d '${link}'`], { stdio: ['ignore', 'ignore', 'inherit'] });
  console.log('Pairing link sent. Tap "pair ▶" on the phone.');
} else {
  adb('shell', 'monkey', '-p', 'com.diogodebastos.lax', '-c', 'android.intent.category.LAUNCHER', '1');
}
