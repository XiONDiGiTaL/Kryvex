import { useRef, useState } from 'react';
import { Webview, type WebviewElement, type WebviewStatus } from '../components/Webview';
import { Icon } from '../components/ui';
import { useT } from '../lib/i18n';
import { partitionFor } from '../lib/services';

/**
 * The arcade xiondigital.net publishes.
 *
 * It is a real page, so it is embedded exactly like a module: same `<webview>`,
 * same persistent partition, same service session policy. The partition matters
 * here rather than being a formality — an arcade keeps its high scores and its
 * saved games in browser storage, and an in-memory partition would throw them
 * away on every quit.
 */
export const ARCADE_URL = 'https://xiondigital.net/arcade/';
export const ARCADE_PARTITION_SERVICE_ID = 'arcade';

export function Arcade({
  isElectron,
  onOpenLink,
  onBack,
  embedded = false,
}: {
  isElectron: boolean;
  /** Hands a URL to the registered browser, the same way a service does. */
  onOpenLink: (url: string) => void;
  onBack: () => void;
  /** Rendered inside a Workspace window: the window owns the title bar. */
  embedded?: boolean;
}) {
  const t = useT();
  const controller = useRef<WebviewElement | null>(null);
  const [status, setStatus] = useState<WebviewStatus>({
    loading: true,
    canGoBack: false,
    canGoForward: false,
    error: null,
  });
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <section className={`view arcade-view ${embedded ? 'is-embedded' : ''}`}>
      {embedded ? null : (
      <header className="view-head">
        <div>
          <p className="eyebrow mono">{t('x535 / ARCADE')}</p>
          {/* A product name: the same in every language, so it is not a key. */}
          <h1>Arcade</h1>
          <p className="lede">
            {t(
              'The xiondigital.net arcade, embedded here with its own saved session so scores and saves survive a restart.',
            )}
          </p>
        </div>
        <div className="view-head-actions">
          {isElectron ? (
            <button className="btn secondary small" onClick={() => controller.current?.reload()}>
              <Icon name="reload" size={14} />
              {t('Reload')}
            </button>
          ) : null}
          <button className="btn secondary small" onClick={() => onOpenLink(ARCADE_URL)}>
            <Icon name="external" size={14} />
            {t('Open in this browser')}
          </button>
          <button className="btn ghost" onClick={onBack}>
            <Icon name="back" size={15} />
            {t('Back to services')}
          </button>
        </div>
      </header>
      )}

      <div className="arcade-frame">
        {isElectron ? (
          <>
            {status.loading && !status.error ? (
              <div className="loading-bar" aria-hidden="true" />
            ) : null}
            {status.error ? (
              <div className="webview-fallback">
                <Icon name="warning" size={28} />
                <h2>{t('The arcade did not load.')}</h2>
                <p>{t('Check the connection, then try again.')}</p>
                <button
                  className="btn primary"
                  onClick={() => {
                    setStatus(current => ({ ...current, loading: true, error: null }));
                    setReloadKey(key => key + 1);
                  }}
                >
                  <Icon name="reload" size={14} />
                  {t('Reload')}
                </button>
              </div>
            ) : (
              <Webview
                key={`arcade-${reloadKey}`}
                src={ARCADE_URL}
                partition={partitionFor(ARCADE_PARTITION_SERVICE_ID)}
                controller={controller}
                allowPopups
                onStatus={setStatus}
              />
            )}
          </>
        ) : (
          <div className="webview-fallback">
            <Icon name="monitor" size={30} />
            <h2>Arcade</h2>
            <p>
              {t(
                'The arcade runs in the desktop app, which embeds it with its own saved session. The web build opens it in a browser tab instead.',
              )}
            </p>
            <a className="btn primary" href={ARCADE_URL} target="_blank" rel="noreferrer">
              {t('Open in this browser')}
            </a>
          </div>
        )}
      </div>

      <p className="arcade-bar mono">
        <span>{ARCADE_URL}</span>
        <span>{partitionFor(ARCADE_PARTITION_SERVICE_ID)}</span>
        {status.error ? <span className="arcade-bar-error">{status.error}</span> : null}
      </p>
    </section>
  );
}
