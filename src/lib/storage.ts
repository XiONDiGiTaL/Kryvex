import type { PersistedState } from '../types';
import { hasLocalSpeechEngine, sanitizeState } from './store';

const KEY = 'kryvex.state.v1';

function bridge() {
  return typeof window !== 'undefined' ? window.kryvex : undefined;
}

export async function loadState(): Promise<PersistedState> {
  // The sanitizer stays pure; this is the one place that knows what this build
  // can do without a server, which is what decides the speech engine default.
  const options = { localSpeech: hasLocalSpeechEngine() };
  const kx = bridge();
  if (kx) {
    try {
      return sanitizeState(await kx.loadState(), options);
    } catch {
      return sanitizeState(null, options);
    }
  }
  try {
    return sanitizeState(JSON.parse(window.localStorage.getItem(KEY) ?? 'null'), options);
  } catch {
    return sanitizeState(null, options);
  }
}

let pending: ReturnType<typeof setTimeout> | undefined;
let latest: PersistedState | null = null;

async function flush(): Promise<void> {
  if (!latest) return;
  const state = latest;
  latest = null;
  const kx = bridge();
  if (kx) {
    try {
      await kx.saveState(state);
      return;
    } catch {
      /* fall through to local storage */
    }
  }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or unavailable: state stays in memory */
  }
}

/** Debounced so typing in settings does not hit the disk on every keystroke. */
export function saveState(state: PersistedState, delay = 250): void {
  latest = state;
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = undefined;
    void flush();
  }, delay);
}

export async function saveStateNow(state: PersistedState): Promise<void> {
  latest = state;
  if (pending) {
    clearTimeout(pending);
    pending = undefined;
  }
  await flush();
}
