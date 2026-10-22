import type { AppInfo, PersistedState, ResourceSnapshot, Service, ViewId } from '../types';
import { getTheme } from '../lib/themes';
import { useT } from '../lib/i18n';
import { Icon, ServiceIcon, ThemeMark, type ThemeMarkKind } from './ui';
import { SidebarResources } from './ResourceMonitor';

const NAV: Array<{
  id: ViewId;
  label: string;
  icon: 'home' | 'layers' | 'globe' | 'spark' | 'users' | 'sliders';
}> = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'services', label: 'Services', icon: 'layers' },
  { id: 'browser', label: 'Browser', icon: 'globe' },
  { id: 'assistant', label: 'Vexium', icon: 'spark' },
  { id: 'rooms', label: 'Rooms', icon: 'users' },
  { id: 'settings', label: 'Settings', icon: 'sliders' },
];

export function Header({
  title,
  view,
  onPalette,
  onAdd,
  onSettings,
  onHelp,
  onUpdate,
  onResources,
  resourcesOpen = false,
  update = null,
  isElectron,
  mark = 'kx',
}: {
  title: string;
  view: ViewId;
  onPalette: () => void;
  onAdd: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onUpdate?: () => void;
  onResources?: () => void;
  resourcesOpen?: boolean;
  update?: { available: boolean; ready: boolean; version?: string } | null;
  isElectron: boolean;
  mark?: ThemeMarkKind;
}) {
  const t = useT();
  return (
    <header className="app-header">
      <div className="header-left">
        <span className="brand-chip" aria-hidden="true">
          <ThemeMark mark={mark} size={19} />
        </span>
        <div className="header-title">
          <span className="product-name">KRYVEX</span>
          <span className="header-slash" aria-hidden="true">
            /
          </span>
          <span className="view-name">{title}</span>
        </div>
      </div>

      <button
        className="command-trigger"
        onClick={onPalette}
        aria-label={t('Open command palette')}
      >
        <Icon name="search" size={15} />
        <span>{t('Search services, views, actions')}</span>
        <kbd>Ctrl K</kbd>
      </button>

      <div className="header-right">
        <div className="header-tools" aria-label={t('Quick access')}>
          {update?.available && onUpdate ? (
            <button
              className={`header-tool is-update ${update.ready ? 'is-ready' : ''}`}
              onClick={onUpdate}
              title={
                update.version
                  ? t('Update {version} is ready', { version: update.version })
                  : t('Update available')
              }
            >
              <Icon name="download" size={14} />
              <span>{update.ready ? t('Update ready') : t('Update')}</span>
              <span className="update-dot" aria-hidden="true" />
            </button>
          ) : null}
          {onResources ? (
            <button
              className={`header-tool ${resourcesOpen ? 'is-active' : ''}`}
              onClick={onResources}
              title={t('Open the resource manager')}
              aria-pressed={resourcesOpen}
            >
              <Icon name="monitor" size={14} />
              <span>{t('Activity')}</span>
            </button>
          ) : null}
          <button className="header-tool" onClick={onAdd} title={t('Add a service')}>
            <Icon name="plus" size={14} />
            <span>{t('Add')}</span>
          </button>
          <button
            className={`header-tool ${view === 'settings' ? 'is-active' : ''}`}
            onClick={onSettings}
            title={t('Open settings (Ctrl 5)')}
            aria-current={view === 'settings' ? 'page' : undefined}
          >
            <Icon name="sliders" size={14} />
            <span>{t('Settings')}</span>
          </button>
          <button className="header-tool" onClick={onHelp} title={t('Open quick help')}>
            <Icon name="help" size={14} />
            <span>{t('Help')}</span>
          </button>
        </div>
        <span className="element-chip" title={t('Fictional element x529 · Kx')}>
          x529 <span className="element-symbol">Kx</span>
        </span>
        <span className={`shell-badge ${isElectron ? 'is-live' : ''}`}>
          <span className="status-dot" />
          {isElectron ? t('Desktop') : t('Preview')}
        </span>
        {isElectron ? <div className="window-controls-space" aria-hidden="true" /> : null}
      </div>
    </header>
  );
}

export function Sidebar({
  state,
  routeView,
  unread = {},
  collapsed,
  onToggle,
  onNavigate,
  onOpenService,
  onAdd,
  resources = null,
  showResources = false,
}: {
  state: PersistedState;
  routeView: ViewId;
  unread?: Record<string, number>;
  collapsed: boolean;
  onToggle: () => void;
  onNavigate: (view: ViewId) => void;
  onOpenService: (service: Service) => void;
  onAdd: () => void;
  resources?: ResourceSnapshot | null;
  showResources?: boolean;
}) {
  const t = useT();
  const pinned = state.services.filter(service => service.pinned);

  return (
    <aside className={`app-sidebar ${collapsed ? 'is-collapsed' : ''}`} aria-label={t('Primary')}>
      <nav className="nav-block">
        {NAV.map(item => (
          <button
            key={item.id}
            className={`nav-item ${routeView === item.id ? 'is-active' : ''}`}
            onClick={() => onNavigate(item.id)}
            aria-current={routeView === item.id ? 'page' : undefined}
            title={collapsed ? t(item.label) : undefined}
          >
            <span className="nav-icon">
              <Icon name={item.icon} size={17} />
            </span>
            <span className="nav-label">{t(item.label)}</span>
            {item.id === 'services' ? <span className="nav-count">{state.services.length}</span> : null}
            {routeView === item.id ? <span className="nav-active-bar" aria-hidden="true" /> : null}
          </button>
        ))}
      </nav>

      <div className="sidebar-section">
        <div className="sidebar-heading">
          <span>{t('PINNED')}</span>
          <span className="sidebar-mono">{pinned.length.toString().padStart(2, '0')}</span>
        </div>
        {pinned.length === 0 ? (
          <p className="sidebar-empty">{t('Pin a service to keep it one click away.')}</p>
        ) : (
          <ul className="pinned-list">
            {pinned.map(service => (
              <li key={service.id}>
                <button
                  className="pinned-item"
                  onClick={() => onOpenService(service)}
                  title={service.name}
                >
                  <ServiceIcon service={service} size={22} />
                  <span className="pinned-name">{service.name}</span>
                  {unread[service.id] ? (
                    <span className="pinned-unread mono" aria-label={`${unread[service.id]} unread`}>
                      {(unread[service.id] ?? 0) > 99 ? '99+' : unread[service.id]}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showResources && resources ? (
        <SidebarResources snapshot={resources} services={state.services} />
      ) : null}

      <div className="sidebar-foot">
        <button className="add-service-btn" onClick={onAdd} title={t('Add a service')}>
          <Icon name="plus" size={16} />
          <span className="nav-label">{t('Add service')}</span>
        </button>
        <button
          className="collapse-btn"
          onClick={onToggle}
          aria-label={collapsed ? t('Expand sidebar') : t('Collapse sidebar')}
          title={collapsed ? t('Expand sidebar') : t('Collapse sidebar')}
        >
          <Icon name="chevron" size={16} className={collapsed ? '' : 'flip'} />
        </button>
      </div>
    </aside>
  );
}

export function StatusBar({
  state,
  themeId,
  appInfo,
  isElectron,
  mark = 'kx',
}: {
  state: PersistedState;
  themeId: string;
  appInfo: AppInfo | null;
  isElectron: boolean;
  mark?: ThemeMarkKind;
}) {
  const t = useT();
  const theme = getTheme(themeId);
  const themeName = t(theme.name);
  const pinned = state.services.filter(service => service.pinned).length;

  return (
    <footer className="status-bar">
      <span className="status-group mono">
        <span className="status-dot is-live" />
        {isElectron ? t('LOCAL SHELL') : t('WEB PREVIEW')}
      </span>
      <span className="status-sep" aria-hidden="true">
        ·
      </span>
      <span className="mono status-brand">
        <ThemeMark mark={mark} size={12} />
        {mark === 'donkey'
          ? t('DONKEY EDITION')
          : mark === 'xion'
            ? t('XIØN EDITION / FULL POWER')
            : t('ELEMENT x529 / Kx')}
      </span>
      <span className="status-grow" />
      <span className="mono">{t('{count} SERVICES', { count: state.services.length })}</span>
      <span className="status-sep" aria-hidden="true">
        ·
      </span>
      <span className="mono">{t('{count} PINNED', { count: pinned })}</span>
      <span className="status-sep" aria-hidden="true">
        ·
      </span>
      <span className="mono status-theme">{themeName}</span>
      <span className="status-sep" aria-hidden="true">
        ·
      </span>
      <span className="mono">v{appInfo?.version ?? '0.7.0'}</span>
    </footer>
  );
}
