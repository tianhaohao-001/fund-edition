import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobile = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(homedir(), '.cache', 'morrowfolio-mobile');
const lock = JSON.parse(await readFile(join(mobile, 'toolchain-lock.json'), 'utf8'));
const exists = async path => access(path).then(() => true).catch(() => false);
await mkdir(cache, { recursive: true });

async function download(url, filename, algorithm, expected) {
  let bytes;
  if (await exists(filename)) bytes = await readFile(filename);
  if (!bytes || createHash(algorithm).update(bytes).digest(algorithm === 'sha512' ? 'base64' : 'hex') !== expected) {
    console.log(`Downloading ${new URL(url).pathname.split('/').at(-1)}`);
    const response = await fetch(url, { signal: AbortSignal.timeout(240_000) });
    if (!response.ok) throw new Error(`Download failed with HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (createHash(algorithm).update(bytes).digest(algorithm === 'sha512' ? 'base64' : 'hex') !== expected) throw new Error('The vendor checksum did not match.');
    await writeFile(filename, bytes);
  }
  return filename;
}

function unzip(archive, destination) {
  execFileSync('tar.exe', ['-xf', archive, '-C', destination], { windowsHide: true, stdio: 'inherit' });
}

const npmHome = join(cache, `npm-${lock.npm.version}`);
const npm = join(npmHome, 'package', 'bin', 'npm-cli.js');
if (!await exists(npm)) {
  const metadata = await (await fetch(lock.npm.metadata)).json();
  const integrity = metadata.dist.integrity.replace(/^sha512-/, '');
  const archive = await download(metadata.dist.tarball, join(cache, `npm-${lock.npm.version}.tgz`), 'sha512', integrity);
  await mkdir(npmHome, { recursive: true });
  execFileSync('tar.exe', ['-xzf', archive, '-C', npmHome], { windowsHide: true, stdio: 'inherit' });
}
const bin = join(cache, 'bin');
await mkdir(bin, { recursive: true });
for (const [command, script] of [['npm', 'npm-cli.js'], ['npx', 'npx-cli.js']]) {
  await writeFile(join(bin, `${command}.cmd`), `@echo off\r\n"${process.execPath}" "${join(npmHome, 'package', 'bin', script)}" %*\r\n`);
}
console.log(`npm ready: ${npm}`);

if (process.argv.includes('--android-tools')) {
  const jdk = join(cache, lock.jdk.directory);
  if (!await exists(join(jdk, 'bin', 'java.exe'))) {
    const archive = await download(lock.jdk.url, join(cache, 'jdk17.zip'), 'sha256', lock.jdk.sha256);
    unzip(archive, cache);
  }
  const sdk = join(cache, 'android-sdk');
  const sdkTools = join(sdk, 'cmdline-tools', 'latest');
  if (!await exists(join(sdkTools, 'bin', 'sdkmanager.bat'))) {
    const archive = await download(lock.androidCommandLineTools.url, join(cache, 'android-command-tools.zip'), 'sha1', lock.androidCommandLineTools.sha1);
    const temporary = join(cache, 'android-tools-extracted');
    await mkdir(temporary, { recursive: true });
    unzip(archive, temporary);
    await mkdir(dirname(sdkTools), { recursive: true });
    await rename(join(temporary, 'cmdline-tools'), sdkTools);
  }
  await writeFile(join(cache, 'paths.json'), JSON.stringify({ npm, bin, jdk, sdk }, null, 2));
  console.log(`JDK ready: ${jdk}`);
  console.log(`Android command tools ready: ${sdkTools}`);
  console.log('SDK platforms and licenses are a separate explicit setup step. No system PATH or registry was changed.');
}
