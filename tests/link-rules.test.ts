import { describe, expect, it } from 'vitest';
import {
  clampText,
  describeBytes,
  deviceLabel,
  isLinkCommand,
  isLinkToken,
  isPrivateAddress,
  isValidPairCode,
  linkUrl,
  linkableUrl,
  makePairCode,
  normalizePairCode,
  rankLinkAddresses,
  safeFileName,
  uniqueFileName,
} from '../electron/link-rules';

describe('pairing codes', () => {
  it('draws six digits from the injected source', () => {
    const code = makePairCode(() => 7);
    expect(code).toBe('777777');
    expect(isValidPairCode(code)).toBe(true);
  });

  it('accepts what a phone keyboard produces and nothing else', () => {
    expect(normalizePairCode(' 123 456 ')).toBe('123456');
    expect(normalizePairCode('123-456')).toBe('123456');
    expect(normalizePairCode('12345')).toBeNull();
    expect(normalizePairCode('1234567')).toBeNull();
    expect(normalizePairCode('abcdef')).toBeNull();
    expect(normalizePairCode(123456)).toBeNull();
  });

  it('recognizes only a full six-digit string as a code', () => {
    expect(isValidPairCode('000000')).toBe(true);
    expect(isValidPairCode('12345')).toBe(false);
    expect(isValidPairCode('12345a')).toBe(false);
  });

  it('recognizes only 48 hex characters as a token', () => {
    expect(isLinkToken('a'.repeat(48))).toBe(true);
    expect(isLinkToken('A'.repeat(48))).toBe(false);
    expect(isLinkToken('a'.repeat(47))).toBe(false);
    expect(isLinkToken(`${'a'.repeat(47)}-`)).toBe(false);
    expect(isLinkToken(null)).toBe(false);
  });
});

describe('address policy', () => {
  it('accepts the private ranges a phone shares with the desktop', () => {
    for (const address of [
      '127.0.0.1',
      '::1',
      '10.0.0.4',
      '172.16.9.9',
      '172.31.255.254',
      '192.168.1.42',
      '100.64.0.1',
      '169.254.10.10',
      '::ffff:192.168.1.42',
      'fd00::1',
      'fe80::1',
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it('refuses a public source address', () => {
    for (const address of [
      '8.8.8.8',
      '172.32.0.1',
      '192.169.0.1',
      '203.0.113.7',
      '2001:4860:4860::8888',
      '',
      'not-an-address',
      null,
    ]) {
      expect(isPrivateAddress(address as string), String(address)).toBe(false);
    }
  });

  it('advertises LAN addresses before loopback', () => {
    expect(rankLinkAddresses(['127.0.0.1', '192.168.1.42', '10.0.0.7', '192.168.1.42'])).toEqual([
      '192.168.1.42',
      '10.0.0.7',
      '127.0.0.1',
    ]);
  });

  it('builds the URL a QR code carries', () => {
    expect(linkUrl('192.168.1.42', 43110)).toBe('http://192.168.1.42:43110/');
  });
});

describe('file names from the phone', () => {
  it('keeps an ordinary name', () => {
    expect(safeFileName('holiday photo.jpg')).toBe('holiday photo.jpg');
  });

  it('refuses to reach a parent directory or a drive', () => {
    expect(safeFileName('../../etc/passwd')).toBe('etc-passwd');
    expect(safeFileName('C:\\Windows\\system32\\evil.exe')).toBe('C--Windows-system32-evil.exe');
    expect(safeFileName('..')).toBeNull();
    expect(safeFileName('.')).toBeNull();
    expect(safeFileName('')).toBeNull();
    expect(safeFileName(null)).toBeNull();
  });

  it('strips control characters and alternate data streams', () => {
    expect(safeFileName('a\u0000b\u001fc.txt')).toBe('abc.txt');
    expect(safeFileName('report.pdf:evil')).toBe('report.pdf-evil');
  });

  it('escapes names Windows reserves', () => {
    expect(safeFileName('CON.txt')).toBe('file-CON.txt');
    expect(safeFileName('lpt1')).toBe('file-lpt1');
  });

  it('decodes a percent-encoded name once', () => {
    expect(safeFileName('my%20notes.txt')).toBe('my notes.txt');
    expect(safeFileName('%2e%2e%2fpasswd')).toBe('passwd');
  });

  it('caps a very long name', () => {
    const name = safeFileName(`${'x'.repeat(400)}.txt`);
    expect(name).not.toBeNull();
    expect((name as string).length).toBeLessThanOrEqual(120);
  });

  it('numbers a collision instead of overwriting', () => {
    expect(uniqueFileName(['a.txt'], 'b.txt')).toBe('b.txt');
    expect(uniqueFileName(['a.txt'], 'a.txt')).toBe('a (2).txt');
    expect(uniqueFileName(['a.txt', 'a (2).txt'], 'a.txt')).toBe('a (3).txt');
    expect(uniqueFileName(['notes'], 'notes')).toBe('notes (2)');
  });
});

describe('text and links from the phone', () => {
  it('caps clipboard text rather than refusing it', () => {
    expect(clampText('hello')).toBe('hello');
    expect(clampText('a'.repeat(200_000)).length).toBe(100_000);
    expect(clampText(null)).toBe('');
  });

  it('normalizes line endings so a paste round-trips', () => {
    expect(clampText('one\r\ntwo')).toBe('one\ntwo');
  });

  it('accepts a web page and adds a missing scheme', () => {
    expect(linkableUrl('example.com/watch?v=1')).toBe('https://example.com/watch?v=1');
    expect(linkableUrl('http://192.168.1.5:8080/x')).toBe('http://192.168.1.5:8080/x');
  });

  it('refuses a scheme that could act on this machine', () => {
    for (const raw of ['file:///C:/Windows', 'javascript:alert(1)', 'magnet:?xt=urn', 'kryvex://x']) {
      expect(linkableUrl(raw), raw).toBeNull();
    }
    expect(linkableUrl('https://user:pass@example.com')).toBeNull();
    expect(linkableUrl('')).toBeNull();
    expect(linkableUrl(7)).toBeNull();
  });

  it('labels a device without letting it write a paragraph', () => {
    expect(deviceLabel('  Pixel   9 ')).toBe('Pixel 9');
    expect(deviceLabel('')).toBe('Phone');
    expect(deviceLabel(undefined)).toBe('Phone');
    expect(deviceLabel('x'.repeat(80)).length).toBe(40);
  });
});

describe('remote commands', () => {
  it('allows the transport and navigation commands only', () => {
    expect(isLinkCommand('play')).toBe(true);
    expect(isLinkCommand('volume-up')).toBe(true);
    expect(isLinkCommand('rooms')).toBe(true);
    expect(isLinkCommand('shutdown')).toBe(false);
    expect(isLinkCommand('')).toBe(false);
    expect(isLinkCommand(42)).toBe(false);
  });
});

describe('byte labels', () => {
  it('reads like a file size', () => {
    expect(describeBytes(0)).toBe('0 B');
    expect(describeBytes(512)).toBe('512 B');
    expect(describeBytes(2048)).toBe('2 KB');
    expect(describeBytes(5 * 1024 * 1024)).toBe('5 MB');
  });
});
