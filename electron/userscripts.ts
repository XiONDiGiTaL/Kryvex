import { app, dialog, net, type BrowserWindow, type WebContents } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isAliveWindow } from './lifecycle';
import { serviceSessions } from './service-sessions';
import {
  appliesTo,
  hostsOf,
  MAX_USERSCRIPTS,
  MAX_USERSCRIPT_BYTES,
  parseUserscript,
  wrapUserscript,
  type UserscriptMeta,
} from './userscript-rules';
import type { UserscriptRecord } from './types';

interface StoredUserscript {
  key: string;
  meta: UserscriptMeta;
  enabled: boolean;
  installedAt: number;
  file: string;
}

interface InstallResult {
  ok: boolean;
  message: string;
  records: UserscriptRecord[];
}

const KEY = /^us-[a-z0-9-]{8,48}$/;

function rootDir(): string {
  return path.join(app.getPath('userData'), 'userscripts');
}

function recordsPath(): string {
  return path.join(app.getPath('userData'), 'kryvex-userscripts.json');
}

function readRecords(): StoredUserscript[] {
  try {
    const raw = JSON.parse(fs.readFileSync(recordsPath(), 'utf8'));
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (item): item is StoredUserscript =>
          Boolean(item) &&
          typeof item.key === 'string' &&
          KEY.test(item.key) &&
          typeof item.file === 'string' &&
          item.file.startsWith(rootDir()) &&
          Boolean(item.meta) &&
          typeof item.meta === 'object',
      )
      .slice(0, MAX_USERSCRIPTS);
  } catch {
    return [];
  }
}

function writeRecords(records: StoredUserscript[]): void {
  const target = recordsPath();
  const tmp = `${target}.tmp`;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(records), 'utf8');
    fs.renameSync(tmp, target);
  } catch {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* nothing to clean up */
    }
  }
}

/**
 * User scripts, in the shape Greasemonkey and Tampermonkey use.
 *
 * The file on disk is the `.user.js` exactly as it arrived, so a script can be
 * read, copied out or diffed later; the JSON beside it holds only metadata and
 * the enabled switch. Injection happens in the main process rather than through
 * a preload, which is what keeps a script out of the shell, out of service
 * modules and inside browser tabs only.
 */
class UserscriptManager {
  private records: StoredUserscript[] = [];
  private loaded = false;
  private window: BrowserWindow | null = null;
  private attached = new WeakSet<WebContents>();

  attachWindow(win: BrowserWindow): void {
    this.window = win;
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    this.records = readRecords();
  }

  list(): UserscriptRecord[] {
    this.ensureLoaded();
    return this.records.map(record => ({
      key: record.key,
      name: record.meta.name,
      version: record.meta.version,
      description: record.meta.description,
      hosts: hostsOf(record.meta),
      matches: [...record.meta.matches],
      includes: [...record.meta.includes],
      excludes: [...record.meta.excludes],
      runAt: record.meta.runAt,
      enabled: record.enabled,
      installedAt: record.installedAt,
      bytes: this.sizeOf(record),
    }));
  }

  private sizeOf(record: StoredUserscript): number {
    try {
      return fs.statSync(record.file).size;
    } catch {
      return 0;
    }
  }

  installFromText(source: string): InstallResult {
    this.ensureLoaded();
    if (typeof source !== 'string' || !source.trim()) {
      return this.result(false, 'The script is empty.');
    }
    if (Buffer.byteLength(source, 'utf8') > MAX_USERSCRIPT_BYTES) {
      return this.result(false, 'That script is larger than 512 KB.');
    }
    if (this.records.length >= MAX_USERSCRIPTS) {
      return this.result(false, `Kryvex runs at most ${MAX_USERSCRIPTS} scripts. Remove one first.`);
    }
    const parsed = parseUserscript(source);
    if (!parsed.ok) return this.result(false, parsed.reason);

    const duplicate = this.records.find(
      record =>
        record.meta.name.toLowerCase() === parsed.meta.name.toLowerCase() &&
        record.meta.namespace === parsed.meta.namespace,
    );

    const key = duplicate?.key ?? `us-${crypto.randomUUID()}`;
    const file = path.join(rootDir(), `${key}.user.js`);
    try {
      fs.mkdirSync(rootDir(), { recursive: true });
      fs.writeFileSync(file, source, 'utf8');
    } catch {
      return this.result(false, 'The script could not be written to disk.');
    }

    const record: StoredUserscript = {
      key,
      meta: parsed.meta,
      enabled: true,
      installedAt: Date.now(),
      file,
    };
    this.records = duplicate
      ? this.records.map(item => (item.key === key ? { ...record, installedAt: item.installedAt } : item))
      : [...this.records, record];
    writeRecords(this.records);
    return this.result(
      true,
      duplicate ? `${parsed.meta.name} updated to v${parsed.meta.version}.` : `${parsed.meta.name} installed.`,
    );
  }

  async installFromDialog(): Promise<InstallResult> {
    const window = this.window;
    if (!isAliveWindow(window)) return this.result(false, 'The main window is not ready.');
    const picked = await dialog.showOpenDialog(window, {
      title: 'Choose a user script',
      properties: ['openFile'],
      filters: [
        { name: 'User script', extensions: ['js', 'user.js', 'txt'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (picked.canceled || picked.filePaths.length === 0) {
      return this.result(false, 'Installation cancelled.');
    }
    try {
      const stat = fs.statSync(picked.filePaths[0]);
      if (stat.size > MAX_USERSCRIPT_BYTES) {
        return this.result(false, 'That script is larger than 512 KB.');
      }
      return this.installFromText(fs.readFileSync(picked.filePaths[0], 'utf8'));
    } catch {
      return this.result(false, 'That file could not be read.');
    }
  }

  /**
   * Fetches a `.user.js` over http(s) and installs what it finds. A Greasy Fork
   * page is HTML, not a script, so the reply has to look like a user script
   * before anything is written.
   */
  async installFromUrl(rawUrl: string): Promise<InstallResult> {
    this.ensureLoaded();
    let url: URL;
    try {
      url = new URL(String(rawUrl ?? '').trim());
    } catch {
      return this.result(false, 'That is not a valid address.');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return this.result(false, 'Only http and https addresses can be fetched.');
    }
    try {
      const response = await net.fetch(url.toString(), { redirect: 'follow' });
      if (!response.ok) return this.result(false, `The address returned HTTP ${response.status}.`);
      const declared = Number(response.headers.get('content-length') ?? '0');
      if (declared > MAX_USERSCRIPT_BYTES) {
        return this.result(false, 'That script is larger than 512 KB.');
      }
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > MAX_USERSCRIPT_BYTES) {
        return this.result(false, 'That script is larger than 512 KB.');
      }
      if (!text.includes('==UserScript==')) {
        return this.result(
          false,
          'That address did not return a user script. Open its install link, not its page.',
        );
      }
      return this.installFromText(text);
    } catch {
      return this.result(false, 'The script could not be downloaded.');
    }
  }

  setEnabled(key: string, enabled: boolean): InstallResult {
    this.ensureLoaded();
    const record = this.records.find(item => item.key === key);
    if (!record) return this.result(false, 'That script is not installed.');
    record.enabled = enabled;
    writeRecords(this.records);
    return this.result(true, `${record.meta.name} ${enabled ? 'enabled' : 'disabled'}.`);
  }

  remove(key: string): InstallResult {
    this.ensureLoaded();
    const record = this.records.find(item => item.key === key);
    if (!record) return this.result(false, 'That script is not installed.');
    this.records = this.records.filter(item => item.key !== key);
    writeRecords(this.records);
    if (record.file.startsWith(rootDir())) {
      try {
        fs.rmSync(record.file, { force: true });
      } catch {
        /* a file held open by Windows is dropped from the list regardless */
      }
    }
    return this.result(true, `${record.meta.name} removed.`);
  }

  /**
   * Installs the DOM hook for one browser tab.
   *
   * A service module never receives a user script: its session is a persistent
   * signed-in profile, and silently running third-party code inside it would
   * cross the line between "the browser" and "the app". A sign-in popup shares
   * its opener's session but is a window rather than a webview, so it is not
   * reached either.
   */
  attach(contents: WebContents): void {
    if (this.attached.has(contents)) return;
    if (contents.getType() !== 'webview') return;
    if (serviceSessions.isServiceSession(contents.session)) return;
    this.attached.add(contents);
    contents.on('dom-ready', () => this.inject(contents));
  }

  private inject(contents: WebContents): void {
    this.ensureLoaded();
    const enabled = this.records.filter(record => record.enabled);
    if (enabled.length === 0) return;
    let url = '';
    try {
      url = contents.getURL();
    } catch {
      return;
    }
    for (const record of enabled) {
      if (!appliesTo(record.meta, url)) continue;
      let source = '';
      try {
        source = fs.readFileSync(record.file, 'utf8');
      } catch {
        continue;
      }
      // One script per evaluation: a syntax error in one file must not stop the
      // script after it, and the rejection is already harmless to the page.
      contents.executeJavaScript(wrapUserscript(record.key, record.meta.name, source)).catch(() => undefined);
    }
  }

  private result(ok: boolean, message: string): InstallResult {
    return { ok, message, records: this.list() };
  }
}

export const userscripts = new UserscriptManager();
