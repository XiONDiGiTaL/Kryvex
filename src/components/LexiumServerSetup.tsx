import { useState } from 'react';
import { useT } from '../lib/i18n';
import {
  ENGINE_LABELS,
  LOCAL_SERVERS,
  healthEndpoint,
  type LocalCandidate,
} from '../lib/lexium';
import type { LexiumEngine } from '../types';
import { Icon } from './ui';
import { LexiumLocalEngine } from './LexiumLocalEngine';

/**
 * The setup path for a speech engine.
 *
 * Lexium is a client, so a brand-new install has nothing to talk to. The first
 * transcription used to end on "nothing answered" and leave it there, which is
 * a dead end for anyone who has never run a Whisper server. This panel says
 * what the engine is, offers the three supported shapes with a command to
 * copy, and can scan the usual local ports so a server that is already running
 * is one click away instead of a configuration exercise.
 *
 * Probing goes through the main process when it exists: a renderer request to
 * `http://127.0.0.1:8000` is refused by CORS before it reaches a healthy
 * server, which would make a running engine look offline.
 */
const COMMANDS: Array<{ label: string; engine: LexiumEngine; baseUrl: string; command: string }> = [
  {
    label: 'whisper.cpp',
    engine: 'whisper-cpp',
    baseUrl: 'http://127.0.0.1:8080',
    command: 'whisper-server -m ggml-base.bin --host 127.0.0.1 --port 8080',
  },
  {
    label: 'local-whisper',
    engine: 'local-whisper',
    baseUrl: 'http://127.0.0.1:8000',
    command: 'uvicorn app.main:app --host 127.0.0.1 --port 8000',
  },
  {
    label: 'OpenAI-compatible',
    engine: 'openai',
    baseUrl: 'http://127.0.0.1:8001',
    command: 'docker run --rm -p 8001:8000 fedirz/faster-whisper-server:latest-cpu',
  },
];

export function LexiumServerSetup({
  onPick,
  onCopy,
  onUseThisPc,
  usingThisPc = false,
  onUseLocalEngine,
  activeEngine,
  activeUrl,
}: {
  /** Applies one detected server to the settings. */
  onPick: (engine: LexiumEngine, baseUrl: string) => void;
  onCopy: (value: string, label: string) => void;
  /** Selects the speech engine the desktop build already has. */
  onUseThisPc?: () => void;
  usingThisPc?: boolean;
  /** Selects the Whisper server Kryvex installed on this machine. */
  onUseLocalEngine?: (baseUrl: string, model: string) => void;
  /** The engine and address Lexium is pointed at, for the "in use" mark. */
  activeEngine?: string;
  activeUrl?: string;
}) {
  const t = useT();
  // The in-box engine exists in the desktop app on Windows only; elsewhere the
  // row would be a button that cannot do anything.
  const thisPc = typeof window !== 'undefined' && window.kryvex?.platform === 'win32';
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [found, setFound] = useState<LocalCandidate[]>([]);

  async function probe(candidate: LocalCandidate): Promise<boolean> {
    const endpoint = healthEndpoint(candidate.engine, candidate.baseUrl);
    if (!endpoint) return false;
    const bridge = window.kryvex;
    if (bridge?.lexiumProbe) {
      try {
        const answer = await bridge.lexiumProbe({
          engine: candidate.engine,
          baseUrl: candidate.baseUrl,
        });
        return Boolean(answer?.ok);
      } catch {
        return false;
      }
    }
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(4000) });
      return response.ok;
    } catch {
      return false;
    }
  }

  async function scan() {
    setScanning(true);
    setFound([]);
    const answers = await Promise.all(
      LOCAL_SERVERS.map(async candidate => ((await probe(candidate)) ? candidate : null)),
    );
    setFound(answers.filter((item): item is LocalCandidate => item !== null));
    setScanned(true);
    setScanning(false);
  }

  return (
    <section className="lexium-setup" aria-label={t('Run a transcription server on this machine')}>
      {/* The one-click path comes first: it is the answer for anyone who has
          never run a speech server, and the rows below are for the rest. */}
      {onUseLocalEngine ? (
        <LexiumLocalEngine
          activeEngine={activeEngine ?? ''}
          activeUrl={activeUrl ?? ''}
          onUse={onUseLocalEngine}
        />
      ) : null}

      <header className="lexium-setup-head">
        <div>
          <strong>{t('Run a transcription server on this machine')}</strong>
          <p>
            {t(
              'Vexium Core is a text model, so it cannot hear audio. Transcription needs a speech model: use the one this PC has, or start a server of your own.',
            )}
          </p>
        </div>
        <button className="btn secondary small" onClick={() => void scan()} disabled={scanning}>
          <Icon name="search" size={14} />
          {scanning ? t('Scanning…') : t('Scan this machine')}
        </button>
      </header>

      {thisPc && onUseThisPc ? (
        <div className="lexium-setup-pc">
          <div>
            <strong>{t('No setup: {name}', { name: ENGINE_LABELS['windows-speech'] })}</strong>
            <span>
              {t(
                'Windows already has a speech engine. It needs no download and no server, and it is best on clear speech: for accents, music or several speakers a Whisper server below is far more accurate.',
              )}
            </span>
          </div>
          <button
            className="btn primary small"
            onClick={onUseThisPc}
            disabled={usingThisPc}
            aria-pressed={usingThisPc}
          >
            <Icon name="mic" size={14} />
            {usingThisPc ? t('In use') : t('Use this PC')}
          </button>
        </div>
      ) : null}

      {found.length > 0 ? (
        <ul className="lexium-setup-found">
          {found.map(candidate => (
            <li key={`${candidate.engine}-${candidate.baseUrl}`}>
              <span>{t('Found {name} at {url}.', { name: candidate.label, url: candidate.baseUrl })}</span>
              <button
                className="btn primary tiny"
                onClick={() => onPick(candidate.engine, candidate.baseUrl)}
              >
                {t('Use this server')}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {scanned && found.length === 0 ? (
        <p className="lexium-hint">{t('No local server answered on the usual ports.')}</p>
      ) : null}

      <p className="lexium-hint">
        {t('Start one of these, then press Check speech server.')}{' '}
        {t('Examples only; follow each project’s own instructions if they differ.')}
      </p>

      <div className="lexium-commands">
        {COMMANDS.map(item => (
          <div key={item.label}>
            <span className="mono">{item.label}</span>
            <code>{item.command}</code>
            <button
              className="btn ghost tiny"
              onClick={() => onCopy(item.command, t('Copy command'))}
              aria-label={t('Copy command')}
              title={t('Copy command')}
            >
              <Icon name="copy" size={12} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
