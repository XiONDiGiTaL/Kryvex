import { app, nativeTheme, session, webContents, type WebContents } from 'electron';
import {
  DEFAULT_CHROMIUM,
  chromiumFromState,
  chromiumSwitches,
  chromiumWebPreferences,
  sanitizeChromium,
  type ChromiumSettings,
  type ChromiumWebPreferences,
  type EngineGuest,
  type EngineInfo,
  type EngineGpu,
} from './chromium-rules';

/**
 * Applies the persisted Chromium profile to the running engine.
 *
 * The state file is the source of truth at launch because some switches must
 * exist before `app.whenReady()`; the renderer then sends changes through the
 * bridge so the panel never drifts from what the engine is actually using.
 */
let profile: ChromiumSettings = { ...DEFAULT_CHROMIUM };
let startedAt = Date.now();
const guests = new Map<number, { applied: ChromiumWebPreferences; attachedAt: number }>();

export function chromiumProfile(): ChromiumSettings {
  return profile;
}

/** Launch switches and hardware acceleration. Call once, before app ready. */
export function initChromium(state: unknown): ChromiumSettings {
  profile = chromiumFromState(state);
  startedAt = Date.now();
  if (!profile.hardwareAcceleration) app.disableHardwareAcceleration();
  for (const item of chromiumSwitches(profile)) {
    app.commandLine.appendSwitch(item.name, item.value);
  }
  nativeTheme.themeSource = profile.colorScheme;
  return profile;
}

/** Runtime changes: colour scheme is live, guest preferences apply on attach. */
export function setChromium(raw: unknown): ChromiumSettings {
  profile = sanitizeChromium(raw);
  nativeTheme.themeSource = profile.colorScheme;
  try {
    session.defaultSession.setSpellCheckerEnabled(profile.spellcheck);
  } catch {
    /* a session can be gone while the app closes */
  }
  return profile;
}

/** Called on `will-attach-webview`, after the hardening assignments. */
export function applyChromiumPreferences(target: Record<string, unknown>): void {
  Object.assign(target, chromiumWebPreferences(profile));
}

/** Remembers what each live guest was built with, for the engine report. */
export function trackChromiumGuest(contents: WebContents): void {
  guests.set(contents.id, {
    applied: chromiumWebPreferences(profile),
    attachedAt: Date.now(),
  });
  contents.once('destroyed', () => guests.delete(contents.id));
}

function guestList(): EngineGuest[] {
  const list: EngineGuest[] = [];
  for (const contents of webContents.getAllWebContents()) {
    if (contents.getType() !== 'webview') continue;
    const record = guests.get(contents.id);
    let url = '';
    let zoomFactor = profile.defaultZoom;
    try {
      url = contents.getURL();
      zoomFactor = contents.getZoomFactor();
    } catch {
      /* the guest may be tearing down */
    }
    list.push({
      id: contents.id,
      url,
      zoomFactor,
      applied: record?.applied ?? null,
      attachedAt: record?.attachedAt ?? startedAt,
    });
  }
  return list;
}

export function engineInfo(): EngineInfo {
  const status = app.getGPUFeatureStatus() as unknown as Record<string, string>;
  const gpu: EngineGpu = {
    compositing: String(status.gpu_compositing ?? ''),
    webgl: String(status.webgl ?? ''),
    rasterization: String(status.rasterization ?? ''),
  };
  const switches = chromiumSwitches(profile).map(item =>
    item.value ? `--${item.name}=${item.value}` : `--${item.name}`,
  );
  if (!profile.hardwareAcceleration) switches.push('hardware acceleration disabled');
  return {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    profile,
    accelerated: app.isHardwareAccelerationEnabled(),
    gpu,
    switches,
    guests: guestList(),
  };
}
