import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../lib/i18n';
import { formatBytes } from '../lib/lexium';
import { ElementMark } from '../components/ElementMark';
import { Icon, Modal } from '../components/ui';
import type { DiskSettings } from '../types';

/**
 * Secret storage tool.
 *
 * The page itself never touches the filesystem: it asks the main process for
 * health, a scan and a clean. Cleaning sends target ids only, and the main
 * process re-reads the allowlist before every unlink, so a compromised renderer
 * cannot widen the scope.
 */

interface DiskHealth {
  available: boolean;
  drive: string;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usedPercent: number;
  checkedAt: number;
  message?: string;
}

interface DiskTargetResult {
  id: string;
  label: string;
  detail: string;
  risk: 'safe' | 'caution';
  bytes: number;
  fileCount: number;
  available: boolean;
  selectedByDefault: boolean;
  requiresElevation: boolean;
}

interface DiskFolderEntry {
  name: string;
  path: string;
  bytes: number;
  directory: boolean;
}

interface DiskScanResult {
  ok: boolean;
  health: DiskHealth;
  targets: DiskTargetResult[];
  folders: DiskFolderEntry[];
  scannedAt: number;
  cancelled: boolean;
  message?: string;
}

interface DiskCleanResult {
  ok: boolean;
  freedBytes: number;
  removedFiles: number;
  skipped: number;
  targets: Array<{ id: string; label: string; bytes: number; removed: number }>;
  errors: string[];
  cancelled: boolean;
  message?: string;
}

interface DiskBridge {
  diskHealth: () => Promise<DiskHealth | null>;
  diskScan: () => Promise<DiskScanResult | null>;
  diskClean: (ids: string[]) => Promise<DiskCleanResult | null>;
  diskCancel: () => Promise<boolean>;
}

function bridge(): DiskBridge | null {
  const api = (window as unknown as { kryvex?: Partial<DiskBridge> }).kryvex;
  if (!api?.diskHealth || !api.diskScan || !api.diskClean || !api.diskCancel) return null;
  return api as DiskBridge;
}

/** A heart-rate trace whose amplitude follows how full the drive is. */
function pulsePath(percent: number): string {
  const base = 58;
  const spike = 12 + Math.min(100, Math.max(0, percent)) * 0.26;
  const beat = () =>
    `h10 l3 -${spike * 0.35} l4 ${spike * 0.55} l4 -${spike} l4 ${spike * 0.7} l3 -${spike * 0.2} h14`;
  return `M0 ${base} h18 ${beat()} ${beat()} h42`;
}

function severity(percent: number): 'calm' | 'warm' | 'hot' {
  if (percent >= 90) return 'hot';
  if (percent >= 75) return 'warm';
  return 'calm';
}

export function DiskPulse({
  settings,
  onUpdate,
  onBack,
  onToast,
  embedded = false,
}: {
  settings: DiskSettings;
  onUpdate: (patch: Partial<DiskSettings>) => void;
  onBack: () => void;
  onToast: (message: string, tone?: 'info' | 'success' | 'warning' | 'danger') => void;
  /** Rendered inside a Workspace window: the window owns the title bar. */
  embedded?: boolean;
}) {
  const t = useT();
  const api = useMemo(bridge, []);
  const [health, setHealth] = useState<DiskHealth | null>(null);
  const [scan, setScan] = useState<DiskScanResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [result, setResult] = useState<DiskCleanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accepted = settings.disclaimerAcceptedAt > 0;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!api || !accepted) return;
    let live = true;
    api
      .diskHealth()
      .then(next => {
        if (live && next) setHealth(next);
      })
      .catch(() => setError(t('The main process did not answer the drive check.')));
    return () => {
      live = false;
    };
  }, [accepted, api, t]);

  const startScan = useCallback(async () => {
    if (!api || scanning) return;
    setScanning(true);
    setError(null);
    setResult(null);
    try {
      const next = await api.diskScan();
      if (!mounted.current) return;
      if (!next) {
        setError(t('The main process did not answer the scan.'));
        return;
      }
      setScan(next);
      setHealth(next.health);
      const defaults = new Set<string>();
      for (const target of next.targets) {
        if (!target.available || target.bytes <= 0 || target.requiresElevation) continue;
        if (target.selectedByDefault) defaults.add(target.id);
      }
      setSelected(defaults);
      if (next.cancelled) onToast(t('Scan stopped early.'), 'warning');
      else onToast(t('Scan finished.'), 'success');
    } catch {
      if (mounted.current) setError(t('The scan failed before it could finish.'));
    } finally {
      if (mounted.current) setScanning(false);
    }
  }, [api, onToast, scanning, t]);

  const cancelScan = useCallback(async () => {
    await api?.diskCancel();
  }, [api]);

  const toggle = (id: string) => {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const chosen = useMemo(
    () => (scan ? scan.targets.filter(target => selected.has(target.id)) : []),
    [scan, selected],
  );
  const chosenBytes = chosen.reduce((total, target) => total + target.bytes, 0);
  const maxFolder = scan?.folders[0]?.bytes ?? 0;
  const usedPercent = health?.usedPercent ?? 0;
  const level = severity(usedPercent);

  const runClean = useCallback(async () => {
    if (!api || cleaning || chosen.length === 0) return;
    setCleaning(true);
    setError(null);
    try {
      const next = await api.diskClean(chosen.map(target => target.id));
      if (!mounted.current || !next) return;
      setResult(next);
      setConfirmOpen(false);
      setConfirmText('');
      if (next.ok) {
        onToast(
          t('Freed {size}.', { size: formatBytes(next.freedBytes) }),
          next.skipped > 0 ? 'warning' : 'success',
        );
      } else {
        onToast(next.message ?? t('Nothing was removed.'), 'danger');
      }
      const fresh = await api.diskHealth();
      if (mounted.current && fresh) setHealth(fresh);
      setScan(current =>
        current
          ? {
              ...current,
              targets: current.targets.map(target => {
                const cleaned = next.targets.find(item => item.id === target.id);
                if (!cleaned) return target;
                return {
                  ...target,
                  bytes: Math.max(0, target.bytes - cleaned.bytes),
                  fileCount: Math.max(0, target.fileCount - cleaned.removed),
                };
              }),
            }
          : current,
      );
      setSelected(new Set());
    } catch {
      if (mounted.current) setError(t('The cleanup stopped before it finished.'));
    } finally {
      if (mounted.current) setCleaning(false);
    }
  }, [api, chosen, cleaning, onToast, t]);

  if (!api) {
    return (
      <section className={`view disk-view ${embedded ? 'is-embedded' : ''}`}>
        <header className="disk-head">
          <button className="btn ghost" onClick={onBack}>
            <Icon name="back" size={15} />
            {t('Services')}
          </button>
          <ElementMark tool="disk" size={64} />
        </header>
        <p className="disk-empty mono">
          {t('Disk pulse runs in the desktop app: the web build has no filesystem access.')}
        </p>
      </section>
    );
  }

  return (
    <section className={`view disk-view ${embedded ? 'is-embedded' : ''}`}>
      <header className="disk-head">
        <button className="btn ghost" onClick={onBack}>
          <Icon name="back" size={15} />
          {t('Services')}
        </button>
        <div className="disk-head-copy">
          <p className="eyebrow mono">{t('SECRET SERVICE / x533')}</p>
          <h1>{t('Disk pulse')}</h1>
          <p className="lede">
            {t(
              'A read-only analyzer with a guarded cleaner. Nothing leaves the machine, and system paths are never candidates.',
            )}
          </p>
        </div>
        <ElementMark tool="disk" size={72} />
      </header>

      <div className="disk-grid">
        <article className={`disk-heart is-${level}`}>
          <div className="disk-heart-top">
            <span className="mono">{health ? `${health.drive}` : t('DRIVE')}</span>
            <span className="disk-state mono">
              {usedPercent >= 90 ? <span className="disk-alert">{t('LOW SPACE')}</span> : null}
              {health ? t('{percent}% FULL', { percent: usedPercent }) : t('CHECKING')}
            </span>
          </div>
          <svg
            className="disk-ecg"
            viewBox="0 0 280 96"
            preserveAspectRatio="none"
            role="img"
            aria-label={t('Drive usage pulse')}
          >
            <path className="disk-ecg-glow" d={pulsePath(usedPercent)} />
            <path className="disk-ecg-line" d={pulsePath(usedPercent)} />
          </svg>
          <div className="disk-heart-stats">
            <span>
              <span className="mono muted">{t('FREE')}</span>
              <strong>{health ? formatBytes(health.freeBytes) : 'n/a'}</strong>
            </span>
            <span>
              <span className="mono muted">{t('USED')}</span>
              <strong>{health ? formatBytes(health.usedBytes) : 'n/a'}</strong>
            </span>
            <span>
              <span className="mono muted">{t('TOTAL')}</span>
              <strong>{health ? formatBytes(health.totalBytes) : 'n/a'}</strong>
            </span>
          </div>
          <div
            className="disk-meter"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={usedPercent}
            aria-label={t('Drive used')}
          >
            <span style={{ width: `${Math.max(1, usedPercent)}%` }} />
          </div>
        </article>

        <article className="disk-analyzer">
          <div className="disk-analyzer-head">
            <span className="mono muted">{t('WHERE THE SPACE GOES')}</span>
            <button className="btn ghost" onClick={startScan} disabled={scanning}>
              <Icon name="reload" size={14} />
              {scanning ? t('Scanning') : t('Analyze')}
            </button>
          </div>
          {scan && scan.folders.length > 0 ? (
            <ul className="disk-bars">
              {scan.folders.map(folder => (
                <li key={folder.path} title={folder.path}>
                  <span className="disk-bar-label">
                    <span>{folder.name}</span>
                    <span className="mono">{formatBytes(folder.bytes)}</span>
                  </span>
                  <span className="disk-bar-track">
                    <span style={{ width: `${Math.max(2, (folder.bytes / maxFolder) * 100)}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="disk-empty mono">
              {scanning ? t('READING THE DRIVE…') : t('RUN ANALYZE TO MAP THE DRIVE')}
            </p>
          )}
        </article>
      </div>

      <section className="disk-targets">
        <div className="disk-targets-head">
          <div>
            <span className="mono muted">{t('CLEANUP PLAN')}</span>
            <p>{t('Only caches, temp files and diagnostics from the list below can be touched.')}</p>
          </div>
          <div className="disk-actions">
            {scanning ? (
              <button className="btn ghost" onClick={cancelScan}>
                {t('Stop scan')}
              </button>
            ) : (
              <button className="btn secondary" onClick={startScan}>
                <Icon name="reload" size={15} />
                {t('Scan')}
              </button>
            )}
            <button
              className="btn primary"
              disabled={cleaning || chosen.length === 0 || chosenBytes === 0}
              onClick={() => setConfirmOpen(true)}
            >
              <Icon name="trash" size={15} />
              {cleaning
                ? t('Cleaning')
                : t('Clean {size}', { size: formatBytes(chosenBytes) })}
            </button>
          </div>
        </div>

        {error ? <p className="disk-error">{error}</p> : null}

        <ul className="disk-list">
          {(scan?.targets ?? []).map(target => {
            const disabled = !target.available || target.bytes <= 0 || target.requiresElevation;
            return (
              <li key={target.id} className={disabled ? 'is-empty' : ''}>
                <label className="disk-check">
                  <input
                    type="checkbox"
                    checked={selected.has(target.id)}
                    disabled={disabled || scanning || cleaning}
                    onChange={() => toggle(target.id)}
                  />
                  <span className="disk-check-copy">
                    <span className="disk-check-title">
                      {target.label}
                      <span className={`disk-risk ${target.risk}`}>
                        {target.risk === 'safe' ? t('SAFE') : t('CAUTION')}
                      </span>
                    </span>
                    <span className="disk-check-detail">{target.detail}</span>
                  </span>
                </label>
                <span className="disk-check-size mono">
                  {target.requiresElevation
                    ? t('NEEDS ELEVATION')
                    : target.available
                      ? formatBytes(target.bytes)
                      : t('NOT FOUND')}
                  {target.available && target.fileCount > 0 ? (
                    <small>{t('{count} files', { count: target.fileCount })}</small>
                  ) : null}
                </span>
              </li>
            );
          })}
          {!scan ? (
            <li className="disk-empty-row mono">
              {t('No scan yet. Nothing is selected, and nothing can be cleaned before a scan.')}
            </li>
          ) : null}
        </ul>

        {result ? (
          <p className={`disk-result mono ${result.ok ? '' : 'is-bad'}`}>
            {result.ok
              ? t('Removed {files} files ({size}). {skipped} were in use or protected.', {
                  files: result.removedFiles,
                  size: formatBytes(result.freedBytes),
                  skipped: result.skipped,
                })
              : (result.message ?? t('Nothing was removed.'))}
          </p>
        ) : null}
      </section>

      {!accepted ? (
        <Modal
          title={t('Before you clean anything')}
          subtitle={t('Secret storage tool')}
          width={560}
          onClose={onBack}
          footer={
            <div className="modal-actions">
              <button className="btn ghost" onClick={onBack}>
                {t('Not now')}
              </button>
              <button
                className="btn primary"
                onClick={() => onUpdate({ disclaimerAcceptedAt: Date.now() })}
              >
                <Icon name="check" size={14} />
                {t('I understand')}
              </button>
            </div>
          }
        >
          <div className="disk-disclaimer">
            <p>
              {t(
                'Disk pulse scans your drives locally and can permanently delete the cache and temporary files you select.',
              )}
            </p>
            <ul>
              <li>
                {t(
                  'Deletion bypasses the Recycle Bin. Files removed here cannot be restored from Kryvex.',
                )}
              </li>
              <li>
                {t(
                  'Windows, Program Files, ProgramData, your desktop, documents, downloads, pictures, videos, music and roaming app data are refused even if a rule asks for them.',
                )}
              </li>
              <li>
                {t(
                  'Links and junctions are never followed, files in use are skipped, and system categories that need elevation are not offered in this build.',
                )}
              </li>
              <li>
                {t('Nothing is scanned, uploaded or cleaned until you press a button.')}
              </li>
            </ul>
            <p className="mono muted">
              {t('The first scan is the safest time to look: nothing is deleted by scanning.')}
            </p>
          </div>
        </Modal>
      ) : null}

      {confirmOpen ? (
        <Modal
          title={t('Permanently remove these files?')}
          subtitle={t('{size} across {count} categories', {
            size: formatBytes(chosenBytes),
            count: chosen.length,
          })}
          width={520}
          onClose={() => {
            setConfirmOpen(false);
            setConfirmText('');
          }}
          footer={
            <div className="modal-actions">
              <button
                className="btn ghost"
                onClick={() => {
                  setConfirmOpen(false);
                  setConfirmText('');
                }}
              >
                {t('Cancel')}
              </button>
              <button
                className="btn primary"
                disabled={confirmText.trim().toUpperCase() !== 'CLEAN' || cleaning}
                onClick={runClean}
              >
                <Icon name="trash" size={14} />
                {t('Clean permanently')}
              </button>
            </div>
          }
        >
          <div className="disk-confirm">
            <p>
              {t(
                'This cannot be undone and the files do not go to the Recycle Bin. Programs rebuild caches on their next start, but a session that is open right now may need a refresh.',
              )}
            </p>
            <ul className="mono">
              {chosen.map(target => (
                <li key={target.id}>
                  {target.label} · {formatBytes(target.bytes)}
                </li>
              ))}
            </ul>
            <label className="disk-confirm-type">
              <span className="mono">{t('Type CLEAN to confirm')}</span>
              <input
                value={confirmText}
                onChange={event => setConfirmText(event.target.value)}
                autoFocus
                spellCheck={false}
                placeholder="CLEAN"
              />
            </label>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
