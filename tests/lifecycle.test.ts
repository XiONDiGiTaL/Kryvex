import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isAliveContents, isAliveWindow } from '../electron/lifecycle';

/**
 * A destroyed Electron wrapper still answers `isDestroyed()` but throws on every
 * other read, which is the distinction these guards exist for.
 */
function fake(destroyed: boolean) {
  return { isDestroyed: () => destroyed };
}

describe('lifecycle guards', () => {
  it('treats a live wrapper as alive', () => {
    expect(isAliveWindow(fake(false))).toBe(true);
    expect(isAliveContents(fake(false))).toBe(true);
  });

  it('treats a destroyed wrapper as gone', () => {
    expect(isAliveWindow(fake(true))).toBe(false);
    expect(isAliveContents(fake(true))).toBe(false);
  });

  it('treats a missing reference as gone', () => {
    expect(isAliveWindow(null)).toBe(false);
    expect(isAliveWindow(undefined)).toBe(false);
    expect(isAliveContents(null)).toBe(false);
    expect(isAliveContents(undefined)).toBe(false);
  });

  it('treats a wrapper that cannot answer as gone', () => {
    const throwing = {
      isDestroyed: () => {
        throw new TypeError('Object has been destroyed');
      },
    };
    expect(isAliveWindow(throwing)).toBe(false);
    expect(isAliveContents(throwing)).toBe(false);
  });

  it('keeps every close and destroy handler free of window reads', () => {
    const report = execFileSync(process.execPath, ['scripts/audit-lifecycle.cjs'], {
      encoding: 'utf8',
    });
    expect(report).toContain('No window reads inside close/destroy handlers');
  });

  it('flags the read that used to crash on close', () => {
    const fixture = path.join(os.tmpdir(), `kryvex-lifecycle-${process.pid}.ts`);
    fs.writeFileSync(
      fixture,
      [
        'export function attach(win: any) {',
        "  win.once('closed', () => {",
        '    if (shell === win.webContents) shell = null;',
        '  });',
        '}',
      ].join('\n'),
    );
    let stderr = '';
    try {
      execFileSync(process.execPath, ['scripts/audit-lifecycle.cjs', fixture], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (error) {
      stderr = String((error as { stderr?: string }).stderr ?? '');
    } finally {
      fs.rmSync(fixture, { force: true });
    }
    expect(stderr).toContain('reads .webContents');
  });

  it('only calls isDestroyed, never another property', () => {
    const reads: string[] = [];
    const watched = new Proxy(
      { isDestroyed: () => true },
      {
        get(target, property, receiver) {
          reads.push(String(property));
          return Reflect.get(target, property, receiver);
        },
      },
    );
    expect(isAliveWindow(watched)).toBe(false);
    expect(isAliveContents(watched)).toBe(false);
    expect(reads).toEqual(['isDestroyed', 'isDestroyed']);
  });
});
