import type { AppInfo, PersistedState, Service, ViewId } from '../types';
import { getTheme } from '../lib/themes';
import { Icon, KxMark, ServiceGlyph } from './ui';

const NAV: Array<{ id: ViewId; label: string; icon: 'home' | 'layers' | 'globe' | 'sliders' }> = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'services', label: 'Services', icon: 'layers' },
  { id: 'browser', label: 'Browser', icon: 'globe' },
  { id: 'settings', label: 'Settings', icon: 'sliders' },
];

export function Header({
  title,
  onPalette,
  isElectron,
}: {
  title: string;
  onPalette: () => void;
  isElectron: boolean;
}) {
  return (
    <header className="app-header">
      <div className="header-left">
        <span className="brand-chip" aria-hidden="true">
          <KxMark size={19} />
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
        <span className="element-chip" title="Fictional element 027 · Kx">
          027 <span className="element-symbol">Kx</span>
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
                  <ServiceGlyph letter={service.letter} color={service.color} size={22} />
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
}: {
  state: PersistedState;
  themeId: string;
  appInfo: AppInfo | null;
  isElectron: boolean;
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
      <span className="mono">ELEMENT 027 / Kx</span>
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
      <span className="mono">v{appInfo?.version ?? '0.1.0'}</span>
    </footer>
  );
}
