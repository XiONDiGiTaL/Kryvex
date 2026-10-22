import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type {
  AppInfo,
  ChromiumSettings,
  CustomTheme,
  DefaultBrowserStatus,
  DownloadLocation,
  EngineInfo,
  ExtensionRecord,
  LanguageSetting,
  LocalModelStatus,
  PersistedState,
  Settings as SettingsModel,
  ShieldCustomPatch,
  ShieldStatus,
  UpdateStatus,
  ViewId,
  VpnStatus,
  WallpaperFit,
  WallpaperImage,
  WallpaperSource,
} from '../types';
import { CHROMIUM_ZOOM_STEPS, DEFAULT_CHROMIUM, zoomLabel } from '../lib/chromium';
import {
  DEFAULT_ICE_SERVERS,
  DEFAULT_TRACKERS,
  PEER_COLORS,
  sanitizeDisplayName,
  sanitizeIceServers,
  sanitizeTrackers,
} from '../lib/party-rules';
import {
  CUSTOM_THEME_ID,
  DEFAULT_CUSTOM_THEME,
  FAMILY_LABELS,
  THEMES,
  THEME_FAMILIES,
  buildCustomTheme,
  type Theme,
  type ThemeFamily,
} from '../lib/themes';
import { extensionMessage, LANGUAGES, languageLabel, useI18n } from '../lib/i18n';
import {
  ASSISTANT_PROVIDER_URL,
  MODEL_SOURCES,
  normalizeBaseUrl,
  useAssistantRuntime,
} from '../lib/assistant';
import { WALLPAPER_ACCEPT } from '../lib/wallpaper';
import {
  SEARCH_REGIONS,
  engineGroups,
  enginesForRegion,
  searchEngine,
} from '../lib/search-engines';
import { ColorPicker } from '../components/ColorPicker';
import { SettingsBlock } from '../components/SettingsBlock';
import { ThemeGallery } from '../components/ThemeGallery';
import { Icon, ThemeMark, type ThemeMarkKind } from '../components/ui';
import { logoUrl } from '../assets';

type PrivacyOption = 'httpsUpgrade' | 'stripTracking' | 'fingerprint';

/** Engine switches the panel renders as toggles. */
type EngineSwitchKey =
  | 'hardwareAcceleration'
  | 'smoothScrolling'
  | 'javascript'
  | 'images'
  | 'webgl'
  | 'pdfViewer'
  | 'autoplay'
  | 'backgroundThrottling'
  | 'spellcheck';

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 MB';
  const mb = value / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

const FIT_LABELS: Record<WallpaperFit, string> = {
  cover: 'FILL',
  contain: 'FIT',
  tile: 'TILE',
};

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
  wallpaper = null,
  onPickWallpaper,
  onClearWallpaper,
  onUpdate,
  onReset,
  onToast,
  onRebuildPages,
  update = null,
  focusUpdates = false,
  focusAssistant = false,
  focusResources = false,
  onCheckUpdate,
  onDownloadUpdate,
  onInstallUpdate,
  onRevealUpdate,
  onOpenRelease,
}: {
  state: PersistedState;
  info: AppInfo | null;
  isElectron: boolean;
  mark?: ThemeMarkKind;
  wallpaper?: WallpaperImage | null;
  onPickWallpaper: (file: File) => void;
  onClearWallpaper: () => void;
  onUpdate: (patch: Partial<SettingsModel>) => void;
  onReset: () => void;
  onToast: (message: string, tone?: 'info' | 'success' | 'warning' | 'danger') => void;
  /** Remounts every embedded guest so new engine preferences attach. */
  onRebuildPages: () => number;
  update?: UpdateStatus | null;
  focusUpdates?: boolean;
  focusAssistant?: boolean;
  focusResources?: boolean;
  onCheckUpdate: () => void;
  onDownloadUpdate: () => void;
  onInstallUpdate: () => void;
  onRevealUpdate: () => void;
  onOpenRelease: () => void;
}) {
  const { t, locale } = useI18n();
  const settings = state.settings;
  const [shield, setShield] = useState<ShieldStatus | null>(null);
  /** Local text of the filter editor; only synced while the user has no edits. */
  const [filtersDraft, setFiltersDraft] = useState('');
  const [filtersDirty, setFiltersDirty] = useState(false);
  const [extensions, setExtensions] = useState<ExtensionRecord[]>([]);
  const [defaultBrowser, setDefaultBrowser] = useState<DefaultBrowserStatus | null>(null);
  const [downloadLocation, setDownloadLocation] = useState<DownloadLocation | null>(null);
  const [engine, setEngine] = useState<EngineInfo | null>(null);
  const [model, setModel] = useState<LocalModelStatus | null>(null);
  const [modelBusy, setModelBusy] = useState(false);
  const [vpnState, setVpnState] = useState<VpnStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(settings.themeId === CUSTOM_THEME_ID);
  const updatesRef = useRef<HTMLElement | null>(null);
  const assistantRef = useRef<HTMLElement | null>(null);
  const resourcesRef = useRef<HTMLElement | null>(null);
  const runtime = useAssistantRuntime(settings.assistant);

  useEffect(() => {
    if (!focusUpdates) return;
    updatesRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [focusUpdates]);

  useEffect(() => {
    if (!focusAssistant) return;
    assistantRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [focusAssistant]);

  useEffect(() => {
    if (!focusResources) return;
    resourcesRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [focusResources]);

  useEffect(() => {
    if (settings.themeId === CUSTOM_THEME_ID) setCustomOpen(true);
  }, [settings.themeId]);

  // The shield polls every few seconds; never overwrite text being typed.
  useEffect(() => {
    if (!shield || filtersDirty) return;
    setFiltersDraft(shield.customFilters);
  }, [shield, filtersDirty]);

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
    const poll = () => {
      void window.kryvex!
        .vpnStatus()
        .then(next => {
          if (alive && next) setVpnState(next as VpnStatus);
        })
        .catch(() => undefined);
    };
    poll();
    const timer = window.setInterval(poll, 3000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [isElectron]);

  useEffect(() => {
    if (!isElectron || !window.kryvex) return;
    let alive = true;
    void window.kryvex
      .modelStatus()
      .then(next => {
        if (alive) setModel(next);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [isElectron]);

  // A server loading a large GGUF is silent for a while; poll while it starts.
  useEffect(() => {
    if (!isElectron || !window.kryvex || model?.phase !== 'starting') return;
    const timer = window.setInterval(() => {
      void window.kryvex!.modelStatus()
        .then(setModel)
        .catch(() => undefined);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isElectron, model?.phase]);

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

  useEffect(() => {
    if (!isElectron || !window.kryvex) return;
    let alive = true;
    void window.kryvex
      .chromiumInfo()
      .then(next => {
        if (alive && next) setEngine(next);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [isElectron]);

  // Saving the patch twice (state + main process) is deliberate: the panel
  // must keep rendering after a reload, and the engine must be told at once.
  function applyChromium(patch: Partial<ChromiumSettings>) {
    const next: ChromiumSettings = { ...settings.chromium, ...patch };
    onUpdate({ chromium: next });
    if (!window.kryvex) return;
    void window.kryvex
      .chromiumSet(next)
      .then(info => {
        if (info) setEngine(info);
      })
      .catch(() => onToast(t('The engine setting could not be applied.'), 'danger'));
  }

  function rebuildPages() {
    // A guest keeps the web preferences it attached with, so a reload is not
    // enough: the renderer remounts the <webview> to build a new one.
    const count = onRebuildPages();
    onToast(
      count > 0
        ? t('{count} embedded pages rebuilt.', { count })
        : t('No embedded pages are open.'),
      count > 0 ? 'success' : 'info',
    );
    void window.kryvex
      ?.chromiumInfo()
      .then(next => {
        if (next) setEngine(next);
      })
      .catch(() => undefined);
  }

  function renderEngineSwitch(
    key: EngineSwitchKey,
    title: string,
    description: string,
  ) {
    const value = settings.chromium[key];
    return (
      <div className="setting-row" key={key} data-engine={key}>
        <div>
          <strong>{t(title)}</strong>
          <p>{t(description)}</p>
        </div>
        <button
          className={`switch ${value ? 'is-on' : ''}`}
          role="switch"
          aria-checked={value}
          aria-label={t(title)}
          disabled={!isElectron}
          onClick={() => applyChromium({ [key]: !value } as Partial<ChromiumSettings>)}
        >
          <span />
        </button>
      </div>
    );
  }

  function patchVpn(patch: Partial<SettingsModel['vpn']>) {
    onUpdate({ vpn: { ...settings.vpn, ...patch } });
  }

  async function vpnAction(kind: 'binary' | 'config' | 'connect' | 'disconnect') {
    if (!window.kryvex || busy) return;
    const busyKey = `vpn-${kind}`;
    setBusy(busyKey);
    try {
      const next =
        kind === 'binary'
          ? await window.kryvex.vpnChooseBinary()
          : kind === 'config'
            ? await window.kryvex.vpnChooseConfig()
            : kind === 'connect'
              ? await window.kryvex.vpnConnect()
              : await window.kryvex.vpnDisconnect();
      if (next) {
        const status = next as VpnStatus;
        setVpnState(status);
        if (kind === 'binary' || kind === 'config') {
          // The dialog lives in the main process; mirror its choice into the
          // workspace so the path survives a restart.
          patchVpn({ binaryPath: status.binaryPath, configPath: status.configPath });
        }
        if (kind === 'connect') {
          onToast(
            status.phase === 'connected'
              ? t('The VPN tunnel is up.')
              : status.phase === 'connecting'
                ? t('OpenVPN is connecting…')
                : status.detail,
            status.phase === 'connected' || status.phase === 'connecting' ? 'success' : 'warning',
          );
        }
      }
    } catch {
      onToast(t('The VPN action could not be completed.'), 'danger');
    } finally {
      setBusy(null);
    }
  }

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

  async function saveFilters(patch: ShieldCustomPatch) {
    if (!window.kryvex) return;
    setBusy('filters');
    try {
      const next = await window.kryvex.shieldSetCustom(patch);
      setShield(next);
      setFiltersDirty(false);
      onToast(
        next.error ? next.error : t('Filter rules applied.'),
        next.error ? 'danger' : 'success',
      );
    } catch {
      onToast(t('The filter rules could not be applied.'), 'danger');
    } finally {
      setBusy(null);
    }
  }

  async function importFilters() {
    if (!window.kryvex) return;
    setBusy('filters');
    try {
      const result = await window.kryvex.shieldImportFilters();
      setShield(result.status);
      setFiltersDirty(false);
      onToast(result.message, result.ok ? 'success' : 'warning');
    } catch {
      onToast(t('The file could not be imported.'), 'danger');
    } finally {
      setBusy(null);
    }
  }

  async function exportFilters() {
    if (!window.kryvex) return;
    setBusy('filters');
    try {
      const result = await window.kryvex.shieldExportFilters();
      setShield(result.status);
      if (result.ok) onToast(result.message, 'success');
    } catch {
      onToast(t('The rules could not be exported.'), 'danger');
    } finally {
      setBusy(null);
    }
  }

  async function chooseModel() {
    if (!window.kryvex) return;
    setModelBusy(true);
    try {
      const next = await window.kryvex.modelChoose();
      setModel(next);
      if (next.error) onToast(next.error, 'warning');
    } catch {
      onToast(t('The model file could not be opened.'), 'danger');
    } finally {
      setModelBusy(false);
    }
  }

  async function chooseModelBinary() {
    if (!window.kryvex) return;
    setModelBusy(true);
    try {
      setModel(await window.kryvex.modelChooseBinary());
    } catch {
      onToast(t('The runtime could not be set.'), 'danger');
    } finally {
      setModelBusy(false);
    }
  }

  async function startModel() {
    if (!window.kryvex) return;
    setModelBusy(true);
    onToast(t('Loading the model. Large files can take a minute.'), 'info');
    try {
      const next = await window.kryvex.modelStart();
      setModel(next);
      if (next.phase === 'running' && next.baseUrl) {
        onUpdate({
          assistant: {
            ...settings.assistant,
            provider: 'local',
            baseUrl: next.baseUrl,
            model: '',
          },
        });
        runtime.refresh();
        onToast(t('{name} is serving on {url}.', { name: next.name, url: next.baseUrl }), 'success');
      } else if (next.error) {
        onToast(next.error, 'danger');
      }
    } catch {
      onToast(t('The model could not be started.'), 'danger');
    } finally {
      setModelBusy(false);
    }
  }

  async function stopModel() {
    if (!window.kryvex) return;
    setModelBusy(true);
    try {
      setModel(await window.kryvex.modelStop());
      onToast(t('The local model stopped.'), 'info');
    } catch {
      onToast(t('The model could not be stopped.'), 'danger');
    } finally {
      setModelBusy(false);
    }
  }

  async function configureModel(patch: { ctxSize?: number; gpuLayers?: number }) {
    if (!window.kryvex) return;
    try {
      setModel(await window.kryvex.modelConfigure(patch));
    } catch {
      /* a stale panel is better than a broken one */
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

  function updateErrorCopy(code: UpdateStatus['error']): string {
    switch (code) {
      case 'offline':
        return t('No network connection was available.');
      case 'timeout':
        return t('The server took too long to answer.');
      case 'rate-limited':
        return t('GitHub limited update checks. Try again in a few minutes.');
      case 'no-release':
        return t('The repository has no published release yet.');
      case 'invalid-release':
        return t('The release data did not match the expected format.');
      case 'no-asset':
        return t('This release has no installer for this build. Use the release page.');
      case 'download-failed':
        return t('The download did not finish.');
      case 'checksum-missing':
        return t('The release does not publish a SHA-256 checksum, so the download was rejected.');
      case 'checksum-failed':
        return t('The downloaded file did not match the release checksum and was deleted.');
      case 'too-large':
        return t('That download is larger than the updater allows.');
      case 'unsupported':
        return t('This build updates with git. Use the release page for a packaged installer.');
      default:
        return t('The update could not continue.');
    }
  }

  const updatePhase = update?.phase ?? 'idle';
  const updatePercent = Math.round((update?.progress ?? 0) * 100);
  let updateTitle = t('No update check has run yet.');
  let updateDetail = t(
    'Kryvex asks GitHub Releases for the newest published version. Only the public release feed is contacted.',
  );
  if (updatePhase === 'checking') {
    updateTitle = t('Checking GitHub Releases…');
    updateDetail = t('This usually takes a moment. Nothing is downloaded yet.');
  } else if (updatePhase === 'current') {
    updateTitle = t('Kryvex {version} is the latest release.', {
      version: update?.latestVersion ?? update?.currentVersion ?? '',
    });
    updateDetail = t('Last checked {time}.', {
      time: timeLabel(update?.checkedAt ?? null, locale, t('never')),
    });
    if (update?.latestVersion && update.latestVersion !== update.currentVersion) {
      updateTitle = t('Kryvex {current} is newer than the latest published release ({latest}).', {
        current: update.currentVersion,
        latest: update.latestVersion,
      });
    }
  } else if (updatePhase === 'available') {
    updateTitle = t('Kryvex {version} is available.', {
      version: update?.latestVersion ?? '',
    });
    updateDetail =
      update?.mode === 'source'
        ? t('This checkout is updated with git. Packaged installers are on the release page.')
        : update?.error
          ? updateErrorCopy(update.error)
          : t('Download the installer, then Kryvex verifies it against the release checksum.');
  } else if (updatePhase === 'downloading') {
    updateTitle = t('Downloading Kryvex {version}…', { version: update?.latestVersion ?? '' });
    updateDetail = t('{received} of {total} · the SHA-256 checksum is verified before install.', {
      received: formatBytes(update?.receivedBytes ?? 0),
      total: formatBytes(update?.assetSize ?? 0),
    });
  } else if (updatePhase === 'ready') {
    updateTitle = t('Kryvex {version} is ready to install.', { version: update?.latestVersion ?? '' });
    updateDetail = update?.canInstall
      ? t('The installer was verified. Kryvex closes, runs it, and you can reopen when it finishes.')
      : t('The file was verified. Portable builds cannot replace themselves, so close Kryvex and run the new EXE.');
  } else if (updatePhase === 'installing') {
    updateTitle = t('Closing Kryvex to install…');
    updateDetail = t('The verified installer is starting. Your services, tabs and settings stay in place.');
  } else if (updatePhase === 'error') {
    updateTitle = t('The update could not continue.');
    updateDetail = updateErrorCopy(update?.error);
  }
  const customPreview = buildCustomTheme(settings.customTheme);
  const engineChanged = (Object.keys(DEFAULT_CHROMIUM) as Array<keyof ChromiumSettings>).filter(
    key => settings.chromium[key] !== DEFAULT_CHROMIUM[key],
  ).length;

  function updateCustomTheme(patch: Partial<CustomTheme>) {
    onUpdate({ customTheme: { ...settings.customTheme, ...patch } });
  }

  function applyTheme(id: string, name: string) {
    onUpdate({ themeId: id });
    onToast(t('{name} theme applied.', { name }), 'success');
  }

  function renderThemeTile(theme: Theme) {
    const label = t(theme.name);
    const active = settings.themeId === theme.id;
    const style = {
      '--tile-accent': theme.tokens.accent,
      '--tile-soft': theme.tokens.accentSoft,
      '--tile-bg': theme.tokens.bg,
      '--tile-surface': theme.tokens.surface,
      '--tile-ink': theme.tokens.ink,
    } as CSSProperties;
    return (
      <button
        key={theme.id}
        data-theme={theme.id}
        data-mode={theme.mode}
        className={`theme-card element-card ${active ? 'is-active' : ''} ${
          theme.gradient ? 'is-gradient' : ''
        } ${theme.glass ? 'is-glass' : ''} ${theme.mono ? 'is-mono' : ''} ${
          theme.plugin ? 'is-plugin' : ''
        }`}
        style={style}
        onClick={() => applyTheme(theme.id, label)}
        aria-pressed={active}
        title={label}
      >
        <span className="element-number mono">
          {theme.number ? String(theme.number).padStart(2, '0') : 'CX'}
        </span>
        <span className="element-symbol mono">{theme.symbol ?? theme.id.slice(0, 2).toUpperCase()}</span>
        <span className="element-name">{label}</span>
        <span className="element-meta mono">
          {t(FAMILY_LABELS[theme.family ?? 'core'])} · {t(theme.mode === 'dark' ? 'DARK' : 'LIGHT')}
        </span>
        <span
          className="element-strip"
          style={{
            background: `linear-gradient(90deg, ${theme.tokens.bg}, ${theme.tokens.surface} 34%, ${theme.tokens.accent} 72%, ${theme.tokens.accentSoft})`,
          }}
        />
        {active ? (
          <span className="theme-check">
            <Icon name="check" size={13} />
          </span>
        ) : null}
      </button>
    );
  }

  const wallpaperOn = settings.wallpaper.enabled;
  const wallpaperStatus = !wallpaperOn
    ? t('OFF')
    : settings.wallpaper.source === 'gradient'
      ? t('THEME WASH')
      : wallpaper
        ? `${Math.max(1, Math.round(wallpaper.bytes / 1024))} KB · ${t(FIT_LABELS[settings.wallpaper.fit])}`
        : t('NO IMAGE');

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

      <SettingsBlock
        className="panel"
        title={t('Appearance')}
        defaultOpen
      >
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
      </SettingsBlock>

      <SettingsBlock
        id="themes"
        className="panel panel-wide theme-settings-panel"
        icon="layers"
        title={t('Themes')}
        meta={`${THEMES.length + 1} ${t('THEMES')}`}
      >
        <div className="theme-families">
          {([...THEME_FAMILIES, 'custom'] as ThemeFamily[]).map(family => {
            // Plugin themes sit in the same table as the catalogue: one chooser.
            const entries = THEMES.filter(theme => (theme.family ?? 'core') === family);
            if (entries.length === 0 && family !== 'custom') return null;
            return (
              <section className="theme-family" key={family} data-family={family}>
                <div className="theme-family-head">
                  <span className="mono">{t(FAMILY_LABELS[family])}</span>
                  <span className="theme-family-line" aria-hidden="true" />
                </div>
                <div className="theme-grid">
                  {entries.map(renderThemeTile)}
                  {family === 'custom' ? (
                    <button
                      data-theme={CUSTOM_THEME_ID}
                      data-mode={customPreview.mode}
                      className={`theme-card element-card is-custom ${
                        settings.themeId === CUSTOM_THEME_ID ? 'is-active' : ''
                      }`}
                      style={
                        {
                          '--tile-accent': settings.customTheme.accent,
                          '--tile-soft': settings.customTheme.accentSoft,
                          '--tile-bg': customPreview.tokens.bg,
                          '--tile-surface': customPreview.tokens.surface,
                          '--tile-ink': customPreview.tokens.ink,
                        } as CSSProperties
                      }
                      onClick={() => {
                        setCustomOpen(true);
                        applyTheme(CUSTOM_THEME_ID, settings.customTheme.name);
                      }}
                      aria-pressed={settings.themeId === CUSTOM_THEME_ID}
                    >
                      <span className="element-number mono">00</span>
                      <span className="element-symbol mono">Cx</span>
                      <span className="element-name">
                        {settings.customTheme.name || t('Custom')}
                      </span>
                      <span className="element-meta mono">
                        {t('CUSTOM')} ·{' '}
                        {t(customPreview.mode === 'dark' ? 'DARK' : 'LIGHT')}
                      </span>
                      <span
                        className="element-strip"
                        style={{
                          background: `linear-gradient(90deg, ${settings.customTheme.bg}, ${settings.customTheme.surface} 34%, ${settings.customTheme.accent} 72%, ${settings.customTheme.accentSoft})`,
                        }}
                      />
                      {settings.themeId === CUSTOM_THEME_ID ? (
                        <span className="theme-check">
                          <Icon name="check" size={13} />
                        </span>
                      ) : null}
                    </button>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>

        <div className="theme-gallery-section" id="theme-gallery">
          <div className="section-head">
            <h3>{t('Theme gallery')}</h3>
            <span className="mono muted-label">{t('PREVIEW BY FAMILY')}</span>
          </div>
          <p className="theme-gallery-intro">
            {t(
              'The periodic table above is the full catalogue. This gallery shows each family on a mock workspace first, so you can compare looks before committing.',
            )}
          </p>
          <ThemeGallery
            themeId={settings.themeId}
            onPick={(id, name) => applyTheme(id, name)}
          />
        </div>

        {customOpen ? (
          <section className="custom-theme-panel" id="custom-theme">
            <div className="section-head">
              <h3>{t('Custom theme')}</h3>
              <span className="mono muted-label">
                {t(customPreview.mode === 'dark' ? 'DARK' : 'LIGHT')} · {settings.customTheme.accent}
              </span>
            </div>
            <p className="custom-theme-copy">
              {t(
                'Pick a background, surface, two accents and text colour. Kryvex derives the raised, line and muted tones and switches light/dark automatically.',
              )}
            </p>
            <label className="custom-name-field">
              <span>{t('Name')}</span>
              <input
                value={settings.customTheme.name}
                maxLength={40}
                onChange={event => updateCustomTheme({ name: event.target.value })}
                aria-label={t('Theme name')}
              />
            </label>
            <div className="custom-color-grid">
              <ColorPicker
                label={t('Background')}
                value={settings.customTheme.bg}
                onChange={bg => updateCustomTheme({ bg })}
              />
              <ColorPicker
                label={t('Surface')}
                value={settings.customTheme.surface}
                onChange={surface => updateCustomTheme({ surface })}
              />
              <ColorPicker
                label={t('Accent')}
                value={settings.customTheme.accent}
                onChange={accent => updateCustomTheme({ accent })}
              />
              <ColorPicker
                label={t('Accent 2')}
                value={settings.customTheme.accentSoft}
                onChange={accentSoft => updateCustomTheme({ accentSoft })}
              />
              <ColorPicker
                label={t('Text')}
                value={settings.customTheme.ink}
                onChange={ink => updateCustomTheme({ ink })}
              />
            </div>
            <div className="custom-theme-actions">
              <button
                className="btn primary small"
                onClick={() => applyTheme(CUSTOM_THEME_ID, settings.customTheme.name)}
              >
                {t('Apply custom theme')}
              </button>
              <button
                className="btn secondary small"
                onClick={() => {
                  onUpdate({ customTheme: { ...DEFAULT_CUSTOM_THEME } });
                  onToast(t('Custom colours reset.'), 'info');
                }}
              >
                {t('Reset colours')}
              </button>
              <button className="link" onClick={() => setCustomOpen(false)}>
                {t('Hide')}
              </button>
            </div>
          </section>
        ) : null}

        </SettingsBlock>

        <SettingsBlock
          id="wallpaper"
          className="panel wallpaper-panel"
          title={t('Wallpaper')}
          meta={wallpaperStatus}
        >
          <p className="wallpaper-copy">
            {wallpaperOn
              ? t(
                  'A wash built from the active theme, or your own photo. The theme still paints the chrome, borders and accents over it.',
                )
              : t(
                  'Off by default, so the active theme paints the whole window. Turn it on for a theme-tinted wash or your own photo.',
                )}
          </p>
          <div className="setting-row wallpaper-toggle">
            <div>
              <strong>{t('Show a backdrop')}</strong>
              <p>{t('Sits behind the workspace. Nothing is downloaded; the image stays on this machine.')}</p>
            </div>
            <button
              className={`switch ${wallpaperOn ? 'is-on' : ''}`}
              role="switch"
              aria-checked={wallpaperOn}
              aria-label={t('Wallpaper')}
              onClick={() =>
                onUpdate({ wallpaper: { ...settings.wallpaper, enabled: !wallpaperOn } })
              }
            >
              <span />
            </button>
          </div>
          {wallpaperOn ? (
            <>
              <div className="wallpaper-sources" role="group" aria-label={t('Backdrop source')}>
                {(['gradient', 'image'] as WallpaperSource[]).map(source => (
                  <button
                    key={source}
                    className={`wallpaper-source ${settings.wallpaper.source === source ? 'is-active' : ''}`}
                    aria-pressed={settings.wallpaper.source === source}
                    onClick={() => onUpdate({ wallpaper: { ...settings.wallpaper, source } })}
                  >
                    {source === 'gradient' ? t('Theme wash') : t('My image')}
                  </button>
                ))}
              </div>
              <div className="wallpaper-row">
                <div
                  className={`wallpaper-preview ${settings.wallpaper.source === 'gradient' ? 'is-wash' : ''}`}
                  role={settings.wallpaper.source === 'gradient' ? 'img' : undefined}
                  aria-label={
                    settings.wallpaper.source === 'gradient' ? t('Theme wash') : undefined
                  }
                >
                  {settings.wallpaper.source === 'gradient' ? null : wallpaper ? (
                    <img
                      src={wallpaper.dataUrl}
                      alt={t('Wallpaper preview')}
                      style={{ objectFit: settings.wallpaper.fit === 'contain' ? 'contain' : 'cover' }}
                    />
                  ) : (
                    <span className="mono">{t('No image')}</span>
                  )}
                </div>
                <div className="wallpaper-controls">
                  {settings.wallpaper.source === 'image' ? (
                    <div className="wallpaper-actions">
                      <label className="btn secondary small wallpaper-pick">
                        <input
                          type="file"
                          accept={WALLPAPER_ACCEPT}
                          onChange={event => {
                            const file = event.target.files?.[0];
                            event.target.value = '';
                            if (file) onPickWallpaper(file);
                          }}
                        />
                        <Icon name="image" size={14} />
                        {wallpaper ? t('Replace image') : t('Choose image')}
                      </label>
                      {wallpaper ? (
                        <button className="btn ghost small" onClick={onClearWallpaper}>
                          {t('Remove')}
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <p className="wallpaper-note">
                      {t('Follows the active theme, so it changes with every theme you pick.')}
                    </p>
                  )}
                  <label className="wallpaper-slider">
                    <span>{t('Veil')}</span>
                    <input
                      type="range"
                      min={0}
                      max={90}
                      step={1}
                      value={settings.wallpaper.veil}
                      onChange={event =>
                        onUpdate({
                          wallpaper: { ...settings.wallpaper, veil: Number(event.target.value) },
                        })
                      }
                    />
                    <span className="mono">{settings.wallpaper.veil}%</span>
                  </label>
                  {settings.wallpaper.source === 'image' ? (
                    <div className="wallpaper-fits" role="group" aria-label={t('Fill')}>
                      {(['cover', 'contain', 'tile'] as WallpaperFit[]).map(fit => (
                        <button
                          key={fit}
                          className={`wallpaper-fit ${settings.wallpaper.fit === fit ? 'is-active' : ''}`}
                          aria-pressed={settings.wallpaper.fit === fit}
                          onClick={() => onUpdate({ wallpaper: { ...settings.wallpaper, fit } })}
                        >
                          {t(FIT_LABELS[fit])}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </SettingsBlock>

      <SettingsBlock
        title="Vexium"
        icon="spark"
        className="assistant-settings panel"
        id="assistant"
        forceOpen={focusAssistant}
        sectionRef={assistantRef}
        meta={
          runtime.status === 'online'
            ? t('ONLINE')
            : runtime.status === 'checking'
              ? t('CHECKING')
              : runtime.status === 'unavailable'
                ? t('DESKTOP ONLY')
                : t('OFFLINE')
        }
      >
        <p className="setting-copy">
          {t(
            'Connect a model server running on this machine. Kryvex sends prompts only to that loopback address, stores no key and ships no weights.',
          )}
        </p>

        <div className="setting-row">
          <div>
            <strong>{t('Runtime')}</strong>
            <p>{t('Ollama serves on port 11434, LM Studio on 1234. Only loopback http addresses are accepted.')}</p>
          </div>
          <div className="assistant-providers" role="group" aria-label={t('Runtime')}>
            {(['ollama', 'lmstudio', 'local'] as const).map(provider => (
              <button
                key={provider}
                className={`assistant-provider-btn ${settings.assistant.provider === provider ? 'is-active' : ''}`}
                aria-pressed={settings.assistant.provider === provider}
                onClick={() =>
                  onUpdate({
                    assistant: {
                      provider,
                      // A model file lives on a port picked at launch; use the
                      // running server's address when there is one.
                      baseUrl:
                        provider === 'local' && model?.phase === 'running' && model.baseUrl
                          ? model.baseUrl
                          : ASSISTANT_PROVIDER_URL[provider],
                      model: '',
                    },
                  })
                }
              >
                {provider === 'ollama'
                  ? 'OLLAMA'
                  : provider === 'lmstudio'
                    ? 'LM STUDIO'
                    : t('MODEL FILE')}
              </button>
            ))}
          </div>
        </div>

        <div className="setting-row">
          <div>
            <strong>{t('Address')}</strong>
            <p>{t('Loopback only. A hostname, https address or path is rejected.')}</p>
          </div>
          <div className="assistant-address">
            <input
              value={settings.assistant.baseUrl}
              spellCheck={false}
              aria-label={t('Runtime address')}
              onChange={event =>
                onUpdate({ assistant: { ...settings.assistant, baseUrl: event.target.value } })
              }
              onBlur={() => {
                const next = normalizeBaseUrl(settings.assistant.baseUrl);
                if (next) {
                  onUpdate({ assistant: { ...settings.assistant, baseUrl: next } });
                  return;
                }
                onUpdate({
                  assistant: {
                    ...settings.assistant,
                    baseUrl: ASSISTANT_PROVIDER_URL[settings.assistant.provider],
                  },
                });
                onToast(t('Use a loopback http address on 127.0.0.1 or localhost.'), 'warning');
              }}
            />
            <button
              className="btn ghost small"
              onClick={() =>
                onUpdate({
                  assistant: {
                    ...settings.assistant,
                    baseUrl: ASSISTANT_PROVIDER_URL[settings.assistant.provider],
                  },
                })
              }
            >
              {t('Reset address')}
            </button>
          </div>
        </div>

        <div className="setting-row">
          <div>
            <strong>{t('Model')}</strong>
            <p>
              {runtime.status === 'unavailable'
                ? t('Vexium needs the desktop app; the web preview has no loopback access.')
                : t('{count} models reported by the runtime.', { count: runtime.models.length })}
            </p>
          </div>
          <div className="assistant-address">
            <select
              value={settings.assistant.model}
              aria-label={t('Model')}
              onChange={event =>
                onUpdate({ assistant: { ...settings.assistant, model: event.target.value } })
              }
            >
              <option value="">{runtime.models[0] ?? t('No model selected')}</option>
              {runtime.models.map(name => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <button className="btn ghost small" onClick={runtime.refresh}>
              <Icon name="reload" size={12} /> {t('Refresh')}
            </button>
          </div>
        </div>

        <div className="local-model-block">
          <div className="custom-filters-head">
            <span className="mono privacy-kicker">{t('RUN A MODEL FILE')}</span>
            <span className={`mono shield-state ${model?.phase === 'running' ? 'is-ready' : ''}`}>
              {model
                ? t(model.phase.toUpperCase())
                : isElectron
                  ? t('IDLE')
                  : t('DESKTOP ONLY')}
            </span>
          </div>
          <p className="setting-copy">
            {t(
              'Pick a .gguf model you already downloaded. Kryvex starts llama.cpp on loopback and Vexium uses it like any other runtime. No weights are downloaded or hosted by us.',
            )}
          </p>

          <div className="setting-row">
            <div>
              <strong>{t('Model file')}</strong>
              <p className="mono local-model-path">
                {model?.path
                  ? model.path
                  : t('No model file chosen. A 4B–8B quantised model runs well on most machines.')}
              </p>
            </div>
            <div className="assistant-address">
              <button
                className="btn secondary small"
                disabled={!isElectron || modelBusy}
                onClick={() => void chooseModel()}
              >
                {t('Choose model…')}
              </button>
              <button
                className="btn ghost small"
                onClick={() => void window.kryvex?.openExternal(MODEL_SOURCES.huggingface)}
              >
                <Icon name="external" size={12} /> {t('Get models')}
              </button>
            </div>
          </div>

          <div className="setting-row">
            <div>
              <strong>{t('Runtime')}</strong>
              <p className="mono local-model-path">
                {model?.binary || 'llama-server'}
                {model && !model.binaryFound ? ` · ${t('not found')}` : ''}
              </p>
              <p>
                {t(
                  'Kryvex uses llama.cpp’s llama-server. If it is not on your PATH, point Kryvex at the executable once.',
                )}{' '}
                <button
                  className="link"
                  onClick={() => void window.kryvex?.openExternal(MODEL_SOURCES.runtime)}
                >
                  {t('Download llama.cpp')} <Icon name="external" size={11} />
                </button>
              </p>
            </div>
            <div className="assistant-address">
              <button
                className="btn ghost small"
                disabled={!isElectron || modelBusy}
                onClick={() => void chooseModelBinary()}
              >
                {t('Find runtime…')}
              </button>
              {model?.phase === 'running' ? (
                <button
                  className="btn secondary small"
                  disabled={modelBusy}
                  onClick={() => void stopModel()}
                >
                  {t('Stop server')}
                </button>
              ) : (
                <button
                  className="btn primary small"
                  disabled={!isElectron || modelBusy || !model?.path}
                  onClick={() => void startModel()}
                >
                  {modelBusy || model?.phase === 'starting' ? t('Starting…') : t('Start server')}
                </button>
              )}
            </div>
          </div>

          <div className="setting-row">
            <div>
              <strong>{t('Context window')}</strong>
              <p>
                {t(
                  'Tokens the model can hold. Larger needs more memory. A change applies the next time the server starts.',
                )}
              </p>
            </div>
            <div className="assistant-address">
              <input
                type="number"
                min={512}
                max={131072}
                step={512}
                value={model?.ctxSize ?? 4096}
                aria-label={t('Context window')}
                disabled={!isElectron || modelBusy}
                onChange={event => void configureModel({ ctxSize: Number(event.target.value) })}
              />
              <span className="mono local-model-hint">
                {t('GPU layers: {count}', { count: model?.gpuLayers ?? 999 })}
              </span>
            </div>
          </div>

          {model?.error ? (
            <p className="shield-note is-error">{model.error}</p>
          ) : null}
          {model?.phase === 'running' && model.baseUrl ? (
            <p className="shield-note mono">
              {t('Serving {name} at {url} — Vexium is pointed at it.', {
                name: model.name,
                url: model.baseUrl,
              })}
            </p>
          ) : null}
          {model?.log && model.phase === 'error' ? (
            <pre className="local-model-log mono">{model.log}</pre>
          ) : null}
          <p className="shield-note">
            {t(
              'Models are yours to source: Hugging Face GGUF builds, Ollama’s library, or LM Studio’s catalogue. Kryvex never uploads or redistributes them.',
            )}
          </p>
        </div>
      </SettingsBlock>

      <div className="settings-columns">
        <SettingsBlock
          className="panel shield-panel"
          title={t('Kryvex Shield')}
          icon="shield"
          meta={isElectron ? t((shield?.phase ?? 'STARTING').toUpperCase()) : t('DESKTOP ONLY')}
        >

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

              <div className="custom-filters">
                <div className="custom-filters-head">
                  <span className="mono privacy-kicker">{t('MY FILTERS')}</span>
                  <span className="mono custom-filter-count">
                    {t('{rules} active rules · {lines} lines', {
                      rules: shield.customRules.toLocaleString(locale),
                      lines: shield.customLines.toLocaleString(locale),
                    })}
                  </span>
                </div>
                <p className="shield-note">
                  {t(
                    'uBlock Origin syntax, one rule per line: ||ads.example.com^ blocks a request, example.com##.ad hides a selector, example.com##+js(…) runs a scriptlet. Applying recompiles from the cached lists, so no download is needed.',
                  )}
                </p>
                <textarea
                  className="custom-filter-editor"
                  value={filtersDraft}
                  spellCheck={false}
                  aria-label={t('Custom filter rules')}
                  placeholder={t('! Your rules go here\n||ads.example.com^\nwww.youtube.com##ytd-ad-slot-renderer')}
                  disabled={!isElectron}
                  onChange={event => {
                    setFiltersDraft(event.target.value);
                    setFiltersDirty(true);
                  }}
                />
                <div className="custom-filter-tools">
                  <button
                    className="btn primary small"
                    disabled={!isElectron || !filtersDirty || busy === 'filters'}
                    onClick={() => void saveFilters({ text: filtersDraft })}
                  >
                    {busy === 'filters' ? t('Applying…') : t('Apply changes')}
                  </button>
                  <button
                    className="btn ghost small"
                    disabled={!filtersDirty}
                    onClick={() => {
                      setFiltersDraft(shield.customFilters);
                      setFiltersDirty(false);
                    }}
                  >
                    {t('Revert')}
                  </button>
                  <button
                    className="btn secondary small"
                    disabled={!isElectron || busy === 'filters'}
                    onClick={() => void importFilters()}
                  >
                    {t('Import and append…')}
                  </button>
                  <button
                    className="btn secondary small"
                    disabled={!isElectron || !shield.customFilters || busy === 'filters'}
                    onClick={() => void exportFilters()}
                  >
                    {t('Export…')}
                  </button>
                </div>

                <div className="privacy-settings">
                  <div className="setting-row">
                    <div>
                      <strong>{t('Enable my custom filters')}</strong>
                      <p>{t('When off, the rules are kept but not compiled into the shield.')}</p>
                    </div>
                    <button
                      className={`switch ${shield.customEnabled ? 'is-on' : ''}`}
                      role="switch"
                      aria-checked={shield.customEnabled}
                      disabled={!isElectron || busy === 'filters'}
                      onClick={() => void saveFilters({ enabled: !shield.customEnabled })}
                    >
                      <span />
                    </button>
                  </div>
                  <div className="setting-row">
                    <div>
                      <strong>{t('Allow scriptlet rules (+js)')}</strong>
                      <p>
                        {t(
                          'Scriptlets run small scripts in the page to switch off ad-block popups. Kryvex implements uBO’s set and set-constant; other scriptlet names are ignored. Rules using them are skipped while this is off.',
                        )}
                      </p>
                    </div>
                    <button
                      className={`switch ${shield.customScriptlets ? 'is-on' : ''}`}
                      role="switch"
                      aria-checked={shield.customScriptlets}
                      disabled={!isElectron || busy === 'filters'}
                      onClick={() => void saveFilters({ scriptlets: !shield.customScriptlets })}
                    >
                      <span />
                    </button>
                  </div>
                  <div className="setting-row">
                    <div>
                      <strong>{t('YouTube: block ads and feed noise')}</strong>
                      <p>
                        {t(
                          'Hides ad slots, sponsored feed cards and recommendation shelves on youtube.com, switches off the ad-block popup, and blocks three ad hosts on that site only.',
                        )}
                      </p>
                    </div>
                    <button
                      className={`switch ${shield.youtube ? 'is-on' : ''}`}
                      role="switch"
                      aria-checked={shield.youtube}
                      disabled={!isElectron || busy === 'filters'}
                      onClick={() => void saveFilters({ youtube: !shield.youtube })}
                    >
                      <span />
                    </button>
                  </div>
                </div>

                {shield.customSkipped > 0 ? (
                  <p className="shield-note is-error">
                    {t('{count} rule(s) are on hold until scriptlet rules are allowed.', {
                      count: shield.customSkipped,
                    })}
                  </p>
                ) : null}
                {filtersDirty ? (
                  <p className="shield-note">
                    {t('Unapplied edits. Nothing is compiled until you apply.')}
                  </p>
                ) : null}
              </div>

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
        </SettingsBlock>

        <SettingsBlock
          className="panel"
          title={t('Extensions')}
          meta={t('{count} INSTALLED', { count: extensions.length })}
        >

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
        </SettingsBlock>

        <SettingsBlock
          className="panel panel-wide updates-panel"
          id="updates"
          sectionRef={updatesRef}
          forceOpen={focusUpdates}
          title={t('Updates')}
          meta={
            update
              ? `v${update.currentVersion} · ${t('BUILD')} ${update.mode.toUpperCase()}`
              : t('DESKTOP ONLY')
          }
        >

          {isElectron ? (
            <>
              <div className={`update-status is-${updatePhase}`} aria-live="polite">
                <div className="update-status-head">
                  <strong>{updateTitle}</strong>
                  {updatePhase === 'current' ? (
                    <span className="update-verdict is-current" data-testid="update-up-to-date">
                      <Icon name="check" size={12} />
                      {t('UP TO DATE')}
                    </span>
                  ) : null}
                </div>
                <p>{updateDetail}</p>
                {updatePhase === 'available' && update?.releaseName ? (
                  <p className="mono update-release-name">{update.releaseName}</p>
                ) : null}
                {update?.notes && (updatePhase === 'available' || updatePhase === 'ready') ? (
                  <p className="update-notes">{update.notes}</p>
                ) : null}
                {updatePhase === 'downloading' ? (
                  <div
                    className="update-progress"
                    role="progressbar"
                    aria-label={t('Download progress')}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={updatePercent}
                  >
                    <span style={{ width: `${updatePercent}%` }} />
                  </div>
                ) : null}
              </div>

              <div className="update-actions">
                {updatePhase === 'idle' || updatePhase === 'current' || updatePhase === 'error' ? (
                  <button className="btn primary small" onClick={onCheckUpdate}>
                    <Icon name="reload" size={13} />
                    {t('Check for updates')}
                  </button>
                ) : null}
                {updatePhase === 'checking' ? (
                  <button className="btn primary small" disabled>
                    {t('Checking…')}
                  </button>
                ) : null}
                {updatePhase === 'available' && update?.mode !== 'source' ? (
                  <button
                    className="btn primary small"
                    onClick={onDownloadUpdate}
                    disabled={!update?.assetName}
                  >
                    <Icon name="download" size={13} />
                    {t('Download update')}
                  </button>
                ) : null}
                {updatePhase === 'available' && update?.mode === 'source' ? (
                  <button className="btn primary small" onClick={onOpenRelease}>
                    <Icon name="external" size={13} />
                    {t('Open release page')}
                  </button>
                ) : null}
                {updatePhase === 'downloading' ? (
                  <button className="btn primary small" disabled>
                    {t('Downloading…')}
                  </button>
                ) : null}
                {updatePhase === 'ready' && update?.canInstall ? (
                  <button className="btn primary small" onClick={onInstallUpdate}>
                    <Icon name="reload" size={13} />
                    {t('Install and restart')}
                  </button>
                ) : null}
                {updatePhase === 'ready' && !update?.canInstall ? (
                  <button className="btn primary small" onClick={onRevealUpdate}>
                    <Icon name="folder" size={13} />
                    {t('Show downloaded file')}
                  </button>
                ) : null}
                {updatePhase === 'installing' ? (
                  <button className="btn primary small" disabled>
                    {t('Installing…')}
                  </button>
                ) : null}
                <button className="btn secondary small" onClick={onOpenRelease}>
                  <Icon name="external" size={13} />
                  {t('View release')}
                </button>
                {(updatePhase === 'available' || updatePhase === 'ready') && (
                  <button className="link" onClick={onCheckUpdate}>
                    {t('Check again')}
                  </button>
                )}
              </div>

              <div className="setting-row">
                <div>
                  <strong>{t('Check for updates automatically')}</strong>
                  <p>
                    {t(
                      'Ask GitHub shortly after launch and every six hours. Downloads never start without you.',
                    )}
                  </p>
                </div>
                <button
                  className={`switch ${settings.autoCheckUpdates ? 'is-on' : ''}`}
                  role="switch"
                  aria-checked={settings.autoCheckUpdates}
                  onClick={() => onUpdate({ autoCheckUpdates: !settings.autoCheckUpdates })}
                >
                  <span />
                </button>
              </div>

              <p className="shield-note">
                {t(
                  'Installed builds can replace themselves with a checksum-verified release installer. Portable builds download and verify the EXE, then ask you to run it. A git checkout is never modified.',
                )}
              </p>
            </>
          ) : (
            <p className="shield-note">{t('Available in the Windows app.')}</p>
          )}
        </SettingsBlock>
      </div>

      <SettingsBlock
        className="panel panel-wide rooms-settings"
        id="rooms"
        title={t('Rooms')}
        icon="users"
        meta={t('PEER TO PEER')}
      >
        <p className="settings-copy">
          {t(
            'Rooms have no account and no Kryvex server. Chat, presence and shared screens travel directly between peers; only the WebRTC handshake uses the relays below.',
          )}
        </p>

        <div className="room-settings-grid">
          <div>
            <label className="room-field">
              <span>{t('Display name')}</span>
              <input
                value={settings.party.displayName}
                maxLength={24}
                placeholder={t('Guest')}
                aria-label={t('Display name')}
                onChange={event =>
                  onUpdate({
                    party: { ...settings.party, displayName: sanitizeDisplayName(event.target.value) },
                  })
                }
              />
            </label>
            <div className="room-colors" role="group" aria-label={t('Your colour')}>
              {PEER_COLORS.map(swatch => (
                <button
                  key={swatch}
                  className={`room-swatch ${
                    (settings.party.color || PEER_COLORS[0]) === swatch ? 'is-active' : ''
                  }`}
                  style={{ background: swatch }}
                  aria-label={t('Use {color}', { color: swatch })}
                  aria-pressed={(settings.party.color || PEER_COLORS[0]) === swatch}
                  onClick={() => onUpdate({ party: { ...settings.party, color: swatch } })}
                />
              ))}
            </div>
          </div>

          <label className="room-field">
            <span>{t('Signaling relays')}</span>
            <textarea
              key={settings.party.trackers.join('|')}
              rows={3}
              spellCheck={false}
              defaultValue={settings.party.trackers.join('\n')}
              aria-label={t('Signaling relays')}
              onBlur={event => {
                const trackers = sanitizeTrackers(event.target.value);
                onUpdate({
                  party: {
                    ...settings.party,
                    trackers: trackers.length > 0 ? trackers : [...DEFAULT_TRACKERS],
                  },
                });
              }}
            />
            <em className="mono room-field-note">
              {t('wss:// only · public WebTorrent trackers by default')}
            </em>
          </label>

          <label className="room-field">
            <span>{t('STUN / TURN')}</span>
            <textarea
              key={settings.party.iceServers.join('|')}
              rows={3}
              spellCheck={false}
              defaultValue={settings.party.iceServers.join('\n')}
              aria-label={t('STUN / TURN')}
              onBlur={event => {
                const servers = sanitizeIceServers(event.target.value);
                onUpdate({
                  party: {
                    ...settings.party,
                    iceServers: servers.length > 0 ? servers : [...DEFAULT_ICE_SERVERS],
                  },
                });
              }}
            />
            <em className="mono room-field-note">
              {t('One per line · add a TURN relay if a peer cannot connect')}
            </em>
          </label>
        </div>
      </SettingsBlock>

      <div className="settings-columns">
        <SettingsBlock className="panel" title={t('Workspace')}>

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
              <option value="assistant">Vexium</option>
              <option value="rooms">{t('Rooms')}</option>
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
        </SettingsBlock>

        <SettingsBlock className="panel browser-settings-panel" title={t('Browser')}>

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

          <div className="setting-row column">
            <div>
              <strong>{t('Search engine')}</strong>
              <p>
                {t('Used when the address bar is not a URL. Choose a region to narrow the list.')}
              </p>
            </div>
            <div className="search-engine-picker">
              <select
                value={settings.searchRegion}
                onChange={event => {
                  const region = event.target.value as SettingsModel['searchRegion'];
                  const available = enginesForRegion(region);
                  const keep = available.some(engine => engine.id === settings.searchEngine);
                  onUpdate({
                    searchRegion: region,
                    // A regional list narrows the picker; never leave a select
                    // showing a value it cannot display.
                    ...(keep ? {} : { searchEngine: available[0]?.id ?? 'duckduckgo' }),
                  });
                }}
                aria-label={t('Search region')}
              >
                {SEARCH_REGIONS.map(region => (
                  <option key={region.id} value={region.id}>
                    {region.id === 'global' ? t(region.label) : `${t(region.label)} — ${t(region.hint)}`}
                  </option>
                ))}
              </select>
              <select
                value={settings.searchEngine}
                onChange={event =>
                  onUpdate({ searchEngine: event.target.value as SettingsModel['searchEngine'] })
                }
                aria-label={t('Search engine')}
              >
                {engineGroups(settings.searchRegion).map(group => (
                  <optgroup key={group.label} label={t(group.label)}>
                    {group.engines.map(engine => (
                      <option key={engine.id} value={engine.id}>
                        {engine.name} · {engine.host} — {t(engine.purpose)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <span className="mono search-engine-note">
              {searchEngine(settings.searchEngine).host}
            </span>
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

          <div className="setting-row">
            <div>
              <strong>{t('Chromium engine')}</strong>
              <p>
                {engineChanged > 0
                  ? t('{count} preferences differ from the Chromium defaults.', {
                      count: engineChanged,
                    })
                  : t('Scripts, images, GPU, zoom and theming for every embedded page.')}
              </p>
            </div>
            <button
              className="btn secondary small"
              onClick={() => {
                const section = document.getElementById('chromium');
                // The section folds by default now, so Configure has to open
                // it as well as bring it into view.
                if (section?.dataset.open === 'false') {
                  section.querySelector<HTMLButtonElement>('.settings-block-toggle')?.click();
                }
                section?.scrollIntoView({ block: 'start', behavior: 'smooth' });
              }}
            >
              <Icon name="sliders" size={13} />
              {t('Configure')}
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
        </SettingsBlock>

        <SettingsBlock
          className="panel panel-wide engine-panel"
          id="chromium"
          title={t('Chromium engine')}
          icon="globe"
          meta={engine ? `CHROMIUM ${engine.chrome.split('.')[0]}` : t('DESKTOP ONLY')}
        >
          <p className="settings-copy">
            {t(
              'These are the switches and page preferences of the embedded Chromium itself, applied to service apps and browser tabs alike.',
            )}
          </p>

          <div className="engine-groups">
            <section className="engine-group">
              <span className="mono engine-group-label">
                {t('AT LAUNCH')} · {t('RESTART REQUIRED')}
              </span>
              {renderEngineSwitch(
                'hardwareAcceleration',
                'Hardware acceleration',
                'Draw pages on the GPU. Off falls back to software rendering and takes effect at the next launch.',
              )}
              {renderEngineSwitch(
                'smoothScrolling',
                'Smooth scrolling',
                'Animated scrolling in the shell and every page. Off applies at the next launch.',
              )}
            </section>

            <section className="engine-group">
              <span className="mono engine-group-label">
                {t('PAGE CONTENT')} · {t('REBUILD TO APPLY')}
              </span>
              {renderEngineSwitch(
                'javascript',
                'JavaScript',
                'Scripts in embedded pages. Off leaves pages static, including sign-in forms and chat.',
              )}
              {renderEngineSwitch(
                'images',
                'Images',
                'Load images automatically. Off saves data and shows alt text instead.',
              )}
              {renderEngineSwitch(
                'webgl',
                'WebGL',
                '3D canvas and WebGL contexts. Off blocks 3D content and some map views.',
              )}
              {renderEngineSwitch(
                'pdfViewer',
                'Built-in PDF viewer',
                'Open PDFs in Chromium instead of downloading the file.',
              )}
              {renderEngineSwitch(
                'autoplay',
                'Autoplay with sound',
                'Let pages start media without a click. Off waits for an interaction.',
              )}
              {renderEngineSwitch(
                'backgroundThrottling',
                'Throttle hidden pages',
                'Slow timers in pages you are not looking at. Off keeps background calls and feeds live at a higher battery cost.',
              )}
              {renderEngineSwitch(
                'spellcheck',
                'Spellcheck',
                'Chromium spellcheck in the text fields of embedded pages.',
              )}
            </section>

            <section className="engine-group">
              <span className="mono engine-group-label">{t('RENDERING')}</span>
              <div className="setting-row" data-engine="colorScheme">
                <div>
                  <strong>{t('Preferred colour scheme')}</strong>
                  <p>
                    {t(
                      'Which theme pages are told you prefer through prefers-color-scheme. Applied immediately, without a reload.',
                    )}
                  </p>
                </div>
                <select
                  value={settings.chromium.colorScheme}
                  aria-label={t('Preferred colour scheme')}
                  disabled={!isElectron}
                  onChange={event =>
                    applyChromium({
                      colorScheme: event.target.value as ChromiumSettings['colorScheme'],
                    })
                  }
                >
                  <option value="system">{t('Follow the system')}</option>
                  <option value="light">{t('Light')}</option>
                  <option value="dark">{t('Dark')}</option>
                </select>
              </div>
              <div className="setting-row" data-engine="defaultZoom">
                <div>
                  <strong>{t('Default page zoom')}</strong>
                  <p>
                    {t(
                      'Starting zoom for sites you have not opened before. A site keeps the zoom you last used, and the toolbar changes the current tab only.',
                    )}
                  </p>
                </div>
                <select
                  value={String(settings.chromium.defaultZoom)}
                  aria-label={t('Default page zoom')}
                  disabled={!isElectron}
                  onChange={event => applyChromium({ defaultZoom: Number(event.target.value) })}
                >
                  {CHROMIUM_ZOOM_STEPS.map(step => (
                    <option key={step} value={String(step)}>
                      {zoomLabel(step)}
                    </option>
                  ))}
                </select>
              </div>
            </section>
          </div>

          <div className="engine-report" aria-live="polite">
            <div>
              <span className="mono">{t('GRAPHICS')}</span>
              <strong>
                {engine ? (engine.accelerated ? t('Hardware') : t('Software')) : '—'}
              </strong>
            </div>
            <div>
              <span className="mono">{t('COMPOSITING')}</span>
              <strong className="mono">{engine?.gpu.compositing || '—'}</strong>
            </div>
            <div>
              <span className="mono">{t('LIVE PAGES')}</span>
              <strong>{engine?.guests.length ?? 0}</strong>
            </div>
            <div>
              <span className="mono">{t('CHROMIUM')}</span>
              <strong className="mono">{engine?.chrome ?? info?.chrome ?? '—'}</strong>
            </div>
          </div>

          <p className="shield-note mono engine-switches">
            {engine && engine.switches.length > 0
              ? engine.switches.join(' · ')
              : t('No launch switches — every Chromium default is in effect.')}
          </p>

          <div className="engine-actions">
            <button className="btn secondary small" disabled={!isElectron} onClick={rebuildPages}>
              <Icon name="reload" size={13} />
              {t('Rebuild open pages')}
            </button>
            <span className="mono engine-hint">
              {t('Launch changes apply after a restart.')}
            </span>
          </div>
        </SettingsBlock>

        <SettingsBlock
          className="panel panel-wide services-settings-panel"
          title={t('Service apps')}
        >

          <div className="setting-row">
            <div>
              <strong>{t('Desktop notifications')}</strong>
              <p>
                {t(
                  'Installed services can raise native notifications and taskbar alerts, like the desktop app they replace. Browser tabs stay blocked. Reload an open service to apply a change.',
                )}
              </p>
            </div>
            <button
              className={`switch ${settings.serviceNotifications ? 'is-on' : ''}`}
              role="switch"
              aria-checked={settings.serviceNotifications}
              onClick={() => onUpdate({ serviceNotifications: !settings.serviceNotifications })}
            >
              <span />
            </button>
          </div>

          <div className="setting-row">
            <div>
              <strong>{t('Apps stay running')}</strong>
              <p>
                {t(
                  'An opened service keeps its connection, call and scroll position while you work elsewhere in Kryvex. Only closing the app or clearing its session ends it.',
                )}
              </p>
            </div>
            <code className="mono code-line">persist:svc-*</code>
          </div>

          <div className="setting-row column">
            <div>
              <strong>{t('Sign-in popups')}</strong>
              <p>
                {t(
                  'OAuth and passkey flows open in a sandboxed child window on the same service session. Other popups are sent to your default browser.',
                )}
              </p>
            </div>
          </div>

          <p className="shield-note">
            {t(
              'Clear one service’s cookies and storage from the lock button in its toolbar. Removing a module never deletes its session; clearing is always explicit.',
            )}
          </p>
        </SettingsBlock>
      </div>

      <SettingsBlock
        className="panel panel-wide home-settings-panel"
        id="home-board"
        title={t('Home board')}
        icon="home"
        meta={settings.home.showBoard ? t('ON') : t('OFF')}
      >
        <p className="settings-copy">
          {t(
            'A transparent overlay on Home: clock, local weather, sticky tasks and a short board guide. Every widget can be hidden independently.',
          )}
        </p>
        <div className="setting-row">
          <div>
            <strong>{t('Show the Home board')}</strong>
            <p>{t('Sits over the theme with a translucent pane instead of replacing it.')}</p>
          </div>
          <button
            className={`switch ${settings.home.showBoard ? 'is-on' : ''}`}
            role="switch"
            aria-checked={settings.home.showBoard}
            onClick={() => onUpdate({ home: { ...settings.home, showBoard: !settings.home.showBoard } })}
          >
            <span />
          </button>
        </div>
        <div className="home-widget-toggles">
          {(
            [
              ['showWeather', 'Weather'],
              ['showTasks', 'Sticky tasks'],
              ['showGuide', 'Board guide'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={`chip-btn ${settings.home[key] ? 'is-active' : ''}`}
              aria-pressed={settings.home[key]}
              disabled={!settings.home.showBoard}
              onClick={() => onUpdate({ home: { ...settings.home, [key]: !settings.home[key] } })}
            >
              {t(label)}
            </button>
          ))}
        </div>
        <div className="setting-row">
          <div>
            <strong>{t('Temperature unit')}</strong>
            <p>{t('The city itself is set on the weather card, where it can be checked.')}</p>
          </div>
          <div className="segmented" role="radiogroup" aria-label={t('Temperature unit')}>
            {(['c', 'f'] as const).map(unit => (
              <button
                key={unit}
                role="radio"
                aria-checked={settings.home.unit === unit}
                className={settings.home.unit === unit ? 'is-active' : ''}
                onClick={() => onUpdate({ home: { ...settings.home, unit } })}
              >
                °{unit.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <p className="shield-note">
          {t(
            'Weather is fetched by the main process from Open-Meteo with no key. Only the place you choose is sent: a city name on lookup, then its coordinates when the card refreshes. Tasks never leave this device.',
          )}
        </p>
      </SettingsBlock>

      <SettingsBlock
        className="panel panel-wide resources-settings-panel"
        id="resources"
        title={t('Resource manager')}
        icon="monitor"
        forceOpen={focusResources}
        sectionRef={resourcesRef}
        meta={settings.resources.enabled ? t('LIVE') : t('OFF')}
      >
        <p className="settings-copy">
          {t(
            'Shows which service pages are using CPU and memory, plus the whole-app totals. Values come from Electron’s own process metrics, sampled only while the monitor is visible.',
          )}
        </p>
        <div className="setting-row">
          <div>
            <strong>{t('Enable the resource manager')}</strong>
            <p>{t('Adds an Activity button to the header and a detailed pop-up panel.')}</p>
          </div>
          <button
            className={`switch ${settings.resources.enabled ? 'is-on' : ''}`}
            role="switch"
            aria-checked={settings.resources.enabled}
            onClick={() =>
              onUpdate({ resources: { ...settings.resources, enabled: !settings.resources.enabled } })
            }
          >
            <span />
          </button>
        </div>
        <div className="setting-row">
          <div>
            <strong>{t('Usage bars in the sidebar')}</strong>
            <p>{t('CPU, memory and GPU-process bars under your pinned services.')}</p>
          </div>
          <button
            className={`switch ${settings.resources.sidebar ? 'is-on' : ''}`}
            role="switch"
            aria-checked={settings.resources.sidebar}
            disabled={!settings.resources.enabled}
            onClick={() =>
              onUpdate({ resources: { ...settings.resources, sidebar: !settings.resources.sidebar } })
            }
          >
            <span />
          </button>
        </div>
        <p className="shield-note">
          {t(
            'Windows does not expose total GPU utilization to Electron, so the GPU figure is the Chromium GPU process’s CPU and memory rather than a device-wide percentage.',
          )}
        </p>
      </SettingsBlock>

      <SettingsBlock
        className="panel panel-wide network-panel"
        id="network"
        title={t('Network')}
        icon="lock"
        meta={
          vpnState
            ? t(
                vpnState.phase === 'connected'
                  ? 'VPN CONNECTED'
                  : vpnState.phase === 'connecting'
                    ? 'VPN CONNECTING'
                    : vpnState.phase === 'error'
                      ? 'VPN ERROR'
                      : vpnState.phase === 'missing'
                        ? 'VPN NOT SET UP'
                        : 'VPN OFF',
              )
            : t('VPN OFF')
        }
      >
        <p className="settings-copy">
          {t(
            'Point Kryvex at your own OpenVPN executable and .ovpn profile, then start and stop the tunnel here. Kryvex bundles no VPN binary or driver and never reroutes traffic silently.',
          )}
        </p>
        <div className="setting-row">
          <div>
            <strong>{t('Use OpenVPN')}</strong>
            <p>{t('Enables the controls below. The tunnel only starts when you press Connect.')}</p>
          </div>
          <button
            className={`switch ${settings.vpn.enabled ? 'is-on' : ''}`}
            role="switch"
            aria-checked={settings.vpn.enabled}
            onClick={() => {
              const next = !settings.vpn.enabled;
              patchVpn({ enabled: next });
              // Turning the switch off is an explicit stop, not just a hidden
              // control: an already-running tunnel must not outlive it.
              if (
                !next &&
                (vpnState?.phase === 'connected' || vpnState?.phase === 'connecting')
              ) {
                void vpnAction('disconnect');
              }
            }}
          >
            <span />
          </button>
        </div>

        <div className="vpn-grid">
          <div className="vpn-field">
            <span>{t('OpenVPN executable')}</span>
            <code className="mono code-line" title={settings.vpn.binaryPath}>
              {settings.vpn.binaryPath || t('Not chosen')}
            </code>
            <button
              className="btn secondary small"
              disabled={!isElectron || Boolean(busy)}
              onClick={() => void vpnAction('binary')}
            >
              <Icon name="folder" size={13} /> {t('Choose executable')}
            </button>
          </div>
          <div className="vpn-field">
            <span>{t('OpenVPN profile')}</span>
            <code className="mono code-line" title={settings.vpn.configPath}>
              {settings.vpn.configPath || t('Not chosen')}
            </code>
            <button
              className="btn secondary small"
              disabled={!isElectron || Boolean(busy)}
              onClick={() => void vpnAction('config')}
            >
              <Icon name="folder" size={13} /> {t('Choose profile')}
            </button>
          </div>
          <label className="vpn-field">
            <span>{t('Extra OpenVPN arguments')}</span>
            <input
              value={settings.vpn.extraArgs}
              onChange={event => patchVpn({ extraArgs: event.target.value })}
              placeholder="--proto udp --port 1194"
              maxLength={500}
            />
            <em className="mono">{t('Flags that run another program are refused.')}</em>
          </label>
          <label className="vpn-field">
            <span>{t('DNS servers')}</span>
            <input
              value={settings.vpn.dns}
              onChange={event => patchVpn({ dns: event.target.value })}
              placeholder="1.1.1.1, 9.9.9.9"
              maxLength={200}
            />
            <em className="mono">{t('Passed to OpenVPN as --dhcp-option DNS entries.')}</em>
          </label>
          <label className="vpn-field">
            <span>{t('Proxy')}</span>
            <input
              value={settings.vpn.proxy}
              onChange={event => patchVpn({ proxy: event.target.value })}
              placeholder="socks5://127.0.0.1:1080"
              maxLength={300}
            />
            <em className="mono">{t('Optional http, https or socks5 proxy used by OpenVPN.')}</em>
          </label>
          <div className="vpn-field">
            <span>{t('Connect on launch')}</span>
            <button
              className={`switch ${settings.vpn.autoConnect ? 'is-on' : ''}`}
              role="switch"
              aria-checked={settings.vpn.autoConnect}
              disabled={!settings.vpn.enabled}
              onClick={() => patchVpn({ autoConnect: !settings.vpn.autoConnect })}
            >
              <span />
            </button>
          </div>
        </div>

        <div className="vpn-actions">
          <span className={`mono vpn-state is-${vpnState?.phase ?? 'idle'}`}>{vpnState?.detail ?? t('No tunnel is running.')}</span>
          <div>
            <button
              className="btn primary small"
              disabled={
                !isElectron ||
                !settings.vpn.enabled ||
                !settings.vpn.binaryPath ||
                !settings.vpn.configPath ||
                Boolean(busy) ||
                vpnState?.phase === 'connected' ||
                vpnState?.phase === 'connecting'
              }
              onClick={() => void vpnAction('connect')}
            >
              {busy === 'vpn-connect' ? t('Connecting…') : t('Connect')}
            </button>
            <button
              className="btn ghost small"
              disabled={!isElectron || Boolean(busy) || !vpnState || vpnState.phase === 'idle'}
              onClick={() => void vpnAction('disconnect')}
            >
              {t('Disconnect')}
            </button>
            <button
              className="link"
              onClick={() => void window.kryvex?.openExternal('https://github.com/OpenVPN/openvpn')}
            >
              {t('OpenVPN project')} <Icon name="external" size={11} />
            </button>
          </div>
        </div>
        {vpnState?.log ? <pre className="vpn-log mono">{vpnState.log}</pre> : null}
        <p className="shield-note">
          {t(
            'A tunnel needs the OpenVPN TAP/TUN driver and, on Windows, usually administrator rights. Kryvex reports OpenVPN’s own output and stops the process when you disconnect or quit.',
          )}
        </p>
      </SettingsBlock>

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
              {t('Reset address')}
            </button>
          </div>
        </section>

        <section className="settings-block panel about-panel">
          <div className="about-head">
            {mark === 'kx' ? (
              <img src={logoUrl} width={72} height={72} alt={t('Kryvex element tile')} />
            ) : (
              <span className="about-mark">
                <ThemeMark mark={mark} size={72} variant="tile" />
              </span>
            )}
            <div>
              <h2>Kryvex</h2>
              <p className="mono">
                {mark === 'donkey'
                  ? `${t('Special Donkey Edition')} · `
                  : mark === 'xion'
                    ? `${t('Special XiØN Edition')} · `
                    : `${t('ELEMENT x529 · Kx')} · `}
                v{info?.version ?? '0.7.0'}
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
                aria-label={t('{name} on GitHub', { name: 'XiONDiGiTaL' })}
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
                aria-label={t('{name} on GitHub', { name: 'player529' })}
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
