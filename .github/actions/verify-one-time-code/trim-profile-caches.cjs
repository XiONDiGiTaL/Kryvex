/* eslint-disable no-console */
/**
 * Strip Chromium cache directories from a verification profile before it is
 * uploaded as a CI artifact.
 *
 * A failed Electron run leaves behind a profile that is mostly disposable
 * browser cache. Keeping Cookies, Local Storage, IndexedDB, Network and
 * Service Worker databases makes the failure reproducible; keeping the cache
 * only makes the artifact larger.
 *
 * This is best-effort: a missing or locked profile must never mask the
 * verification failure that triggered the upload.
 */
const fs = require('node:fs');
const path = require('node:path');

// Chromium recreates these on the next launch. Matching is case-insensitive
// and applies at any depth, including per-service partitions.
const CACHE_DIRECTORIES = new Set([
  'cache',
  'code cache',
  'gpucache',
  'dawncache',
  'dawngraphitecache',
  'dawnwebgpucache',
  'graphitedawncache',
  'grshadercache',
  'shadercache',
  'cachestorage',
  'scriptcache',
  'media cache',
]);

function collectCaches(directory, found) {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    console.warn(`profile caches: cannot read ${directory}: ${error.message}`);
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const target = path.join(directory, entry.name);
    if (CACHE_DIRECTORIES.has(entry.name.toLowerCase())) {
      found.push(target);
      continue;
    }
    collectCaches(target, found);
  }
}

function measure(directory) {
  let bytes = 0;
  let files = 0;
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return { bytes, files };
  }

  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = measure(target);
      bytes += nested.bytes;
      files += nested.files;
    } else if (entry.isFile()) {
      try {
        bytes += fs.statSync(target).size;
        files += 1;
      } catch {
        /* the file disappeared or is locked; it simply is not counted */
      }
    }
  }
  return { bytes, files };
}

function main() {
  const profile = path.resolve(process.argv[2] || '.tmp-otp-verify-profile');
  if (!fs.existsSync(profile)) {
    console.log(`profile caches: no profile at ${profile}; nothing to trim.`);
    return;
  }

  const caches = [];
  collectCaches(profile, caches);
  if (caches.length === 0) {
    console.log('profile caches: none found.');
    return;
  }

  let removed = 0;
  let bytes = 0;
  let files = 0;
  const failures = [];

  for (const cache of caches) {
    const size = measure(cache);
    try {
      fs.rmSync(cache, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      removed += 1;
      bytes += size.bytes;
      files += size.files;
    } catch (error) {
      failures.push(`${cache}: ${error.message}`);
    }
  }

  const megabytes = (bytes / (1024 * 1024)).toFixed(1);
  console.log(
    `profile caches: removed ${removed}/${caches.length} directories, ` +
      `${files} files, ${megabytes} MB.`,
  );

  for (const failure of failures) {
    console.warn(`profile caches: could not remove ${failure}`);
  }
}

// Trimming is an optimization, so never fail the job here.
main();
