import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n';
import {
  capabilityLabel,
  downloadPercent,
  failureMessage,
  formatMemoryEstimate,
  formatModelSize,
  isActivePhase,
  languageLabel,
  limitationLabel,
  modelSourceLabel,
  orderCatalogue,
} from '../lib/local-models';
import type { ModelCatalogueEntry, ModelDownloadProgress, ModelInstalledRow } from '../types';
import { SettingsBlock } from './SettingsBlock';

type Tone = 'info' | 'success' | 'danger';

/**
 * The reviewed catalogue, one card per artifact.
 *
 * The card discloses everything before a byte moves: publisher, the host the
 * bytes actually come from, pinned revision, exact size, checksum, licence,
 * quantisation, estimated memory and the model's limits. Download is the only
 * action that touches the network and it never happens on its own; starting a
 * server stays a separate button in the panel above.
 *
 * Only the model in use is expanded. The rest sit behind a nested fold, because
 * the list grows with every install and the one that matters is always the one
 * currently handed to the runtime.
 */
export function ModelManager({
  isElectron,
  runtimeReady,
  runtimeBundled,
  runningPath,
  selectedPath,
  onUse,
  onStartCore,
}: {
  isElectron: boolean;
  runtimeReady: boolean;
  runtimeBundled: boolean;
  /** The model file the local runtime is serving, or an empty string. */
  runningPath: string;
  /** The model file Kryvex is configured to use, running or not. */
  selectedPath: string;
  onUse: (path: string) => void;
  onStartCore: (path: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [catalogue, setCatalogue] = useState<ModelCatalogueEntry[]>([]);
  const [installed, setInstalled] = useState<ModelInstalledRow[]>([]);
  const [progress, setProgress] = useState<ModelDownloadProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: Tone } | null>(null);

  const refresh = useCallback(async () => {
    const bridge = window.kryvex;
    if (!bridge?.modelsCatalogue || !bridge.modelsInstalled) return;
    try {
      const [nextCatalogue, nextInstalled] = await Promise.all([
        bridge.modelsCatalogue(),
        bridge.modelsInstalled(),
      ]);
      setCatalogue(nextCatalogue);
      setInstalled(nextInstalled);
    } catch {
      /* an empty panel is better than a broken one */
    }
  }, []);

  useEffect(() => {
    if (!isElectron) return;
    void refresh();
  }, [isElectron, refresh]);

  useEffect(() => {
    if (!isElectron) return;
    return window.kryvex?.onModelProgress?.(next => setProgress(next));
  }, [isElectron]);

  const activeId = isActivePhase(progress?.phase) ? progress?.id : undefined;

  function rowFor(id: string): ModelInstalledRow | undefined {
    return installed.find(row => row.id === id);
  }

  /** True when this card is the model Kryvex is configured to use. */
  function isInUse(row: ModelInstalledRow | undefined): boolean {
    if (!row || !row.present) return false;
    if (selectedPath && row.path === selectedPath) return true;
    return Boolean(runningPath && row.path === runningPath);
  }

  /**
   * The card that leads the panel: whichever model is configured, else the one
   * running, else the default core so the panel is never an empty list.
   */
  const inUseId = catalogue.find(entry => isInUse(rowFor(entry.id)))?.id ?? null;
  const [hero, ...others] = orderCatalogue(catalogue, inUseId, 'vexium-core-3b');

  async function download(id: string) {
    const bridge = window.kryvex;
    if (!bridge) return;
    const entry = catalogue.find(item => item.id === id);
    setBusy(true);
    setMessage(null);
    try {
      const result = await bridge.modelsDownload(id);
      if (result.ok) {
        setMessage({
          text: entry?.id === 'vexium-core-3b'
            ? t('Vexium Core is installed. Start it when you are ready; downloading never starts a server.')
            : t('Model installed. Use this model to hand it to Vexium, then start the server.'),
          tone: 'success',
        });
        await refresh();
      } else if (result.error === 'cancelled') {
        setMessage({ text: t(failureMessage('cancelled')), tone: 'info' });
      } else {
        setMessage({ text: t(failureMessage(result.error)), tone: 'danger' });
      }
    } catch {
      setMessage({ text: t(failureMessage(undefined)), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    try {
      await window.kryvex?.modelsCancel(id);
    } catch {
      /* the download may have finished first */
    }
  }

  async function remove(id: string) {
    const bridge = window.kryvex;
    if (!bridge) return;
    setBusy(true);
    setConfirming(null);
    try {
      const result = await bridge.modelsDelete(id);
      setMessage(
        result.ok
          ? { text: t('The model file was deleted.'), tone: 'info' }
          : { text: t(failureMessage(result.error)), tone: 'danger' },
      );
      await refresh();
    } catch {
      setMessage({ text: t(failureMessage(undefined)), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  async function startCore(row: ModelInstalledRow) {
    setBusy(true);
    setMessage(null);
    try {
      await onStartCore(row.path);
    } finally {
      setBusy(false);
    }
  }

  function renderCard(entry: ModelCatalogueEntry) {
    const row = rowFor(entry.id);
    const downloading = activeId === entry.id;
    const runningHere = Boolean(row && runningPath && row.path === runningPath);
    const inUse = isInUse(row);
    const percent = downloading ? downloadPercent(progress?.received ?? 0, entry.bytes) : 0;
    const source = modelSourceLabel(entry.sourceUrl, entry.repository);
    const sourceIsGithub = source.startsWith('github.com/');
    return (
      <div key={entry.id} className={`model-card ${inUse ? 'is-in-use' : ''}`}>
        <div className="model-card-head">
          <div>
            <strong>{entry.productName ?? entry.name}</strong>
            <p className="mono model-sub">
              {entry.productName ? `${entry.name} · ` : ''}
              {entry.publisher} · {entry.licence} · {entry.quantisation}
            </p>
          </div>
          <span className={`mono model-state ${inUse ? 'is-in-use' : ''}`}>
            {inUse
              ? t('IN USE')
              : row
                ? t('ALREADY INSTALLED')
                : entry.id === 'vexium-core-3b'
                  ? t('DEFAULT CORE')
                  : entry.id === 'qwen2.5-1.5b-instruct'
                    ? t('LIGHT')
                    : entry.quantisation}
          </span>
        </div>

        <dl className="model-facts">
          <div>
            <dt>{t('Source')}</dt>
            <dd className="mono">
              {source}
              {sourceIsGithub ? <span className="model-source-kind"> · {t('release asset')}</span> : null}
            </dd>
          </div>
          <div>
            <dt>{t('Revision')}</dt>
            <dd className="mono model-hash">{entry.revision}</dd>
          </div>
          <div>
            <dt>{t('File')}</dt>
            <dd className="mono">{entry.filename}</dd>
          </div>
          <div>
            <dt>{t('Download size')}</dt>
            <dd className="mono">
              {entry.bytes.toLocaleString()} B · {formatModelSize(entry.bytes)}
            </dd>
          </div>
          <div>
            <dt>{t('SHA-256')}</dt>
            <dd className="mono model-hash">{entry.sha256}</dd>
          </div>
          <div>
            <dt>{t('Licence')}</dt>
            <dd>
              <a href={entry.licenceUrl} target="_blank" rel="noreferrer">
                {entry.licence}
              </a>
              {entry.commercialUse ? ` · ${t('commercial use permitted')}` : ''}
            </dd>
          </div>
          <div>
            <dt>{t('Architecture')}</dt>
            <dd className="mono">
              {entry.architecture} · {t('context')} {entry.contextLength.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt>{t('Estimated memory')}</dt>
            <dd>
              {formatMemoryEstimate(entry.memory)} <span className="mono">({t('estimate')})</span>
            </dd>
          </div>
          <div>
            <dt>{t('Languages')}</dt>
            <dd>{entry.languages.map(languageLabel).join(' · ')}</dd>
          </div>
          <div>
            <dt>{t('Good at')}</dt>
            <dd>{entry.capabilities.map(capabilityLabel).join(' · ')}</dd>
          </div>
          <div>
            <dt>{t('Limits')}</dt>
            <dd>{entry.limitations.map(limitationLabel).join(' · ')}</dd>
          </div>
        </dl>

        {downloading ? (
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
            <div className="meta" aria-live="polite">
              <span className="mono">
                {progress?.phase === 'verifying'
                  ? t('Verifying the checksum…')
                  : t('Downloading {done} of {total}', {
                      done: formatModelSize(progress?.received ?? 0),
                      total: formatModelSize(entry.bytes),
                    })}
              </span>
              <span className="mono">{percent}%</span>
            </div>
          </div>
        ) : null}

        <div className="model-actions">
          {row ? (
            <>
              {entry.id === 'vexium-core-3b' ? (
                <button
                  className="btn primary small"
                  disabled={!isElectron || busy || !row.present}
                  onClick={() => void startCore(row)}
                >
                  {runningHere ? t('Vexium Core is running') : t('Start Vexium Core')}
                </button>
              ) : (
                <button
                  className={`btn small ${inUse ? 'ghost' : 'primary'}`}
                  disabled={!isElectron || busy || !row.present || inUse}
                  aria-pressed={inUse}
                  onClick={() => onUse(row.path)}
                >
                  {inUse ? `✓ ${t('In use')}` : t('Use this model')}
                </button>
              )}
              {confirming === entry.id ? (
                <>
                  <button className="btn danger small" disabled={busy} onClick={() => void remove(entry.id)}>
                    {t('Remove')}
                  </button>
                  <button className="btn ghost small" onClick={() => setConfirming(null)}>
                    {t('Keep')}
                  </button>
                </>
              ) : (
                <button
                  className="btn ghost small"
                  disabled={!isElectron || busy}
                  onClick={() => setConfirming(entry.id)}
                >
                  {t('Delete')}
                </button>
              )}
              {row.present ? null : (
                <span className="mono model-missing">{t('The file is missing from disk.')}</span>
              )}
            </>
          ) : downloading ? (
            <button className="btn secondary small" onClick={() => void cancel(entry.id)}>
              {t('Cancel download')}
            </button>
          ) : (
            <button
              className="btn primary small"
              disabled={!isElectron || busy}
              onClick={() => void download(entry.id)}
            >
              {entry.id === 'vexium-core-3b' ? t('Download Vexium Core') : t('Download')}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="model-manager">
      <div className="custom-filters-head">
        <span className="mono privacy-kicker">{t('DOWNLOAD MODELS')}</span>
        <span className="mono shield-state">{t('PINNED CATALOGUE')}</span>
      </div>
      <p className="setting-copy">
        {t(
          'One reviewed file per model, with its publisher, revision, size, checksum and licence shown before anything is fetched. Downloads start only when you press Download, and a running model is never replaced.',
        )}
      </p>
      {catalogue.some(entry => entry.productName) ? (
        <p className="setting-copy">
          {t(
            'Vexium Core is the supported local stack: the included llama.cpp runtime runs reviewed Qwen2.5 weights on loopback. Vexium Core 3B is the default; Vexium Core Light (1.5B) is there for machines that cannot spare the memory. Qwen and its Apache-2.0 licence stay visible; Kryvex packages the runtime and verifies the file, not the weights.',
          )}
        </p>
      ) : null}

      {!isElectron ? (
        <p className="setting-copy mono">{t('Model downloads are available in the desktop app.')}</p>
      ) : null}

      {hero ? renderCard(hero) : null}

      {others.length > 0 ? (
        <SettingsBlock
          variant="sub"
          className="model-others"
          title={t('Other models')}
          meta={`${others.length} · ${t('folded')}`}
          icon="layers"
        >
          {others.map(entry => renderCard(entry))}
        </SettingsBlock>
      ) : null}

      <div className="setting-row model-runtime">
        <div>
          <strong>{t('Runtime')}</strong>
          <p className="mono">
            {runtimeReady
              ? runtimeBundled
                ? t('The llama.cpp runtime is included with Kryvex. Downloading a model does not start it.')
                : t('llama-server was found. Downloading does not start it.')
              : t('llama-server was not found. You can download now and point Kryvex at the runtime before starting.')}
          </p>
        </div>
      </div>

      <div className="setting-row">
        <div>
          <strong>{t('Already installed')}</strong>
          {installed.length === 0 ? (
            <p className="mono">{t('No downloaded models. This panel fetched nothing on its own.')}</p>
          ) : (
            <ul className="model-installed">
              {installed.map(row => {
                const entry = catalogue.find(item => item.id === row.id);
                const label = entry?.productName
                  ? `${entry.productName} · ${row.name}`
                  : row.name;
                const inUse = isInUse(row);
                return (
                  <li key={row.id} className="mono">
                    {label} · {formatModelSize(row.bytes)} · {row.licence}
                    {row.present ? '' : ` · ${t('file missing')}`}
                    {inUse ? ` · ${t('in use')}` : ''}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {message ? (
        <p className={`model-message tone-${message.tone}`} role="status">
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
