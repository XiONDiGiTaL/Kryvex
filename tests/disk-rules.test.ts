import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkDeletable,
  cleanupTargets,
  formatBytes,
  isDriveRoot,
  isInside,
  isOldEnough,
  isProtectedPath,
  matchesPrefix,
  protectedRoots,
  targetById,
} from '../electron/disk-rules';

const ENV = {
  USERPROFILE: 'C:\\Users\\tester',
  LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local',
  APPDATA: 'C:\\Users\\tester\\AppData\\Roaming',
  TEMP: 'C:\\Users\\tester\\AppData\\Local\\Temp',
  SystemRoot: 'C:\\Windows',
  WINDIR: 'C:\\Windows',
  ProgramFiles: 'C:\\Program Files',
  'ProgramFiles(x86)': 'C:\\Program Files (x86)',
  ProgramData: 'C:\\ProgramData',
} as NodeJS.ProcessEnv;

const PROTECTED = protectedRoots(ENV);
const TEMP = ENV.TEMP as string;

describe('containment', () => {
  it('treats a sibling with a shared prefix as outside', () => {
    expect(isInside(TEMP, path.join(TEMP, 'file.tmp'))).toBe(true);
    expect(isInside(TEMP, 'C:\\Users\\tester\\AppData\\Local\\Temp-evil\\file.tmp')).toBe(false);
  });

  it('does not consider a root inside itself', () => {
    expect(isInside(TEMP, TEMP)).toBe(false);
    expect(checkDeletable(TEMP, TEMP, PROTECTED)).toEqual({ ok: false, reason: 'root' });
  });

  it('rejects drive roots', () => {
    expect(isDriveRoot('C:\\')).toBe(true);
    expect(checkDeletable('C:\\', 'C:\\Windows\\Temp\\x', PROTECTED)).toEqual({
      ok: false,
      reason: 'drive',
    });
  });
});

describe('protected paths', () => {
  it('protects Windows and personal folders', () => {
    expect(isProtectedPath('C:\\Windows\\System32\\drivers\\etc\\hosts', PROTECTED)).toBe(true);
    expect(isProtectedPath('C:\\Users\\tester\\Documents\\taxes.pdf', PROTECTED)).toBe(true);
    expect(isProtectedPath('C:\\Program Files\\App\\app.exe', PROTECTED)).toBe(true);
    expect(isProtectedPath('C:\\Users\\tester\\AppData\\Roaming\\App\\state.json', PROTECTED)).toBe(
      true,
    );
  });

  it('leaves the approved user caches alone', () => {
    expect(isProtectedPath(TEMP, PROTECTED)).toBe(false);
    expect(isProtectedPath('C:\\Users\\tester\\AppData\\Local\\CrashDumps\\a.dmp', PROTECTED)).toBe(
      false,
    );
  });

  it('refuses a protected file even inside an allowed root', () => {
    expect(checkDeletable('C:\\Windows', 'C:\\Windows\\System32\\kernel32.dll', PROTECTED)).toEqual({
      ok: false,
      reason: 'protected',
    });
  });
});

describe('deletable candidates', () => {
  it('accepts a cache file below its own root', () => {
    expect(checkDeletable(TEMP, path.join(TEMP, 'setup.log'), PROTECTED)).toEqual({ ok: true });
  });

  it('refuses traversal out of the root', () => {
    expect(checkDeletable(TEMP, path.join(TEMP, '..', 'Roaming', 'x'), PROTECTED)).toEqual({
      ok: false,
      reason: 'outside',
    });
  });

  it('refuses relative paths', () => {
    expect(checkDeletable(TEMP, 'Cache\\x.tmp', PROTECTED)).toEqual({ ok: false, reason: 'outside' });
  });
});

describe('filters', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');

  it('keeps recent cache files', () => {
    expect(isOldEnough(now - 60_000, now, 24)).toBe(false);
    expect(isOldEnough(now - 25 * 60 * 60 * 1000, now, 24)).toBe(true);
    expect(isOldEnough(now, now, undefined)).toBe(true);
  });

  it('matches thumbnail prefixes only', () => {
    expect(matchesPrefix('thumbcache_256.db', ['thumbcache_', 'iconcache_'])).toBe(true);
    expect(matchesPrefix('desktop.ini', ['thumbcache_'])).toBe(false);
    expect(matchesPrefix('anything', undefined)).toBe(true);
  });
});

describe('targets', () => {
  const targets = cleanupTargets(ENV);

  it('never asks for elevation in the built-in set', () => {
    expect(targets.every((target) => target.requiresElevation === false)).toBe(true);
  });

  it('only points at directories under the user profile', () => {
    for (const target of targets) {
      for (const root of target.roots) {
        expect(isDriveRoot(root)).toBe(false);
        expect(root.toLowerCase().startsWith('c:\\users\\tester')).toBe(true);
      }
    }
  });

  it('looks targets up by id only', () => {
    expect(targetById('user-temp', ENV)?.id).toBe('user-temp');
    expect(targetById('C:\\Users\\tester\\Desktop', ENV)).toBeNull();
    expect(targetById('x'.repeat(80), ENV)).toBeNull();
  });
});

describe('formatting', () => {
  it('scales units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.00 MB');
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.00 GB');
  });
});
