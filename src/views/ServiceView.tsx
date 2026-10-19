import { useRef, useState } from 'react';
import type { Service } from '../types';
import { CATEGORIES, partitionFor } from '../lib/services';
import { hostOf } from '../lib/url';
import { Icon, ServiceIcon, ThemeMark, type ThemeMarkKind } from '../components/ui';
import { Webview, type WebviewElement, type WebviewStatus } from '../components/Webview';

export function ServiceView({
  service,
  isElectron,
  onBack,
  onEdit,
  onDelete,
  onToast,
  mark = 'kx',
}: {
  service: Service;
  isElectron: boolean;
  mark?: ThemeMarkKind;
  onBack: () => void;
  onEdit: (service: Service) => void;
  onDelete: (service: Service) => void;
  onToast: (message: string, tone?: 'info' | 'success' | 'warning' | 'danger') => void;
}) {
  const controller = useRef<WebviewElement | null>(null);
  const [status, setStatus] = useState<WebviewStatus>({
    loading: true,
    canGoBack: false,
    canGoForward: false,
    error: null,
  });
  const [reloadKey, setReloadKey] = useState(0);

  const category = CATEGORIES.find(item => item.id === service.category)?.label ?? 'Other';

  return (
    <section className="view service-view">
      <header className="service-toolbar">
        <button className="icon-btn" onClick={onBack} aria-label="Back to services" title="Back">
          <Icon name="back" size={16} />
        </button>

        <ServiceIcon service={service} size={30} />

        <div className="service-id">
          <div className="service-title-line">
            <h1>{service.name}</h1>
            <span className="tag mono">{category}</span>
            {service.pinned ? <span className="tag mono accent">PINNED</span> : null}
          </div>
          <span className="mono service-url">{hostOf(service.url)}</span>
        </div>

        <div className="service-actions">
          <button
            className="icon-btn"
            onClick={() => controller.current?.reload()}
            title="Reload"
            aria-label="Reload service"
          >
            <Icon name="reload" size={16} />
          </button>
          <button
            className="btn secondary small"
            onClick={() => {
              void window.kryvex?.openExternal(service.url);
              onToast('Opened in your default browser.', 'info');
            }}
          >
            <Icon name="external" size={14} />
            Open externally
          </button>
          <button className="icon-btn" onClick={() => onEdit(service)} title="Edit" aria-label="Edit service">
            <Icon name="edit" size={16} />
          </button>
          <button
            className="icon-btn danger"
            onClick={() => onDelete(service)}
            title="Remove"
            aria-label="Remove service"
          >
            <Icon name="trash" size={16} />
          </button>
        </div>
      </header>

      <div className="service-canvas">
        {status.loading && !status.error ? <div className="loading-bar" aria-hidden="true" /> : null}

        {!isElectron ? (
          <div className="webview-fallback">
            <ThemeMark mark={mark} size={128} variant="tile" />
            <h2>{service.name}</h2>
            <p>
              Service webviews render inside the Electron shell, where Kryvex can give this module
              its own persistent session. This browser preview only shows the app surface.
            </p>
            <div className="fallback-meta mono">
              <span>PARTITION {partitionFor(service.id)}</span>
              <span>{service.url}</span>
            </div>
            <a className="btn secondary" href={service.url} target="_blank" rel="noreferrer">
              Open in this browser
            </a>
          </div>
        ) : (
          <Webview
            key={`${service.id}-${reloadKey}`}
            src={service.url}
            partition={partitionFor(service.id)}
            controller={controller}
            onStatus={setStatus}
            onNavigate={url => {
              if (url !== service.url) {
                onToast(`Navigated to ${hostOf(url)}`, 'info');
              }
            }}
          />
        )}

        {status.error ? (
          <div className="webview-error" role="alert">
            <Icon name="shield" size={22} />
            <h3>This module could not load</h3>
            <p>{status.error}</p>
            <div className="error-actions">
              <button
                className="btn primary"
                onClick={() => {
                  setStatus({ ...status, error: null, loading: true });
                  setReloadKey(value => value + 1);
                }}
              >
                Try again
              </button>
              <button
                className="btn secondary"
                onClick={() => {
                  void window.kryvex?.openExternal(service.url);
                }}
              >
                Open externally
              </button>
            </div>
            <p className="mono error-note">
              Some sites refuse embedding with frame or cookie policies. Kryvex never disables
              security to force them in.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
