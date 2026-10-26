import { describe, expect, it } from 'vitest';
import {
  MAX_CLIP_BYTES,
  MAX_SHOT_BYTES,
  captureExtension,
  captureFileName,
  captureLimit,
  decodeCapture,
} from '../electron/capture-rules';

describe('capture file rules', () => {
  it('forces the extension the file needs, whatever was proposed', () => {
    expect(captureFileName('kryvex-gmail-20261026-091507.png', 'shot')).toBe(
      'kryvex-gmail-20261026-091507.png',
    );
    // A recording cannot be saved as a PNG, or as an executable.
    expect(captureFileName('clip.png', 'clip')).toBe('clip.webm');
    expect(captureFileName('setup.exe', 'shot')).toBe('setup.png');
    expect(captureExtension('shot')).toBe('png');
    expect(captureExtension('clip')).toBe('webm');
  });

  it('cannot be walked out of the folder it is written to', () => {
    expect(captureFileName('..\\..\\Windows\\System32\\evil.png', 'shot')).toBe('evil.png');
    expect(captureFileName('/etc/passwd', 'shot')).toBe('passwd.png');
    // Characters a filesystem refuses are replaced, not passed through.
    expect(captureFileName('a:b*c?.png', 'shot')).toBe('abc.png');
    expect(captureFileName('...png', 'shot')).toBe('kryvex-capture.png');
    expect(captureFileName('', 'shot')).toBe('kryvex-capture.png');
    expect(captureFileName(null, 'shot')).toBe('kryvex-capture.png');
  });

  it('accepts base64 within the cap and refuses everything else', () => {
    expect(decodeCapture('aGk=', 1024)?.toString()).toBe('hi');
    expect(decodeCapture('', 1024)).toBeNull();
    expect(decodeCapture('not base64!', 1024)).toBeNull();
    expect(decodeCapture(42, 1024)).toBeNull();
    // A payload larger than the limit is refused before it is decoded.
    const big = 'A'.repeat(Math.ceil(MAX_SHOT_BYTES / 3) * 4 + 8);
    expect(decodeCapture(big, MAX_SHOT_BYTES)).toBeNull();
    expect(captureLimit('shot')).toBe(MAX_SHOT_BYTES);
    expect(captureLimit('clip')).toBe(MAX_CLIP_BYTES);
  });
});
