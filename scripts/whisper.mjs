// Set up Whisper on this computer (lib/whisper.mjs): build whisper.cpp's server into ~/.lax-tools and fetch the "small"
// model.   npm run whisper     then restart Lax
// No Homebrew: on an Intel Mac `brew install whisper-cpp` compiles cmake and LLVM from source (hours). A prebuilt cmake
// is fetched instead when there's none (on Linux too). On Apple silicon the same build uses the GPU (Metal).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { BIN, MODEL } from '../lib/whisper.mjs';

const TOOLS = path.join(os.homedir(), '.lax-tools');
const SRC = path.join(TOOLS, 'whisper.cpp');
const CMAKE_VERSION = '3.30.5';
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts });
// A PATH scan, not `which`: minimal Linux installs have none.
const has = (cmd) => (process.env.PATH || '').split(':').some((d) => d && fs.existsSync(path.join(d, cmd)));
const LINUX = process.platform === 'linux';
for (const t of LINUX ? ['curl', 'git', 'make', 'g++'] : []) if (!has(t)) {
  console.error(`Building Whisper needs ${t}: sudo apt install curl git build-essential (or: sudo dnf install curl git gcc-c++ make)`); process.exit(1);
}
fs.mkdirSync(TOOLS, { recursive: true });

function cmake() {
  if (has('cmake')) return 'cmake';
  const name = `cmake-${CMAKE_VERSION}-${LINUX ? `linux-${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}` : 'macos-universal'}`;
  const dir = path.join(TOOLS, name), bin = path.join(dir, LINUX ? 'bin/cmake' : 'CMake.app/Contents/bin/cmake');
  if (!fs.existsSync(bin)) {
    console.log(`fetching cmake ${CMAKE_VERSION}…`);
    const tgz = path.join(TOOLS, 'cmake.tar.gz');
    run('curl', ['-fsSL', '-o', tgz, `https://github.com/Kitware/CMake/releases/download/v${CMAKE_VERSION}/${name}.tar.gz`]);
    run('tar', ['xzf', tgz, '-C', TOOLS]); fs.rmSync(tgz);
  }
  return bin;
}

if (!fs.existsSync(BIN)) {
  if (!fs.existsSync(SRC)) run('git', ['clone', '--depth', '1', 'https://github.com/ggml-org/whisper.cpp', SRC]);
  const c = cmake();
  run(c, ['-B', 'build', '-DCMAKE_BUILD_TYPE=Release', '-DWHISPER_SDL2=OFF', '-DBUILD_SHARED_LIBS=OFF'], { cwd: SRC });
  run(c, ['--build', 'build', '-j', String(os.cpus().length), '--target', 'whisper-server'], { cwd: SRC });
}
if (!fs.existsSync(MODEL)) {
  console.log('fetching the small model (466 MB)…');
  fs.mkdirSync(path.dirname(MODEL), { recursive: true });
  run('curl', ['-fL', '--progress-bar', '-o', MODEL + '.part', 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin']);
  fs.renameSync(MODEL + '.part', MODEL);
}
console.log(`Whisper is set up:\n  ${BIN}\n  ${MODEL}\nRestart Lax to use it.`);
