import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { extractZip, ZipError } from '../electron/zip-extract';

/** Folders the tests unpack into, removed after each case. */
const created: string[] = [];

function workspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-zip-'));
  created.push(dir);
  return path.join(dir, 'unpacked');
}

afterEach(() => {
  for (const dir of created.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

interface EntrySpec {
  name: string;
  data?: Buffer;
  method?: number;
  /** Version-made-by; the default is Unix 2.0, which carries a file mode. */
  madeBy?: number;
  /** Raw external attributes, including the Unix mode in the high half. */
  external?: number;
  flags?: number;
  /** Overrides the size written to the central directory. */
  declaredCompressed?: number;
  declaredUncompressed?: number;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer: Buffer): number {
  let value = 0xffffffff;
  for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function buildZip(specs: EntrySpec[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const spec of specs) {
    const name = Buffer.from(spec.name, 'utf8');
    const raw = spec.data ?? Buffer.alloc(0);
    const method = spec.method ?? 0;
    const body = method === 8 ? zlib.deflateRawSync(raw) : raw;
    const compressed = spec.declaredCompressed ?? body.length;
    const uncompressed = spec.declaredUncompressed ?? raw.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(spec.flags ?? 0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(spec.madeBy ?? 0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(spec.flags ?? 0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc32(raw), 16);
    central.writeUInt32LE(compressed, 20);
    central.writeUInt32LE(uncompressed, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(spec.external ?? 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(specs.length, 8);
  end.writeUInt16LE(specs.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const read = (root: string, relative: string): string =>
  fs.readFileSync(path.join(root, ...relative.split('/')), 'utf8');

describe('extractZip', () => {
  it('unpacks stored and deflated entries with their bytes intact', () => {
    const root = workspace();
    const manifest = Buffer.from('{"manifest_version":3,"name":"Demo"}');
    const page = Buffer.from('<html>'.repeat(200));

    const result = extractZip(
      buildZip([
        { name: 'manifest.json', data: manifest },
        { name: 'pages/popup.html', data: page, method: 8 },
        { name: 'pages/icons/', external: 0x10 },
        { name: 'pages/icons/icon.png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]), method: 8 },
      ]),
      root,
    );

    expect(result).toEqual({ files: 3, bytes: manifest.length + page.length + 4 });
    expect(read(root, 'manifest.json')).toBe(manifest.toString('utf8'));
    expect(fs.readFileSync(path.join(root, 'pages', 'popup.html')).length).toBe(page.length);
    expect(fs.statSync(path.join(root, 'pages', 'icons')).isDirectory()).toBe(true);
  });

  it('keeps the case a package used for its folders', () => {
    const root = workspace();
    extractZip(
      buildZip([{ name: '_locales/pt_BR/messages.json', data: Buffer.from('{}') }]),
      root,
    );
    expect(fs.readdirSync(root)).toEqual(['_locales']);
    expect(fs.readdirSync(path.join(root, '_locales'))).toEqual(['pt_BR']);
  });

  it('refuses a link entry, which is how both advisories left the folder', () => {
    const root = workspace();
    const archive = buildZip([
      // A link named "escape" pointing anywhere, then a file that writes through it.
      { name: 'escape', data: Buffer.from('../../../../Windows/Temp/payload'), external: 0o120777 * 0x10000 },
      { name: 'escape/payload', data: Buffer.from('owned') },
    ]);

    expect(() => extractZip(archive, root)).toThrow(ZipError);
    expect(() => extractZip(archive, root)).toThrow(/symbolic link/);
    expect(fs.existsSync(path.join(root, 'escape'))).toBe(false);
  });

  it.each([
    ['parent segments', '../escape.txt'],
    ['nested parent segments', 'icons/../../escape.txt'],
    ['absolute paths', '/etc/passwd'],
    ['drive-qualified paths', 'C:escape.txt'],
    ['backslash separators', 'icons\\escape.txt'],
    ['a trailing dot Windows strips', 'escape.'],
    ['a trailing space Windows strips', 'escape '],
    ['a reserved device name', 'CON'],
    ['a reserved device name with an extension', 'nul.txt'],
    ['a current-directory segment', './escape.txt'],
  ])('refuses %s', (_label, name) => {
    const root = workspace();
    expect(() => extractZip(buildZip([{ name, data: Buffer.from('x') }]), root)).toThrow(ZipError);
    expect(fs.existsSync(path.join(root, 'escape.txt'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'escape'))).toBe(false);
  });

  it('refuses two entries whose names Windows would fold together', () => {
    const root = workspace();
    const archive = buildZip([
      { name: 'file.txt', data: Buffer.from('one') },
      { name: 'FILE.txt', data: Buffer.from('two') },
    ]);
    expect(() => extractZip(archive, root)).toThrow(/same name/);
  });

  it('refuses a file that would sit where a folder already is, and the reverse', () => {
    expect(() =>
      extractZip(
        buildZip([
          { name: 'icons', data: Buffer.from('file') },
          { name: 'icons/icon.png', data: Buffer.from('png') },
        ]),
        workspace(),
      ),
    ).toThrow(/folder/);

    expect(() =>
      extractZip(
        buildZip([
          { name: 'icons/', external: 0x10 },
          { name: 'icons', data: Buffer.from('file') },
        ]),
        workspace(),
      ),
    ).toThrow(/folder/);
  });

  it('refuses an encrypted entry, an unknown method and ZIP64 sizes', () => {
    expect(() => extractZip(buildZip([{ name: 'a.txt', data: Buffer.from('x'), flags: 0x1 }]), workspace()))
      .toThrow(/Encrypted/);
    expect(() => extractZip(buildZip([{ name: 'a.txt', data: Buffer.from('x'), method: 12 }]), workspace()))
      .toThrow(/unsupported compression/);
    expect(() =>
      extractZip(
        buildZip([{ name: 'a.txt', data: Buffer.from('x'), declaredUncompressed: 0xffffffff }]),
        workspace(),
      ),
    ).toThrow(/ZIP64/);
  });

  it('refuses a stored entry whose two size fields disagree', () => {
    expect(() =>
      extractZip(buildZip([{ name: 'a.txt', data: Buffer.from('abc'), declaredUncompressed: 99 }]), workspace()),
    ).toThrow(/inconsistent sizes/);
  });

  it('refuses data that does not match the size the index claims', () => {
    const archive = buildZip([
      { name: 'bomb.txt', data: Buffer.alloc(4096, 0x41), method: 8, declaredUncompressed: 16 },
    ]);
    expect(() => extractZip(archive, workspace())).toThrow(/decompress|unexpected size/);
  });

  it('refuses a buffer that is not a ZIP, and one with no files', () => {
    expect(() => extractZip(Buffer.from('not a zip at all'), workspace())).toThrow(/not a readable ZIP/);
    expect(() =>
      extractZip(buildZip([{ name: 'empty/', external: 0x10 }]), workspace()),
    ).toThrow(/no files/);
  });

  it('never overwrites a file that is already there', () => {
    const root = workspace();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'manifest.json'), 'original');
    expect(() =>
      extractZip(buildZip([{ name: 'manifest.json', data: Buffer.from('replaced') }]), root),
    ).toThrow(/overwrite/);
    expect(read(root, 'manifest.json')).toBe('original');
  });

  it('rejects a truncated archive instead of unpacking part of it', () => {
    const archive = buildZip([
      { name: 'one.txt', data: Buffer.from('one') },
      { name: 'two.txt', data: Buffer.from('two') },
    ]);
    expect(() => extractZip(archive.subarray(0, archive.length - 10), workspace())).toThrow(ZipError);
  });
});
