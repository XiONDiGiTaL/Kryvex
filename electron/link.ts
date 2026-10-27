import { app, clipboard, dialog, shell, type BrowserWindow } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { media } from './media';
import { LinkServer } from './link-server';
import type { LinkFileInfo, LinkStatus } from './types';
import {
  LINK_CODE_TTL_MS,
  LINK_MAX_DEVICES,
  LINK_MAX_FILES,
  LINK_PORT_FIRST,
  clampText,
  deviceLabel,
  isLinkCommand,
  isLinkToken,
  describeLinkAddresses,
  isPrivateAddress,
  linkableUrl,
  makePairCode,
  uniqueFileName,
  type LinkCommand,
} from './link-rules';

/**
 * Kryvex Link: the desktop half of the phone companion.
 *
 * It keeps the pairing list, the clipboard relay, the transfer folder and the
 * remote-control mapping, and it starts the LAN server that serves the phone's
 * page. The server owns the sockets; this file owns every decision.
 *
 * Two rules shape the code. First, nothing the phone sends is trusted: a file
 * name is rewritten by `safeFileName`, a link is a web page or it is refused, and
 * a command has to be in the allowlist. Second, a token is a capability for one
 * phone: it is minted only against a live six-digit code, it is never sent to
 * another device, and revoking it ends its event stream immediately.
 */

const CLIPBOARD_POLL_MS = 1_200;
const BODY_PREVIEW = 240;

interface LinkDevice {
  token: string;
  /** Public handle for the shell: a digest, never the token itself. */
  id: string;
  label: string;
  address: string;
  pairedAt: number;
  lastSeenAt: number;
}

interface LinkFile {
  id: string;
  name: string;
  size: number;
  at: number;
  direction: 'received' | 'offered';
  path: string;
}

interface LinkIndex {
  devices: LinkDevice[];
  files: LinkFile[];
}

function nowMs(): number {
  return Date.now();
}

/**
 * The handle the renderer may hold. A token is a capability to use the link; a
 * digest of one lets the view say "unpair this phone" without the shell ever
 * holding something that could be replayed against the server.
 */
function deviceId(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 16);
}

class LinkService {
  private server: LinkServer | null = null;
  private win: BrowserWindow | null = null;
  private enabled = false;
  private code = '';
  private codeAt = 0;
  private devices: LinkDevice[] = [];
  private files: LinkFile[] = [];
  private clipboardTimer: NodeJS.Timeout | null = null;
  private lastClipboard = '';
  private fromPhone = '';
  private volume = 1;
  private muted = false;
  private error = '';

  get folder(): string {
    return path.join(app.getPath('downloads'), 'Kryvex Link');
  }

  private indexPath(): string {
    return path.join(app.getPath('userData'), 'link-index.json');
  }

  /** Reads the pairing list and the transfer log, dropping anything stale. */
  init(): void {
    try {
      const raw = JSON.parse(fs.readFileSync(this.indexPath(), 'utf8')) as Partial<LinkIndex>;
      this.devices = Array.isArray(raw.devices)
        ? raw.devices
            .filter(
              device =>
                device &&
                isLinkToken(device.token) &&
                typeof device.label === 'string' &&
                typeof device.pairedAt === 'number',
            )
            // A list written before the handle existed gets one now.
            .map(device => ({ ...device, id: device.id || deviceId(device.token) }))
        : [];
      this.files = Array.isArray(raw.files)
        ? raw.files.filter(
            file =>
              file &&
              typeof file.id === 'string' &&
              typeof file.name === 'string' &&
              typeof file.path === 'string' &&
              (file.direction === 'received' || file.direction === 'offered'),
          )
        : [];
    } catch {
      this.devices = [];
      this.files = [];
    }
    // A received file that the user moved or deleted is no longer a row.
    this.files = this.files.filter(file => {
      if (file.direction === 'offered') return fs.existsSync(file.path);
      return fs.existsSync(file.path);
    });
    try {
      fs.mkdirSync(this.folder, { recursive: true });
    } catch {
      /* the folder is created again on the first transfer */
    }
    this.save();
  }

  private save(): void {
    const payload: LinkIndex = { devices: this.devices, files: this.files };
    try {
      fs.writeFileSync(this.indexPath(), JSON.stringify(payload), 'utf8');
    } catch {
      /* a full or locked profile must not take the link down */
    }
  }

  attachWindow(win: BrowserWindow): void {
    this.win = win;
    win.once('closed', () => {
      if (this.win === win) this.win = null;
    });
  }

  /** The renderer owns the setting; this mirrors it onto the socket. */
  async configure(patch: { enabled?: unknown }): Promise<LinkStatus> {
    const wants = patch.enabled === undefined ? this.enabled : patch.enabled === true;
    if (wants) await this.startListening();
    else this.stopListening();
    return this.status();
  }

  private async startListening(): Promise<void> {
    if (this.enabled && this.server?.listening) return;
    this.enabled = true;
    if (!this.server) this.server = new LinkServer(this.backend, path.join(__dirname, '..', 'dist'));
    try {
      await this.server.start();
      this.error = '';
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'The link could not start.';
    }
    if (!this.code || nowMs() - this.codeAt > LINK_CODE_TTL_MS) this.rollCode();
    this.startClipboardWatch();
  }

  private stopListening(): void {
    this.enabled = false;
    this.server?.stop();
    if (this.clipboardTimer) clearInterval(this.clipboardTimer);
    this.clipboardTimer = null;
  }

  /**
   * The clipboard has no change event, so it is sampled. Sampling stops when the
   * switch is off or no phone is paired, which is also when it costs nothing.
   */
  private startClipboardWatch(): void {
    if (this.clipboardTimer) return;
    this.clipboardTimer = setInterval(() => void this.sampleClipboard(), CLIPBOARD_POLL_MS);
    this.clipboardTimer.unref?.();
  }

  /** One sample. Electron's clipboard is promise-based, so it is awaited here. */
  private async sampleClipboard(): Promise<void> {
    if (!this.enabled || this.devices.length === 0) return;
    let text = '';
    try {
      text = await clipboard.readText();
    } catch {
      return;
    }
    const clean = clampText(text);
    if (!clean || clean === this.lastClipboard || clean === this.fromPhone) return;
    this.lastClipboard = clean;
    this.server?.broadcast('clipboard', { text: clean, at: nowMs(), from: 'desktop' });
  }

  private rollCode(): string {
    this.code = makePairCode(max => crypto.randomInt(max));
    this.codeAt = nowMs();
    return this.code;
  }

  /** A fresh code retires the old one, so a shoulder-surfed code expires. */
  newCode(): LinkStatus {
    this.rollCode();
    return this.status();
  }

  status(): LinkStatus {
    const port = this.server?.boundPort ?? LINK_PORT_FIRST;
    const links = describeLinkAddresses(this.localAddresses(), port);
    return {
      enabled: this.enabled,
      running: Boolean(this.server?.listening),
      port,
      code: this.code,
      codeExpiresAt: this.codeAt + LINK_CODE_TTL_MS,
      urls: links.map(link => link.url),
      links,
      folder: this.folder,
      devices: this.devices.map(device => ({
        id: device.id || deviceId(device.token),
        label: device.label,
        address: device.address,
        pairedAt: device.pairedAt,
        lastSeenAt: device.lastSeenAt,
      })),
      received: this.files.filter(file => file.direction === 'received').map(this.publicFile),
      offered: this.files.filter(file => file.direction === 'offered').map(this.publicFile),
      error: this.error || undefined,
    };
  }

  private publicFile(file: LinkFile): LinkFileInfo {
    return { id: file.id, name: file.name, size: file.size, at: file.at };
  }

  /**
   * Every non-loopback IPv4 on this machine, with the adapter it belongs to. A
   * phone cannot reach 127.0.0.1, so this list is what the user types; the
   * adapter name is what lets the view say which one is the Wi-Fi.
   */
  private localAddresses(): Array<{ address: string; name: string }> {
    const rows: Array<{ address: string; name: string }> = [];
    const interfaces = os.networkInterfaces();
    for (const [name, entries] of Object.entries(interfaces)) {
      for (const row of entries ?? []) {
        if (row.family !== 'IPv4' || row.internal) continue;
        if (!isPrivateAddress(row.address)) continue;
        rows.push({ address: row.address, name });
      }
    }
    return rows.length > 0 ? rows : [{ address: '127.0.0.1', name: 'Loopback' }];
  }

  /** Accepts the device handle the view holds, or the token itself. */
  revoke(handle: unknown): boolean {
    if (typeof handle !== 'string' || !handle) return false;
    const target = this.devices.find(
      device => device.token === handle || (device.id || deviceId(device.token)) === handle,
    );
    if (!target) return false;
    this.devices = this.devices.filter(device => device.token !== target.token);
    this.server?.disconnect(target.token);
    this.save();
    this.announceDevices();
    return true;
  }

  revokeAll(): boolean {
    for (const device of this.devices) this.server?.disconnect(device.token);
    this.devices = [];
    this.save();
    this.announceDevices();
    return true;
  }

  /** Files the desktop offers to the phone are chosen, never pathed by the phone. */
  async offer(): Promise<LinkStatus> {
    const win = this.win;
    const options: Electron.OpenDialogOptions = {
      title: 'Send to your phone',
      buttonLabel: 'Offer',
      properties: ['openFile', 'multiSelections'],
    };
    const picked = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (picked.canceled || picked.filePaths.length === 0) return this.status();
    for (const chosen of picked.filePaths.slice(0, 20)) {
      let stat: fs.Stats;
      try {
        stat = fs.statSync(chosen);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      this.files.unshift({
        id: `f-${crypto.randomBytes(6).toString('hex')}`,
        name: path.basename(chosen),
        size: stat.size,
        at: nowMs(),
        direction: 'offered',
        path: chosen,
      });
    }
    this.trim();
    this.save();
    this.server?.broadcast('files', { state: this.snapshot() });
    return this.status();
  }

  removeFile(id: unknown, deleteFile: unknown): LinkStatus {
    if (typeof id !== 'string') return this.status();
    const file = this.files.find(item => item.id === id);
    if (!file) return this.status();
    this.files = this.files.filter(item => item.id !== id);
    if (deleteFile === true && file.direction === 'received') {
      try {
        fs.rmSync(file.path, { force: true });
      } catch {
        /* the file may already be gone */
      }
    }
    this.save();
    this.server?.broadcast('files', { state: this.snapshot() });
    return this.status();
  }

  clearReceived(deleteFiles: unknown): LinkStatus {
    for (const file of this.files) {
      if (file.direction !== 'received') continue;
      if (deleteFiles !== true) continue;
      try {
        fs.rmSync(file.path, { force: true });
      } catch {
        /* already gone */
      }
    }
    this.files = this.files.filter(file => file.direction === 'offered');
    this.save();
    this.server?.broadcast('files', { state: this.snapshot() });
    return this.status();
  }

  reveal(id: unknown): boolean {
    const file = this.files.find(item => item.id === id);
    if (!file) return false;
    shell.showItemInFolder(file.path);
    return true;
  }

  async open(id: unknown): Promise<boolean> {
    const file = this.files.find(item => item.id === id);
    if (!file) return false;
    const error = await shell.openPath(file.path);
    return error === '';
  }

  /** Kryvex's own events (a transfer, a pairing) reach the phone as a notice. */
  notify(title: string, body: string): void {
    this.server?.broadcast('notice', {
      title: clampText(title).slice(0, 120),
      body: clampText(body).slice(0, BODY_PREVIEW),
      at: nowMs(),
    });
  }

  private announceDevices(): void {
    this.server?.broadcast('devices', { devices: this.status().devices });
  }

  private trim(): void {
    if (this.files.length <= LINK_MAX_FILES) return;
    this.files = this.files.slice(0, LINK_MAX_FILES);
  }

  private snapshot(): unknown {
    const status = this.status();
    const states = media.list();
    const top = states.find(state => state.playing) ?? states[0] ?? null;
    return {
      version: app.getVersion(),
      clipboard: this.lastClipboard,
      devices: status.devices,
      files: { received: status.received, offered: status.offered },
      remote: {
        playing: Boolean(top?.playing),
        title: top?.title ?? '',
        artist: top?.artist ?? '',
        volume: this.volume,
        muted: this.muted,
      },
    };
  }

  private step(delta: number): void {
    const next = Math.min(1, Math.max(0, Math.round((this.volume + delta) * 10) / 10));
    this.volume = next;
    if (next > 0) this.muted = false;
    media.setPageVolume(this.muted ? 0 : next);
  }

  /** One command from the phone, mapped to something the desktop can do. */
  private async run(command: LinkCommand): Promise<boolean> {
    if (command === 'focus') {
      const win = this.win;
      if (!win || win.isDestroyed()) return false;
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
      win.flashFrame(true);
      return true;
    }
    if (command === 'rooms' || command === 'home') {
      const win = this.win;
      if (!win || win.isDestroyed()) return false;
      win.webContents.send('kryvex:link:command', { command });
      return true;
    }
    if (command === 'volume-up') {
      this.step(0.1);
      return true;
    }
    if (command === 'volume-down') {
      this.step(-0.1);
      return true;
    }
    if (command === 'mute') {
      this.muted = !this.muted;
      media.setPageVolume(this.muted ? 0 : this.volume);
      return true;
    }
    const states = media.list();
    const top = states.find(state => state.playing) ?? states[0];
    if (!top) return false;
    return media.control(top.id, command);
  }

  /**
   * The transport's view of this service. Every method here is reached only
   * after the server has checked the source address and the token.
   */
  private backend = {
    version: () => app.getVersion(),
    pair: (code: string, label: string, address: string) => {
      if (!this.enabled || !this.code) return null;
      if (nowMs() - this.codeAt > LINK_CODE_TTL_MS) return null;
      // Constant-time compare: a timing oracle on six digits is worth closing.
      const given = Buffer.from(code);
      const expected = Buffer.from(this.code);
      if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
      if (this.devices.length >= LINK_MAX_DEVICES) {
        this.notify('Kryvex Link is full', `Unpair a device first: ${LINK_MAX_DEVICES} phones can stay paired.`);
        return null;
      }
      const token = crypto.randomBytes(24).toString('hex');
      const device: LinkDevice = {
        token,
        id: deviceId(token),
        label: deviceLabel(label),
        address,
        pairedAt: nowMs(),
        lastSeenAt: nowMs(),
      };
      this.devices.push(device);
      // A code pairs one phone; the next device needs the next code.
      this.rollCode();
      this.save();
      this.announceDevices();
      this.notify(`${device.label} paired`, 'Clipboard and file transfer are live on this phone.');
      this.toShell(`${device.label} paired with Kryvex Link.`, 'success');
      return { token, label: device.label };
    },
    authorize: (token: string) => this.devices.some(device => device.token === token),
    seen: (token: string, address: string) => {
      const device = this.devices.find(item => item.token === token);
      if (!device) return;
      device.lastSeenAt = nowMs();
      if (address) device.address = address;
    },
    unpair: (token: string) => {
      this.devices = this.devices.filter(device => device.token !== token);
      this.save();
      this.announceDevices();
    },
    snapshot: () => this.snapshot(),
    receiveText: (token: string, text: string) => {
      const device = this.devices.find(item => item.token === token);
      this.fromPhone = text;
      this.lastClipboard = text;
      // A clipboard held open by another app rejects the write; that is not
      // worth failing the phone's request over.
      void clipboard.writeText(text).catch(() => undefined);
      this.server?.broadcast('clipboard', { text, at: nowMs(), from: 'phone' });
      this.toShell(`${device?.label ?? 'Your phone'} sent text to the clipboard.`, 'info');
    },
    receiveSend: (token: string, value: string) => {
      const device = this.devices.find(item => item.token === token);
      const label = device?.label ?? 'Your phone';
      const url = linkableUrl(value);
      const win = this.win;
      if (url && win && !win.isDestroyed()) {
        win.webContents.send('kryvex:link:command', { command: 'open-url', url });
        this.toShell(`${label} opened a link in Kryvex.`, 'info');
        return;
      }
      void clipboard.writeText(value).catch(() => undefined);
      this.lastClipboard = value;
      this.server?.broadcast('clipboard', { text: value, at: nowMs(), from: 'phone' });
      this.toShell(`${label} sent text to Kryvex.`, 'info');
    },
    receiveUpload: async (token: string, name: string, data: Buffer) => {
      const device = this.devices.find(item => item.token === token);
      try {
        fs.mkdirSync(this.folder, { recursive: true });
      } catch {
        return null;
      }
      // A name is unique against the transfer log *and* the folder itself: a
      // file the user put there by hand, or one left by an earlier profile,
      // must not make the next upload fail.
      const taken = new Set(this.files.map(file => file.name));
      try {
        for (const entry of fs.readdirSync(this.folder)) taken.add(entry);
      } catch {
        /* an unreadable folder is answered by the write below */
      }
      const finalName = uniqueFileName(taken, name);
      const target = path.join(this.folder, finalName);
      try {
        fs.writeFileSync(target, data, { flag: 'wx' });
      } catch {
        return null;
      }
      const record: LinkFile = {
        id: `f-${crypto.randomBytes(6).toString('hex')}`,
        name: finalName,
        size: data.length,
        at: nowMs(),
        direction: 'received',
        path: target,
      };
      this.files.unshift(record);
      this.trim();
      this.save();
      this.server?.broadcast('files', { state: this.snapshot() });
      this.notify('File received', `${finalName} is in Downloads\\Kryvex Link.`);
      this.toShell(`${device?.label ?? 'Your phone'} sent ${finalName}.`, 'success');
      return this.publicFile(record);
    },
    receiveCommand: async (token: string, command: string) => {
      if (!this.devices.some(device => device.token === token)) return false;
      if (!isLinkCommand(command)) return false;
      const done = await this.run(command);
      this.server?.broadcast('remote', { state: this.snapshot(), ok: done });
      return done;
    },
    outbox: () =>
      this.files.filter(file => file.direction === 'offered').map(this.publicFile),
    outboxPath: (id: string) => {
      const file = this.files.find(item => item.id === id && item.direction === 'offered');
      if (!file) return null;
      try {
        if (!fs.statSync(file.path).isFile()) return null;
      } catch {
        return null;
      }
      return { path: file.path, name: file.name, size: file.size };
    },
  };

  /** A toast in the shell, so a transfer is visible without opening the view. */
  private toShell(message: string, tone: 'info' | 'success' | 'warning' | 'danger'): void {
    const win = this.win;
    if (!win || win.isDestroyed()) return;
    win.webContents.send('kryvex:link:notice', { message, tone });
  }

  dispose(): void {
    this.stopListening();
    this.server = null;
    this.win = null;
  }
}

export const link = new LinkService();
