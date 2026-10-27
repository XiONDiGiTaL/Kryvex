/**
 * Kryvex opening with Windows.
 *
 * The Windows `Run` entry is the state, not a copy of it: `getLoginItemSettings`
 * reads the same value `setLoginItemSettings` writes, so the switch can only
 * show what Windows will actually do, and an entry removed by hand in Task
 * Manager turns the switch off here as well. Nothing is written until the
 * switch is used.
 *
 * The path is the part worth getting right. An installed copy runs from its
 * install folder; a portable copy runs from wherever it was unpacked but
 * reports its temporary extract folder as `process.execPath`, so the portable
 * launcher's own path is used when Electron announces one. A development run
 * (`electron .`) is never registered: that entry would point at the Electron
 * binary and open no app, so the switch is refused there instead.
 */
import { app } from 'electron';
import fs from 'node:fs';
import type { StartupStatus } from './types';

/**
 * The file Windows should start.
 *
 * `PORTABLE_EXECUTABLE_FILE` is set by electron-builder's portable runtime. It
 * is only trusted when it still points at a file, because a stale variable from
 * a deleted copy must not become a startup entry.
 */
export function launcherPath(
  portable: string | undefined = process.env.PORTABLE_EXECUTABLE_FILE,
): string {
  if (typeof portable === 'string' && portable.trim()) {
    try {
      if (fs.statSync(portable).isFile()) return portable;
    } catch {
      /* the variable outlived the file: fall back to the running binary */
    }
  }
  return process.execPath;
}

export function startupStatus(): StartupStatus {
  const supported = process.platform === 'win32';
  // Registering an unpackaged run would start `electron.exe` with no project,
  // so the switch is offered only where the entry would open Kryvex.
  const canChange = supported && app.isPackaged;
  let enabled = false;
  if (canChange) {
    try {
      enabled = app.getLoginItemSettings({ path: launcherPath() }).openAtLogin;
    } catch {
      enabled = false;
    }
  }
  return { supported, enabled, canChange };
}

/** Only a real boolean is a request; anything else just reads the state. */
export function setStartup(enabled: unknown): StartupStatus {
  if (typeof enabled !== 'boolean') return startupStatus();
  if (!startupStatus().canChange) return startupStatus();
  try {
    app.setLoginItemSettings({ openAtLogin: enabled, path: launcherPath(), args: [] });
  } catch {
    /* Windows refused the write; the switch reports what the registry says */
  }
  return startupStatus();
}
