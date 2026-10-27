import { useEffect, useRef, useState } from 'react';
import type { SpeechInstallProgress, SpeechRuntimeStatus } from '../types';
import { useT } from '../lib/i18n';
import { formatBytes } from '../lib/lexium';
import { Icon } from './ui';

/**
 * One button that makes transcription work.
 *
 * Lexium is a client, so a first-time user had to find a Whisper build, find a
 * model and run a command before the first transcript appeared. This card is
 * the way out of that: it downloads the whisper.cpp server and one reviewed
 * speech model into app data, starts it on loopback, and points Lexium at it.
 * The three servers below stay for anyone who already runs their own.
 *
 * The card owns the status and the actions; the page is told when the engine is
 * up so it can select it. Nothing here builds a URL: the main process decides
 * the address and reports it.
 */
export function LexiumLocalEngine({
  activeEngine,
  activeUrl,
  onUse,
}: {
  /** The engine Lexium is pointed at right now. */
  activeEngine: string;
  activeUrl: string;
  /** Called when the local engine comes up, with the address to use. */
  onUse: (baseUrl: string, model: string) => void;
}) {
  const direct = (value: string) => value.trim().replace(/\/+$/, '').toLowerCase();
  const t = useT();
  const [status, setStatus] = useState<SpeechRuntimeStatus | null>(null);
  const [progress, setProgress] = useState<SpeechInstallProgress | null>(null);
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  const bridge = typeof window !== 'undefined' ? window.kryvex : undefined;
  const available = Boolean(bridge?.speechStatus);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!available) return;
    void refresh();
    // Progress arrives as it happens: a 148 MB model would otherwise need a poll.
    return bridge?.onSpeechProgress?.(next => {
      if (!mounted.current) return;
      setProgress(next);
      if (next.phase === 'installed' || next.phase === 'failed' || next.phase === 'cancelled') {
        setBusy(false);
      } else {
        setBusy(true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available]);

  async function refresh() {
    const answer = await bridge?.speechStatus?.();
    if (!mounted.current) return;
    if (answer) {
      setStatus(answer);
      setModel(current => current || answer.model);
      setBusy(answer.phase === 'installing');
    }
    return answer ?? null;
  }

  /** The main process reports failures as ids; they become words here. */
  function failureCopy(error: string | undefined): string | null {
    switch (error) {
      case 'platform':
        return t('One-click Whisper needs the desktop app on 64-bit Windows.');
      case 'invalid-artifacts':
        return t(
          'The pinned speech build failed its own review, so Kryvex will not install it.',
        );
      case 'network':
        return t('The download could not be reached. Check the connection and try again.');
      case 'disk-space':
        return t(
          'Not enough free space for that model. Free some space, or pick a smaller one.',
        );
      case 'hash':
        return t('The download did not match its checksum, so it was discarded. Try again.');
      case 'size':
        return t('The download was incomplete, so it was discarded. Try again.');
      case 'cancelled':
        return t('The download was cancelled.');
      case 'write':
        return t(
          'The files could not be written. Check that the folder is writable and try again.',
        );
      case 'extract':
        return t('The server archive could not be unpacked, so it was discarded.');
      case 'spawn':
        return t('The server could not be started.');
      case 'timeout':
        return t(
          'The server did not answer in time. A larger model takes longer to load; try again.',
        );
      case 'exit':
        return t('The server stopped on its own. The lines below say why.');
      case 'not-installed':
        return t('Download the server before starting it.');
      case 'busy':
        return t('A download is already running.');
      default:
        return null;
    }
  }

  /** Applies a fresh status and hands the page the address it should use. */
  function apply(answer: SpeechRuntimeStatus | null | undefined) {
    if (!answer) return;
    setStatus(answer);
    setModel(current => current || answer.model);
    setBusy(answer.phase === 'installing' || answer.phase === 'starting');
    if (answer.phase === 'running' && answer.baseUrl) {
      onUse(answer.baseUrl, answer.model);
    }
  }

  async function install() {
    setBusy(true);
    const answer = await bridge?.speechInstall?.(model || status?.model || '');
    setBusy(false);
    apply(answer);
  }

  async function start() {
    setBusy(true);
    const answer = await bridge?.speechStart?.(model || status?.model || '');
    setBusy(false);
    apply(answer);
  }

  async function stop() {
    setBusy(true);
    const answer = await bridge?.speechStop?.();
    setBusy(false);
    apply(answer);
  }

  async function remove() {
    setBusy(true);
    const answer = await bridge?.speechRemove?.(model || status?.model || '');
    setBusy(false);
    apply(answer);
  }

  async function cancel() {
    await bridge?.speechCancel?.();
  }

  /**
   * The launch switch. Turning it on starts the engine now as well, so the
   * switch shows the state the next launch will be in; turning it off stops the
   * server instead of leaving one running behind a switch that says otherwise.
   */
  async function toggleAutostart() {
    setBusy(true);
    const answer = await bridge?.speechAutostart?.(!status?.autostart);
    setBusy(false);
    apply(answer);
  }

  if (!available) {
    return (
      <div className="lexium-setup-local">
        <strong>{t('Whisper on this machine')}</strong>
        <p className="lexium-hint">
          {t(
            'One-click Whisper needs the desktop app on 64-bit Windows. The three servers below work from any build.',
          )}
        </p>
      </div>
    );
  }

  const supported = status?.supported ?? true;
  const installed = Boolean(status?.installed) && supported;
  const rows = status?.models ?? [];
  const presentRows = rows.filter(row => row.present);
  const selected = rows.find(row => row.id === model) ?? rows.find(row => row.id === status?.model);
  const running = status?.phase === 'running';
  const runningThis = running && status?.model === (selected?.id ?? model);
  // Only this engine's own address counts as "in use": a whisper.cpp server
  // someone started by hand is a different engine with its own row below.
  const inUse =
    activeEngine === 'whisper-cpp' && Boolean(status?.baseUrl) && direct(activeUrl) === direct(status?.baseUrl ?? '');
  const selectedPresent = Boolean(selected?.present);
  const percent = progress
    ? Math.max(
        0,
        Math.min(100, Math.floor((progress.received / Math.max(1, progress.total)) * 100)),
      )
    : 0;

  function phaseCopy(): string {
    if (!progress) return t('Working…');
    if (progress.phase === 'verifying') return t('Checking the download…');
    if (progress.phase === 'extracting') return t('Unpacking the server…');
    if (progress.phase === 'cancelled') return t('The download was cancelled.');
    if (progress.phase === 'failed') return failureCopy(progress.error) ?? t('The download failed.');
    return progress.step === 'build'
      ? t('Downloading the whisper.cpp server…')
      : t('Downloading the speech model…');
  }

  return (
    <div className="lexium-setup-local">
      <header className="lexium-setup-head">
        <div>
          <strong>{t('Whisper on this machine')}</strong>
          <p>
            {t(
              'Kryvex downloads the whisper.cpp server and one speech model once, runs it on this machine and stops it when you ask. Nothing is uploaded. This is the engine to use for accents, music and singing, where the PC dictation engine cannot follow.',
            )}
          </p>
        </div>
      </header>

      {!supported ? (
        <p className="lexium-hint">
          {t(
            'One-click Whisper needs the desktop app on 64-bit Windows. The three servers below work from any build.',
          )}
        </p>
      ) : (
        <>
          <div className="lexium-local-row">
            <label className="field">
              <span>{t('Speech model')}</span>
              <select
                value={model || status?.model || ''}
                onChange={event => setModel(event.target.value)}
                disabled={busy || rows.length === 0}
              >
                {rows.map(row => (
                  <option key={row.id} value={row.id}>
                    {row.name} · {formatBytes(row.bytes)}
                    {row.present ? ` · ${t('downloaded')}` : ''}
                  </option>
                ))}
              </select>
            </label>

            {busy ? (
              <button className="btn secondary small" onClick={() => void cancel()}>
                <Icon name="close" size={14} />
                {t('Cancel')}
              </button>
            ) : !installed || !selectedPresent ? (
              <button className="btn primary small" onClick={() => void install()}>
                <Icon name="download" size={14} />
                {t('Download and start')}
              </button>
            ) : runningThis ? (
              <button className="btn secondary small" onClick={() => void stop()}>
                <Icon name="stop" size={14} />
                {t('Stop the engine')}
              </button>
            ) : (
              <button className="btn primary small" onClick={() => void start()}>
                <Icon name="play" size={14} />
                {t('Start the engine')}
              </button>
            )}

            {running && !inUse && !busy ? (
              <button
                className="btn secondary small"
                onClick={() => onUse(status?.baseUrl ?? '', status?.model ?? model)}
              >
                <Icon name="check" size={14} />
                {t('Use this engine')}
              </button>
            ) : null}
          </div>

          <div className="setting-row lexium-autostart">
            <div>
              <strong>{t('Start with Kryvex')}</strong>
              <p>
                {status?.autostart
                  ? t('The engine starts with Kryvex and stops when Kryvex quits.')
                  : t('Start the engine with Kryvex and stop it on quit.')}
              </p>
            </div>
            <button
              className={`switch ${status?.autostart ? 'is-on' : ''}`}
              role="switch"
              aria-checked={Boolean(status?.autostart)}
              aria-label={t('Start with Kryvex')}
              onClick={() => void toggleAutostart()}
              disabled={busy}
            >
              <span />
            </button>
          </div>

          {busy && progress ? (
            <div className="model-progress">
              <div
                className="bar"
                role="progressbar"
                aria-label={t('Download progress')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <i style={{ width: `${percent}%` }} />
              </div>
              <span className="meta">
                <span>{phaseCopy()}</span>
                <span className="mono">{percent}%</span>
              </span>
            </div>
          ) : null}

          {!busy && status?.error ? (
            <p className="lexium-error">{failureCopy(status.error) ?? t('The engine failed.')}</p>
          ) : null}

          {!busy && !status?.error ? (
            <p className="lexium-hint">
              {running
                ? t('Running on {url}. Lexium uses it as soon as it is up.', { url: status?.baseUrl ?? '' })
                : installed && selectedPresent
                  ? t('{name} is downloaded and ready to start.', { name: selected?.name ?? '' })
                  : t(
                      'Nothing is installed yet. The download is a one-time {size} for the model you pick.',
                      { size: formatBytes(selected?.bytes ?? 0) },
                    )}
            </p>
          ) : null}

          {presentRows.length > 0 ? (
            <ul className="lexium-setup-found">
              {presentRows.map(row => {
                  // A product name and a byte count: both are already final, so
                  // the row is a value rather than a sentence to translate.
                  const label = `${row.name} · ${formatBytes(row.bytes)}`;
                  return (
                  <li key={row.id}>
                    <span>{label}</span>
                    <button
                      className="btn ghost tiny"
                      onClick={() => {
                        setModel(row.id);
                        void remove();
                      }}
                      disabled={busy || row.id === status?.model}
                      title={t('Remove {name}', { name: row.name })}
                    >
                      <Icon name="trash" size={12} />
                      {t('Remove')}
                    </button>
                  </li>
                  );
                })}
            </ul>
          ) : null}

          <p className="lexium-hint">
            {t(
              'The server is whisper.cpp (MIT). The models are OpenAI’s Whisper weights, converted by the same project and also MIT. Kryvex fetches them from their own release pages and checks the SHA-256 before unpacking.',
            )}
          </p>

          {status?.log && status.phase === 'error' ? (
            <details className="lexium-setup-details">
              <summary>{t('What the server said')}</summary>
              <pre className="mono lexium-local-log">{status.log}</pre>
            </details>
          ) : null}
        </>
      )}
    </div>
  );
}


