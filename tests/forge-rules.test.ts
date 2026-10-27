import { describe, expect, it } from 'vitest';
import {
  IMAGE_INPUTS,
  IMAGE_OUTPUTS,
  applyRenamePattern,
  csvToJson,
  detectDelimiter,
  encodeBmp,
  extensionOf,
  fitSize,
  formatBytes,
  imageOutputName,
  isImageFormat,
  jsonToCsv,
  pageSizeFor,
  parsePageOrder,
  parsePageRanges,
  renamePlan,
} from '../src/lib/forge-rules';
import {
  PICKABLE_EXTENSIONS,
  WRITABLE_EXTENSIONS,
  kindOfExtension,
} from '../electron/file-kit-rules';

describe('image conversions', () => {
  it('offers only formats this build can actually write', () => {
    expect([...IMAGE_OUTPUTS]).toEqual(['png', 'jpeg', 'webp', 'bmp']);
    expect(isImageFormat('webp')).toBe(true);
    expect(isImageFormat('avif')).toBe(false);
    expect(extensionOf('jpeg')).toBe('jpg');
    expect(extensionOf('bmp')).toBe('bmp');
  });

  it('reads every input the picker accepts, and nothing else', () => {
    expect(IMAGE_INPUTS).toContain('gif');
    for (const extension of IMAGE_INPUTS) {
      expect(PICKABLE_EXTENSIONS.image).toContain(extension);
    }
    // The two tables live on either side of the bridge; a destination the
    // renderer offers but the main process refuses would be a silent failure.
    for (const format of IMAGE_OUTPUTS) {
      expect(WRITABLE_EXTENSIONS).toContain(extensionOf(format));
    }
    expect(kindOfExtension('holiday.PNG')).toBe('image');
    expect(kindOfExtension('notes.txt')).toBe('data');
    expect(kindOfExtension('paper.pdf')).toBe('pdf');
    expect(kindOfExtension('clip.mp4')).toBeNull();
  });

  it('fits a size into the longest edge without changing the shape', () => {
    expect(fitSize(4000, 3000, 1920)).toEqual({ width: 1920, height: 1440 });
    expect(fitSize(3000, 4000, 1920)).toEqual({ width: 1440, height: 1920 });
    expect(fitSize(800, 600, null)).toEqual({ width: 800, height: 600 });
    expect(fitSize(800, 600, 2560)).toEqual({ width: 800, height: 600 });
    // A very wide image keeps a height of one rather than collapsing.
    expect(fitSize(4000, 3, 640)).toEqual({ width: 640, height: 1 });
    expect(fitSize(Number.NaN, 10, 100)).toEqual({ width: 1, height: 10 });
  });

  it('names an output from the input, with a suffix when one is asked for', () => {
    expect(imageOutputName('holiday.PNG', 'webp')).toBe('holiday.webp');
    expect(imageOutputName('no-extension', 'jpeg')).toBe('no-extension.jpg');
    expect(imageOutputName('shot.png', 'png', '-page-2')).toBe('shot-page-2.png');
  });

  it('writes a 24-bit BMP the format spec accepts', () => {
    // Two pixels, fully opaque red and blue, at 100% alpha.
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]);
    const bytes = encodeBmp(rgba, 2, 1);
    expect(bytes.length).toBe(54 + 8); // one row padded to four bytes
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe('BM');
    expect(bytes.length).toBe(54 + 8);
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(14, true)).toBe(40);
    expect(view.getInt32(18, true)).toBe(2);
    expect(view.getInt32(22, true)).toBe(1);
    expect(view.getUint16(28, true)).toBe(24);
    // Bottom-up rows, BGR order: red is 00 00 FF in the file, blue FF 00 00.
    expect([bytes[54], bytes[55], bytes[56]]).toEqual([0, 0, 255]);
    expect([bytes[57], bytes[58], bytes[59]]).toEqual([255, 0, 0]);
    expect(view.getUint32(2, true)).toBe(bytes.length);
  });

  it('composites a transparent pixel over white, which a 24-bit BMP has room for', () => {
    const bytes = encodeBmp(new Uint8ClampedArray([0, 0, 0, 0]), 1, 1);
    expect([bytes[54], bytes[55], bytes[56]]).toEqual([255, 255, 255]);
  });
});

describe('data conversions', () => {
  it('turns a list of records into a table with one column per field', () => {
    const answer = jsonToCsv('[{"name":"Ada","age":36},{"name":"Grace","city":"NY"}]');
    expect(answer.ok).toBe(true);
    expect(answer.value).toBe('name,age,city\r\nAda,36,\r\nGrace,,NY\r\n');
  });

  it('quotes anything a comma, quote or newline would break.', () => {
    const answer = jsonToCsv('[{"note":"a,b"},{"note":"say \\"hi\\""}]');
    expect(answer.value).toBe('note\r\n"a,b"\r\n"say ""hi"""\r\n');
  });

  it('refuses JSON that is not a list of records', () => {
    expect(jsonToCsv('{"a":1}').ok).toBe(false);
    expect(jsonToCsv('nonsense').error).toBe('invalid-json');
    expect(jsonToCsv('[]').error).toBe('empty');
  });

  it('reads a table back as records, coercing numbers and booleans', () => {
    const answer = csvToJson('name,age,active\r\nAda,36,true\r\nGrace,45,false\r\n');
    expect(answer.ok).toBe(true);
    expect(JSON.parse(String(answer.value))).toEqual([
      { name: 'Ada', age: 36, active: true },
      { name: 'Grace', age: 45, active: false },
    ]);
  });

  it('honours quotes, semicolons and CRLF on the way back in', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    const answer = csvToJson('name;note\nAda;"one; two"\n');
    expect(JSON.parse(String(answer.value))).toEqual([{ name: 'Ada', note: 'one; two' }]);
  });

  it('names a column it was not given rather than losing the value', () => {
    const answer = csvToJson('a,\n1,2\n');
    expect(JSON.parse(String(answer.value))).toEqual([{ a: 1, column2: 2 }]);
  });

  it('keeps fields past the header instead of dropping them', () => {
    const answer = csvToJson('a\n1,2,3\n');
    expect(JSON.parse(String(answer.value))).toEqual([{ a: 1, column2: 2, column3: 3 }]);
  });

  it('refuses an empty table', () => {
    expect(csvToJson('   ').error).toBe('empty');
  });
});

describe('pdf page maths', () => {
  it('accepts a full permutation and refuses anything else', () => {
    expect(parsePageOrder('3, 1, 2', 3)).toEqual([2, 0, 1]);
    expect(parsePageOrder('1-2', 3)).toBeNull();
    expect(parsePageOrder('1,1,3', 3)).toBeNull();
    expect(parsePageOrder('1,2', 3)).toBeNull();
    expect(parsePageOrder('0,1,2', 3)).toBeNull();
    expect(parsePageOrder('1,2,4', 3)).toBeNull();
  });

  it('reads ranges as zero-based page lists', () => {
    expect(parsePageRanges('1-3,5', 5)).toEqual([[0, 1, 2], [4]]);
    expect(parsePageRanges('2', 3)).toEqual([[1]]);
    expect(parsePageRanges('4-5', 3)).toBeNull();
    expect(parsePageRanges('3-1', 3)).toBeNull();
    expect(parsePageRanges('', 3)).toBeNull();
  });

  it('sizes a page in points from the image pixels', () => {
    expect(pageSizeFor(960, 540, 96)).toEqual({ width: 720, height: 405 });
    expect(pageSizeFor(100, 100, 0)).toEqual({ width: 75, height: 75 });
  });
});

describe('rename patterns', () => {
  const date = new Date(2026, 9, 27);

  it('applies each token', () => {
    expect(applyRenamePattern('{name}-{n}', 'photo.png', 0, 12, date)).toBe('photo-01.png');
    expect(applyRenamePattern('{date}-{name}.{ext}', 'photo.png', 4, 5, date)).toBe(
      '2026-10-27-photo.png',
    );
    expect(applyRenamePattern('trip-{n}-of-{count}', 'photo.png', 2, 20, date)).toBe(
      'trip-03-of-20.png',
    );
  });

  it('replaces characters a filesystem refuses', () => {
    expect(applyRenamePattern('a/b:c*', 'photo.png', 0, 1, date)).toBe('a-b-c-.png');
  });

  it('does not double an extension the pattern already carried', () => {
    expect(applyRenamePattern('{name}.png', 'photo.png', 0, 1, date)).toBe('photo.png');
  });

  it('plans the batch and flags the rows that cannot be applied', () => {
    const plan = renamePlan(
      [
        { name: 'a.png', path: 'C:\\a.png' },
        { name: 'b.png', path: 'C:\\b.png' },
      ],
      'same',
    );
    expect(plan.map(step => step.to)).toEqual(['same.png', 'same.png']);
    expect(plan[0]!.error).toBeUndefined();
    // The second row would land on the first one's name, so the whole batch is
    // refused before anything moves.
    expect(plan[1]!.error).toBe('duplicate');
  });

  it('flags a name that would not change at all', () => {
    const plan = renamePlan([{ name: 'photo.png', path: 'C:\\photo.png' }], '{name}');
    expect(plan[0]!.error).toBe('unchanged');
  });

  it('flags a pattern that left no extension at all', () => {
    // A pattern with no token keeps the original extension, so the only way to
    // lose one is a source file that never had it.
    const plan = renamePlan([{ name: 'README', path: 'C:\\README' }], 'readme');
    expect(plan[0]!.error).toBe('no-extension');
  });
});

describe('labels', () => {
  it('formats sizes the way the rest of the app does', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
  });
});
