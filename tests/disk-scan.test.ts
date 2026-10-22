import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readHealth, scanDisk } from '../electron/disk-scan';

/**
 * The scan body that the worker thread runs. It is exercised here in-process
 * against a fixture, so the target sizing, the budget and the cancel path are
 * covered without walking the real drive. The worker plumbing itself is checked
 * end to end by scripts/verify-disk-pulse.cjs against the built app.
 */

let fixture = '';
let saved: NodeJS.ProcessEnv = {};

const OLD_BYTES = 4096;

function age(file: string, hours: number) {
  const when = new Date(Date.now() - hours * 60 * 60 * 1000);
  fs.utimesSync(file, when, when);
}

beforeAll(() => {
  saved = { LOCALAPPDATA: process.env.LOCALAPPDATA, TEMP: process.env.TEMP };
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-scan-'));
  const local = path.join(fixture, 'local');
  const temp = path.join(local, 'Temp');
  const dumps = path.join(local, 'CrashDumps');

  fs.mkdirSync(path.join(temp, 'nested'), { recursive: true });
  fs.mkdirSync(dumps, { recursive: true });
  fs.writeFileSync(path.join(temp, 'old.tmp'), Buffer.alloc(OLD_BYTES, 1));
  fs.writeFileSync(path.join(temp, 'fresh.tmp'), Buffer.alloc(OLD_BYTES * 2, 2));
  fs.writeFileSync(path.join(temp, 'nested', 'nested-old.tmp'), Buffer.alloc(OLD_BYTES * 3, 3));
  fs.writeFileSync(path.join(dumps, 'app.dmp'), Buffer.alloc(OLD_BYTES * 4, 4));
  age(path.join(temp, 'old.tmp'), 48);
  age(path.join(temp, 'nested', 'nested-old.tmp'), 48);

  process.env.LOCALAPPDATA = local;
  process.env.TEMP = temp;
});

afterAll(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(fixture, { recursive: true, force: true });
});

function target(payload: Awaited<ReturnType<typeof scanDisk>>, id: string) {
  return payload.targets.find((entry) => entry.id === id);
}

describe('disk scan', () => {
  it('sizes every target it can reach and skips the ones it cannot', async () => {
    const payload = await scanDisk({
      budgetMs: 10_000,
      signal: new AbortController().signal,
      driveFolders: false,
    });

    expect(payload.ok).toBe(true);
    expect(payload.cancelled).toBe(false);

    const temp = target(payload, 'user-temp');
    expect(temp?.available).toBe(true);
    // Only the two files older than the 24 h filter count; the fresh one stays.
    expect(temp?.bytes).toBe(OLD_BYTES * 4);
    expect(temp?.fileCount).toBe(2);

    const dumps = target(payload, 'crash-dumps');
    expect(dumps?.available).toBe(true);
    expect(dumps?.bytes).toBe(OLD_BYTES * 4);

    // Chrome does not live in the fixture, so the category is reported as absent.
    expect(target(payload, 'chrome-cache')?.available).toBe(false);
  });

  it('stops immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const payload = await scanDisk({
      budgetMs: 10_000,
      signal: controller.signal,
      driveFolders: false,
    });

    expect(payload.ok).toBe(true);
    expect(payload.cancelled).toBe(true);
    expect(payload.targets.every((entry) => entry.bytes === 0)).toBe(true);
    expect(payload.folders).toEqual([]);
  });

  it('reads real drive health', async () => {
    const health = await readHealth();
    expect(health.drive).not.toBe('');
    expect(health.available).toBe(true);
    expect(health.totalBytes).toBeGreaterThan(0);
    expect(health.usedPercent).toBeGreaterThanOrEqual(0);
    expect(health.usedPercent).toBeLessThanOrEqual(100);
  });
});
