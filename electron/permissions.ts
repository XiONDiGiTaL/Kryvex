import type { BrowserWindow, MediaAccessPermissionRequest, WebContents } from 'electron';
import crypto from 'node:crypto';
import {
  isMediaPermission,
  isPrivacyPermission,
  mediaDevices,
  normalizeHttpOrigin,
  type MediaDevice,
} from './privacy';
import type { PermissionPrompt } from './types';

interface PendingPermission {
  id: string;
  origin: string;
  devices: MediaDevice[];
  callbacks: Set<(allowed: boolean) => void>;
}

/**
 * Media permission broker. Remote content never gets an automatic grant:
 * every new origin prompts in the trusted shell, and only the devices the
 * user approved are remembered for the rest of this app session.
 *
 * All other permissions continue to be denied by the session policy.
 */
class PermissionManager {
  private window: BrowserWindow | null = null;
  private grants = new Map<string, Set<MediaDevice>>();
  private pending = new Map<string, PendingPermission>();
  private attached = new WeakSet<BrowserWindow>();

  attachWindow(win: BrowserWindow): void {
    this.window = win;
    if (this.attached.has(win)) return;
    this.attached.add(win);
    win.once('closed', () => {
      if (this.window === win) this.window = null;
      this.denyAll();
    });
  }

  check(permission: string, requestingOrigin: string, mediaType?: string): boolean {
    if (isPrivacyPermission(permission)) return true;
    const origin = normalizeHttpOrigin(requestingOrigin);
    if (!isMediaPermission(permission) || !origin) return false;
    const granted = this.grants.get(origin);
    if (!granted) return false;
    if (mediaType === 'audio') return granted.has('microphone');
    if (mediaType === 'video') return granted.has('camera');
    // An unspecified media check must not unlock a device the user never
    // approved; require both grants before treating the origin as fully open.
    return granted.has('microphone') && granted.has('camera');
  }

  request(
    contents: WebContents,
    permission: string,
    callback: (allowed: boolean) => void,
    details: MediaAccessPermissionRequest,
    originFallback: string,
  ): void {
    if (isPrivacyPermission(permission)) {
      callback(true);
      return;
    }
    if (!isMediaPermission(permission) || contents.getType() !== 'webview') {
      callback(false);
      return;
    }

    const origin = normalizeHttpOrigin(details.securityOrigin ?? originFallback);
    if (!origin) {
      callback(false);
      return;
    }

    const devices = mediaDevices(details.mediaTypes);
    if (devices.length === 0) {
      callback(false);
      return;
    }

    const granted = this.grants.get(origin);
    if (granted && devices.every(device => granted.has(device))) {
      callback(true);
      return;
    }

    // A page can request audio and video separately. Reuse the visible prompt
    // for the same origin instead of stacking duplicate dialogs.
    const existing = [...this.pending.values()].find(
      item =>
        item.origin === origin &&
        item.devices.length === devices.length &&
        item.devices.every(device => devices.includes(device)),
    );
    if (existing) {
      existing.callbacks.add(callback);
      return;
    }

    const id = `perm-${crypto.randomUUID()}`;
    this.pending.set(id, {
      id,
      origin,
      devices,
      callbacks: new Set([callback]),
    });
    this.send('kryvex:permissions:request', this.prompt(id, origin, devices));
  }

  respond(id: string, allow: boolean): boolean {
    const pending = this.pending.get(id);
    if (!pending) return false;
    this.pending.delete(id);
    if (allow) {
      const granted = this.grants.get(pending.origin) ?? new Set<MediaDevice>();
      for (const device of pending.devices) granted.add(device);
      this.grants.set(pending.origin, granted);
    }
    for (const callback of pending.callbacks) callback(allow);
    this.send('kryvex:permissions:resolved', id);
    return true;
  }

  private prompt(id: string, origin: string, devices: MediaDevice[]): PermissionPrompt {
    let host = origin;
    try {
      host = new URL(origin).host;
    } catch {
      /* origin was already validated */
    }
    return { id, origin, host, devices };
  }

  private denyAll(): void {
    for (const pending of this.pending.values()) {
      for (const callback of pending.callbacks) callback(false);
    }
    this.pending.clear();
  }

  private send(channel: string, payload: unknown): void {
    if (!this.window || this.window.isDestroyed()) return;
    try {
      this.window.webContents.send(channel, payload);
    } catch {
      /* the window may be closing while the request is in flight */
    }
  }
}

export const permissions = new PermissionManager();
