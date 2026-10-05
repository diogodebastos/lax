// Build the Lax Android app and install it on the phone over USB.
//   npm run android              build + install + launch
//   npm run android -- --pair    also send the pairing link (Lax URL + Access service token) over adb; tap "pair ▶" on the phone
//   npm run android -- --build   build only
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const APP = path.join(ROOT, 'android');
const args = new Set(process.argv.slice(2));
const brew = (() => { try { return execFileSync('brew', ['--prefix'], { encoding: 'utf8' }).trim(); } catch { return '/usr/local'; } })();

// JDK 17 (the system Java is too old for the Android Gradle plugin) and the Homebrew Android SDK.
// Prefer a prebuilt Temurin in ~/.lax-tools (Homebrew builds openjdk from source on Intel Macs: hours).
const TOOLS = path.join(os.homedir(), '.lax-tools');
const temurin = fs.existsSync(TOOLS) && fs.readdirSync(TOOLS).find((d) => d.startsWith('jdk-17'));
const JAVA_HOME = process.env.JAVA_HOME?.includes('17') ? process.env.JAVA_HOME
  : temurin ? path.join(TOOLS, temurin, 'Contents/Home') : `${brew}/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`;
const ANDROID_HOME = process.env.ANDROID_HOME || `${brew}/share/android-commandlinetools`;
for (const [name, dir] of [['JDK 17', JAVA_HOME], ['Android SDK', ANDROID_HOME]])
  if (!fs.existsSync(dir)) { console.error(`${name} not found at ${dir}. See android/README.md.`); process.exit(1); }
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
  const DATA = process.env.LAX_DATA || path.join(ROOT, 'data');
  const token = fs.readFileSync(path.join(DATA, 'token'), 'utf8').trim();
  let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(path.join(DATA, 'env.json'), 'utf8')); } catch {}
  if (!cfg.LAX_PUBLIC_URL) { console.error('No LAX_PUBLIC_URL in data/env.json, so there\'s nothing to pair with.'); process.exit(1); }
  const link = 'lax://pair?' + new URLSearchParams({ u: `${cfg.LAX_PUBLIC_URL.replace(/\/$/, '')}/?t=${token}`,
    id: cfg.CF_ACCESS_CLIENT_ID || '', s: cfg.CF_ACCESS_CLIENT_SECRET || '' });
  // adb shell joins its arguments into one remote shell command: single-quote the link (it has no quotes of its own).
  run('adb', ['shell', `am start -a android.intent.action.VIEW -n com.diogodebastos.lax/.PairActivity -d '${link}'`], { stdio: ['ignore', 'ignore', 'inherit'] });
  console.log('Pairing link sent. Tap "pair ▶" on the phone.');
} else {
  adb('shell', 'monkey', '-p', 'com.diogodebastos.lax', '-c', 'android.intent.category.LAUNCHER', '1');
}
