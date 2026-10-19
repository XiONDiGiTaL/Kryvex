import type { AppInfo, PersistedState, Service, ViewId } from '../types';
import { getTheme } from '../lib/themes';
import { Icon, ServiceIcon, ThemeMark, type ThemeMarkKind } from './ui';

const NAV: Array<{ id: ViewId; label: string; icon: 'home' | 'layers' | 'globe' | 'sliders' }> = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'services', label: 'Services', icon: 'layers' },
  { id: 'browser', label: 'Browser', icon: 'globe' },
  { id: 'settings', label: 'Settings', icon: 'sliders' },
];

export function Header({
  title,
  view,
  onPalette,
  onAdd,
  onSettings,
  onHelp,
  isElectron,
  mark = 'kx',
}: {
  title: string;
  view: ViewId;
  onPalette: () => void;
  onAdd: () => void;
  onSettings: () => void;
  onHelp: () => void;
  isElectron: boolean;
  mark?: ThemeMarkKind;
}) {
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

      <button className="command-trigger" onClick={onPalette} aria-label="Open command palette">
        <Icon name="search" size={15} />
        <span>Search services, views, actions</span>
        <kbd>Ctrl K</kbd>
      </button>

      <div className="header-right">
        <div className="header-tools" aria-label="Quick access">
          <button className="header-tool" onClick={onAdd} title="Add a service">
            <Icon name="plus" size={14} />
            <span>Add</span>
          </button>
          <button
            className={`header-tool ${view === 'settings' ? 'is-active' : ''}`}
            onClick={onSettings}
            title="Open settings (Ctrl 4)"
            aria-current={view === 'settings' ? 'page' : undefined}
          >
            <Icon name="sliders" size={14} />
            <span>Settings</span>
          </button>
          <button className="header-tool" onClick={onHelp} title="Open quick help">
            <Icon name="help" size={14} />
            <span>Help</span>
          </button>
        </div>
        <span className="element-chip" title="Fictional element x529 · Kx">
          x529 <span className="element-symbol">Kx</span>
        </span>
        <span className={`shell-badge ${isElectron ? 'is-live' : ''}`}>
          <span className="status-dot" />
          {isElectron ? 'Desktop' : 'Preview'}
        </span>
        {isElectron ? <div className="window-controls-space" aria-hidden="true" /> : null}
      </div>
    </header>
  );
}

export function Sidebar({
  state,
  routeView,
  collapsed,
  onToggle,
  onNavigate,
  onOpenService,
  onAdd,
}: {
  state: PersistedState;
  routeView: ViewId;
  collapsed: boolean;
  onToggle: () => void;
  onNavigate: (view: ViewId) => void;
  onOpenService: (service: Service) => void;
  onAdd: () => void;
}) {
  const pinned = state.services.filter(service => service.pinned);

  return (
    <aside className={`app-sidebar ${collapsed ? 'is-collapsed' : ''}`} aria-label="Primary">
      <nav className="nav-block">
        {NAV.map(item => (
          <button
            key={item.id}
            className={`nav-item ${routeView === item.id ? 'is-active' : ''}`}
            onClick={() => onNavigate(item.id)}
            aria-current={routeView === item.id ? 'page' : undefined}
            title={collapsed ? item.label : undefined}
          >
            <span className="nav-icon">
              <Icon name={item.icon} size={17} />
            </span>
            <span className="nav-label">{item.label}</span>
            {item.id === 'services' ? <span className="nav-count">{state.services.length}</span> : null}
            {routeView === item.id ? <span className="nav-active-bar" aria-hidden="true" /> : null}
          </button>
        ))}
      </nav>

      <div className="sidebar-section">
        <div className="sidebar-heading">
          <span>PINNED</span>
          <span className="sidebar-mono">{pinned.length.toString().padStart(2, '0')}</span>
        </div>
        {pinned.length === 0 ? (
          <p className="sidebar-empty">Pin a service to keep it one click away.</p>
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
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sidebar-foot">
        <button className="add-service-btn" onClick={onAdd} title="Add a service">
          <Icon name="plus" size={16} />
          <span className="nav-label">Add service</span>
        </button>
        <button
          className="collapse-btn"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
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
  const theme = getTheme(themeId);
  const pinned = state.services.filter(service => service.pinned).length;

  return (
    <footer className="status-bar">
      <span className="status-group mono">
        <span className="status-dot is-live" />
        {isElectron ? 'LOCAL SHELL' : 'WEB PREVIEW'}
      </span>
      <span className="status-sep" aria-hidden="true">
        ·
      </span>
      <span className="mono status-brand">
        <ThemeMark mark={mark} size={12} />
        {mark === 'donkey' ? 'DONKEY EDITION' : 'ELEMENT x529 / Kx'}
      </span>
      <span className="status-grow" />
      <span className="mono">{state.services.length} SERVICES</span>
      <span className="status-sep" aria-hidden="true">
        ·
      </span>
      <span className="mono">{pinned} PINNED</span>
      <span className="status-sep" aria-hidden="true">
        ·
      </span>
      <span className="mono status-theme">{theme.name}</span>
      <span className="status-sep" aria-hidden="true">
        ·
      </span>
      <span className="mono">v{appInfo?.version ?? '0.3.0'}</span>
    </footer>
  );
}
