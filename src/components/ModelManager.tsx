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
} from '../lib/local-models';
import type { ModelCatalogueEntry, ModelDownloadProgress, ModelInstalledRow } from '../types';

type Tone = 'info' | 'success' | 'danger';

/**
 * The reviewed catalogue, one card per artifact.
 *
 * The card discloses everything before a byte moves: publisher, pinned
 * revision, exact size, checksum, licence, quantisation, estimated memory and
 * the model's limits. Download is the only action that touches the network and
 * it never happens on its own; starting a server stays a separate button in the
 * panel above.
 */
export function ModelManager({
  isElectron,
  runtimeReady,
  onUse,
}: {
  isElectron: boolean;
  runtimeReady: boolean;
  onUse: (path: string) => void;
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

  async function download(id: string) {
    const bridge = window.kryvex;
    if (!bridge) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await bridge.modelsDownload(id);
      if (result.ok) {
        setMessage({
          text: t('Model installed. Use this model to hand it to Vexium, then start the server.'),
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

      {!isElectron ? (
        <p className="setting-copy mono">{t('Model downloads are available in the desktop app.')}</p>
      ) : null}

      {catalogue.map(entry => {
        const row = rowFor(entry.id);
        const downloading = activeId === entry.id;
        const percent = downloading ? downloadPercent(progress?.received ?? 0, entry.bytes) : 0;
        return (
          <div key={entry.id} className="model-card">
            <div className="model-card-head">
              <div>
                <strong>{entry.name}</strong>
                <p className="mono model-sub">
                  {entry.publisher} · {entry.licence} · {entry.quantisation}
                </p>
              </div>
              <span className="mono model-state">
                {row ? t('ALREADY INSTALLED') : t('STARTER')}
              </span>
            </div>

            <dl className="model-facts">
              <div>
                <dt>{t('Source')}</dt>
                <dd className="mono">huggingface.co/{entry.repository}</dd>
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
                  <button
                    className="btn primary small"
                    disabled={!isElectron || busy || !row.present}
                    onClick={() => onUse(row.path)}
                  >
                    {t('Use this model')}
                  </button>
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
                  {t('Download')}
                </button>
              )}
            </div>
          </div>
        );
      })}

      <div className="setting-row model-runtime">
        <div>
          <strong>{t('Runtime')}</strong>
          <p className="mono">
            {runtimeReady
              ? t('llama-server was found. Downloading does not start it.')
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
              {installed.map(row => (
                <li key={row.id} className="mono">
                  {row.name} · {formatModelSize(row.bytes)} · {row.licence}
                  {row.present ? '' : ` · ${t('file missing')}`}
                </li>
              ))}
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
