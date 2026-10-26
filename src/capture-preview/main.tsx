import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './capture.css';
import { byteLabel } from '../lib/screen-capture';
import { makeCaptureStrings, normalizeCaptureLanguage } from './strings';

/**
 * The window a capture opens in.
 *
 * Snapping a screenshot and then looking at a thumbnail inside a board card is
 * not enough to decide whether to keep it, so the picture gets its own window:
 * shown at its own shape, with Save as…, Copy, Always on top, Fit/Actual size and
 * New capture in one row, and the saved path kept in view afterwards.
 *
 * The page never holds a file path or a filesystem handle. It asks the main
 * process what it is showing, and every action it offers is one IPC call.
 */

interface CaptureInfo {
  kind: 'shot' | 'clip';
  name: string;
  target: string;
  width: number;
  height: number;
  bytes: number;
  url: string;
  savedPath: string | null;
  pinned: boolean;
  language: string;
  version: string;
}

interface SaveResult {
  ok: boolean;
  path?: string;
  cancelled?: boolean;
  message?: string;
}

interface Note {
  tone: 'ok' | 'bad';
  text: string;
}

function api() {
  return typeof window === 'undefined' ? undefined : window.kryvexCapture;
}

function CaptureWindow() {
  const [info, setInfo] = useState<CaptureInfo | null>(null);
  const [empty, setEmpty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState<'fit' | 'actual'>('fit');
  const [note, setNote] = useState<Note | null>(null);

  const language = normalizeCaptureLanguage(info?.language);
  const tr = useMemo(() => makeCaptureStrings(language), [language]);

  useEffect(() => {
    let alive = true;
    const bridge = api();
    if (!bridge) {
      setEmpty(true);
      return () => {
        alive = false;
      };
    }
    void bridge
      .info()
      .then((value: unknown) => {
        if (!alive) return;
        if (!value) {
          setEmpty(true);
          return;
        }
        setInfo(value as CaptureInfo);
        setZoom('fit');
      })
      .catch(() => {
        if (alive) setEmpty(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const save = useCallback(async () => {
    const bridge = api();
    if (!bridge || saving) return;
    setSaving(true);
    setNote(null);
    try {
      const result = (await bridge.save()) as SaveResult;
      if (result.cancelled) return;
      if (result.ok && result.path) {
        const saved = result.path;
        setInfo(current => (current ? { ...current, savedPath: saved } : current));
        // The footer already carries the path; repeating it here would print it
        // twice on the same line.
        setNote(null);
      } else {
        setNote({ tone: 'bad', text: result.message || tr('saveFailed') });
      }
    } catch {
      setNote({ tone: 'bad', text: tr('saveFailed') });
    } finally {
      setSaving(false);
    }
  }, [saving, tr]);

  const copy = useCallback(async () => {
    const bridge = api();
    if (!bridge) return;
    try {
      const done = await bridge.copy();
      setNote(done ? { tone: 'ok', text: tr('copied') } : { tone: 'bad', text: tr('copyFailed') });
    } catch {
      setNote({ tone: 'bad', text: tr('copyFailed') });
    }
  }, [tr]);

  const togglePin = useCallback(async () => {
    const bridge = api();
    if (!bridge) return;
    const next = !(info?.pinned ?? false);
    try {
      const applied = await bridge.pin(next);
      setInfo(current => (current ? { ...current, pinned: applied } : current));
    } catch {
      setNote({ tone: 'bad', text: tr('pin') });
    }
  }, [info?.pinned, tr]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const bridge = api();
      if (!bridge) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        void bridge.close();
        return;
      }
      if (!event.ctrlKey && !event.metaKey) return;
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        void save();
      }
      if (key === 'c' && info?.kind === 'shot') {
        event.preventDefault();
        void copy();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, copy, info?.kind]);

  return (
    <div className="cap-window">
      <header className="cap-bar">
        <div className="cap-brand">
          <span className="cap-dot" aria-hidden="true" />
          <span>KRYVEX</span>
          <span>{info ? tr(info.kind === 'clip' ? 'recording' : 'screenshot') : ''}</span>
        </div>
        <div className="cap-tools">
          <button type="button" onClick={() => void api()?.fresh()}>
            {tr('newCapture')}
          </button>
          <button type="button" className="primary" onClick={() => void save()} disabled={!info || saving}>
            {saving ? tr('saving') : tr('saveAs')}
          </button>
          <button type="button" onClick={() => void copy()} disabled={!info || info.kind !== 'shot'}>
            {tr('copy')}
          </button>
          {info?.savedPath ? (
            <button type="button" onClick={() => void api()?.reveal()}>
              {tr('showInFolder')}
            </button>
          ) : null}
          <button
            type="button"
            aria-pressed={info?.pinned === true}
            onClick={() => void togglePin()}
            disabled={!info}
          >
            {info?.pinned ? tr('unpin') : tr('pin')}
          </button>
          <button
            type="button"
            aria-pressed={zoom === 'actual'}
            onClick={() => setZoom(current => (current === 'fit' ? 'actual' : 'fit'))}
            disabled={!info || info.kind === 'clip'}
          >
            {zoom === 'fit' ? tr('actual') : tr('fit')}
          </button>
          <button type="button" className="ghost" onClick={() => void api()?.close()}>
            {tr('close')}
          </button>
        </div>
      </header>

      <main className={zoom === 'actual' ? 'cap-stage is-actual' : 'cap-stage'}>
        {info ? (
          info.kind === 'clip' ? (
            <video src={info.url} controls autoPlay loop aria-label={tr('recordingAlt')} />
          ) : (
            <img src={info.url} alt={tr('captureAlt')} />
          )
        ) : (
          <p className="cap-empty">{empty ? tr('missing') : tr('loading')}</p>
        )}
      </main>

      <footer className="cap-meta">
        {info ? (
          <span>
            {info.width ? `${info.width}×${info.height} · ` : ''}
            {byteLabel(info.bytes)}
          </span>
        ) : null}
        {info ? <span className="cap-target">{info.target}</span> : null}
        {info?.savedPath ? (
          <span className="cap-saved">
            {tr('savedTo')} {info.savedPath}
          </span>
        ) : null}
        <span className={note?.tone === 'bad' ? 'cap-note is-error' : 'cap-note'}>
          {note?.text ?? tr('shortcuts')}
        </span>
      </footer>
    </div>
  );
}

const host = document.getElementById('capture-root');
if (host) createRoot(host).render(<CaptureWindow />);
