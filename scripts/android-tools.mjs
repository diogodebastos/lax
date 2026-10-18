// What building the Android app needs, without Homebrew, into ~/.lax-tools (LAX_TOOLS moves it): a prebuilt JDK 17
// (Temurin) and Google's Android command-line tools, with platform-tools (adb), the Android 34 platform and build
// tools. Every download is checked against its published checksum. Safe to run again: what's there is kept.
// The command-line tools are pinned to 19.0, the plain sdkmanager: from 23.0 it hands over to Google's new `android`
// CLI, which downloads itself into ~/.android and sends usage metrics.
//   node scripts/android-tools.mjs [--accept-licenses]
// Google's Android SDK licenses must be accepted to install the SDK. In a terminal you read and answer them yourself;
// --accept-licenses says yes for you (the setup conversation asks you first).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

export const TOOLS = process.env.LAX_TOOLS || path.join(os.homedir(), '.lax-tools');
export const SDK = path.join(TOOLS, 'android-sdk');
export const jdkHome = () => { const d = fs.existsSync(TOOLS) && fs.readdirSync(TOOLS).find((x) => x.startsWith('jdk-17')); return d ? path.join(TOOLS, d, 'Contents', 'Home') : null; };
const SDK_PARTS = ['platform-tools', 'platforms;android-34', 'build-tools;34.0.0'];
const CMDLINE = 'cmdline-tools;19.0';
const say = (s) => console.log(s);

async function download(url, file, algo, want) {
  const r = await fetch(url); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer()), got = crypto.createHash(algo).update(buf).digest('hex');
  if (want && got !== want.toLowerCase()) throw new Error(`${path.basename(url)}: checksum ${got}, expected ${want}`);
  fs.writeFileSync(file, buf);
}

async function jdk() {
  if (jdkHome()) return say(`JDK 17: ${jdkHome()}`);
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';
  const [a] = await (await fetch(`https://api.adoptium.net/v3/assets/latest/17/hotspot?os=mac&architecture=${arch}&image_type=jdk&vendor=eclipse`)).json();
  const pkg = a?.binary?.package; if (!pkg?.link) throw new Error('no Temurin 17 build found for this Mac');
  say(`JDK 17: downloading ${pkg.name} (${Math.round(pkg.size / 1e6)} MB)…`);
  const tgz = path.join(TOOLS, pkg.name); await download(pkg.link, tgz, 'sha256', pkg.checksum);
  execFileSync('tar', ['xzf', tgz, '-C', TOOLS]); fs.rmSync(tgz);
  say(`JDK 17: ${jdkHome()}`);
}

async function sdk(accept) {
  const sdkmanager = path.join(SDK, 'cmdline-tools', 'latest', 'bin', 'sdkmanager');
  if (!fs.existsSync(sdkmanager)) {
    const xml = await (await fetch('https://dl.google.com/android/repository/repository2-3.xml')).text();
    const pkg = xml.split('<remotePackage ').find((p) => p.startsWith(`path="${CMDLINE}"`)) || '';
    const zip = [...pkg.matchAll(/<archive>([\s\S]*?)<\/archive>/g)].map((m) => m[1])
      .map((a) => ({ url: /<url>(.*?)<\/url>/.exec(a)?.[1], sha1: /<checksum type="sha1">(.*?)<\/checksum>/.exec(a)?.[1] }))
      .find((a) => a.url?.startsWith('commandlinetools-mac-')) || {};
    if (!zip.url) throw new Error(`no ${CMDLINE} for macOS in Google's repository`);
    say(`Android command-line tools: downloading ${zip.url}…`);
    const file = path.join(TOOLS, zip.url); await download(`https://dl.google.com/android/repository/${zip.url}`, file, 'sha1', zip.sha1);
    const tmp = path.join(TOOLS, 'cmdline-tools-tmp'); fs.rmSync(tmp, { recursive: true, force: true });
    execFileSync('unzip', ['-q', file, '-d', tmp]); fs.rmSync(file);
    fs.mkdirSync(path.join(SDK, 'cmdline-tools'), { recursive: true });
    fs.renameSync(path.join(tmp, 'cmdline-tools'), path.join(SDK, 'cmdline-tools', 'latest')); fs.rmSync(tmp, { recursive: true, force: true });
  }
  const env = { ...process.env, JAVA_HOME: jdkHome() };
  const missing = SDK_PARTS.filter((p) => !fs.existsSync(path.join(SDK, ...p.split(';'))));
  if (!missing.length) return say(`Android SDK: ${SDK}`);
  if (!accept && !process.stdin.isTTY) throw new Error("Google's Android SDK licenses need a yes: run this in a terminal, or with --accept-licenses");
  const lic = spawnSync(sdkmanager, [`--sdk_root=${SDK}`, '--licenses'], { env, stdio: accept ? ['pipe', 'ignore', 'inherit'] : 'inherit', input: accept ? 'y\n'.repeat(20) : undefined });
  if (lic.status !== 0) throw new Error('the Android SDK licenses were not accepted');
  say(`Android SDK: installing ${missing.join(', ')}…`);
  const r = spawnSync(sdkmanager, [`--sdk_root=${SDK}`, ...missing], { env, stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.status !== 0) throw new Error('sdkmanager failed');
  say(`Android SDK: ${SDK}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fs.mkdirSync(TOOLS, { recursive: true });
  try { await jdk(); await sdk(process.argv.includes('--accept-licenses')); say('Ready: npm run android (with the phone plugged in).'); }
  catch (e) { console.error(`android tools: ${e.message}`); process.exit(1); }
}
