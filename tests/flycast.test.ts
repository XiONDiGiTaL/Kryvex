import { describe, expect, it } from 'vitest';
import {
  FLYCAST_CORE,
  FLYCAST_INSTALL_BYTES,
  FLYCAST_RELEASE,
  FLYCAST_DEFAULT_OPTIONS,
  buildStoredZip,
  crc32,
  flycastCoreJson,
  flycastCoreZip,
  flycastFailureKey,
} from '../src/lib/flycast';
import { FLYCAST_CATALOGUE, FLYCAST_ASSETS } from '../electron/flycast-catalogue';

/** A minimal reader for the archive this module writes; the point is to prove
 * the bytes are a zip, not to trust the writer's own bookkeeping. */
function readZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  const centralSize = view.getUint32(end + 12, true);
  const centralStart = view.getUint32(end + 16, true);
  expect(centralStart + centralSize).toBe(end);

  const entries: Array<{ name: string; bytes: Uint8Array; crc: number; method: number }> = [];
  let cursor = centralStart;
  for (let index = 0; index < count; index += 1) {
    expect(view.getUint32(cursor, true)).toBe(0x02014b50);
    const method = view.getUint16(cursor + 10, true);
    const crc = view.getUint32(cursor + 16, true);
    const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = new TextDecoder().decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));

    expect(view.getUint32(localOffset, true)).toBe(0x04034b50);
    expect(view.getUint16(localOffset + 8, true)).toBe(method);
    expect(view.getUint32(localOffset + 14, true)).toBe(crc);
    expect(view.getUint32(localOffset + 22, true)).toBe(size);
    const localName = view.getUint16(localOffset + 26, true);
    expect(localName).toBe(nameLength);
    const dataStart = localOffset + 30 + localName + view.getUint16(localOffset + 28, true);

    entries.push({ name, bytes: bytes.slice(dataStart, dataStart + size), crc, method });
    cursor += 46 + nameLength;
  }
  return entries;
}

const text = (value: string) => new TextEncoder().encode(value);

describe('Flycast packaging', () => {
  it('computes the CRC a zip reader will check', () => {
    // The standard check value for "123456789".
    expect(crc32(text('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('writes a stored archive whose directory and entries agree', () => {
    const first = text('first file');
    const second = new Uint8Array([0, 1, 2, 3, 250, 251]);
    const zip = buildStoredZip([
      { name: 'a.txt', bytes: first },
      { name: 'nested/b.bin', bytes: second },
    ]);
    const entries = readZip(zip);
    expect(entries.map(entry => entry.name)).toEqual(['a.txt', 'nested/b.bin']);
    expect(entries.every(entry => entry.method === 0)).toBe(true);
    expect(entries[0]!.bytes).toEqual(first);
    expect(entries[1]!.bytes).toEqual(second);
    expect(entries[0]!.crc).toBe(crc32(first));
  });

  it('names every file the frontend looks for, including the licence', () => {
    const zip = flycastCoreZip({
      js: text('// core'),
      wasm: new Uint8Array([0x00, 0x61, 0x73, 0x6d]),
    });
    const entries = readZip(zip);
    expect(entries.map(entry => entry.name)).toEqual([
      `${FLYCAST_CORE}.js`,
      `${FLYCAST_CORE}.wasm`,
      'core.json',
      'license.txt',
    ]);
    const core = JSON.parse(new TextDecoder().decode(entries[2]!.bytes));
    expect(core.name).toBe('flycast');
    expect(core.extensions).toContain('cdi');
    expect(core.license).toBe('GPLv2');
    // The repository the frontend credits is the emulator's own, not the build.
    expect(core.repo).toBe('https://github.com/flyinghead/flycast');
    // The notice inside the payload names both projects and the licence.
    const notice = new TextDecoder().decode(entries[3]!.bytes);
    expect(notice).toContain('GPLv2');
    expect(notice).toContain('nasomers/flycast-wasm');
    expect(notice).toContain('flyinghead/flycast');
  });

  it('asks the frontend for the WebGL2 build, which is the only one that exists', () => {
    // The frontend chooses `<core>-wasm.data` over `<core>-legacy-wasm.data`
    // from a setting, and the release publishes no legacy build. A report blob
    // cannot carry this: the frontend reads a blob download as bytes and never
    // parses it, so the setting is the only route that works.
    expect(FLYCAST_DEFAULT_OPTIONS.webgl2Enabled).toBe('enabled');
    expect(FLYCAST_DEFAULT_OPTIONS['save-state-location']).toBe('browser');
    expect(flycastCoreJson()).toContain('"options":{}');
  });

  it('describes a download that can be shown before it starts', () => {
    const total = FLYCAST_RELEASE.js.bytes + FLYCAST_RELEASE.wasm.bytes;
    expect(FLYCAST_INSTALL_BYTES).toBe(total);
    expect(total).toBeGreaterThan(10 * 1024 * 1024);
  });

  it('keeps the main-process catalogue in step with the renderer', () => {
    // The two processes cannot share a module (separate TS roots), so the
    // pinned release is written twice. This is the guard against drift: a hash
    // or a URL changed in one place and not the other fails here.
    expect(FLYCAST_CATALOGUE.version).toBe('v1.0');
    expect(FLYCAST_CATALOGUE.project).toBe(FLYCAST_RELEASE.project);
    expect(FLYCAST_CATALOGUE.upstream).toBe(FLYCAST_RELEASE.upstream);
    expect(FLYCAST_CATALOGUE.licence).toBe(FLYCAST_RELEASE.licence);
    for (const key of ['js', 'wasm'] as const) {
      expect(FLYCAST_CATALOGUE[key]).toEqual(FLYCAST_RELEASE[key]);
      expect(FLYCAST_ASSETS).toContainEqual(FLYCAST_CATALOGUE[key]);
    }
  });

  it('turns a failure id into copy that can be translated', () => {
    expect(flycastFailureKey('hash')).toMatch(/pinned release/);
    expect(flycastFailureKey('disk-space')).toMatch(/free space/);
    expect(flycastFailureKey('not-installed')).toMatch(/Install the engine/);
    expect(flycastFailureKey('something-new')).toMatch(/interrupted/);
  });
});
