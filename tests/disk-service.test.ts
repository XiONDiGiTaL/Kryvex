import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { diskService } from '../electron/disk-service';

/**
 * Behavioural test for the cleaner. The scanner is covered by the rules tests;
 * this one proves the deletion path against a real directory: only files that
 * pass the age filter and sit below the target root are removed.
 */

let fixture = '';
let originalTemp: string | undefined;

function age(file: string, hours: number) {
  const when = new Date(Date.now() - hours * 60 * 60 * 1000);
  fs.utimesSync(file, when, when);
}

beforeAll(() => {
  originalTemp = process.env.TEMP;
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-disk-'));
  process.env.TEMP = fixture;

  fs.mkdirSync(path.join(fixture, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(fixture, 'old.tmp'), 'old');
  fs.writeFileSync(path.join(fixture, 'fresh.tmp'), 'fresh');
  fs.writeFileSync(path.join(fixture, 'nested', 'nested-old.tmp'), 'nested');
  age(path.join(fixture, 'old.tmp'), 48);
  age(path.join(fixture, 'nested', 'nested-old.tmp'), 48);
});

afterAll(() => {
  if (originalTemp === undefined) delete process.env.TEMP;
  else process.env.TEMP = originalTemp;
  fs.rmSync(fixture, { recursive: true, force: true });
});

describe('disk clean', () => {
  it('refuses ids that are paths', async () => {
    const result = await diskService.clean([path.join(fixture, 'old.tmp')]);
    expect(result.ok).toBe(false);
    expect(fs.existsSync(path.join(fixture, 'old.tmp'))).toBe(true);
  });

  it('refuses unknown ids', async () => {
    const result = await diskService.clean(['not-a-target']);
    expect(result.ok).toBe(false);
    expect(result.removedFiles).toBe(0);
  });

  it('removes old temp files only, below the root', async () => {
    const result = await diskService.clean(['user-temp']);
    expect(result.ok).toBe(true);
    expect(result.removedFiles).toBe(2);
    expect(result.freedBytes).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(fixture, 'old.tmp'))).toBe(false);
    expect(fs.existsSync(path.join(fixture, 'nested', 'nested-old.tmp'))).toBe(false);
    expect(fs.existsSync(path.join(fixture, 'fresh.tmp'))).toBe(true);
    // The target root itself is never removed.
    expect(fs.existsSync(fixture)).toBe(true);
  });

  it('reports a second pass as empty', async () => {
    const result = await diskService.clean(['user-temp']);
    expect(result.ok).toBe(true);
    expect(result.removedFiles).toBe(0);
  });
});
