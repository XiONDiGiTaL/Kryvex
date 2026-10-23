import { app, dialog, net, type BrowserWindow, type Session } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isAliveWindow } from './lifecycle';
import { extractZip } from './zip-extract';
import type { ExtensionRecord } from './types';

interface StoredExtension {
  key: string;
  name: string;
  version: string;
  manifestVersion: number;
  enabled: boolean;
  installedAt: number;
  dir: string;
}

interface InstallResult {
  ok: boolean;
  message: string;
  records: ExtensionRecord[];
}

const MAX_EXTENSION_BYTES = 80 * 1024 * 1024;

/** Windows can hold extracted files open briefly; cleanup must never mask an install. */
function removeTree(target: string): boolean {
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 });
    return true;
  } catch {
    return false;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function rootDir(): string {
  return path.join(app.getPath('userData'), 'extensions');
}

function recordsPath(): string {
  return path.join(app.getPath('userData'), 'kryvex-extensions.json');
}

function safeKey(value: string): boolean {
  return /^ext-[a-z0-9-]{6,80}$/.test(value);
}

function readRecords(): StoredExtension[] {
  try {
    const raw = JSON.parse(fs.readFileSync(recordsPath(), 'utf8'));
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item): item is StoredExtension =>
        Boolean(item) &&
        typeof item.key === 'string' &&
        safeKey(item.key) &&
        typeof item.dir === 'string' &&
        item.dir.startsWith(rootDir()),
      )
      .slice(0, 30);
  } catch {
    return [];
  }
}

function writeRecords(records: StoredExtension[]): void {
  const target = recordsPath();
  const tmp = `${target}.tmp`;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(records), 'utf8');
    fs.renameSync(tmp, target);
  } catch {
    removeTree(tmp);
  }
}

/** Chrome extensions often store the display name in _locales messages. */
function resolveManifestName(dir: string, raw: string, defaultLocale: unknown): string {
  const match = /^__MSG_(.+)__$/i.exec(raw.trim());
  if (!match) return raw.slice(0, 80) || 'Unnamed extension';
  const locales = [
    typeof defaultLocale === 'string' ? defaultLocale : '',
    'en',
    'en_US',
  ].filter(Boolean);
  for (const locale of locales) {
    try {
      const file = path.join(dir, '_locales', locale, 'messages.json');
      const messages = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
      const entry = Object.entries(messages).find(
        ([key]) => key.toLowerCase() === match[1].toLowerCase(),
      )?.[1];
      const message =
        entry && typeof entry === 'object' && typeof (entry as { message?: unknown }).message === 'string'
          ? (entry as { message: string }).message
          : null;
      if (message) return message.slice(0, 80);
    } catch {
      /* try the next locale */
    }
  }
  return 'Unnamed extension';
}

function validateManifest(dir: string): { name: string; version: string; manifestVersion: number } {
  const manifestFile = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestFile)) throw new Error('The package has no manifest.json.');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as Record<string, unknown>;
  const manifestVersion = Number(manifest.manifest_version);
  if (manifestVersion !== 2 && manifestVersion !== 3) {
    throw new Error('Only Manifest V2/V3 Chrome extensions are supported.');
  }
  const rawName = typeof manifest.name === 'string' ? manifest.name : '';
  const name = resolveManifestName(dir, rawName, manifest.default_locale);
  const version = typeof manifest.version === 'string' ? manifest.version.slice(0, 30) : '0.0.0';
  return { name, version, manifestVersion };
}

function findExtensionRoot(dir: string, depth = 0): string | null {
  if (fs.existsSync(path.join(dir, 'manifest.json'))) return dir;
  if (depth >= 2) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const found = findExtensionRoot(path.join(dir, entry.name), depth + 1);
    if (found) return found;
  }
  return null;
}

/** CRX3 files carry a binary header before the ZIP payload. */
function unwrapCrx(buffer: Buffer): Buffer {
  const zipMagic = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  const offset = buffer.indexOf(zipMagic);
  if (offset < 0) throw new Error('This .crx file does not contain a ZIP payload.');
  return buffer.subarray(offset);
}

class ExtensionManager {
  private records: StoredExtension[] = [];
  private sessions = new Set<Session>();
  private defaultSession: Session | null = null;
  private window: BrowserWindow | null = null;

  init(defaultSession: Session): void {
    this.defaultSession = defaultSession;
    this.sessions.add(defaultSession);
    this.records = readRecords();
    for (const record of this.records) {
      if (record.enabled) void this.loadInto(defaultSession, record);
    }
  }

  attachWindow(win: BrowserWindow): void {
    this.window = win;
  }

  trackSession(ses: Session): void {
    if (this.sessions.has(ses)) return;
    this.sessions.add(ses);
    for (const record of this.records) {
      if (record.enabled) void this.loadInto(ses, record);
    }
  }

  list(): ExtensionRecord[] {
    const loadedPaths = new Set(
      this.defaultSession?.extensions.getAllExtensions().map(extension => extension.path) ?? [],
    );
    return this.records.map(record => ({
      key: record.key,
      name: record.name,
      version: record.version,
      manifestVersion: record.manifestVersion,
      enabled: record.enabled,
      installedAt: record.installedAt,
      loaded: loadedPaths.has(record.dir),
    }));
  }

  async installFromWebStore(extensionId: string): Promise<InstallResult> {
    if (!/^[a-p]{32}$/.test(extensionId)) {
      return this.result(false, 'That is not a valid Chrome Web Store extension ID.');
    }
    const target = path.join(rootDir(), `.webstore-${crypto.randomUUID()}.crx`);
    try {
      const url = new URL('https://clients2.google.com/service/update2/crx');
      url.searchParams.set('response', 'redirect');
      url.searchParams.set('prodversion', process.versions.chrome ?? '140.0.0.0');
      url.searchParams.set('acceptformat', 'crx2,crx3');
      url.searchParams.set('x', `id=${extensionId}&uc`);

      const response = await net.fetch(url.toString(), { redirect: 'follow' });
      if (!response.ok) {
        return this.result(false, `Chrome Web Store returned HTTP ${response.status}.`);
      }
      const declared = Number(response.headers.get('content-length') ?? '0');
      if (declared > MAX_EXTENSION_BYTES) {
        return this.result(false, 'That extension package is larger than 80 MB.');
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > MAX_EXTENSION_BYTES) {
        return this.result(false, 'That extension package is larger than 80 MB.');
      }
      if (buffer.byteLength < 4) {
        return this.result(false, 'Chrome Web Store returned an empty package.');
      }
      fs.mkdirSync(rootDir(), { recursive: true });
      fs.writeFileSync(target, buffer);
      return await this.installFromPath(target);
    } catch (error) {
      return this.result(
        false,
        error instanceof Error
          ? error.message
          : 'The Chrome Web Store extension could not be downloaded.',
      );
    } finally {
      removeTree(target);
    }
  }

  async installFromDialog(folder: boolean): Promise<InstallResult> {
    const window = this.window;
    // `showOpenDialog` needs a live parent; a destroyed window throws.
    if (!isAliveWindow(window)) return this.result(false, 'The main window is not ready.');
    const picked = await dialog.showOpenDialog(window, {
      title: folder ? 'Choose an unpacked Chrome extension' : 'Choose a Chrome extension package',
      properties: folder ? ['openDirectory'] : ['openFile'],
      filters: folder
        ? undefined
        : [{ name: 'Chrome extension', extensions: ['zip', 'crx', 'xpi'] }],
    });
    if (picked.canceled || picked.filePaths.length === 0) {
      return this.result(false, 'Installation cancelled.');
    }
    return this.installFromPath(picked.filePaths[0]);
  }

  private async installFromPath(source: string): Promise<InstallResult> {
    if (!this.defaultSession) return this.result(false, 'The session is not ready.');
    const lower = source.toLowerCase();
    if (lower.endsWith('.xpi')) {
      return this.result(
        false,
        'Firefox .xpi add-ons are Gecko-only and cannot run in Electron. Use a Chrome build instead.',
      );
    }

    const key = `ext-${crypto.randomUUID()}`;
    fs.mkdirSync(rootDir(), { recursive: true });
    const target = path.join(rootDir(), key);
    const temp = path.join(rootDir(), `.tmp-${key}`);

    try {
      const stat = fs.statSync(source);
      if (stat.size > MAX_EXTENSION_BYTES) throw new Error('That package is larger than 80 MB.');

      let extensionRoot = source;
      if (stat.isFile()) {
        fs.mkdirSync(temp, { recursive: true });
        const raw = fs.readFileSync(source);
        const unpackDir = path.join(temp, 'unpacked');
        fs.mkdirSync(unpackDir, { recursive: true });
        extractZip(lower.endsWith('.crx') ? unwrapCrx(raw) : raw, unpackDir);
        extensionRoot = findExtensionRoot(unpackDir) ?? '';
        if (!extensionRoot) throw new Error('No manifest.json was found in the package.');
      } else {
        extensionRoot = findExtensionRoot(source) ?? '';
        if (!extensionRoot) throw new Error('No manifest.json was found in that folder.');
      }

      const manifest = validateManifest(extensionRoot);
      fs.cpSync(extensionRoot, target, { recursive: true });
      removeTree(temp);

      const record: StoredExtension = {
        key,
        name: manifest.name,
        version: manifest.version,
        manifestVersion: manifest.manifestVersion,
        enabled: true,
        installedAt: Date.now(),
        dir: target,
      };

      const loaded = await this.loadInto(this.defaultSession, record);
      if (!loaded) {
        removeTree(target);
        return this.result(false, 'Electron rejected the extension manifest.');
      }

      this.records = [...this.records, record];
      writeRecords(this.records);
      for (const ses of this.sessions) {
        if (ses !== this.defaultSession) void this.loadInto(ses, record);
      }
      return this.result(true, `${manifest.name} installed.`);
    } catch (error) {
      removeTree(temp);
      removeTree(target);
      return this.result(
        false,
        error instanceof Error ? error.message : 'The extension could not be installed.',
      );
    }
  }

  async setEnabled(key: string, enabled: boolean): Promise<InstallResult> {
    const record = this.records.find(item => item.key === key);
    if (!record) return this.result(false, 'That extension is not installed.');
    record.enabled = enabled;
    writeRecords(this.records);

    if (enabled) {
      for (const ses of this.sessions) await this.loadInto(ses, record);
      return this.result(true, `${record.name} enabled.`);
    }

    for (const ses of this.sessions) {
      for (const extension of ses.extensions.getAllExtensions()) {
        if (extension.path === record.dir) {
          try {
            ses.extensions.removeExtension(extension.id);
          } catch {
            /* ignore individual session failures */
          }
        }
      }
    }
    return this.result(true, `${record.name} disabled.`);
  }

  async remove(key: string): Promise<InstallResult> {
    const record = this.records.find(item => item.key === key);
    if (!record) return this.result(false, 'That extension is not installed.');
    for (const ses of this.sessions) {
      for (const extension of ses.extensions.getAllExtensions()) {
        if (extension.path === record.dir) {
          try {
            ses.extensions.removeExtension(extension.id);
          } catch {
            /* ignore */
          }
        }
      }
    }
    this.records = this.records.filter(item => item.key !== key);
    writeRecords(this.records);
    if (record.dir.startsWith(rootDir()) && safeKey(record.key)) {
      // Chromium may still have the extension's service worker files mapped.
      for (let attempt = 0; attempt < 12; attempt += 1) {
        if (removeTree(record.dir) || !fs.existsSync(record.dir)) break;
        await wait(250);
      }
    }
    return this.result(true, `${record.name} removed.`);
  }

  private async loadInto(ses: Session, record: StoredExtension): Promise<boolean> {
    if (!record.enabled) return false;
    if (ses.extensions.getAllExtensions().some(extension => extension.path === record.dir)) {
      return true;
    }
    try {
      await ses.extensions.loadExtension(record.dir, { allowFileAccess: true });
      return true;
    } catch {
      return false;
    }
  }

  private result(ok: boolean, message: string, records?: ExtensionRecord[]): InstallResult {
    return { ok, message, records: records ?? this.list() };
  }
}

export const extensions = new ExtensionManager();
