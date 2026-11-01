import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The disk half of a room file transfer, exercised against a real directory.
 *
 * Only the native save dialog and the shell are replaced. Everything that
 * touches the filesystem — the `.kryvexpart` partial, the rename on finish and
 * the move to a new folder — runs for real. The move is the interesting part,
 * because a receiver who picked the wrong folder should not pay again for the
 * bytes that already arrived, including when the new folder sits on a volume a
 * rename cannot cross.
 */

const picks = vi.hoisted(() => ({ paths: [] as string[], cancel: false }));

/** A rename that can be made to fail the way another volume does. */
const disk = vi.hoisted(() => ({ failRename: false, renames: 0 }));

vi.mock('electron', () => ({
  app: { getPath: () => process.cwd() },
  BrowserWindow: class {},
  dialog: {
    showSaveDialog: async () =>
      picks.cancel ? { canceled: true } : { canceled: false, filePath: picks.paths.shift() },
  },
  shell: { showItemInFolder: () => undefined },
}));

// The module under test holds its own `node:fs` binding, so the failing rename
// has to be installed at the module boundary rather than spied on afterwards.
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const renameSync = ((from: string, to: string) => {
    if (disk.failRename) {
      disk.renames += 1;
      throw Object.assign(new Error('cross-device link'), { code: 'EXDEV' });
    }
    return actual.renameSync(from, to);
  }) as unknown as typeof actual.renameSync;
  return { ...actual, renameSync, default: { ...actual, renameSync } };
});

import { transferSink } from '../electron/transfers';

const made: string[] = [];

/** A throwaway folder, so a test never touches the real Downloads folder. */
function scratch(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-carry-'));
  made.push(dir);
  return dir;
}

/** Predictable bytes, so a carried prefix can be recognised at the new home. */
function chunk(length: number, seed: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) bytes[index] = (seed + index) % 251;
  return bytes;
}

function partOf(target: string): string {
  return `${target}.kryvexpart`;
}

afterEach(() => {
  picks.cancel = false;
  picks.paths = [];
  disk.failRename = false;
  disk.renames = 0;
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('moving a paused file', () => {
  it('takes the bytes that already arrived to the new folder', async () => {
    const first = scratch();
    const second = scratch();
    const original = path.join(first, 'holiday.bin');
    picks.paths = [original];

    const begin = await transferSink.begin({ name: 'holiday.bin', size: 12 });
    expect(begin.ok).toBe(true);
    const token = begin.token!;
    expect(begin.bytes).toBe(0);
    expect(transferSink.write({ token, bytes: chunk(4, 1) }).ok).toBe(true);
    expect(transferSink.write({ token, bytes: chunk(4, 5) }).ok).toBe(true);

    const moved = path.join(second, 'holiday.bin');
    picks.paths = [moved];
    const next = await transferSink.begin({
      name: 'holiday.bin',
      size: 12,
      previousToken: token,
    });

    expect(next.ok).toBe(true);
    expect(next.path).toBe(moved);
    // Eight bytes moved across, so the sender is told to continue from there.
    expect(next.bytes).toBe(8);
    expect(Array.from(fs.readFileSync(partOf(moved)))).toEqual([
      ...Array.from(chunk(4, 1)),
      ...Array.from(chunk(4, 5)),
    ]);
    // Nothing is left behind in the folder that was abandoned.
    expect(fs.existsSync(partOf(original))).toBe(false);

    expect(transferSink.write({ token: next.token!, bytes: chunk(4, 9) }).ok).toBe(true);
    expect(transferSink.finish(next.token!)).toMatchObject({ ok: true, size: 12 });
    expect(Array.from(fs.readFileSync(moved))).toEqual([
      ...Array.from(chunk(4, 1)),
      ...Array.from(chunk(4, 5)),
      ...Array.from(chunk(4, 9)),
    ]);
  });

  it('copies the bytes when the new folder is on another volume', async () => {
    const first = scratch();
    const second = scratch();
    const original = path.join(first, 'film.mkv');
    picks.paths = [original];

    const begin = await transferSink.begin({ name: 'film.mkv', size: 6 });
    const token = begin.token!;
    expect(transferSink.write({ token, bytes: chunk(3, 7) }).ok).toBe(true);

    // A rename cannot cross a volume, which is what EXDEV reports.
    disk.failRename = true;
    const moved = path.join(second, 'film.mkv');
    picks.paths = [moved];
    const next = await transferSink.begin({
      name: 'film.mkv',
      size: 6,
      previousToken: token,
    });
    disk.failRename = false;

    // The rename was tried and refused, so the copy is what carried the bytes.
    expect(disk.renames).toBe(1);
    expect(next.ok).toBe(true);
    expect(next.bytes).toBe(3);
    expect(Array.from(fs.readFileSync(partOf(moved)))).toEqual(Array.from(chunk(3, 7)));
    // Copying is not moving until the old partial is gone.
    expect(fs.existsSync(partOf(original))).toBe(false);

    expect(transferSink.write({ token: next.token!, bytes: chunk(3, 10) }).ok).toBe(true);
    expect(transferSink.finish(next.token!)).toMatchObject({ ok: true, size: 6 });
  });

  it('keeps the file in place when the same folder is picked again', async () => {
    const folder = scratch();
    const target = path.join(folder, 'notes.txt');
    picks.paths = [target];

    const begin = await transferSink.begin({ name: 'notes.txt', size: 5 });
    const token = begin.token!;
    expect(transferSink.write({ token, bytes: chunk(3, 2) }).ok).toBe(true);

    picks.paths = [target];
    const again = await transferSink.begin({ name: 'notes.txt', size: 5, previousToken: token });

    expect(again.ok).toBe(true);
    expect(again.bytes).toBe(3);
    // Re-opening must not truncate what is already there.
    expect(fs.readFileSync(partOf(target)).byteLength).toBe(3);

    expect(transferSink.write({ token: again.token!, bytes: chunk(2, 5) }).ok).toBe(true);
    expect(transferSink.finish(again.token!)).toMatchObject({ ok: true, size: 5 });
  });

  it('leaves the partial file alone when the dialog is closed', async () => {
    const folder = scratch();
    const target = path.join(folder, 'photo.jpg');
    picks.paths = [target];

    const begin = await transferSink.begin({ name: 'photo.jpg', size: 8 });
    const token = begin.token!;
    expect(transferSink.write({ token, bytes: chunk(4, 3) }).ok).toBe(true);

    picks.cancel = true;
    const cancelled = await transferSink.begin({
      name: 'photo.jpg',
      size: 8,
      previousToken: token,
    });

    expect(cancelled).toMatchObject({ ok: false, cancelled: true });
    expect(cancelled.bytes).toBeUndefined();
    expect(Array.from(fs.readFileSync(partOf(target)))).toEqual(Array.from(chunk(4, 3)));

    // The pause is intact, so the same sink still takes the rest.
    picks.cancel = false;
    expect(transferSink.write({ token, bytes: chunk(4, 7) }).ok).toBe(true);
    expect(transferSink.finish(token)).toMatchObject({ ok: true, size: 8 });
  });
});
