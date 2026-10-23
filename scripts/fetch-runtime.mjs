#!/usr/bin/env node
/**
 * Fetches the pinned llama.cpp CPU runtime that ships inside the installer.
 *
 * The release asset is pinned by tag, byte size and SHA-256, so a changed or
 * replaced upstream file fails before anything is extracted. Only the files
 * `llama-server` needs are kept: the ZIP's other tools would add tens of
 * megabytes to every installer for no user benefit.
 *
 * Weights are never downloaded here. The model stays a separate, verified
 * download in Settings -> Vexium.
 *
 * Usage:
 *   node scripts/fetch-runtime.mjs [--force]
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNTIME_DIR = path.join(ROOT, 'runtime');
const BIN_DIR = path.join(RUNTIME_DIR, 'bin');
const CACHE_DIR = path.join(RUNTIME_DIR, '.cache');
const MANIFEST = path.join(RUNTIME_DIR, 'manifest.json');
const SIDECAR = path.join(BIN_DIR, 'runtime.json');

const RELEASE = 'b11835';
const COMMIT = 'f64a49819';
const RELEASE_URL = `https://github.com/ggml-org/llama.cpp/releases/tag/${RELEASE}`;

/** GitHub reports these digests on the release asset itself. */
const ASSETS = {
  'win32-x64': {
    name: `llama-${RELEASE}-bin-win-cpu-x64.zip`,
    bytes: 24_081_155,
    sha256: '256e606f93b7f7dfb440e8d78bdbac34184c3b45ae4defead4e072a84afe63e4',
  },
  'win32-arm64': {
    name: `llama-${RELEASE}-bin-win-cpu-arm64.zip`,
    bytes: 12_706_478,
    sha256: '3e3695e4004d5e1d8d0d142e6e665172503e03c15df32f26b7442dc36a498011',
  },
};

const REQUIRED = [
  'llama-server.exe',
  'llama-server-impl.dll',
  'llama-common.dll',
  'llama.dll',
  'ggml.dll',
  'ggml-base.dll',
  'libomp.dll',
  'mtmd.dll',
];
const REQUIRED_PREFIX = 'ggml-cpu-';
const MAX_UNPACKED = 128 * 1024 * 1024;

function fail(message) {
  console.error(`fetch-runtime: ${message}`);
  process.exit(1);
}

function allowlisted(name) {
  if (REQUIRED.includes(name)) return true;
  if (name === 'LICENSE-LLVM-OpenMP') return true;
  return name.startsWith(REQUIRED_PREFIX) && name.endsWith('.dll');
}

function u16(buffer, offset) {
  return buffer.readUInt16LE(offset);
}

function u32(buffer, offset) {
  return buffer.readUInt32LE(offset);
}

function findEndRecord(buffer) {
  const min = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= min; offset -= 1) {
    if (u32(buffer, offset) !== 0x06054b50) continue;
    const comment = u16(buffer, offset + 20);
    if (offset + 22 + comment === buffer.length) return offset;
  }
  fail('the downloaded archive has no ZIP end record');
}

/**
 * Reads the central directory and extracts only the allowlisted root files.
 * Names are never reused as paths: a name with a separator is refused, and
 * every file is created exclusively in the runtime directory.
 */
function extract(zip, destination) {
  const eocd = findEndRecord(zip);
  const count = u16(zip, eocd + 10);
  const centralOffset = u32(zip, eocd + 16);
  if (count < 1 || count > 2_000) fail(`the archive reports ${count} entries`);
  if (centralOffset >= zip.length) fail('the central directory points outside the archive');

  fs.mkdirSync(destination, { recursive: true });
  let offset = centralOffset;
  let written = 0;
  const files = [];

  for (let index = 0; index < count; index += 1) {
    if (u32(zip, offset) !== 0x02014b50) fail('a central-directory entry is malformed');
    const method = u16(zip, offset + 10);
    const compressedSize = u32(zip, offset + 20);
    const uncompressedSize = u32(zip, offset + 24);
    const nameLength = u16(zip, offset + 28);
    const extraLength = u16(zip, offset + 30);
    const commentLength = u16(zip, offset + 32);
    const localOffset = u32(zip, offset + 42);
    const name = zip.toString('utf8', offset + 46, offset + 46 + nameLength);
    const next = offset + 46 + nameLength + extraLength + commentLength;

    if (!name || name.includes('\0')) fail('the archive contains an empty entry name');
    if (!allowlisted(name)) {
      offset = next;
      continue;
    }
    if (name.includes('/') || name.includes('\\') || /^[a-zA-Z]:/.test(name)) {
      fail(`refusing an entry with a path: ${name}`);
    }
    if (method !== 0 && method !== 8) fail(`${name} uses unsupported compression ${method}`);
    if (u32(zip, localOffset) !== 0x04034b50) fail(`${name} has no local header`);
    if (uncompressedSize > MAX_UNPACKED) fail(`${name} is larger than the unpacked cap`);

    const dataStart =
      localOffset + 30 + u16(zip, localOffset + 26) + u16(zip, localOffset + 28);
    if (dataStart + compressedSize > zip.length) fail(`${name} runs past the archive`);
    const compressed = zip.subarray(dataStart, dataStart + compressedSize);
    let data;
    try {
      data = method === 0 ? compressed : inflateRawSync(compressed);
    } catch {
      fail(`${name} could not be decompressed`);
    }
    if (data.length !== uncompressedSize) fail(`${name} has the wrong unpacked size`);

    const target = path.join(destination, name);
    fs.writeFileSync(target, data, { flag: 'wx' });
    files.push({ name, bytes: data.length });
    written += data.length;
    offset = next;
  }

  for (const name of REQUIRED) {
    if (!files.some(file => file.name === name)) fail(`the archive lacks ${name}`);
  }
  if (!files.some(file => file.name.startsWith(REQUIRED_PREFIX))) {
    fail('the archive lacks a CPU backend');
  }
  if (written > MAX_UNPACKED) fail('the extracted runtime is larger than the cap');
  return files;
}

async function download(url, target) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) fail(`download returned HTTP ${response.status}`);
  const total = Number(response.headers.get('content-length'));
  if (!Number.isSafeInteger(total) || total <= 0) fail('download has no usable length');
  const part = `${target}.part`;
  const handle = await fsp.open(part, 'w');
  const hash = createHash('sha256');
  let received = 0;
  try {
    for await (const chunk of Readable.fromWeb(response.body)) {
      received += chunk.length;
      if (received > total) fail('download grew past its advertised length');
      hash.update(chunk);
      await handle.write(chunk);
    }
  } finally {
    await handle.close();
  }
  return { bytes: received, sha256: hash.digest('hex'), part, total };
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function runtimeReady(asset) {
  const sidecar = readJson(SIDECAR);
  if (!sidecar || sidecar.release !== RELEASE || sidecar.asset !== asset.name) return false;
  if (sidecar.sha256 !== asset.sha256) return false;
  if (!Array.isArray(sidecar.files)) return false;
  for (const file of sidecar.files) {
    if (typeof file?.name !== 'string' || !Number.isSafeInteger(file.bytes)) return false;
    try {
      const stat = fs.statSync(path.join(BIN_DIR, file.name));
      if (!stat.isFile() || stat.size !== file.bytes) return false;
    } catch {
      return false;
    }
  }
  return REQUIRED.every(name => fs.existsSync(path.join(BIN_DIR, name)));
}

async function main() {
  const force = process.argv.includes('--force');
  const key = `${process.platform}-${process.arch}`;
  const asset = ASSETS[key];
  if (!asset) {
    fail(
      `no bundled runtime for ${key}; this script supports ${Object.keys(ASSETS).join(', ')}`,
    );
  }
  if (!force && runtimeReady(asset)) {
    console.log(`fetch-runtime: ${RELEASE} already in runtime/bin`);
    return;
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cached = path.join(CACHE_DIR, asset.name);
  let haveCache = false;
  try {
    const stat = fs.statSync(cached);
    if (stat.isFile() && stat.size === asset.bytes) {
      const digest = createHash('sha256').update(await fsp.readFile(cached)).digest('hex');
      haveCache = digest === asset.sha256;
    }
  } catch {
    /* no cache yet */
  }

  if (!haveCache) {
    const url = `https://github.com/ggml-org/llama.cpp/releases/download/${RELEASE}/${asset.name}`;
    console.log(`fetch-runtime: downloading ${asset.name} (${(asset.bytes / 1e6).toFixed(1)} MB)`);
    let result;
    try {
      result = await download(url, cached);
    } catch (error) {
      fail(`download failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (result.total !== asset.bytes || result.bytes !== asset.bytes) {
      await fsp.rm(result.part, { force: true });
      fail(`size mismatch: expected ${asset.bytes} bytes, received ${result.bytes}`);
    }
    if (result.sha256 !== asset.sha256) {
      await fsp.rm(result.part, { force: true });
      fail(`SHA-256 mismatch: expected ${asset.sha256}, received ${result.sha256}`);
    }
    await fsp.rm(cached, { force: true });
    await fsp.rename(result.part, cached);
  } else {
    console.log(`fetch-runtime: using cached ${asset.name}`);
  }

  const zip = await fsp.readFile(cached);
  if (createHash('sha256').update(zip).digest('hex') !== asset.sha256) {
    fail('the cached archive no longer matches its pinned SHA-256');
  }

  await fsp.rm(BIN_DIR, { recursive: true, force: true });
  fs.mkdirSync(BIN_DIR, { recursive: true });
  const files = extract(zip, BIN_DIR);

  // The ZIP carries the OpenMP runtime's license but not llama.cpp's own MIT
  // text. Fetch it from the same pinned tag; a cached copy survives offline.
  const licenseCache = path.join(CACHE_DIR, 'LICENSE-llama.cpp');
  let license;
  try {
    license = await fsp.readFile(licenseCache, 'utf8');
  } catch {
    const response = await fetch(`https://raw.githubusercontent.com/ggml-org/llama.cpp/${RELEASE}/LICENSE`);
    if (!response.ok) fail(`the llama.cpp license returned HTTP ${response.status}`);
    license = await response.text();
    if (!license.includes('MIT License') || license.length < 500) {
      fail('the llama.cpp license did not look like the MIT text');
    }
    await fsp.writeFile(licenseCache, license, 'utf8');
  }
  fs.writeFileSync(path.join(BIN_DIR, 'LICENSE-llama.cpp'), license, { flag: 'wx' });
  files.push({ name: 'LICENSE-llama.cpp', bytes: Buffer.byteLength(license) });

  const manifest = {
    release: RELEASE,
    commit: COMMIT,
    asset: asset.name,
    sha256: asset.sha256,
    bytes: asset.bytes,
    releaseUrl: RELEASE_URL,
    license: 'MIT',
    fetchedAt: new Date().toISOString(),
    files,
  };
  fs.writeFileSync(SIDECAR, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const total = files.reduce((sum, file) => sum + file.bytes, 0);
  console.log(
    `fetch-runtime: ${RELEASE} ready in runtime/bin (${files.length} files, ${(total / 1e6).toFixed(
      1,
    )} MB)`,
  );
}

main().catch(error => fail(error instanceof Error ? error.message : String(error)));
