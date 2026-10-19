import { useEffect, useState } from 'react';
import type {
  AppInfo,
  ExtensionRecord,
  PersistedState,
  Settings as SettingsModel,
  ShieldStatus,
  ViewId,
} from '../types';
import { THEMES } from '../lib/themes';
import { THEME_PLUGINS } from '../plugins';
import { DonkeyMark } from '../plugins/donkey';
import { Icon, ThemeMark, type ThemeMarkKind } from '../components/ui';
import { logoUrl } from '../assets';

function timeLabel(timestamp: number | null): string {
  if (!timestamp) return 'never';
  return new Date(timestamp).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function Settings({
  state,
  info,
  isElectron,
  mark = 'kx',
  onUpdate,
  onReset,
  onToast,
}: {
  state: PersistedState;
  info: AppInfo | null;
  isElectron: boolean;
  mark?: ThemeMarkKind;
  onUpdate: (patch: Partial<SettingsModel>) => void;
  onReset: () => void;
  onToast: (message: string, tone?: 'info' | 'success' | 'warning' | 'danger') => void;
}) {
  const settings = state.settings;
  const [shield, setShield] = useState<ShieldStatus | null>(null);
  const [extensions, setExtensions] = useState<ExtensionRecord[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!isElectron || !window.kryvex) return;
    let alive = true;

    const refresh = async () => {
      try {
        const [nextShield, nextExtensions] = await Promise.all([
          window.kryvex!.shieldStatus(),
          window.kryvex!.extensionsList(),
        ]);
        if (alive) {
          setShield(nextShield);
          setExtensions(nextExtensions);
        }
      } catch {
        // The bridge is sandboxed; a failed poll should never break settings.
      }
    };

    void refresh();
    const timer = window.setInterval(refresh, 4000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [isElectron]);

  async function toggleShield(next: boolean) {
    if (!window.kryvex) return;
    setBusy('shield');
    try {
      setShield(await window.kryvex.shieldSetEnabled(next));
      onToast(next ? 'Kryvex Shield enabled.' : 'Kryvex Shield disabled.', next ? 'success' : 'info');
    } catch {
      onToast('Could not change the shield state.', 'danger');
    } finally {
      setBusy(null);
    }
  }

  async function updateShield() {
    if (!window.kryvex) return;
    setBusy('shield-update');
    onToast('Downloading filter lists…', 'info');
    try {
      const next = await window.kryvex.shieldUpdate();
      setShield(next);
      onToast(
        next.phase === 'error' ? next.error ?? 'Filter update failed.' : 'Filter lists updated.',
        next.phase === 'error' ? 'danger' : 'success',
      );
    } catch {
      onToast('Filter update failed.', 'danger');
    } finally {
      setBusy(null);
    }
  }

  async function installExtension(folder: boolean) {
    if (!window.kryvex) return;
    setBusy(folder ? 'ext-folder' : 'ext-file');
    try {
      const result = folder
        ? await window.kryvex.extensionsInstallFolder()
        : await window.kryvex.extensionsInstall();
      setExtensions(result.records);
      onToast(result.message, result.ok ? 'success' : 'warning');
    } catch {
      onToast('Extension installation failed.', 'danger');
    } finally {
      setBusy(null);
    }
  }

  async function toggleExtension(record: ExtensionRecord, enabled: boolean) {
    if (!window.kryvex) return;
    setBusy(`ext-${record.key}`);
    try {
      const result = await window.kryvex.extensionsSetEnabled(record.key, enabled);
      setExtensions(result.records);
      onToast(result.message, result.ok ? 'success' : 'warning');
    } catch {
      onToast('Could not change the extension state.', 'danger');
    } finally {
      setBusy(null);
    }
  }

  async function removeExtension(record: ExtensionRecord) {
    if (!window.kryvex) return;
    setBusy(`ext-${record.key}`);
    try {
      const result = await window.kryvex.extensionsRemove(record.key);
      setExtensions(result.records);
      onToast(result.message, result.ok ? 'warning' : 'danger');
    } catch {
      onToast('Could not remove the extension.', 'danger');
    } finally {
      setBusy(null);
    }
  }

  const shieldReady = shield?.phase === 'ready';

  return (
    <section className="view settings-view">
      <header className="view-head">
        <div>
          <p className="eyebrow mono">CONFIGURATION / LOCAL ONLY</p>
          <h1>Settings</h1>
          <p className="lede">
            Appearance, protection, extensions and startup behavior. Everything is stored on this
            machine; there is no account and no sync.
          </p>
        </div>
      </header>

      <section className="settings-block">
        <div className="section-head">
          <h2>Appearance</h2>
          <span className="mono muted-label">
            {THEMES.length} THEMES · {THEME_PLUGINS.length} PLUGIN
          </span>
        </div>
        <div className="theme-grid">
          {THEMES.map(theme => (
            <button
              key={theme.id}
              className={`theme-card ${settings.themeId === theme.id ? 'is-active' : ''} ${
                theme.plugin ? 'is-plugin' : ''
              }`}
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
                  {theme.plugin ? 'PLUGIN · ' : ''}
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

        {THEME_PLUGINS.map(plugin => (
          <div key={plugin.id} className="plugin-card">
            <span className="plugin-mark">
              <DonkeyMark size={54} variant="tile" />
            </span>
            <div className="plugin-copy">
              <span className="mono plugin-kicker">THEME PLUGIN / {plugin.author.toUpperCase()}</span>
              <strong>{plugin.name}</strong>
              <p>{plugin.description}</p>
            </div>
            <button
              className={`btn ${settings.themeId === plugin.themeId ? 'ghost' : 'secondary'}`}
              onClick={() => {
                onUpdate({ themeId: plugin.themeId });
                onToast('Special Donkey Edition activated. Hee-haw.', 'success');
              }}
            >
              {settings.themeId === plugin.themeId ? 'Active' : 'Activate'}
            </button>
          </div>
        ))}
      </section>

      <div className="settings-columns">
        <section className="settings-block panel shield-panel">
          <div className="section-head">
            <h2>
              <Icon name="shield" size={16} /> Kryvex Shield
            </h2>
            <span className={`mono shield-state ${shieldReady ? 'is-ready' : ''}`}>
              {isElectron ? (shield?.phase ?? 'STARTING').toUpperCase() : 'DESKTOP ONLY'}
            </span>
          </div>

          <div className="setting-row">
            <div>
              <strong>Native ad and tracker blocking</strong>
              <p>
                Network filtering inside Electron&apos;s session layer. No extension, no MV3 service
                worker, no browser policy changes.
              </p>
            </div>
            <button
              className={`switch ${shield?.enabled ? 'is-on' : ''}`}
              role="switch"
              aria-checked={Boolean(shield?.enabled)}
              disabled={!isElectron || busy === 'shield'}
              onClick={() => void toggleShield(!shield?.enabled)}
            >
              <span />
            </button>
          </div>

          {shield ? (
            <>
              <div className="shield-stats">
                <div>
                  <span className="mono">BLOCKED THIS SESSION</span>
                  <strong>{shield.blocked.toLocaleString()}</strong>
                </div>
                <div>
                  <span className="mono">NETWORK FILTERS</span>
                  <strong>{shield.filters.toLocaleString()}</strong>
                </div>
                <div>
                  <span className="mono">LISTS UPDATED</span>
                  <strong className="shield-date">{timeLabel(shield.updatedAt)}</strong>
                </div>
              </div>

              <div className="setting-row">
                <div>
                  <strong>Filter sources</strong>
                  <p className="mono shield-lists">
                    {shield.lists.length > 0
                      ? shield.lists.join(' · ')
                      : 'uBlock Origin filters · Privacy · Badware · EasyList · EasyPrivacy'}
                  </p>
                </div>
                <button
                  className="btn secondary small"
                  disabled={!isElectron || busy === 'shield-update'}
                  onClick={() => void updateShield()}
                >
                  <Icon name="reload" size={13} />
                  {busy === 'shield-update' ? 'Updating…' : 'Update lists'}
                </button>
              </div>

              {shield.phase === 'loading' ? (
                <p className="shield-note">Downloading and compiling filter lists in the background…</p>
              ) : null}
              {shield.error ? <p className="shield-note is-error">{shield.error}</p> : null}
            </>
          ) : (
            <p className="shield-note">
              {isElectron
                ? 'Reading shield state…'
                : 'The shield runs in the Electron app. This web preview cannot filter network traffic.'}
            </p>
          )}

          <div className="credit-box">
            <span className="mono credit-kicker">THIRD-PARTY CREDITS</span>
            <p>
              Kryvex Shield is powered by the <strong>uBlock Origin filter lists</strong> created by
              Raymond Hill and the uBlock Origin contributors, together with EasyList and EasyPrivacy.
              The blocking engine is <strong>@ghostery/adblocker</strong> (MPL-2.0), wrapped for
              Electron by Ghostery.
            </p>
            <p className="credit-disclaimer">
              Kryvex takes no credit for uBlock Origin, its filter lists, EasyList, EasyPrivacy or the
              Ghostery engine. They remain the work of their respective authors. uBlock Origin is
              licensed GPL-3.0; list data is downloaded at runtime and is not redistributed with this
              app. No affiliation or endorsement is implied.
            </p>
            <div className="credit-links">
              <button
                className="link"
                onClick={() =>
                  void window.kryvex?.openExternal('https://github.com/gorhill/uBlock')
                }
              >
                uBlock Origin <Icon name="external" size={12} />
              </button>
              <button
                className="link"
                onClick={() =>
                  void window.kryvex?.openExternal('https://github.com/ghostery/adblocker')
                }
              >
                Ghostery Adblocker <Icon name="external" size={12} />
              </button>
              <button
                className="link"
                onClick={() => void window.kryvex?.openExternal('https://easylist.to/')}
              >
                EasyList <Icon name="external" size={12} />
              </button>
            </div>
          </div>
        </section>

        <section className="settings-block panel">
          <div className="section-head">
            <h2>Extensions</h2>
            <span className="mono muted-label">{extensions.length} INSTALLED</span>
          </div>

          <p className="settings-copy">
            Add Chrome-compatible extensions as unpacked folders, <code>.zip</code> or <code>.crx</code>.
            They are loaded into each service and browser session by Electron.
          </p>

          <div className="extension-actions">
            <button
              className="btn secondary small"
              disabled={!isElectron || busy === 'ext-file'}
              onClick={() => void installExtension(false)}
            >
              <Icon name="plus" size={13} />
              Install package
            </button>
            <button
              className="btn ghost small"
              disabled={!isElectron || busy === 'ext-folder'}
              onClick={() => void installExtension(true)}
            >
              Install folder
            </button>
          </div>

          {extensions.length === 0 ? (
            <p className="shield-note">
              No extensions installed. Kryvex Shield already covers ads and trackers, so no ad-block
              extension is required.
            </p>
          ) : (
            <ul className="extension-list">
              {extensions.map(record => (
                <li key={record.key} className="extension-row">
                  <div className="extension-id">
                    <strong>{record.name}</strong>
                    <span className="mono">
                      v{record.version} · MV{record.manifestVersion} · {record.loaded ? 'loaded' : 'not loaded'}
                    </span>
                    {record.error ? <span className="extension-error">{record.error}</span> : null}
                  </div>
                  <div className="extension-controls">
                    <button
                      className={`switch small ${record.enabled ? 'is-on' : ''}`}
                      role="switch"
                      aria-checked={record.enabled}
                      disabled={busy === `ext-${record.key}`}
                      onClick={() => void toggleExtension(record, !record.enabled)}
                      title={record.enabled ? 'Disable' : 'Enable'}
                    >
                      <span />
                    </button>
                    <button
                      className="icon-btn"
                      aria-label={`Remove ${record.name}`}
                      disabled={busy === `ext-${record.key}`}
                      onClick={() => void removeExtension(record)}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="extension-notes">
            <p>
              <strong>Chrome Web Store:</strong> store install buttons cannot run inside Electron.
              Download the developer&apos;s package or unpacked build, then install it here.
            </p>
            <p>
              <strong>Firefox add-ons:</strong> <code>.xpi</code> packages target Gecko, not Chromium.
              Kryvex cannot run them; use the Firefox build where the extension exists, or ask the
              developer for a Chrome build.
            </p>
            <p className="credit-disclaimer">
              Extensions execute third-party code with extension privileges. Install only projects you
              trust; Kryvex does not audit or endorse them.
            </p>
          </div>

          <button
            className="link"
            onClick={() =>
              void window.kryvex?.openExternal('https://chromewebstore.google.com/')
            }
          >
            Open the Chrome Web Store <Icon name="external" size={12} />
          </button>
        </section>
      </div>

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
            {mark === 'donkey' ? (
              <span className="about-mark">
                <DonkeyMark size={72} variant="tile" />
              </span>
            ) : (
              <img src={logoUrl} width={72} height={72} alt="Kryvex element tile" />
            )}
            <div>
              <h2>Kryvex</h2>
              <p className="mono">
                {mark === 'donkey' ? 'SPECIAL DONKEY EDITION · ' : 'ELEMENT x529 · Kx · '}v
                {info?.version ?? '0.3.0'}
              </p>
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
          <div className="about-devs">
            <span className="mono about-devs-label">DEVELOPERS</span>
            <div className="about-dev-links">
              <a
                href="https://github.com/XiONDiGiTaL"
                target="_blank"
                rel="noreferrer noopener"
                aria-label="XiONDiGiTaL on GitHub"
              >
                XiONDiGiTaL <Icon name="external" size={11} />
              </a>
              <span className="about-dev-sep" aria-hidden="true">
                ·
              </span>
              <a
                href="https://github.com/player529"
                target="_blank"
                rel="noreferrer noopener"
                aria-label="player529 on GitHub"
              >
                player529 <Icon name="external" size={11} />
              </a>
            </div>
          </div>
          <div className="about-foot">
            <ThemeMark mark={mark} size={16} />
            <span className="mono">FICTIONAL ELEMENT — NOT A CHEMICAL CLAIM</span>
          </div>
        </section>
      </div>
    </section>
  );
}
