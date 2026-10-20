import { useEffect, useState } from 'react';
import type {
  AppInfo,
  DefaultBrowserStatus,
  DownloadLocation,
  ExtensionRecord,
  LanguageSetting,
  PersistedState,
  Settings as SettingsModel,
  ShieldStatus,
  ViewId,
} from '../types';
import { THEMES } from '../lib/themes';
import { extensionMessage, LANGUAGES, languageLabel, useI18n } from '../lib/i18n';
import { THEME_PLUGINS } from '../plugins';
import { DonkeyMark } from '../plugins/donkey';
import { Icon, ThemeMark, type ThemeMarkKind } from '../components/ui';
import { logoUrl } from '../assets';

type PrivacyOption = 'httpsUpgrade' | 'stripTracking' | 'fingerprint';

function timeLabel(timestamp: number | null, locale: string, never: string): string {
  if (!timestamp) return never;
  return new Date(timestamp).toLocaleString(locale, {
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
  const { t, locale } = useI18n();
  const settings = state.settings;
  const [shield, setShield] = useState<ShieldStatus | null>(null);
  const [extensions, setExtensions] = useState<ExtensionRecord[]>([]);
  const [defaultBrowser, setDefaultBrowser] = useState<DefaultBrowserStatus | null>(null);
  const [downloadLocation, setDownloadLocation] = useState<DownloadLocation | null>(null);
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

  useEffect(() => {
    if (!isElectron || !window.kryvex) return;
    let alive = true;
    void window.kryvex
      .defaultBrowserStatus()
      .then(next => {
        if (alive) setDefaultBrowser(next);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [isElectron]);

  useEffect(() => {
    if (!isElectron || !window.kryvex) return;
    let alive = true;
    void window.kryvex
      .downloadsLocation()
      .then(next => {
        if (alive) setDownloadLocation(next);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [isElectron]);

  async function makeDefaultBrowser() {
    if (!window.kryvex) return;
    setBusy('browser-default');
    try {
      const next = await window.kryvex.defaultBrowserSet();
      setDefaultBrowser(next);
      onToast(
        next.isDefault
          ? t('Kryvex is now the default browser.')
          : t('Windows Default Apps opened. Choose Kryvex for http and https links.'),
        next.isDefault ? 'success' : 'info',
      );
    } catch {
      onToast(t('Could not open the default-browser settings.'), 'danger');
    } finally {
      setBusy(null);
    }
  }

  async function openDefaultBrowserSettings() {
    if (!window.kryvex) return;
    const opened = await window.kryvex.openDefaultApps();
    if (!opened) onToast(t('Windows Default Apps could not be opened.'), 'danger');
  }

  async function changeDownloadLocation() {
    if (!window.kryvex || busy) return;
    setBusy('download-location');
    try {
      const result = await window.kryvex.downloadsChooseLocation();
      if (result.location) setDownloadLocation(result.location);
      if (result.ok) onToast(t('Download location updated.'), 'success');
      else if (result.message !== 'Selection cancelled.') {
        onToast(t(result.message), 'warning');
      }
    } catch {
      onToast(t('The download folder could not be changed.'), 'danger');
    } finally {
      setBusy(null);
    }
  }

  async function useDefaultDownloadLocation() {
    if (!window.kryvex || busy) return;
    setBusy('download-location');
    try {
      const result = await window.kryvex.downloadsResetLocation();
      if (result.location) setDownloadLocation(result.location);
      onToast(t(result.message), result.ok ? 'success' : 'danger');
    } catch {
      onToast(t('The download folder could not be reset.'), 'danger');
    } finally {
      setBusy(null);
    }
  }

  async function toggleShield(next: boolean) {
    if (!window.kryvex) return;
    setBusy('shield');
    try {
      setShield(await window.kryvex.shieldSetEnabled(next));
      onToast(
        next ? t('Kryvex Shield enabled.') : t('Kryvex Shield disabled.'),
        next ? 'success' : 'info',
      );
    } catch {
      onToast(t('Could not change the shield state.'), 'danger');
    } finally {
      setBusy(null);
    }
  }

  async function togglePrivacy(option: PrivacyOption, next: boolean) {
    if (!window.kryvex) return;
    setBusy('privacy');
    try {
      setShield(await window.kryvex.shieldSetOption(option, next));
      onToast(t('Privacy protection updated.'), 'success');
    } catch {
      onToast(t('Could not change privacy protection.'), 'danger');
    } finally {
      setBusy(null);
    }
  }

  async function updateShield() {
    if (!window.kryvex) return;
    setBusy('shield-update');
    onToast(t('Downloading filter lists…'), 'info');
    try {
      const next = await window.kryvex.shieldUpdate();
      setShield(next);
      onToast(
        next.phase === 'error'
          ? next.error ?? t('Filter update failed.')
          : t('Filter lists updated.'),
        next.phase === 'error' ? 'danger' : 'success',
      );
    } catch {
      onToast(t('Filter update failed.'), 'danger');
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
      onToast(extensionMessage(t, result.message), result.ok ? 'success' : 'warning');
    } catch {
      onToast(t('Extension installation failed.'), 'danger');
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
      onToast(extensionMessage(t, result.message), result.ok ? 'success' : 'warning');
    } catch {
      onToast(t('Could not change the extension state.'), 'danger');
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
      onToast(extensionMessage(t, result.message), result.ok ? 'warning' : 'danger');
    } catch {
      onToast(t('Could not remove the extension.'), 'danger');
    } finally {
      setBusy(null);
    }
  }

  const shieldReady = shield?.phase === 'ready';

  return (
    <section className="view settings-view">
      <header className="view-head">
        <div>
          <p className="eyebrow mono">{t('CONFIGURATION / LOCAL ONLY')}</p>
          <h1>{t('Settings')}</h1>
          <p className="lede">
            {t(
              'Appearance, protection, extensions and startup behavior. Everything is stored on this machine; there is no account and no sync.',
            )}
          </p>
        </div>
      </header>

      <section className="settings-block">
        <div className="section-head">
          <h2>{t('Appearance')}</h2>
          <span className="mono muted-label">
            {THEMES.length} {t('THEMES')} · {THEME_PLUGINS.length} {t('PLUGIN')}
          </span>
        </div>

        <div className="setting-row">
          <div>
            <strong>{t('Language')}</strong>
            <p>{t('Use your system language or choose one for the whole interface.')}</p>
          </div>
          <select
            value={settings.language}
            onChange={event => onUpdate({ language: event.target.value as LanguageSetting })}
            aria-label={t('Language')}
          >
            {LANGUAGES.map(language => (
              <option key={language.id} value={language.id}>
                {language.id === 'system' ? languageLabel(language.id, t) : language.label}
              </option>
            ))}
          </select>
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
                onToast(t('{name} theme applied.', { name: t(theme.name) }), 'success');
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
                <strong>{t(theme.name)}</strong>
                <span className="mono">
                  {theme.plugin ? 'PLUGIN · ' : ''}
                  {t(theme.mode === 'dark' ? 'Dark' : 'Light')} ·{' '}
                  {theme.tokens.accent?.toUpperCase()}
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
              <span className="mono plugin-kicker">
                {t('THEME PLUGIN / {author}', { author: plugin.author.toUpperCase() })}
              </span>
              <strong>{t(plugin.name)}</strong>
              <p>{t(plugin.description)}</p>
            </div>
            <button
              className={`btn ${settings.themeId === plugin.themeId ? 'ghost' : 'secondary'}`}
              onClick={() => {
                onUpdate({ themeId: plugin.themeId });
                onToast(t('Special Donkey Edition activated. Hee-haw.'), 'success');
              }}
            >
              {settings.themeId === plugin.themeId ? t('Active') : t('Activate')}
            </button>
          </div>
        ))}
      </section>

      <div className="settings-columns">
        <section className="settings-block panel shield-panel">
          <div className="section-head">
            <h2>
              <Icon name="shield" size={16} /> {t('Kryvex Shield')}
            </h2>
            <span className={`mono shield-state ${shieldReady ? 'is-ready' : ''}`}>
              {isElectron ? t((shield?.phase ?? 'STARTING').toUpperCase()) : t('DESKTOP ONLY')}
            </span>
          </div>

          <div className="setting-row">
            <div>
              <strong>{t('Native ad and tracker blocking')}</strong>
              <p>
                {t(
                  "Network filtering inside Electron's session layer. No extension, no MV3 service worker, no browser policy changes.",
                )}
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
                  <span className="mono">{t('BLOCKED THIS SESSION')}</span>
                  <strong>{shield.blocked.toLocaleString(locale)}</strong>
                </div>
                <div>
                  <span className="mono">{t('NETWORK FILTERS')}</span>
                  <strong>{shield.filters.toLocaleString(locale)}</strong>
                </div>
                <div>
                  <span className="mono">{t('LISTS UPDATED')}</span>
                  <strong className="shield-date">
                    {timeLabel(shield.updatedAt, locale, t('never'))}
                  </strong>
                </div>
              </div>

              <p className="shield-note mono shield-privacy-stats">
                {t('{stripped} tracking parameters removed · {upgrades} HTTPS upgrades', {
                  stripped: shield.paramsStripped,
                  upgrades: shield.httpsUpgrades,
                })}
              </p>

              <div className="privacy-settings">
                <span className="mono privacy-kicker">{t('Privacy protections')}</span>
                <div className="setting-row">
                  <div>
                    <strong>{t('Block fingerprinting')}</strong>
                    <p>
                      {t(
                        'Adds stable, subtle noise to canvas, WebGL and audio-analysis readouts. Reload open pages to apply a change.',
                      )}
                    </p>
                  </div>
                  <button
                    className={`switch ${shield.fingerprint ? 'is-on' : ''}`}
                    role="switch"
                    aria-checked={shield.fingerprint}
                    disabled={!isElectron || busy === 'privacy'}
                    onClick={() => void togglePrivacy('fingerprint', !shield.fingerprint)}
                  >
                    <span />
                  </button>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>{t('Upgrade connections to HTTPS')}</strong>
                    <p>
                      {t(
                        'Tries HTTPS first for top-level navigations, then retries over HTTP once if the secure connection fails.',
                      )}
                    </p>
                  </div>
                  <button
                    className={`switch ${shield.httpsUpgrade ? 'is-on' : ''}`}
                    role="switch"
                    aria-checked={shield.httpsUpgrade}
                    disabled={!isElectron || busy === 'privacy'}
                    onClick={() => void togglePrivacy('httpsUpgrade', !shield.httpsUpgrade)}
                  >
                    <span />
                  </button>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>{t('Strip tracking parameters')}</strong>
                    <p>
                      {t(
                        'Removes known campaign and click identifiers from top-level navigations.',
                      )}
                    </p>
                  </div>
                  <button
                    className={`switch ${shield.stripTracking ? 'is-on' : ''}`}
                    role="switch"
                    aria-checked={shield.stripTracking}
                    disabled={!isElectron || busy === 'privacy'}
                    onClick={() => void togglePrivacy('stripTracking', !shield.stripTracking)}
                  >
                    <span />
                  </button>
                </div>
              </div>

              <div className="setting-row">
                <div>
                  <strong>{t('Filter sources')}</strong>
                  <p className="mono shield-lists">
                    {shield.lists.length > 0
                      ? shield.lists.join(' · ')
                      : 'uBlock Origin filters · Privacy · Badware · EasyList · EasyPrivacy · EasyList Cookie'}
                  </p>
                </div>
                <button
                  className="btn secondary small"
                  disabled={!isElectron || busy === 'shield-update'}
                  onClick={() => void updateShield()}
                >
                  <Icon name="reload" size={13} />
                  {busy === 'shield-update' ? t('Updating…') : t('Update lists')}
                </button>
              </div>

              <p className="shield-note">
                {t('EasyList Cookie hides many consent banners without clicking them.')}
              </p>

              {shield.phase === 'loading' ? (
                <p className="shield-note">
                  {t('Downloading and compiling filter lists in the background…')}
                </p>
              ) : null}
              {shield.error ? <p className="shield-note is-error">{shield.error}</p> : null}
            </>
          ) : (
            <p className="shield-note">
              {isElectron
                ? t('Reading shield state…')
                : t(
                    'The shield runs in the Electron app. This web preview cannot filter network traffic.',
                  )}
            </p>
          )}

          <div className="credit-box">
            <span className="mono credit-kicker">{t('THIRD-PARTY CREDITS')}</span>
            <p>
              {t('Kryvex Shield is powered by the')}{' '}
              <strong>{t('uBlock Origin filter lists')}</strong>{' '}
              {t(
                'created by Raymond Hill and the uBlock Origin contributors, together with EasyList and EasyPrivacy. The blocking engine is',
              )}{' '}
              <strong>@ghostery/adblocker</strong>{' '}
              {t('(MPL-2.0), wrapped for Electron by Ghostery.')}
            </p>
            <p className="credit-disclaimer">
              {t(
                'Kryvex takes no credit for uBlock Origin, its filter lists, EasyList, EasyPrivacy or the Ghostery engine. They remain the work of their respective authors. uBlock Origin is licensed GPL-3.0; list data is downloaded at runtime and is not redistributed with this app. No affiliation or endorsement is implied.',
              )}
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
            <h2>{t('Extensions')}</h2>
            <span className="mono muted-label">
              {t('{count} INSTALLED', { count: extensions.length })}
            </span>
          </div>

          <p className="settings-copy">
            {t(
              'Add Chrome-compatible extensions as unpacked folders, .zip or .crx. They are loaded into each service and browser session by Electron.',
            )}
          </p>

          <div className="extension-actions">
            <button
              className="btn secondary small"
              disabled={!isElectron || busy === 'ext-file'}
              onClick={() => void installExtension(false)}
            >
              <Icon name="plus" size={13} />
              {t('Install package')}
            </button>
            <button
              className="btn ghost small"
              disabled={!isElectron || busy === 'ext-folder'}
              onClick={() => void installExtension(true)}
            >
              {t('Install folder')}
            </button>
          </div>

          {extensions.length === 0 ? (
            <p className="shield-note">
              {t(
                'No extensions installed. Kryvex Shield already covers ads and trackers, so no ad-block extension is required.',
              )}
            </p>
          ) : (
            <ul className="extension-list">
              {extensions.map(record => (
                <li key={record.key} className="extension-row">
                  <div className="extension-id">
                    <strong>{record.name}</strong>
                    <span className="mono">
                      v{record.version} · MV{record.manifestVersion} ·{' '}
                      {record.loaded ? t('loaded') : t('not loaded')}
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
                      title={record.enabled ? t('Disable') : t('Enable')}
                    >
                      <span />
                    </button>
                    <button
                      className="icon-btn"
                      aria-label={t('Remove {name}', { name: record.name })}
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
              <strong>{t('Chrome Web Store')}:</strong>{' '}
              {t(
                'store install buttons cannot run inside Electron. Open an extension page in the Browser; Kryvex will offer an install button.',
              )}
            </p>
            <p>
              <strong>{t('Firefox add-ons')}:</strong>{' '}
              {t(
                '.xpi packages target Gecko, not Chromium. Kryvex cannot run them; use the Firefox build where the extension exists, or ask the developer for a Chrome build.',
              )}
            </p>
            <p className="credit-disclaimer">
              {t(
                'Extensions execute third-party code with extension privileges. Install only projects you trust; Kryvex does not audit or endorse them.',
              )}
            </p>
          </div>

          <button
            className="link"
            onClick={() =>
              void window.kryvex?.openExternal('https://chromewebstore.google.com/')
            }
          >
            {t('Open the Chrome Web Store')} <Icon name="external" size={12} />
          </button>
        </section>
      </div>

      <div className="settings-columns">
        <section className="settings-block panel">
          <h2>{t('Workspace')}</h2>

          <div className="setting-row">
            <div>
              <strong>{t('Start view')}</strong>
              <p>{t('Where Kryvex opens on launch.')}</p>
            </div>
            <select
              value={settings.startView}
              onChange={event => onUpdate({ startView: event.target.value as ViewId })}
              aria-label={t('Start view')}
            >
              <option value="home">{t('Home')}</option>
              <option value="services">{t('Services')}</option>
              <option value="browser">{t('Browser')}</option>
              <option value="settings">{t('Settings')}</option>
            </select>
          </div>

          <div className="setting-row">
            <div>
              <strong>{t('Density')}</strong>
              <p>{t('Compact tightens rows and cards.')}</p>
            </div>
            <div className="segmented" role="radiogroup" aria-label={t('Density')}>
              {(['comfortable', 'compact'] as const).map(value => (
                <button
                  key={value}
                  role="radio"
                  aria-checked={settings.density === value}
                  className={settings.density === value ? 'is-active' : ''}
                  onClick={() => onUpdate({ density: value })}
                >
                  {value === 'comfortable' ? t('Comfortable') : t('Compact')}
                </button>
              ))}
            </div>
          </div>

          <div className="setting-row">
            <div>
              <strong>{t('Status bar')}</strong>
              <p>{t('Show the element and session readout.')}</p>
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
              <strong>{t('Confirm before removing')}</strong>
              <p>{t('Ask before deleting a module.')}</p>
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

        <section className="settings-block panel browser-settings-panel">
          <h2>{t('Browser')}</h2>

          <div className="setting-row">
            <div>
              <strong>{t('Default browser')}</strong>
              <p>
                {!isElectron
                  ? t('Available in the Windows app.')
                  : !defaultBrowser
                    ? t('Checking Windows Default Apps…')
                    : defaultBrowser.isDefault
                      ? t('Kryvex handles http and https links from Windows.')
                      : defaultBrowser.detail ?? t('Choose Kryvex in Windows Default Apps.')}
              </p>
            </div>
            <div className="setting-action-stack">
              <button
                className="btn secondary small"
                disabled={
                  !isElectron ||
                  !defaultBrowser?.canRegister ||
                  Boolean(defaultBrowser?.isDefault) ||
                  busy === 'browser-default'
                }
                onClick={() => void makeDefaultBrowser()}
              >
                <Icon name={defaultBrowser?.isDefault ? 'check' : 'globe'} size={13} />
                {defaultBrowser?.isDefault
                  ? t('Default browser')
                  : busy === 'browser-default'
                    ? t('Opening…')
                    : t('Set as default')}
              </button>
              {defaultBrowser && !defaultBrowser.isDefault && defaultBrowser.supported ? (
                <button className="link" onClick={() => void openDefaultBrowserSettings()}>
                  {t('Windows settings')}
                </button>
              ) : null}
            </div>
          </div>

          <div className="setting-row">
            <div>
              <strong>{t('Search engine')}</strong>
              <p>{t('Used when the address bar is not a URL.')}</p>
            </div>
            <select
              value={settings.searchEngine}
              onChange={event =>
                onUpdate({ searchEngine: event.target.value as SettingsModel['searchEngine'] })
              }
              aria-label={t('Search engine')}
            >
              <option value="duckduckgo">DuckDuckGo</option>
              <option value="google">Google</option>
              <option value="bing">Bing</option>
            </select>
          </div>

          <div className="setting-row">
            <div>
              <strong>{t('Sidebar')}</strong>
              <p>{t('Collapse to the icon rail.')}</p>
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
              <strong>{t('Session isolation')}</strong>
              <p>
                {t(
                  'Each module keeps a persistent partition. Each browser tab uses an in-memory partition that is discarded when the tab closes.',
                )}
              </p>
            </div>
            <code className="mono code-line">persist:svc-* · browser-* (in-memory)</code>
          </div>
        </section>
      </div>

      <div className="settings-columns">
        <section className="settings-block panel">
          <h2>{t('Data')}</h2>
          <div className="setting-row">
            <div className="download-location-copy">
              <strong>{t('Download location')}</strong>
              <p>
                {t(
                  'Regular downloads and new torrents are saved here. Torrents use a Kryvex Torrents subfolder; existing items keep the folder they were saved in.',
                )}
              </p>
              {isElectron ? (
                <code
                  className="mono code-line download-location-path"
                  title={downloadLocation?.path ?? ''}
                >
                  {downloadLocation?.path ?? t('Reading location…')}
                </code>
              ) : (
                <span className="mono muted-label">{t('Available in the Windows app.')}</span>
              )}
            </div>
            <div className="setting-action-stack">
              <button
                className="btn secondary small"
                disabled={!isElectron || !downloadLocation || busy === 'download-location'}
                onClick={() => void changeDownloadLocation()}
              >
                <Icon name="folder" size={13} />
                {busy === 'download-location' ? t('Choosing…') : t('Change folder')}
              </button>
              {downloadLocation && !downloadLocation.isDefault ? (
                <button
                  className="link"
                  disabled={busy === 'download-location'}
                  onClick={() => void useDefaultDownloadLocation()}
                >
                  {t('Use the Downloads folder')}
                </button>
              ) : null}
            </div>
          </div>
          <div className="setting-row">
            <div>
              <strong>{t('State file')}</strong>
              <p>{t("Plain JSON in the app's user-data directory.")}</p>
            </div>
            <code className="mono code-line">userData/kryvex-state.json</code>
          </div>
          <div className="setting-row">
            <div>
              <strong>{t('Reset workspace')}</strong>
              <p>{t('Removes services, bookmarks and preferences, then restores starters.')}</p>
            </div>
            <button className="btn danger-outline" onClick={onReset}>
              <Icon name="trash" size={14} />
              {t('Reset')}
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
              <img src={logoUrl} width={72} height={72} alt={t('Kryvex element tile')} />
            )}
            <div>
              <h2>Kryvex</h2>
              <p className="mono">
                {mark === 'donkey'
                  ? `${t('Special Donkey Edition')} · `
                  : `${t('ELEMENT x529 · Kx')} · `}
                v{info?.version ?? '0.5.0'}
              </p>
            </div>
          </div>
          <p className="about-copy">
            {t(
              'A modular desktop workspace. Independent services, one engineered surface, every session isolated. Built with Electron, React and TypeScript.',
            )}
          </p>
          <dl className="about-meta mono">
            <div>
              <dt>{t('Runtime')}</dt>
              <dd>
                {isElectron ? `Electron ${info?.electron ?? '—'}` : t('Web preview')}
              </dd>
            </div>
            <div>
              <dt>{t('Chromium')}</dt>
              <dd>{info?.chrome ?? '—'}</dd>
            </div>
            <div>
              <dt>{t('License')}</dt>
              <dd>MIT</dd>
            </div>
          </dl>
          <button
            className="btn secondary"
            onClick={() => {
              void window.kryvex?.openExternal('https://github.com/XiONDiGiTaL/Kryvex');
              onToast(t('Opening the repository.'), 'info');
            }}
          >
            <Icon name="external" size={14} />
            github.com/XiONDiGiTaL/Kryvex
          </button>
          <div className="about-devs">
            <span className="mono about-devs-label">{t('DEVELOPERS')}</span>
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
            <span className="mono">
              {t('FICTIONAL ELEMENT — NOT A CHEMICAL CLAIM')}
            </span>
          </div>
        </section>
      </div>
    </section>
  );
}
