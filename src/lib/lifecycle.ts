import type { LifecycleMode, LifecycleServiceId, LifecycleSettings } from '../types';

/**
 * One lifecycle model for every Kryvex service that owns a running process.
 *
 * Before this module each screen answered the question in its own way: the
 * emulator's iframe died with the route, a Disk Pulse scan finished into a
 * component that had already unmounted, and a webview module used a two-value
 * `persistence` flag. The states and the five policies here are the single
 * vocabulary; the per-service table below is the only place that says what a
 * given service is actually able to do.
 *
 * `stopped` is the only state that destroys the view. `paused` keeps it mounted
 * and asks it to suspend activity, `background` keeps it working, and `active`
 * means it is on screen.
 */
export type LifecycleState = 'active' | 'background' | 'paused' | 'stopped';

export const LIFECYCLE_MODES: ReadonlyArray<{
  id: LifecycleMode;
  label: string;
  detail: string;
}> = [
  {
    id: 'keep',
    label: 'Keep running',
    detail: 'The service keeps working while another screen is in front.',
  },
  {
    id: 'mute',
    label: 'Keep running, muted',
    detail: 'It keeps working, but its audio is silenced until it is shown again.',
  },
  {
    id: 'pause',
    label: 'Pause on leave',
    detail: 'It suspends when you leave and picks up where it stopped when you return.',
  },
  {
    id: 'auto-pause',
    label: 'Pause when idle',
    detail: 'It keeps running for a while, then suspends after the interval below.',
  },
  {
    id: 'stop',
    label: 'Stop when leaving',
    detail: 'It is closed when you leave. Reopening starts it again from scratch.',
  },
];

export const IDLE_CHOICES: ReadonlyArray<number> = [5, 10, 15, 60, 240];
export const DEFAULT_IDLE_MINUTES = 15;
export const MIN_IDLE_MINUTES = 1;
export const MAX_IDLE_MINUTES = 480;

export interface LifecycleCapabilities {
  id: LifecycleServiceId;
  /** Display name; also the translation key. */
  label: string;
  /** Extra sentence shown beside the service in Settings. */
  detail: string;
  /** False when the service dies with its view (nothing to keep warm). */
  canKeepRunning: boolean;
  /** False when suspending would destroy the thing it is holding (a live call). */
  canPause: boolean;
  /** False when it has no audio of its own to silence. */
  canMute: boolean;
}

export const LIFECYCLE_SERVICES: ReadonlyArray<LifecycleCapabilities> = [
  {
    id: 'emulator',
    label: '8-bit emulator',
    detail: 'A running game and its core stay loaded.',
    canKeepRunning: true,
    canPause: true,
    canMute: true,
  },
  {
    id: 'disk',
    label: 'Disk pulse',
    detail: 'A scan runs in the main process; leaving the page never cancels it.',
    canKeepRunning: true,
    // A scan is not a resumable pause: suspending would only discard results.
    canPause: false,
    canMute: false,
  },
  {
    id: 'rooms',
    label: 'Rooms',
    detail: 'Membership, chat history and a shared stream stay connected.',
    canKeepRunning: true,
    // Pausing a peer connection would drop the membership it exists to keep.
    canPause: false,
    canMute: true,
  },
  {
    id: 'modules',
    label: 'Web modules',
    detail: 'Each module keeps its own Chromium session, cookies and sign-in.',
    canKeepRunning: true,
    canPause: true,
    canMute: true,
  },
];

export function isLifecycleMode(value: unknown): value is LifecycleMode {
  return LIFECYCLE_MODES.some(mode => mode.id === value);
}

export function isLifecycleService(value: unknown): value is LifecycleServiceId {
  return LIFECYCLE_SERVICES.some(service => service.id === value);
}

export function lifecycleService(id: LifecycleServiceId): LifecycleCapabilities {
  return LIFECYCLE_SERVICES.find(service => service.id === id) ?? LIFECYCLE_SERVICES[0]!;
}

export function lifecycleMode(id: LifecycleMode) {
  return LIFECYCLE_MODES.find(mode => mode.id === id) ?? LIFECYCLE_MODES[0]!;
}

export const DEFAULT_LIFECYCLE: LifecycleSettings = {
  mode: 'keep',
  idleMinutes: DEFAULT_IDLE_MINUTES,
  overrides: {},
};

export function idleWaitMs(minutes: number): number {
  const safe = Number.isFinite(minutes) ? minutes : DEFAULT_IDLE_MINUTES;
  return Math.round(Math.min(MAX_IDLE_MINUTES, Math.max(MIN_IDLE_MINUTES, safe)) * 60_000);
}

/** A service's own exception, or the shared default. */
export function modeFor(settings: LifecycleSettings, id: LifecycleServiceId): LifecycleMode {
  const override = settings.overrides[id];
  return isLifecycleMode(override) ? override : settings.mode;
}

export interface LifecycleInput {
  visible: boolean;
  mode: LifecycleMode;
  /** Only read by `auto-pause`. */
  idleMinutes?: number;
  /** How long the view has been hidden; 0 until it is. */
  hiddenForMs?: number;
  capabilities: LifecycleCapabilities;
}

export interface LifecycleVerdict {
  id: LifecycleServiceId;
  state: LifecycleState;
  /** True when the view must stay mounted (visible or hidden). */
  keepMounted: boolean;
  /** Ask the service to suspend its work but keep its state. */
  pause: boolean;
  /** Silence the service without stopping it. */
  mute: boolean;
  /** Why the requested policy could not be followed to the letter. */
  note?: string;
}

const NOTE_NO_PAUSE = 'This service cannot suspend, so it stays in the background.';
const NOTE_NO_KEEP = 'This service cannot keep running in the background.';
const NOTE_NO_MUTE = 'This service has no audio to silence, so it keeps running with sound.';

/**
 * Turns a policy plus a visibility fact into what the shell should do.
 *
 * Policy never loses information silently: when a service cannot pause or be
 * muted, the verdict says so in `note` and takes the closest safe option
 * instead of pretending the request was honoured.
 */
export function resolveLifecycle({
  visible,
  mode,
  idleMinutes = DEFAULT_IDLE_MINUTES,
  hiddenForMs = 0,
  capabilities,
}: LifecycleInput): LifecycleVerdict {
  const id = capabilities.id;

  if (visible) {
    return { id, state: 'active', keepMounted: true, pause: false, mute: false };
  }

  if (mode === 'stop') {
    return { id, state: 'stopped', keepMounted: false, pause: false, mute: false };
  }

  const wantsPause =
    mode === 'pause' || (mode === 'auto-pause' && hiddenForMs >= idleWaitMs(idleMinutes));

  if (wantsPause && capabilities.canPause) {
    return { id, state: 'paused', keepMounted: true, pause: true, mute: false };
  }

  if (!capabilities.canKeepRunning) {
    if (capabilities.canPause) {
      return {
        id,
        state: 'paused',
        keepMounted: true,
        pause: true,
        mute: false,
        note: NOTE_NO_KEEP,
      };
    }
    return {
      id,
      state: 'stopped',
      keepMounted: false,
      pause: false,
      mute: false,
      note: NOTE_NO_KEEP,
    };
  }

  const wantsMute = mode === 'mute';
  return {
    id,
    state: 'background',
    keepMounted: true,
    pause: false,
    mute: wantsMute && capabilities.canMute,
    ...(wantsPause ? { note: NOTE_NO_PAUSE } : {}),
    ...(wantsMute && !capabilities.canMute ? { note: NOTE_NO_MUTE } : {}),
  };
}

/** Idle intervals are bounded so a stale file can never park a timer for days. */
export function clampIdleMinutes(value: unknown, fallback = DEFAULT_IDLE_MINUTES): number {
  const minutes = Math.round(Number(value));
  if (!Number.isFinite(minutes)) return fallback;
  return Math.min(MAX_IDLE_MINUTES, Math.max(MIN_IDLE_MINUTES, minutes));
}

export function sanitizeLifecycle(
  raw: unknown,
  base: LifecycleSettings = DEFAULT_LIFECYCLE,
): LifecycleSettings {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...base };
  const source = raw as Record<string, unknown>;
  const overrides: Partial<Record<LifecycleServiceId, LifecycleMode>> = {};
  const rawOverrides =
    typeof source.overrides === 'object' && source.overrides !== null && !Array.isArray(source.overrides)
      ? (source.overrides as Record<string, unknown>)
      : {};
  for (const service of LIFECYCLE_SERVICES) {
    const value = rawOverrides[service.id];
    if (isLifecycleMode(value)) overrides[service.id] = value;
  }
  return {
    mode: isLifecycleMode(source.mode) ? source.mode : base.mode,
    idleMinutes: clampIdleMinutes(source.idleMinutes, base.idleMinutes),
    overrides,
  };
}

/** "15 minutes", "1 hour", "4 hours". */
export function idleLabel(minutes: number): string {
  const safe = clampIdleMinutes(minutes);
  if (safe < 60) return `${safe} minute${safe === 1 ? '' : 's'}`;
  const hours = safe / 60;
  const rounded = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `${rounded} hour${hours === 1 ? '' : 's'}`;
}
