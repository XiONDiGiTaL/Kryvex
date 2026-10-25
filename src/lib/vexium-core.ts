import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AssistantSettings,
  LocalModelStatus,
  ModelDownloadProgress,
  ModelInstalledRow,
} from '../types';
import { downloadPercent } from './local-models';

/** Ollama's own server address, and the one Kryvex picks when it serves a file. */
export const OLLAMA_DEFAULT = 'http://127.0.0.1:11434';
export const CORE_DEFAULT = 'http://127.0.0.1:8080';

/**
 * The saved provider, with the one-time move off Ollama's stock default.
 *
 * Before Vexium Core existed, a profile that never touched the assistant was
 * saved as `ollama` at `127.0.0.1:11434` with no model. Those profiles now
 * point at the local stack instead, because nothing in them was a choice: the
 * address, the provider and the empty model are all the old defaults. The
 * `migrated` flag is written on the first load, so a user who later selects
 * Ollama keeps it.
 */
export function resolveAssistantSettings(
  raw: Record<string, unknown>,
  base: AssistantSettings,
): AssistantSettings {
  const provider: AssistantSettings['provider'] =
    raw.provider === 'lmstudio' || raw.provider === 'ollama' || raw.provider === 'local'
      ? raw.provider
      : base.provider;
  const savedUrl = typeof raw.baseUrl === 'string' ? raw.baseUrl.trim().slice(0, 200) : '';
  const model = typeof raw.model === 'string' ? raw.model.trim().slice(0, 120) : '';
  const cleanModel = /[\u0000-\u001f]/.test(model) ? '' : model;
  const migrated = raw.migrated === true;

  if (!migrated && provider === 'ollama' && !cleanModel && isStockOllamaAddress(savedUrl)) {
    return { provider: 'local', baseUrl: CORE_DEFAULT, model: '', migrated: true };
  }

  return {
    provider,
    baseUrl: savedUrl || base.baseUrl,
    model: cleanModel,
    migrated: true,
  };
}

function isStockOllamaAddress(value: string): boolean {
  const trimmed = value.replace(/\/+$/, '').toLowerCase();
  return trimmed === '' || trimmed === OLLAMA_DEFAULT;
}

/**
 * A launch starts the local server only when the profile asked for it and a
 * model file is configured. A saved error stays an error: retrying a missing
 * file on every launch would only hide the reason.
 */
export function shouldAutoStartCore(input: {
  provider: AssistantSettings['provider'];
  status: Pick<LocalModelStatus, 'phase' | 'path'> | null;
}): boolean {
  if (input.provider !== 'local' || !input.status) return false;
  if (!input.status.path) return false;
  return input.status.phase === 'stopped' || input.status.phase === 'idle';
}

/**
 * The catalogue row for the file the runtime is serving, matched by path
 * because a downloaded model keeps the filename the catalogue pinned.
 */
export function installedCoreFor(
  rows: readonly ModelInstalledRow[],
  modelPath: string,
): ModelInstalledRow | null {
  if (!modelPath) return null;
  const target = modelPath.replace(/\//g, '\\').toLowerCase();
  return (
    rows.find(row => row.path.replace(/\//g, '\\').toLowerCase() === target) ??
    rows.find(row => row.present && target.endsWith(`\\${row.filename.toLowerCase()}`)) ??
    null
  );
}

/** Which of the card's two jobs its one button is doing. */
export type CoreAction = 'install' | 'activate';

/**
 * The label behind the core button while it is busy.
 *
 * A press either downloads the strong core or points the runtime at a file
 * already on disk, and only the first one is a download. Activation starts a
 * server, so it must never read "Downloading 0%" for the few seconds the
 * process takes to answer.
 */
export function coreBusyState(input: {
  action: CoreAction | null;
  progress: Pick<ModelDownloadProgress, 'phase'> | null;
  percent: number;
}): { kind: 'downloading' | 'verifying' | 'starting'; percent: number } {
  if (input.progress?.phase === 'verifying') return { kind: 'verifying', percent: 100 };
  if (input.action === 'activate' || input.progress?.phase === 'installed') {
    return { kind: 'starting', percent: input.percent };
  }
  return { kind: 'downloading', percent: input.percent };
}

export interface VexiumCoreRuntime {
  status: LocalModelStatus | null;
  installed: ModelInstalledRow[];
  busy: boolean;
  error: string | null;
  /** Progress of a first-party core download, null when none is running. */
  progress: ModelDownloadProgress | null;
  percent: number;
  start: () => Promise<LocalModelStatus | null>;
  stop: () => Promise<LocalModelStatus | null>;
  /** Downloads a catalogue core, configures it and starts it: one click. */
  install: (id: string) => Promise<LocalModelStatus | null>;
  /** Points the runtime at an installed file and starts it. */
  activate: (row: ModelInstalledRow) => Promise<LocalModelStatus | null>;
  refresh: () => void;
}

/**
 * Watches the local server from the renderer. The main process owns the
 * process; this only reports what it says and asks it to start or stop.
 */
export function useVexiumCore(enabled: boolean): VexiumCoreRuntime {
  const [status, setStatus] = useState<LocalModelStatus | null>(null);
  const [installed, setInstalled] = useState<ModelInstalledRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ModelDownloadProgress | null>(null);
  const alive = useRef(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    const bridge = enabled ? window.kryvex : undefined;
    if (!bridge) return;
    let cancelled = false;
    const poll = () => {
      void bridge
        .modelStatus()
        .then(next => {
          if (!cancelled && alive.current) setStatus(next);
        })
        .catch(() => undefined);
    };
    poll();
    void Promise.all([bridge.modelsInstalled(), bridge.modelStatus()])
      .then(([rows, next]) => {
        if (cancelled || !alive.current) return;
        setInstalled(Array.isArray(rows) ? rows : []);
        setStatus(next);
      })
      .catch(() => undefined);
    // A model that is loading reports `starting` for a while; the card should
    // reach RUNNING as soon as the runtime does, not up to four seconds later.
    const timer = window.setInterval(poll, status?.phase === 'starting' ? 1000 : 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, tick, status?.phase]);

  useEffect(() => {
    const bridge = enabled ? window.kryvex : undefined;
    if (!bridge?.onModelProgress) return;
    return bridge.onModelProgress(next => {
      if (!alive.current) return;
      setProgress(next);
      if (next.phase === 'installed') setTick(value => value + 1);
    });
  }, [enabled]);

  const start = useCallback(async () => {
    const bridge = window.kryvex;
    if (!bridge) return null;
    setBusy(true);
    setError(null);
    try {
      const next = await bridge.modelStart();
      if (alive.current) {
        setStatus(next);
        setError(next.phase === 'error' ? (next.error ?? 'The model could not be started.') : null);
      }
      return next;
    } catch {
      if (alive.current) setError('The model could not be started.');
      return null;
    } finally {
      if (alive.current) setBusy(false);
    }
  }, []);

  const stop = useCallback(async () => {
    const bridge = window.kryvex;
    if (!bridge) return null;
    setBusy(true);
    try {
      const next = await bridge.modelStop();
      if (alive.current) setStatus(next);
      return next;
    } catch {
      if (alive.current) setError('The model could not be stopped.');
      return null;
    } finally {
      if (alive.current) setBusy(false);
    }
  }, []);

  /**
   * The install path behind the Vexium page's one button: fetch the reviewed
   * file, point the runtime at it, then start it. Every step reports failure
   * as a message the card can show instead of a silent no-op.
   */
  const install = useCallback(async (id: string) => {
    const bridge = window.kryvex;
    if (!bridge) return null;
    setBusy(true);
    setError(null);
    try {
      const result = await bridge.modelsDownload(id);
      if (!result?.ok) {
        if (alive.current) setError(result?.error ?? 'download');
        return null;
      }
      const rows = await bridge.modelsInstalled();
      const row = (Array.isArray(rows) ? rows : []).find(item => item.id === id);
      if (!row) {
        if (alive.current) setError('missing-file');
        return null;
      }
      if (alive.current) setInstalled(rows);
      await bridge.modelConfigure({ path: row.path });
      const next = await bridge.modelStart();
      if (alive.current) {
        setStatus(next);
        setTick(value => value + 1);
        if (next.phase === 'error') setError(next.error ?? 'start');
      }
      return next;
    } catch {
      if (alive.current) setError('download');
      return null;
    } finally {
      if (alive.current) setBusy(false);
    }
  }, []);

  const activate = useCallback(async (row: ModelInstalledRow) => {
    const bridge = window.kryvex;
    if (!bridge) return null;
    setBusy(true);
    setError(null);
    try {
      await bridge.modelConfigure({ path: row.path });
      const next = await bridge.modelStart();
      if (alive.current) {
        setStatus(next);
        setTick(value => value + 1);
        if (next.phase === 'error') setError(next.error ?? 'start');
      }
      return next;
    } catch {
      if (alive.current) setError('start');
      return null;
    } finally {
      if (alive.current) setBusy(false);
    }
  }, []);

  const refresh = useCallback(() => setTick(value => value + 1), []);

  const percent =
    progress && progress.phase === 'downloading'
      ? downloadPercent(progress.received, progress.total)
      : progress?.phase === 'verifying'
        ? 100
        : 0;

  return { status, installed, busy, error, progress, percent, start, stop, install, activate, refresh };
}
