import type { AppInfo, PersistedState, Settings as SettingsModel, ViewId } from '../types';
import { THEMES } from '../lib/themes';
import { Icon, KxMark } from '../components/ui';
import { logoUrl } from '../assets';

export function Settings({
  state,
  info,
  isElectron,
  onUpdate,
  onReset,
  onToast,
}: {
  state: PersistedState;
  info: AppInfo | null;
  isElectron: boolean;
  onUpdate: (patch: Partial<SettingsModel>) => void;
  onReset: () => void;
  onToast: (message: string, tone?: 'info' | 'success' | 'warning' | 'danger') => void;
}) {
  const settings = state.settings;

  return (
    <section className="view settings-view">
      <header className="view-head">
        <div>
          <p className="eyebrow mono">CONFIGURATION / LOCAL ONLY</p>
          <h1>Settings</h1>
          <p className="lede">
            Appearance, startup behavior and browser defaults. Everything is stored on this
            machine; there is no account and no sync.
          </p>
        </div>
      </header>

      <section className="settings-block">
        <div className="section-head">
          <h2>Appearance</h2>
          <span className="mono muted-label">{THEMES.length} THEMES</span>
        </div>
        <div className="theme-grid">
          {THEMES.map(theme => (
            <button
              key={theme.id}
              className={`theme-card ${settings.themeId === theme.id ? 'is-active' : ''}`}
              onClick={() => {
                onUpdate({ themeId: theme.id });
                onToast(`${theme.name} theme applied.`, 'success');
              }}
              aria-pressed={settings.themeId === theme.id}
            >
              <span
                className="theme-swatch"
                style={{ background: theme.tokens.bg, borderColor: theme.tokens.line }}
              >
                <span className="theme-rail" style={{ background: theme.tokens.surface }}>
                  <span style={{ background: theme.tokens.accent }} />
                  <span style={{ background: theme.tokens.raised }} />
                  <span style={{ background: theme.tokens.raised }} />
                </span>
                <span className="theme-body" style={{ background: theme.tokens.surface }}>
                  <span style={{ background: theme.tokens.ink, width: '62%' }} />
                  <span style={{ background: theme.tokens.muted, width: '84%' }} />
                  <span style={{ background: theme.tokens.accent, width: '40%' }} />
                  <span
                    style={{
                      background: theme.tokens.accentSoft,
                      width: '28%',
                      opacity: 0.85,
                    }}
                  />
                </span>
              </span>
              <span className="theme-meta">
                <strong>{theme.name}</strong>
                <span className="mono">
                  {theme.mode.toUpperCase()} · {theme.tokens.accent?.toUpperCase()}
                </span>
              </span>
              {settings.themeId === theme.id ? (
                <span className="theme-check">
                  <Icon name="check" size={13} />
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </section>

      <div className="settings-columns">
        <section className="settings-block panel">
          <h2>Workspace</h2>

          <div className="setting-row">
            <div>
              <strong>Start view</strong>
              <p>Where Kryvex opens on launch.</p>
            </div>
            <select
              value={settings.startView}
              onChange={event => onUpdate({ startView: event.target.value as ViewId })}
              aria-label="Start view"
            >
              <option value="home">Home</option>
              <option value="services">Services</option>
              <option value="browser">Browser</option>
              <option value="settings">Settings</option>
            </select>
          </div>

          <div className="setting-row">
            <div>
              <strong>Density</strong>
              <p>Compact tightens rows and cards.</p>
            </div>
            <div className="segmented" role="radiogroup" aria-label="Density">
              {(['comfortable', 'compact'] as const).map(value => (
                <button
                  key={value}
                  role="radio"
                  aria-checked={settings.density === value}
                  className={settings.density === value ? 'is-active' : ''}
                  onClick={() => onUpdate({ density: value })}
                >
                  {value === 'comfortable' ? 'Comfortable' : 'Compact'}
                </button>
              ))}
            </div>
          </div>

          <div className="setting-row">
            <div>
              <strong>Status bar</strong>
              <p>Show the element and session readout.</p>
            </div>
            <button
              className={`switch ${settings.showStatusBar ? 'is-on' : ''}`}
              role="switch"
              aria-checked={settings.showStatusBar}
              onClick={() => onUpdate({ showStatusBar: !settings.showStatusBar })}
            >
              <span />
            </button>
          </div>

          <div className="setting-row">
            <div>
              <strong>Confirm before removing</strong>
              <p>Ask before deleting a module.</p>
            </div>
            <button
              className={`switch ${settings.confirmBeforeDelete ? 'is-on' : ''}`}
              role="switch"
              aria-checked={settings.confirmBeforeDelete}
              onClick={() => onUpdate({ confirmBeforeDelete: !settings.confirmBeforeDelete })}
            >
              <span />
            </button>
          </div>
        </section>

        <section className="settings-block panel">
          <h2>Browser</h2>

          <div className="setting-row">
            <div>
              <strong>Search engine</strong>
              <p>Used when the address bar is not a URL.</p>
            </div>
            <select
              value={settings.searchEngine}
              onChange={event =>
                onUpdate({ searchEngine: event.target.value as SettingsModel['searchEngine'] })
              }
              aria-label="Search engine"
            >
              <option value="duckduckgo">DuckDuckGo</option>
              <option value="google">Google</option>
              <option value="bing">Bing</option>
            </select>
          </div>

          <div className="setting-row">
            <div>
              <strong>Sidebar</strong>
              <p>Collapse to the icon rail.</p>
            </div>
            <button
              className={`switch ${settings.sidebarCollapsed ? 'is-on' : ''}`}
              role="switch"
              aria-checked={settings.sidebarCollapsed}
              onClick={() => onUpdate({ sidebarCollapsed: !settings.sidebarCollapsed })}
            >
              <span />
            </button>
          </div>

          <div className="setting-row column">
            <div>
              <strong>Session isolation</strong>
              <p>
                Each module and each tab gets a dedicated persistent partition. Clearing a site&apos;s
                data is done from its own settings page.
              </p>
            </div>
            <code className="mono code-line">persist:svc-* · persist:browser-*</code>
          </div>
        </section>
      </div>

      <div className="settings-columns">
        <section className="settings-block panel">
          <h2>Data</h2>
          <div className="setting-row">
            <div>
              <strong>State file</strong>
              <p>Plain JSON in the app&apos;s user-data directory.</p>
            </div>
            <code className="mono code-line">userData/kryvex-state.json</code>
          </div>
          <div className="setting-row">
            <div>
              <strong>Reset workspace</strong>
              <p>Removes services, bookmarks and preferences, then restores starters.</p>
            </div>
            <button className="btn danger-outline" onClick={onReset}>
              <Icon name="trash" size={14} />
              Reset
            </button>
          </div>
        </section>

        <section className="settings-block panel about-panel">
          <div className="about-head">
            <img src={logoUrl} width={72} height={72} alt="Kryvex element tile" />
            <div>
              <h2>Kryvex</h2>
              <p className="mono">ELEMENT 027 · Kx · v{info?.version ?? '0.1.0'}</p>
            </div>
          </div>
          <p className="about-copy">
            A modular desktop workspace. Independent services, one engineered surface, every
            session isolated. Built with Electron, React and TypeScript.
          </p>
          <dl className="about-meta mono">
            <div>
              <dt>Runtime</dt>
              <dd>{isElectron ? `Electron ${info?.electron ?? '—'}` : 'Web preview'}</dd>
            </div>
            <div>
              <dt>Chromium</dt>
              <dd>{info?.chrome ?? '—'}</dd>
            </div>
            <div>
              <dt>License</dt>
              <dd>MIT</dd>
            </div>
          </dl>
          <button
            className="btn secondary"
            onClick={() => {
              void window.kryvex?.openExternal('https://github.com/XiONDiGiTaL/Kryvex');
              onToast('Opening the repository.', 'info');
            }}
          >
            <Icon name="external" size={14} />
            github.com/XiONDiGiTaL/Kryvex
          </button>
          <div className="about-foot">
            <KxMark size={16} />
            <span className="mono">FICTIONAL ELEMENT — NOT A CHEMICAL CLAIM</span>
          </div>
        </section>
      </div>
    </section>
  );
}
