import { webContents, type BrowserWindow, type WebContents } from 'electron';
import { serviceSessions } from './service-sessions';
import {
  controlScript,
  isMediaAction,
  parseMediaSample,
  sampleScript,
  type MediaAction,
} from './media-rules';
import type { ServiceMediaEvent, ServiceMediaState } from './types';

const SAMPLE_MS = 4000;

/**
 * Listens to service guests that are playing something and relays a small,
 * sanitized state to the shell. Audio itself never leaves the page; the dock is
 * a remote control, not a second decoder.
 */
class MediaTracker {
  private win: BrowserWindow | null = null;
  private states = new Map<number, ServiceMediaState>();
  private timers = new Map<number, NodeJS.Timeout>();
  private pending = new Set<number>();

  attachWindow(win: BrowserWindow): void {
    this.win = win;
    win.on('closed', () => {
      if (this.win === win) this.win = null;
      for (const timer of this.timers.values()) clearInterval(timer);
      this.timers.clear();
      this.states.clear();
    });
  }

  /** Called once for each attached guest; browser-only partitions are ignored. */
  track(contents: WebContents): void {
    let partition = '';
    try {
      if (contents.getType() !== 'webview') return;
      partition = serviceSessions.partitionFor(contents) ?? '';
    } catch {
      return;
    }
    if (!partition) return;

    const refresh = () => void this.refresh(contents);
    contents.on('media-started-playing', refresh);
    contents.on('media-paused', refresh);
    contents.on('dom-ready', () => {
      setTimeout(refresh, 900);
    });
    contents.on('did-navigate', () => {
      // A new page is a new track (or silence); the old metadata must not
      // linger in the dock while the page loads.
      this.forget(contents.id);
      setTimeout(refresh, 1400);
    });
    contents.on('destroyed', () => this.forget(contents.id));
  }

  list(): ServiceMediaState[] {
    return [...this.states.values()].sort(
      (a, b) => Number(b.playing) - Number(a.playing) || b.updatedAt - a.updatedAt,
    );
  }

  async control(rawId: unknown, rawAction: unknown): Promise<boolean> {
    const id = typeof rawId === 'number' ? rawId : Number(rawId);
    if (!Number.isInteger(id) || id <= 0 || !isMediaAction(rawAction)) return false;
    let contents: WebContents | undefined;
    try {
      contents = webContents.fromId(id);
    } catch {
      return false;
    }
    if (!contents || contents.isDestroyed()) return false;
    if (!serviceSessions.partitionFor(contents)) return false;
    try {
      const ok = await contents.executeJavaScript(
        controlScript(contents.getURL(), rawAction as MediaAction),
        true,
      );
      // The site updates its own UI asynchronously; sample again so the dock
      // does not show a play icon for a second after pressing pause.
      setTimeout(() => {
        if (!contents.isDestroyed()) void this.refresh(contents);
      }, 450);
      return ok === true;
    } catch {
      return false;
    }
  }

  refreshAll(): void {
    for (const id of this.states.keys()) {
      try {
        const contents = webContents.fromId(id);
        if (contents && !contents.isDestroyed()) void this.refresh(contents);
      } catch {
        /* a guest that vanished needs nothing */
      }
    }
  }

  private async refresh(contents: WebContents): Promise<void> {
    if (contents.isDestroyed()) return;
    const id = contents.id;
    if (this.pending.has(id)) return;
    let partition = '';
    try {
      partition = serviceSessions.partitionFor(contents) ?? '';
    } catch {
      return;
    }
    if (!partition) return;
    this.pending.add(id);
    try {
      const raw = await contents.executeJavaScript(sampleScript(), true);
      if (contents.isDestroyed()) return;
      const sample = parseMediaSample(raw);
      if (!sample) return;
      const state: ServiceMediaState = {
        id,
        partition,
        url: contents.getURL(),
        title: sample.title,
        artist: sample.artist,
        artwork: sample.artwork,
        playing: sample.playing,
        position: sample.position,
        duration: sample.duration,
        updatedAt: Date.now(),
      };
      this.states.set(id, state);
      this.broadcast({ removed: false, ...state });
      if (sample.playing) this.ensureTimer(contents);
      else this.clearTimer(id);
    } catch {
      /* the guest may be between navigations */
    } finally {
      this.pending.delete(id);
    }
  }

  private ensureTimer(contents: WebContents): void {
    if (this.timers.has(contents.id)) return;
    const timer = setInterval(() => {
      if (contents.isDestroyed()) {
        this.clearTimer(contents.id);
        return;
      }
      void this.refresh(contents);
    }, SAMPLE_MS);
    this.timers.set(contents.id, timer);
  }

  private clearTimer(id: number): void {
    const timer = this.timers.get(id);
    if (!timer) return;
    clearInterval(timer);
    this.timers.delete(id);
  }

  private forget(id: number): void {
    this.clearTimer(id);
    const state = this.states.get(id);
    if (!this.states.delete(id)) return;
    this.broadcast({ removed: true, id, partition: state?.partition ?? '' });
  }

  private broadcast(event: ServiceMediaEvent): void {
    if (!this.win || this.win.isDestroyed()) return;
    try {
      this.win.webContents.send('kryvex:media:changed', event);
    } catch {
      /* the shell may be closing */
    }
  }
}

export const media = new MediaTracker();
