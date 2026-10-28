/**
 * The second engine: Flycast, for Dreamcast.
 *
 * Kryvex's cartridge slot uses one emulator frontend, and that frontend
 * publishes no Dreamcast core — measured against its own `cores.json`, which
 * has no `flycast`, `reicast`, `dreamcast` or `naomi` entry (see
 * docs/EMULATOR_ENGINES.md). The only route to the format is a second core, and
 * the one that exists is a third-party WebAssembly build of Flycast.
 *
 * This module is the part of that engine Kryvex owns: the pinned release it is
 * willing to load, and the packaging the frontend needs. It deliberately does
 * not contain a byte of the core. The frontend reads a core as a zip named
 * `<core>-wasm.data` containing `<name>.js`, `<name>.wasm`, `core.json` and an
 * optional `license.txt`; Flycast's release ships the first two as separate
 * files, so this module builds that zip in memory from a copy the main process
 * fetched from the project's own release and hash-checked.
 *
 * Why the zip is built here instead of downloaded: the core is GPLv2, and
 * Kryvex's boundary is that no GPL code is bundled in the installer. The user's
 * machine fetches the release from its publisher; Kryvex only repackages those
 * bytes for the frontend it already runs. `docs/EMULATOR_ENGINES.md` records
 * the reasoning and the measurements behind it.
 */
/** The core name the frontend sees; it is also the zip's `core.json` name. */
export const FLYCAST_CORE = 'flycast';

const RELEASE_ROOT = 'https://github.com/nasomers/flycast-wasm/releases/download/v1.0';

/**
 * One pinned release, and nothing else will be loaded.
 *
 * The hash is what makes this a fixed dependency rather than "whatever that
 * URL serves today": a release rewritten upstream stops being installable
 * instead of silently becoming a different emulator.
 */
export const FLYCAST_RELEASE = {
  version: 'flycast-wasm v1.0',
  /** Where the core comes from; shown in the interface and the docs. */
  project: 'https://github.com/nasomers/flycast-wasm',
  upstream: 'https://github.com/flyinghead/flycast',
  licence: 'GPLv2',
  js: {
    name: 'flycast_libretro.js',
    url: `${RELEASE_ROOT}/flycast_libretro.js`,
    bytes: 312644,
    sha256: '1f2ae9afafa85c8ff577ca3961be0343c2ac394ddc79285981f0d55ad75dbd7b',
  },
  wasm: {
    name: 'flycast_libretro.wasm',
    url: `${RELEASE_ROOT}/flycast_libretro.wasm`,
    bytes: 10398725,
    sha256: 'db2b87d8d2742087a56c4eeed317da14e3549ee037e36de3d77c1e6e5291bead',
  },
} as const;

/** What the download has to move: the two core files. */
export const FLYCAST_INSTALL_BYTES = FLYCAST_RELEASE.js.bytes + FLYCAST_RELEASE.wasm.bytes;

/**
 * The attribution the archive carries.
 *
 * Not the GPL text itself: the user fetched the binary from the publisher's
 * own release, which ships the licence and the source, and Kryvex conveys
 * neither. What the frontend shows as the core's licence is this notice, so the
 * two projects are named wherever the payload is. (A pinned download of the
 * licence file is not usable here: it is served gzip-encoded, and a downloader
 * that enforces the pinned byte count refuses it — measured.)
 */
export const FLYCAST_LICENCE_NOTICE = [
  'Flycast — GPLv2.',
  `This build: ${FLYCAST_RELEASE.project} (${FLYCAST_RELEASE.version}).`,
  `The emulator: ${FLYCAST_RELEASE.upstream}.`,
  'Kryvex fetched it from its own release at your request and did not modify it.',
].join('\n');

/**
 * The console metadata the frontend reads out of the zip.
 *
 * It is the release's own `config/core.json`, read from the tag this pin names.
 * The extension list is the core's, not a guess: it is what decides which files
 * the slot offers while the engine is enabled.
 */
export function flycastCoreJson(): string {
  return JSON.stringify({
    name: FLYCAST_CORE,
    extensions: ['cdi', 'gdi', 'chd', 'cue', 'iso', 'elf', 'bin', 'lst', 'zip', '7z', 'dat'],
    options: {},
    save: 'state',
    license: FLYCAST_RELEASE.licence,
    repo: FLYCAST_RELEASE.upstream,
  });
}

/**
 * What the frontend must think of this core before it asks for it.
 *
 * The frontend picks `<core>-wasm.data` or `<core>-legacy-wasm.data` from a
 * WebGL2 flag, and it can only learn that flag from a per-core report it
 * fetches over HTTP or from a setting. A report handed over as a blob does not
 * work: the frontend reads that download as bytes and never parses it (measured
 * — see docs/EMULATOR_ENGINES.md), which leaves the flag at "not known" and
 * makes it ask for the legacy build this release does not publish. The setting
 * is honoured, so the frame sets it:
 * `webgl2Enabled: 'enabled'`, which also makes the frontend's own menu agree
 * with what the core does.
 */
export const FLYCAST_DEFAULT_OPTIONS = {
  'save-state-location': 'browser',
  webgl2Enabled: 'enabled',
} as const;

/** What the main process hands over once the release is on disk and verified. */
export interface FlycastCoreFiles {
  js: Uint8Array;
  wasm: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

/** Standard CRC-32, which every zip reader checks before it trusts an entry. */
export function crc32(bytes: Uint8Array, seed = 0): number {
  let value = (seed ^ 0xffffffff) >>> 0;
  for (let index = 0; index < bytes.length; index += 1) {
    value = CRC_TABLE[(value ^ bytes[index]!) & 0xff]! ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

/**
 * A zip with no compression, which is the only kind that can be written without
 * a deflate implementation and the only kind this payload needs: the wasm and
 * the js are already dense, and the frontend stores the archive as one blob.
 *
 * Entries are stored, so an archive reader cannot disagree with a decompressor
 * about the bytes — the CRC and both sizes are the whole contract.
 */
export function buildStoredZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const prepared = entries.map(entry => {
    const name = encoder.encode(entry.name);
    if (name.length === 0 || name.length > 0xffff) throw new Error('A zip entry needs a name.');
    if (entry.bytes.length > 0xffffffff) throw new Error('A zip entry is too large.');
    return { name, bytes: entry.bytes, crc: crc32(entry.bytes) };
  });

  const localSize = prepared.reduce((total, entry) => total + 30 + entry.name.length + entry.bytes.length, 0);
  const centralSize = prepared.reduce((total, entry) => total + 46 + entry.name.length, 0);
  const endSize = 22;
  const out = new Uint8Array(localSize + centralSize + endSize);
  const view = new DataView(out.buffer);
  let offset = 0;

  const written: Array<{ entry: (typeof prepared)[number]; offset: number }> = [];
  for (const entry of prepared) {
    written.push({ entry, offset });
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, 20, true); // version needed
    view.setUint16(offset + 6, 0, true); // flags
    view.setUint16(offset + 8, 0, true); // stored
    view.setUint16(offset + 10, 0, true); // time
    view.setUint16(offset + 12, 0x21, true); // date: 1980-01-01, deterministic
    view.setUint32(offset + 14, entry.crc, true);
    view.setUint32(offset + 18, entry.bytes.length, true);
    view.setUint32(offset + 22, entry.bytes.length, true);
    view.setUint16(offset + 26, entry.name.length, true);
    view.setUint16(offset + 28, 0, true);
    out.set(entry.name, offset + 30);
    out.set(entry.bytes, offset + 30 + entry.name.length);
    offset += 30 + entry.name.length + entry.bytes.length;
  }

  const centralStart = offset;
  for (const item of written) {
    view.setUint32(offset, 0x02014b50, true);
    view.setUint16(offset + 4, 20, true); // made by
    view.setUint16(offset + 6, 20, true); // version needed
    view.setUint16(offset + 8, 0, true);
    view.setUint16(offset + 10, 0, true);
    view.setUint16(offset + 12, 0, true);
    view.setUint16(offset + 14, 0x21, true);
    view.setUint32(offset + 16, item.entry.crc, true);
    view.setUint32(offset + 20, item.entry.bytes.length, true);
    view.setUint32(offset + 24, item.entry.bytes.length, true);
    view.setUint16(offset + 28, item.entry.name.length, true);
    view.setUint16(offset + 30, 0, true); // extra
    view.setUint16(offset + 32, 0, true); // comment
    view.setUint16(offset + 34, 0, true); // disk
    view.setUint16(offset + 36, 0, true); // internal attrs
    view.setUint32(offset + 38, 0, true); // external attrs
    view.setUint32(offset + 42, item.offset, true);
    out.set(item.entry.name, offset + 46);
    offset += 46 + item.entry.name.length;
  }

  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 4, 0, true);
  view.setUint16(offset + 6, 0, true);
  view.setUint16(offset + 8, written.length, true);
  view.setUint16(offset + 10, written.length, true);
  view.setUint32(offset + 12, centralSize, true);
  view.setUint32(offset + 16, centralStart, true);
  view.setUint16(offset + 20, 0, true);
  return out;
}

/**
 * The payload the frontend is handed for a Dreamcast game.
 *
 * The file names inside matter: the frontend unzips, picks the entry ending in
 * `.wasm` and the one ending in `.js`, and reads `core.json` for the console's
 * name, its extensions and its repository. `license.txt` is read into the
 * frontend's licence line, so the credit is visible from inside the payload.
 */
export function flycastCoreZip(core: FlycastCoreFiles): Uint8Array {
  return buildStoredZip([
    { name: `${FLYCAST_CORE}.js`, bytes: core.js },
    { name: `${FLYCAST_CORE}.wasm`, bytes: core.wasm },
    { name: 'core.json', bytes: new TextEncoder().encode(flycastCoreJson()) },
    { name: 'license.txt', bytes: new TextEncoder().encode(`${FLYCAST_LICENCE_NOTICE}\n`) },
  ]);
}

/**
 * Why an install or a payload read failed, as an English key the interface
 * translates. Ids come from the main process; a sentence there would arrive in
 * the wrong language.
 */
export function flycastFailureKey(failure: string): string {
  switch (failure) {
    case 'hash':
      return 'That download did not match the pinned release, so it was discarded.';
    case 'size':
      return 'The engine arrived incomplete and was discarded.';
    case 'disk-space':
      return 'There is not enough free space for the engine.';
    case 'cancelled':
      return 'The engine download was cancelled.';
    case 'write':
      return 'The engine could not be written to disk.';
    case 'not-installed':
      return 'Install the engine before starting a Dreamcast game.';
    case 'busy':
      return 'The engine is already being installed.';
    default:
      return 'The engine download was interrupted. Check the connection and try again.';
  }
}
