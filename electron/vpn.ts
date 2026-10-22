import { app, dialog, type BrowserWindow } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import {
  DEFAULT_VPN_CONFIG,
  appendLog,
  buildVpnArgs,
  readVpnLine,
  sanitizeVpnConfig,
  type VpnConfig,
  type VpnPhase,
  type VpnStatus,
} from './vpn-rules';

const CONNECT_TIMEOUT_MS = 60_000;

/**
 * Runs OpenVPN, if the user has one.
 *
 * Kryvex deliberately ships no binary and downloads none: OpenVPN is a system
 * tool with a TUN/TAP driver and a licence of its own. This manager only builds
 * an argv, starts the chosen executable without a shell, reports its real
 * output, and stops it on request or on quit. DNS and proxy are profile-level
 * OpenVPN flags, so they travel through the tunnel rather than being applied by
 * Kryvex behind the user's back.
 */
class VpnManager {
  private config: VpnConfig = { ...DEFAULT_VPN_CONFIG };
  private phase: VpnPhase = 'idle';
  private detail = 'No tunnel is running.';
  private log = '';
  private since: number | null = null;
  private child: (ChildProcess & { stdout: Readable; stderr: Readable }) | null = null;
  private stopping = false;
  private timer: NodeJS.Timeout | null = null;

  configure(raw: unknown): VpnStatus {
    this.config = sanitizeVpnConfig(raw);
    if (this.phase === 'idle' || this.phase === 'missing' || this.phase === 'stopped') {
      const missing = this.missing();
      this.phase = missing ? 'missing' : 'idle';
      this.detail = missing ?? 'Ready.';
    }
    return this.status();
  }

  status(): VpnStatus {
    const binaryFound = Boolean(this.config.binaryPath) && fs.existsSync(this.config.binaryPath);
    const configFound = Boolean(this.config.configPath) && fs.existsSync(this.config.configPath);
    return {
      phase: this.phase,
      binaryFound,
      configFound,
      binaryPath: this.config.binaryPath,
      configPath: this.config.configPath,
      detail: this.detail,
      log: this.log,
      since: this.since,
    };
  }

  async chooseBinary(window: BrowserWindow | null): Promise<VpnStatus> {
    if (!window) return this.status();
    const picked = await dialog.showOpenDialog(window, {
      title: 'Choose the OpenVPN executable',
      properties: ['openFile'],
      filters:
        process.platform === 'win32'
          ? [{ name: 'OpenVPN', extensions: ['exe'] }, { name: 'All files', extensions: ['*'] }]
          : [{ name: 'All files', extensions: ['*'] }],
    });
    const file = picked.canceled ? undefined : picked.filePaths[0];
    if (file) {
      this.config.binaryPath = file;
      this.detail = 'OpenVPN executable set.';
      if (this.phase === 'missing') this.phase = 'idle';
    }
    return this.status();
  }

  async chooseConfig(window: BrowserWindow | null): Promise<VpnStatus> {
    if (!window) return this.status();
    const picked = await dialog.showOpenDialog(window, {
      title: 'Choose an OpenVPN profile',
      properties: ['openFile'],
      filters: [
        { name: 'OpenVPN profiles', extensions: ['ovpn', 'conf'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    const file = picked.canceled ? undefined : picked.filePaths[0];
    if (file) {
      this.config.configPath = file;
      this.detail = 'OpenVPN profile set.';
      if (this.phase === 'missing') this.phase = 'idle';
    }
    return this.status();
  }

  connect(): VpnStatus {
    if (this.child) return this.status();
    const missing = this.missing();
    if (missing) {
      this.phase = 'missing';
      this.detail = missing;
      return this.status();
    }
    const built = buildVpnArgs(this.config);
    if (!built.ok) {
      this.phase = 'error';
      this.detail = built.error ?? 'The OpenVPN arguments are invalid.';
      return this.status();
    }

    this.phase = 'connecting';
    this.detail = 'Starting OpenVPN…';
    this.log = '';
    this.since = null;
    this.stopping = false;

    let child: ChildProcess & { stdout: Readable; stderr: Readable };
    try {
      child = spawn(this.config.binaryPath, built.args, {
        cwd: path.dirname(this.config.configPath),
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      }) as ChildProcess & { stdout: Readable; stderr: Readable };
    } catch (error) {
      this.phase = 'error';
      this.detail = error instanceof Error ? error.message : 'OpenVPN could not be started.';
      return this.status();
    }
    this.child = child;

    const consume = (chunk: Buffer) => {
      this.log = appendLog(this.log, chunk.toString('utf8'));
      for (const line of chunk.toString('utf8').split('\n')) {
        const event = readVpnLine(line);
        if (!event) continue;
        if (event.kind === 'connected') {
          this.phase = 'connected';
          this.since = Date.now();
          this.detail = event.message;
          this.clearTimer();
        } else if (event.kind === 'auth-failed') {
          this.phase = 'error';
          this.detail = event.message;
          this.clearTimer();
          this.stop();
        } else if (event.kind === 'error' && this.phase !== 'connected') {
          this.phase = 'error';
          this.detail = event.message;
        }
      }
    };
    child.stdout.on('data', consume);
    child.stderr.on('data', consume);
    child.on('error', error => {
      this.phase = 'error';
      this.detail = error.message;
      this.child = null;
      this.clearTimer();
    });
    child.on('close', code => {
      this.child = null;
      this.clearTimer();
      if (this.stopping) {
        this.phase = 'stopped';
        this.detail = 'Tunnel stopped.';
      } else if (this.phase !== 'error') {
        this.phase = code === 0 ? 'stopped' : 'error';
        this.detail =
          code === 0
            ? 'OpenVPN exited.'
            : `OpenVPN exited with code ${code ?? 'unknown'}. Check the log below.`;
      }
      this.since = null;
      this.stopping = false;
    });

    this.timer = setTimeout(() => {
      if (this.phase === 'connecting') {
        this.phase = 'error';
        this.detail = 'OpenVPN did not finish connecting within a minute. Check the log below.';
        this.stop();
      }
    }, CONNECT_TIMEOUT_MS);

    return this.status();
  }

  disconnect(): VpnStatus {
    if (!this.child) {
      this.phase = 'idle';
      this.detail = 'No tunnel is running.';
      this.since = null;
      return this.status();
    }
    this.detail = 'Stopping the tunnel…';
    this.stop();
    return this.status();
  }

  dispose(): void {
    this.stopping = true;
    this.stop();
  }

  private stop(): void {
    const child = this.child;
    this.clearTimer();
    if (!child) return;
    this.stopping = true;
    try {
      child.kill();
    } catch {
      /* a process that already exited needs nothing */
    }
    setTimeout(() => {
      if (this.child === child) {
        try {
          child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      }
    }, 3000).unref?.();
  }

  private clearTimer(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private missing(): string | null {
    if (!this.config.binaryPath) return 'Choose the OpenVPN executable.';
    if (!fs.existsSync(this.config.binaryPath)) return 'The OpenVPN executable is no longer at that path.';
    if (!this.config.configPath) return 'Choose an OpenVPN profile (.ovpn).';
    if (!fs.existsSync(this.config.configPath)) return 'The OpenVPN profile is no longer at that path.';
    return null;
  }
}

export const vpn = new VpnManager();

// A tunnel must not outlive the app that started it.
app.on('before-quit', () => vpn.dispose());
