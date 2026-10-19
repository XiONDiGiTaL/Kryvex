import type { AppInfo, PersistedState, Service } from '../types';
import { getTheme } from '../lib/themes';
import { CATEGORIES } from '../lib/services';
import { hostOf } from '../lib/url';
import { Icon, KxMark, ServiceGlyph } from '../components/ui';

function categoryLabel(id: Service['category']): string {
  return CATEGORIES.find(item => item.id === id)?.label ?? 'Other';
}

function relativeTime(timestamp: number | undefined): string {
  if (!timestamp) return 'never';
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function Home({
  state,
  themeId,
  info,
  isElectron,
  onOpenService,
  onAdd,
  onNavigate,
}: {
  state: PersistedState;
  themeId: string;
  info: AppInfo | null;
  isElectron: boolean;
  onOpenService: (service: Service) => void;
  onAdd: () => void;
  onNavigate: (view: 'home' | 'services' | 'browser' | 'settings') => void;
}) {
  const theme = getTheme(themeId);
  const pinned = state.services.filter(service => service.pinned);
  const quick = (pinned.length > 0 ? pinned : state.services).slice(0, 6);
  const recent = state.recent
    .map(id => state.services.find(service => service.id === id))
    .filter((service): service is Service => Boolean(service))
    .slice(0, 5);

  return (
    <section className="view home-view">
      <header className="view-head">
        <div>
          <p className="eyebrow mono">WORKSPACE 01 / ELEMENT 027</p>
          <h1>Everything connected, nothing scattered.</h1>
          <p className="lede">
            {state.services.length} modules ready. Each one keeps its own session, cookies and
            sign-in, so switching context never means signing in again.
          </p>
        </div>
        <button className="btn primary" onClick={onAdd}>
          <Icon name="plus" size={16} />
          Add service
        </button>
      </header>

      <div className="hero-grid">
        <div className="hero-card">
          <div className="hero-copy">
            <span className="chip mono">ELEMENT 027 — MODULAR TECHNOLOGY</span>
            <h2>Precision in Every Connection.</h2>
            <p>
              Kryvex treats every web app as a module: a URL, a purpose, an isolated session, and a
              place in your workspace. Compose the surface you need instead of a haystack of tabs.
            </p>
            <div className="hero-stats">
              <div>
                <strong>{state.services.length.toString().padStart(2, '0')}</strong>
                <span>modules</span>
              </div>
              <div>
                <strong>{(pinned.length + 0).toString().padStart(2, '0')}</strong>
                <span>pinned</span>
              </div>
              <div>
                <strong>{state.bookmarks.length.toString().padStart(2, '0')}</strong>
                <span>bookmarks</span>
              </div>
            </div>
          </div>
          <img className="hero-tile" src="logo.svg" width={176} height={176} alt="Kryvex element tile" />
        </div>

        <aside className="panel runtime-panel">
          <h3>Session health</h3>
          <ul className="health-list">
            <li>
              <Icon name="shield" size={15} />
              <span>Webview sandbox</span>
              <b className="mono ok">ON</b>
            </li>
            <li>
              <Icon name="layers" size={15} />
              <span>Isolated sessions</span>
              <b className="mono">{state.services.length.toString().padStart(2, '0')}</b>
            </li>
            <li>
              <Icon name="monitor" size={15} />
              <span>Runtime</span>
              <b className="mono">{isElectron ? `E${info?.electron.split('.')[0] ?? ''}` : 'WEB'}</b>
            </li>
            <li>
              <Icon name="sliders" size={15} />
              <span>Theme engine</span>
              <b className="mono">{theme.name.toUpperCase()}</b>
            </li>
          </ul>
          <p className="panel-note">
            State is stored locally. Kryvex has no account, telemetry or cloud sync.
          </p>
        </aside>
      </div>

      <section className="home-section">
        <div className="section-head">
          <h2>Quick launch</h2>
          <button className="link" onClick={() => onNavigate('services')}>
            All services <Icon name="chevron" size={13} />
          </button>
        </div>

        {quick.length === 0 ? (
          <div className="panel inline-empty">
            <KxMark size={30} variant="tile" />
            <div>
              <strong>No modules yet.</strong>
              <p>Add the first service and it will show up here.</p>
            </div>
            <button className="btn secondary" onClick={onAdd}>
              Add service
            </button>
          </div>
        ) : (
          <div className="quick-grid">
            {quick.map(service => (
              <button key={service.id} className="quick-card" onClick={() => onOpenService(service)}>
                <ServiceGlyph letter={service.letter} color={service.color} size={36} />
                <span className="quick-meta">
                  <strong>{service.name}</strong>
                  <span className="mono">{hostOf(service.url)}</span>
                </span>
                <Icon name="forward" size={15} className="quick-arrow" />
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="home-columns">
        <section className="panel">
          <div className="section-head">
            <h2>Recent activity</h2>
            <span className="mono muted-label">{recent.length}/5</span>
          </div>
          {recent.length === 0 ? (
            <p className="panel-note">
              Nothing opened yet. Launch a module and it will appear here.
            </p>
          ) : (
            <ul className="recent-list">
              {recent.map(service => (
                <li key={service.id}>
                  <button onClick={() => onOpenService(service)}>
                    <ServiceGlyph letter={service.letter} color={service.color} size={26} />
                    <span className="recent-text">
                      <strong>{service.name}</strong>
                      <span className="mono">{categoryLabel(service.category)}</span>
                    </span>
                    <span className="mono recent-time">{relativeTime(service.lastOpened)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="section-head">
            <h2>Startup</h2>
            <span className="mono muted-label">LOCAL</span>
          </div>
          <dl className="settings-summary">
            <div>
              <dt>Start view</dt>
              <dd>{state.settings.startView}</dd>
            </div>
            <div>
              <dt>Theme</dt>
              <dd>{theme.name}</dd>
            </div>
            <div>
              <dt>Density</dt>
              <dd>{state.settings.density}</dd>
            </div>
            <div>
              <dt>Search</dt>
              <dd>{state.settings.searchEngine}</dd>
            </div>
          </dl>
          <button className="link" onClick={() => onNavigate('settings')}>
            Adjust in settings <Icon name="chevron" size={13} />
          </button>
        </section>
      </div>
    </section>
  );
}
