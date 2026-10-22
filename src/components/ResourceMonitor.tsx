import { useEffect, useRef } from 'react';
import type { ResourceSnapshot, Service } from '../types';
import { formatCpu, formatMB } from '../lib/resources';
import { useT } from '../lib/i18n';
import { Icon } from './ui';

function bar(value: number, max: number): string {
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return `${percent.toFixed(1)}%`;
}

/**
 * Compact sidebar block. It reports Kryvex's own footprint, never the
 * machine-wide numbers: a user who wants those has Task Manager, and mixing the
 * two made a 26 GB system total look like the app's memory.
 */
export function SidebarResources({
  snapshot,
  services,
  onHide,
}: {
  snapshot: ResourceSnapshot;
  services: Service[];
  onHide?: () => void;
}) {
  const t = useT();
  const top = snapshot.services.slice(0, 3);
  return (
    <div className="sidebar-resources" aria-label={t('Resource usage')}>
      <div className="sidebar-heading">
        <span>{t('RESOURCES')}</span>
        <span className="sidebar-resources-actions">
          <span className="sidebar-mono">LIVE</span>
          {onHide ? (
            <button
              className="sidebar-resources-hide"
              onClick={onHide}
              title={t('Hide resources')}
              aria-label={t('Hide resources')}
            >
              <Icon name="close" size={11} />
            </button>
          ) : null}
        </span>
      </div>
      <div className="sidebar-meter">
        <div className="sidebar-meter-head">
          <span>{t('Kryvex CPU')}</span>
          <b className="mono">{formatCpu(snapshot.appCpuShare)}</b>
        </div>
        <span className="sidebar-meter-track">
          <span style={{ width: bar(snapshot.appCpuShare, 100) }} />
        </span>
      </div>
      <div className="sidebar-meter">
        <div className="sidebar-meter-head">
          <span>{t('Kryvex memory')}</span>
          <b className="mono">{formatMB(snapshot.appMemoryMB)}</b>
        </div>
        <span className="sidebar-meter-track">
          <span style={{ width: bar(snapshot.memoryShare, 100) }} />
        </span>
        <span className="sidebar-meter-note mono">
          {t('{share}% of {total} RAM', {
            share: snapshot.memoryShare.toFixed(1),
            total: formatMB(snapshot.memoryTotalMB),
          })}
        </span>
      </div>
      <div className="sidebar-meter">
        <div className="sidebar-meter-head">
          <span>{t('GPU process')}</span>
          <b className="mono">{formatMB(snapshot.gpuMemoryMB)}</b>
        </div>
        <span className="sidebar-meter-track">
          <span style={{ width: bar(snapshot.gpuMemoryMB, Math.max(1, snapshot.appMemoryMB)) }} />
        </span>
      </div>
      {top.length > 0 ? (
        <ul className="sidebar-service-usage">
          {top.map(entry => {
            const service = services.find(item => item.id === entry.id);
            if (!service) return null;
            return (
              <li key={entry.id}>
                <span className="sidebar-usage-name">{service.name}</span>
                <span className="mono">
                  {formatCpu(entry.cpu)} · {formatMB(entry.memoryMB)}
                </span>
                <span className="sidebar-usage-track">
                  <span
                    style={{
                      width: bar(entry.cpu, Math.max(5, top[0]?.cpu ?? 5)),
                      background: service.color,
                    }}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export function ResourcePanel({
  snapshot,
  services,
  isElectron,
  onClose,
  onOpenSettings,
}: {
  snapshot: ResourceSnapshot | null;
  services: Service[];
  isElectron: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
}) {
  const t = useT();
  const panel = useRef<HTMLElement | null>(null);

  // A floating panel must be dismissible the two ways people expect: Escape
  // and a click anywhere outside it. The header button remains a toggle.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onPointer = (event: PointerEvent) => {
      const node = event.target as Node | null;
      if (!node) return;
      if (panel.current?.contains(node)) return;
      // The header button is a toggle, not an outside click: leave the close
      // to its own handler so one press does not close and immediately reopen.
      if ((node as Element).closest?.('.header-tool.is-resources')) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    // `pointerdown` fires before the panel's own buttons react, so a click on
    // Close still reaches its handler; the containment check above keeps the
    // panel itself open.
    document.addEventListener('pointerdown', onPointer, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer, true);
    };
  }, [onClose]);

  const memoryMax = snapshot?.memoryTotalMB || 1;
  return (
    <aside
      ref={panel}
      className="resource-panel"
      role="dialog"
      aria-modal="false"
      aria-label={t('Resource manager')}
    >
      <header className="resource-panel-head">
        <div>
          <span className="mono">{t('KRYVEX / PROCESS ACTIVITY')}</span>
          <h2>{t('Resource manager')}</h2>
        </div>
        <div className="resource-panel-actions">
          <button className="icon-btn" onClick={onOpenSettings} title={t('Resource settings')} aria-label={t('Resource settings')}>
            <Icon name="sliders" size={15} />
          </button>
          <button className="icon-btn" onClick={onClose} title={t('Hide')} aria-label={t('Hide resource manager')}>
            <Icon name="close" size={15} />
          </button>
        </div>
      </header>

      {!isElectron ? (
        <p className="resource-empty">{t('Process metrics are available in the desktop app.')}</p>
      ) : !snapshot ? (
        <p className="resource-empty">{t('Reading process metrics…')}</p>
      ) : (
        <>
          <p className="resource-scope mono">{t('THIS APP ONLY')}</p>
          <div className="resource-totals">
            <div>
              <span className="mono">{t('KRYVEX CPU')}</span>
              <strong>{formatCpu(snapshot.appCpuShare)}</strong>
              <span className="resource-track">
                <span style={{ width: bar(snapshot.appCpuShare, 100) }} />
              </span>
              <em className="mono">
                {t('{count} threads', { count: snapshot.cpuCores })}
              </em>
            </div>
            <div>
              <span className="mono">{t('KRYVEX MEMORY')}</span>
              <strong>{formatMB(snapshot.appMemoryMB)}</strong>
              <span className="resource-track">
                <span style={{ width: bar(snapshot.memoryShare, 100) }} />
              </span>
              <em className="mono">
                {t('{share}% of {total} RAM', {
                  share: snapshot.memoryShare.toFixed(1),
                  total: formatMB(snapshot.memoryTotalMB),
                })}
              </em>
            </div>
            <div>
              <span className="mono">{t('GPU PROCESS')}</span>
              <strong>{formatCpu(snapshot.gpuCpu)}</strong>
              <span className="resource-track">
                <span
                  style={{
                    width: bar(snapshot.gpuMemoryMB, Math.max(1, snapshot.appMemoryMB)),
                  }}
                />
              </span>
              <em className="mono">{formatMB(snapshot.gpuMemoryMB)}</em>
            </div>
          </div>

          <div className="resource-table" role="table" aria-label={t('Usage by service')}>
            <div className="resource-row is-head" role="row">
              <span role="columnheader">{t('Service')}</span>
              <span role="columnheader">{t('CPU')}</span>
              <span role="columnheader">{t('Memory')}</span>
              <span role="columnheader">{t('Proc')}</span>
            </div>
            {snapshot.services.length === 0 ? (
              <p className="resource-empty">
                {t('No service pages are open. Open a module to see its processes here.')}
              </p>
            ) : (
              snapshot.services.map(entry => {
                const service = services.find(item => item.id === entry.id);
                return (
                  <div className="resource-row" role="row" key={entry.id}>
                    <span role="cell" className="resource-name">
                      <i style={{ background: service?.color ?? 'var(--accent)' }} />
                      {service?.name ?? t('Unknown module')}
                    </span>
                    <span role="cell" className="mono">
                      {formatCpu(entry.cpu)}
                    </span>
                    <span role="cell" className="mono">{formatMB(entry.memoryMB)}</span>
                    <span role="cell" className="mono">{entry.processes}</span>
                  </div>
                );
              })
            )}
          </div>

          <div className="resource-processes">
            <span className="mono resource-subhead">
              {t('PROCESSES')} · {snapshot.processCount}
            </span>
            <ul>
              {snapshot.processes.slice(0, 12).map(process => {
                const service = process.serviceId
                  ? services.find(item => item.id === process.serviceId)
                  : undefined;
                return (
                  <li key={process.pid}>
                    <span className="mono resource-pid">{process.pid}</span>
                    <span className="resource-process-name">
                      {service?.name ?? process.label}
                      <em className="mono">{process.type}</em>
                    </span>
                    <span className="mono">{formatCpu(process.cpu)}</span>
                    <span className="mono">{formatMB(process.memoryMB)}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <p className="resource-note">
            {t(
              'Only processes that belong to Kryvex are counted. GPU is Chromium’s GPU process; Windows does not expose total GPU utilisation to Electron.',
            )}
          </p>
          <span className="resource-ram mono">{t('INSTALLED RAM')}: {formatMB(memoryMax)}</span>
        </>
      )}
    </aside>
  );
}
