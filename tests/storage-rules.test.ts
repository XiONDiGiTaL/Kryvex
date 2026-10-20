import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_STORAGE_ROOTS,
  defaultStorageConfig,
  mergeRoots,
  normalizeDir,
  sanitizeStorageConfig,
  torrentRootFor,
} from '../electron/storage-rules';

const base = path.resolve(process.cwd(), 'tmp-storage-rules');

describe('normalizeDir', () => {
  it('accepts only non-empty absolute paths', () => {
    expect(normalizeDir(path.join(base, 'Downloads'))).toBe(path.resolve(base, 'Downloads'));
    expect(normalizeDir('relative/Downloads')).toBeNull();
    expect(normalizeDir('')).toBeNull();
    expect(normalizeDir('   ')).toBeNull();
    expect(normalizeDir(null)).toBeNull();
  });

  it('rejects null bytes and overlong values', () => {
    expect(normalizeDir(`${base}\u0000evil`)).toBeNull();
    expect(normalizeDir(`/${'a'.repeat(5000)}`)).toBeNull();
  });
});

describe('storage config', () => {
  it('builds a default location and its torrent subfolder', () => {
    const downloads = path.join(base, 'Downloads');
    const config = defaultStorageConfig(downloads);
    expect(config.downloadDir).toBe(downloads);
    expect(config.downloadRoots).toEqual([downloads]);
    expect(config.torrentRoots).toEqual([torrentRootFor(downloads)]);
  });

  it('falls back for invalid or malformed files', () => {
    const downloads = path.join(base, 'Downloads');
    const defaults = defaultStorageConfig(downloads);
    expect(sanitizeStorageConfig(null, defaults)).toEqual(defaults);
    expect(sanitizeStorageConfig({ downloadDir: 'relative' }, defaults)).toEqual(defaults);
  });

  it('keeps old roots so existing items remain manageable', () => {
    const first = path.join(base, 'First');
    const second = path.join(base, 'Second');
    const defaults = defaultStorageConfig(first);
    const config = sanitizeStorageConfig(
      {
        downloadDir: second,
        downloadRoots: [first, second],
        torrentRoots: [torrentRootFor(first), torrentRootFor(second)],
      },
      defaults,
    );
    expect(config.downloadDir).toBe(second);
    expect(config.downloadRoots).toContain(first);
    expect(config.downloadRoots).toContain(second);
    expect(config.torrentRoots).toContain(torrentRootFor(first));
    expect(config.torrentRoots).toContain(torrentRootFor(second));
  });

  it('drops relative roots and caps the retained list', () => {
    const downloads = path.join(base, 'Downloads');
    const defaults = defaultStorageConfig(downloads);
    const config = sanitizeStorageConfig(
      {
        downloadDir: downloads,
        downloadRoots: ['relative', ...Array.from({ length: 40 }, (_, i) => path.join(base, `r${i}`))],
      },
      defaults,
    );
    expect(config.downloadRoots).not.toContain('relative');
    expect(config.downloadRoots).toHaveLength(MAX_STORAGE_ROOTS);
  });
});

describe('mergeRoots', () => {
  it('puts the current root first, deduplicates and normalises', () => {
    const first = path.join(base, 'First');
    const second = path.join(base, 'Second');
    expect(mergeRoots([first, first, second], [second])).toEqual([second, first]);
  });
});
