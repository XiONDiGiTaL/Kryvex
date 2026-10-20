import { session, type Session, type WebContents } from 'electron';
import { isServicePartition } from './service-rules';

/**
 * Owns the small amount of state that makes a service module feel installed
 * rather than bookmarked:
 *
 * - the notification policy for persistent service partitions, toggleable in
 *   Settings and denied for throwaway browser tabs;
 * - session clearing for one service, without touching any other module.
 *
 * The session object identity is stable per partition in the main process, so
 * recording it at webview attach time is enough to recognise it later.
 */
class ServiceSessionManager {
  private services = new WeakSet<Session>();
  private notifications = true;

  /** Called from will-attach-webview with the guest's declared partition. */
  markPartition(partition: unknown): void {
    if (!isServicePartition(partition)) return;
    try {
      this.services.add(session.fromPartition(partition));
    } catch {
      /* a partition that cannot be resolved simply gets no service grants */
    }
  }

  isServiceSession(ses: Session | null | undefined): boolean {
    if (!ses) return false;
    return this.services.has(ses);
  }

  allowsNotifications(contents: WebContents | null | undefined): boolean {
    if (!this.notifications || !contents) return false;
    try {
      return contents.getType() === 'webview' && this.isServiceSession(contents.session);
    } catch {
      return false;
    }
  }

  setNotifications(enabled: boolean): void {
    this.notifications = Boolean(enabled);
  }

  notificationsEnabled(): boolean {
    return this.notifications;
  }

  /** Clears only the named service partition: cookies, storage and cache. */
  async clear(partition: unknown): Promise<boolean> {
    if (!isServicePartition(partition)) return false;
    try {
      const target = session.fromPartition(partition);
      await target.clearStorageData();
      await target.clearCache();
      return true;
    } catch {
      return false;
    }
  }
}

export const serviceSessions = new ServiceSessionManager();
