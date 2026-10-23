import { webContents, type WebContents } from 'electron';
import { serviceSessions } from './service-sessions';
import {
  adProbeScript,
  adSkipScript,
  canAttemptSkip,
  isSpotifyPage,
  parseAdProbe,
  restoreMuted,
  shouldAttemptSkip,
} from './spotify-rules';

const POLL_MS = 1200;

/**
 * Opt-in Spotify ad handling for service modules.
 *
 * Spotify's web player has no exposed media element for its stream, so the
 * guard cannot fade a volume slider. It asks the now-playing bar whether an ad
 * is on screen and mutes the whole guest while it is, then restores the module
 * to its own mute policy. A track, album or playlist ad may press the page's
 * own Next button; a podcast break, or an unclear context, only uses an
 * explicit Skip ad control, because Next could leave the episode. Either click
 * happens at most once every twenty seconds, which is best effort: unskippable
 * ads stay.
 *
 * Nothing runs until the user turns the switch on, nothing is sent anywhere,
 * and the page's DOM is read, never rewritten.
 */
class SpotifyAdGuard {
  private enabled = false;
  private timers = new Map<number, NodeJS.Timeout>();
  /** Guests this guard muted, so an already muted module is not unmuted. */
  private borrowedMute = new Set<number>();
  private lastSkip = new Map<number, number>();
  private pending = new Set<number>();

  track(contents: WebContents): void {
    const sync = () => this.sync(contents);
    contents.on('dom-ready', sync);
    contents.on('did-navigate', sync);
    contents.on('did-navigate-in-page', sync);
    contents.on('destroyed', () => this.forget(contents.id));
    this.sync(contents);
  }

  setEnabled(raw: unknown): boolean {
    this.enabled = raw === true;
    for (const contents of webContents.getAllWebContents()) {
      if (contents.isDestroyed() || contents.getType() !== 'webview') continue;
      if (!serviceSessions.partitionFor(contents)) continue;
      this.sync(contents);
    }
    return this.enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Starts polling for a Spotify guest and stops it everywhere else. */
  private sync(contents: WebContents): void {
    if (contents.isDestroyed()) return;
    let partition: string | null = null;
    let url = '';
    try {
      partition = serviceSessions.partitionFor(contents);
      url = contents.getURL();
    } catch {
      return;
    }
    if (!partition) return;
    this.stopTimer(contents.id);
    if (!this.enabled || !isSpotifyPage(url)) {
      this.restore(contents, partition);
      return;
    }
    const timer = setInterval(() => void this.poll(contents), POLL_MS);
    this.timers.set(contents.id, timer);
    void this.poll(contents);
  }

  private async poll(contents: WebContents): Promise<void> {
    if (!this.enabled || contents.isDestroyed()) return;
    const id = contents.id;
    if (this.pending.has(id)) return;
    this.pending.add(id);
    try {
      const probe = parseAdProbe(await contents.executeJavaScript(adProbeScript(), true));
      if (!this.enabled || contents.isDestroyed()) return;
      const partition = serviceSessions.partitionFor(contents);
      if (!partition) return;
      if (probe.ad) {
        if (!contents.isAudioMuted()) {
          contents.setAudioMuted(true);
          this.borrowedMute.add(id);
        }
        // A podcast with no explicit Skip ad control is muted only: Next would
        // advance the episode rather than the ad. Cooldown still applies to
        // every control so a break cannot be raced through.
        const now = Date.now();
        if (canAttemptSkip(probe) && shouldAttemptSkip(this.lastSkip.get(id) ?? 0, now)) {
          this.lastSkip.set(id, now);
          await contents
            .executeJavaScript(adSkipScript(probe.track), true)
            .catch(() => undefined);
        }
        return;
      }
      this.restore(contents, partition);
    } catch {
      /* a guest between navigations answers on the next poll */
    } finally {
      this.pending.delete(id);
    }
  }

  private restore(contents: WebContents, partition: string | null): void {
    if (!this.borrowedMute.delete(contents.id) || contents.isDestroyed()) return;
    try {
      const muted = restoreMuted(serviceSessions.policyFor(partition).muted);
      if (contents.isAudioMuted() !== muted) contents.setAudioMuted(muted);
    } catch {
      /* the guest is already gone */
    }
  }

  private stopTimer(id: number): void {
    const timer = this.timers.get(id);
    if (!timer) return;
    clearInterval(timer);
    this.timers.delete(id);
  }

  private forget(id: number): void {
    this.stopTimer(id);
    this.borrowedMute.delete(id);
    this.lastSkip.delete(id);
    this.pending.delete(id);
  }
}

export const spotifyAds = new SpotifyAdGuard();
