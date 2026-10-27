import type { AppInfo, HomeSectionId, HomeSettings, PersistedState, Service } from '../types';
import { HomeBoard } from '../components/HomeBoard';
import {
  HOME_SECTION_WIDTHS,
  normalizeSectionOrder,
  rowWith,
} from '../lib/home-sections';
import { getTheme } from '../lib/themes';
import { CATEGORIES } from '../lib/services';
import { useT } from '../lib/i18n';
import { hostOf } from '../lib/url';
import { Fragment } from 'react';
import { Icon, ServiceIcon, ThemeMark, type ThemeMarkKind } from '../components/ui';
import { logoUrl } from '../assets';

function categoryLabel(id: Service['category']): string {
  return CATEGORIES.find(item => item.id === id)?.label ?? 'Other';
}

function relativeTime(timestamp: number | undefined, t: (key: string, vars?: Record<string, string | number>) => string): string {
  if (!timestamp) return t('never');
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return t('just now');
  if (minutes < 60) return t('{minutes}m ago', { minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('{hours}h ago', { hours });
  return t('{days}d ago', { days: Math.round(hours / 24) });
}

export function Home({
  state,
  themeId,
  info,
  isElectron,
  mark = 'kx',
  capturePulse = 0,
  onOpenService,
  onAdd,
  onNavigate,
  onUpdateHome,
}: {
  state: PersistedState;
  themeId: string;
  info: AppInfo | null;
  isElectron: boolean;
  mark?: ThemeMarkKind;
  /** Bumped by the header's capture button; the capture widget answers it. */
  capturePulse?: number;
  onOpenService: (service: Service) => void;
  onAdd: () => void;
  onNavigate: (view: 'home' | 'services' | 'browser' | 'settings') => void;
  onUpdateHome: (patch: Partial<HomeSettings>) => void;
}) {
  const t = useT();
  const theme = getTheme(themeId);
  const themeName = t(theme.name);
  const pinned = state.services.filter(service => service.pinned);
  const quick = (pinned.length > 0 ? pinned : state.services).slice(0, 6);
  const recent = state.recent
    .map(id => state.services.find(service => service.id === id))
    .filter((service): service is Service => Boolean(service))
    .slice(0, 5);

  /**
   * The blocks below the hero, in the order the reader put them in.
   *
   * Two blocks that share a row keep sharing it wherever they land, and one that
   * ends up alone takes the whole width, so moving a section never leaves a hole
   * in the page.
   */
  const order = normalizeSectionOrder(state.settings.home.sectionOrder);
  const rows: HomeSectionId[][] = [];
  for (let index = 0; index < order.length; ) {
    const row = rowWith(order, index);
    if (row.length === 0) break;
    rows.push([...row]);
    index += row.length;
  }

  /**
   * One Home block, drawn wherever the reader put it.
   *
   * The four blocks were a fixed page until the order became a setting. Pulling
   * them into one function is what makes the order meaningful: the markup is
   * written once and placed by the list, so a moved block cannot drift from the
   * one it used to be.
   */
  function sectionOf(id: HomeSectionId) {
    // The four ways into the app.
    if (id === 'actions') {
      return (
        <section className="home-section" aria-labelledby="common-actions-title">
          <div className="section-head">
            <h2 id="common-actions-title">{t('Common actions')}</h2>
            <span className="mono muted-label">{t('EVERY ACTION IS A BUTTON')}</span>
          </div>
          <div className="home-actions">
            <button className="home-action" onClick={onAdd}>
              <span className="home-action-icon">
                <Icon name="plus" size={18} />
              </span>
              <span className="home-action-copy">
                <strong>{t('Add a service')}</strong>
                <span>{t('Turn any web app into a module.')}</span>
              </span>
              <Icon name="chevron" size={14} className="home-action-arrow" />
            </button>
            <button className="home-action" onClick={() => onNavigate('services')}>
              <span className="home-action-icon">
                <Icon name="layers" size={18} />
              </span>
              <span className="home-action-copy">
                <strong>{t('Browse services')}</strong>
                <span>{t('Open, search, pin or edit modules.')}</span>
              </span>
              <Icon name="chevron" size={14} className="home-action-arrow" />
            </button>
            <button className="home-action" onClick={() => onNavigate('browser')}>
              <span className="home-action-icon">
                <Icon name="globe" size={18} />
              </span>
              <span className="home-action-copy">
                <strong>{t('Open the browser')}</strong>
                <span>{t('A separate tabbed browsing space.')}</span>
              </span>
              <Icon name="chevron" size={14} className="home-action-arrow" />
            </button>
            <button className="home-action" onClick={() => onNavigate('settings')}>
              <span className="home-action-icon">
                <Icon name="sliders" size={18} />
              </span>
              <span className="home-action-copy">
                <strong>{t('Open settings')}</strong>
                <span>{t('Themes, shield, extensions and startup.')}</span>
              </span>
              <Icon name="chevron" size={14} className="home-action-arrow" />
            </button>
          </div>
        </section>
      );
    }
    // The pinned modules, or every module until one is pinned.
    if (id === 'launch') {
      return (
        <section className="home-section">
          <div className="section-head">
            <h2>{t('Quick launch')}</h2>
            <button className="link" onClick={() => onNavigate('services')}>
              {t('All services')} <Icon name="chevron" size={13} />
            </button>
          </div>

          {quick.length === 0 ? (
            <div className="panel inline-empty">
              <ThemeMark mark={mark} size={30} variant="tile" />
              <div>
                <strong>{t('No modules yet.')}</strong>
                <p>{t('Add the first service and it will show up here.')}</p>
              </div>
              <button className="btn secondary" onClick={onAdd}>
                {t('Add service')}
              </button>
            </div>
          ) : (
            <div className="quick-grid">
              {quick.map(service => (
                <button key={service.id} className="quick-card" onClick={() => onOpenService(service)}>
                  <ServiceIcon service={service} size={36} />
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
      );
    }
    // What was opened last, newest first.
    if (id === 'recent') {
      return (
        <section className="panel">
          <div className="section-head">
            <h2>{t('Recent activity')}</h2>
            <span className="mono muted-label">{recent.length}/5</span>
          </div>
          {recent.length === 0 ? (
            <p className="panel-note">
              {t('Nothing opened yet. Launch a module and it will appear here.')}
            </p>
          ) : (
            <ul className="recent-list">
              {recent.map(service => (
                <li key={service.id}>
                  <button onClick={() => onOpenService(service)}>
                    <ServiceIcon service={service} size={26} />
                    <span className="recent-text">
                      <strong>{service.name}</strong>
                      <span className="mono">{t(categoryLabel(service.category))}</span>
                    </span>
                    <span className="mono recent-time">{relativeTime(service.lastOpened, t)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      );
    }
    // What Kryvex will come back as.
    if (id === 'startup') {
      return (
        <section className="panel">
          <div className="section-head">
            <h2>{t('Startup')}</h2>
            <span className="mono muted-label">{t('LOCAL')}</span>
          </div>
          <dl className="settings-summary">
            <div>
              <dt>{t('Start view')}</dt>
              <dd>{t(state.settings.startView === 'home' ? 'Home' : state.settings.startView === 'services' ? 'Services' : state.settings.startView === 'browser' ? 'Browser' : 'Settings')}</dd>
            </div>
            <div>
              <dt>{t('Theme')}</dt>
              <dd>{themeName}</dd>
            </div>
            <div>
              <dt>{t('Density')}</dt>
              <dd>{t(state.settings.density === 'comfortable' ? 'Comfortable' : 'Compact')}</dd>
            </div>
            <div>
              <dt>{t('Search')}</dt>
              <dd>{state.settings.searchEngine}</dd>
            </div>
          </dl>
          <button className="link" onClick={() => onNavigate('settings')}>
            {t('Adjust in settings')} <Icon name="chevron" size={13} />
          </button>
        </section>
      );
    }
    return null;
  }
  return (
    <section className="view home-view">
      <header className="view-head">
        <div>
          <p className="eyebrow mono">{t('Home')}</p>
          <h1>{t('Everything connected, nothing scattered.')}</h1>
          <p className="lede">
            {t(
              '{count} modules ready. Each one keeps its own session, cookies and sign-in, so switching context never means signing in again.',
              { count: state.services.length },
            )}
          </p>
        </div>
        <button className="btn primary" onClick={onAdd}>
          <Icon name="plus" size={16} />
          {t('Add service')}
        </button>
      </header>

      {state.settings.home.showBoard ? (
        <HomeBoard
          home={state.settings.home}
          capturePulse={capturePulse}
          onUpdate={onUpdateHome}
          onOpenSettings={() => onNavigate('settings')}
        />
      ) : null}

      <div className="hero-grid">
        <div className="hero-card">
          <div className="hero-copy">
            <span className="chip mono">{t('ELEMENT x529: MODULAR TECHNOLOGY')}</span>
            <h2>{t('Precision in Every Connection.')}</h2>
            <p>
              {t(
                'Kryvex treats every web app as a module: a URL, a purpose, an isolated session, and a place in your workspace. Compose the surface you need instead of a haystack of tabs.',
              )}
            </p>
            <div className="hero-stats">
              <div>
                <strong>{state.services.length.toString().padStart(2, '0')}</strong>
                <span>{t('modules')}</span>
              </div>
              <div>
                <strong>{(pinned.length + 0).toString().padStart(2, '0')}</strong>
                <span>{t('pinned')}</span>
              </div>
              <div>
                <strong>{state.bookmarks.length.toString().padStart(2, '0')}</strong>
                <span>{t('bookmarks')}</span>
              </div>
            </div>
          </div>
          {mark === 'kx' ? (
            <img
              className="hero-tile"
              src={logoUrl}
              width={176}
              height={176}
              alt={t('Kryvex element tile')}
            />
          ) : (
            <span className="hero-tile themed-hero">
              <ThemeMark mark={mark} size={176} variant="tile" />
            </span>
          )}
        </div>

        <aside className="panel runtime-panel">
          <h3>{t('Session health')}</h3>
          <ul className="health-list">
            <li>
              <Icon name="shield" size={15} />
              <span>{t('Webview sandbox')}</span>
              <b className="mono ok">{t('ON')}</b>
            </li>
            <li>
              <Icon name="layers" size={15} />
              <span>{t('Isolated sessions')}</span>
              <b className="mono">{state.services.length.toString().padStart(2, '0')}</b>
            </li>
            <li>
              <Icon name="monitor" size={15} />
              <span>{t('Runtime')}</span>
              <b className="mono">{isElectron ? `E${info?.electron.split('.')[0] ?? ''}` : 'WEB'}</b>
            </li>
            <li>
              <Icon name="sliders" size={15} />
              <span>{t('Theme engine')}</span>
              <b className="mono">{themeName.toUpperCase()}</b>
            </li>
          </ul>
          <p className="panel-note">
            {t('State is stored locally. Kryvex has no account, telemetry or cloud sync.')}
          </p>
        </aside>
      </div>

      {rows.map(row => {
        if (row.length === 2) {
          return (
            <div className="home-columns" key={row.join('-')}>
              {row.map(id => (
                <Fragment key={id}>{sectionOf(id)}</Fragment>
              ))}
            </div>
          );
        }
        const id = row[0]!;
        // A block that shares a row keeps its column; one that ends up alone
        // takes the whole width instead of leaving an empty half beside it.
        return HOME_SECTION_WIDTHS[id] === 'half' ? (
          <div className="home-columns is-single" key={id}>
            {sectionOf(id)}
          </div>
        ) : (
          <Fragment key={id}>{sectionOf(id)}</Fragment>
        );
      })}    </section>
  );
}
