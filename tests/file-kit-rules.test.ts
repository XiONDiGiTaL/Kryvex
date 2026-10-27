import { describe, expect, it } from 'vitest';
import {
  MAX_FILE_BYTES,
  WRITABLE_EXTENSIONS,
  decodeBase64,
  extOf,
  isPlainFileName,
  kindOfExtension,
  safeFileName,
  sniffKind,
  uniqueName,
} from '../electron/file-kit-rules';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
const bmp = Buffer.from([0x42, 0x4d, 0x36, 0x00]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.from([1])]);
const pdf = Buffer.from('%PDF-1.7\n');

describe('what may be written', () => {
  it('keeps a plain name and refuses a path, a traversal or a bad character', () => {
    expect(safeFileName('holiday.png')).toBe('holiday.png');
    expect(safeFileName('../../etc/passwd')).toBeNull();
    expect(safeFileName('C:\\Windows\\evil.png')).toBe('evil.png');
    expect(safeFileName('re:port?.png')).toBe('report.png');
    expect(safeFileName('no-extension')).toBeNull();
    expect(safeFileName('')).toBeNull();
    expect(safeFileName(12)).toBeNull();
  });

  it('refuses an extension the app never writes', () => {
    expect(safeFileName('setup.exe')).toBeNull();
    expect(safeFileName('macro.js')).toBeNull();
    expect(safeFileName('notes.csv')).toBe('notes.csv');
    expect(WRITABLE_EXTENSIONS).toContain('kxcanvas');
  });

  it('reduces a long stem rather than dropping the extension', () => {
    const long = `${'a'.repeat(300)}.png`;
    const safe = safeFileName(long);
    expect(safe).not.toBeNull();
    expect(safe!.endsWith('.png')).toBe(true);
    expect(safe!.length).toBeLessThanOrEqual(94);
  });

  it('knows a file name from something that is not one', () => {
    expect(isPlainFileName('photo.jpg')).toBe(true);
    expect(isPlainFileName('sub/photo.jpg')).toBe(false);
    expect(isPlainFileName('..')).toBe(false);
    expect(isPlainFileName('photo')).toBe(false);
    expect(isPlainFileName('a\u0000b.jpg')).toBe(false);
  });

  it('names an extension and the kind it implies', () => {
    expect(extOf('Photo.PNG')).toBe('png');
    expect(extOf('archive.tar.gz')).toBe('gz');
    expect(kindOfExtension('sheet.csv')).toBe('data');
    expect(kindOfExtension('clip.mp4')).toBeNull();
  });
});

describe('what may be read back', () => {
  it('decodes base64 and refuses anything else', () => {
    expect(decodeBase64(Buffer.from('hello').toString('base64'), 1024)?.toString()).toBe('hello');
    expect(decodeBase64('not base64!!', 1024)).toBeNull();
    expect(decodeBase64('', 1024)).toBeNull();
    expect(decodeBase64(123, 1024)).toBeNull();
  });

  it('rejects a payload over the limit before copying it', () => {
    const big = Buffer.alloc(MAX_FILE_BYTES + 1).toString('base64');
    expect(decodeBase64(big, MAX_FILE_BYTES)).toBeNull();
    const small = Buffer.alloc(64).toString('base64');
    expect(decodeBase64(small, 8)).toBeNull();
  });
});

describe('what a payload actually is', () => {
  it('recognises the formats the tools write', () => {
    expect(sniffKind(png)).toBe('image');
    expect(sniffKind(jpeg)).toBe('image');
    expect(sniffKind(bmp)).toBe('image');
    expect(sniffKind(webp)).toBe('image');
    expect(sniffKind(pdf)).toBe('pdf');
    expect(sniffKind(Buffer.from('{"rows":[1]}'))).toBe('data');
    expect(sniffKind(Buffer.from('{"kryvexCanvas":1,"items":[]}'))).toBe('kxcanvas');
  });

  it('refuses something with no header at all, and refuses binary dressed as text', () => {
    expect(sniffKind(Buffer.from([1]))).toBeNull();
    expect(sniffKind(Buffer.from([0x41, 0x42, 0x00, 0x43]))).toBeNull();
  });

  it('catches a file that lies about its own format', () => {
    // A PNG payload named .pdf must not be written as a PDF.
    expect(sniffKind(png)).not.toBe('pdf');
    expect(sniffKind(pdf)).not.toBe('image');
  });
});

describe('a name that is already taken', () => {
  it('suffixes rather than overwriting', () => {
    const taken = new Set<string>(['shot.png']);
    expect(uniqueName('shot.png', taken)).toBe('shot (2).png');
    expect(uniqueName('shot.png', taken)).toBe('shot (3).png');
    expect(uniqueName('other.png', taken)).toBe('other.png');
  });

  it('compares without caring about case, because Windows does not', () => {
    const taken = new Set<string>();
    expect(uniqueName('Shot.PNG', taken)).toBe('Shot.PNG');
    expect(uniqueName('shot.png', taken)).toBe('shot (2).png');
  });
});
