import type { ResourceSnapshot, Service } from '../types';
import { formatCpu, formatMB } from '../lib/resources';
import { useT } from '../lib/i18n';
import { Icon } from './ui';

function bar(value: number, max: number): string {
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return `${percent.toFixed(1)}%`;
}

export function SidebarResources({
  snapshot,
  services,
}: {
  snapshot: ResourceSnapshot;
  services: Service[];
}) {
  const t = useT();
  const memoryMax = snapshot.memoryTotalMB || 1;
  const top = snapshot.services.slice(0, 3);
  return (
    <div className="sidebar-resources" aria-label={t('Resource usage')}>
      <div className="sidebar-heading">
        <span>{t('RESOURCES')}</span>
        <span className="sidebar-mono">LIVE</span>
      </div>
      <div className="sidebar-meter">
        <div className="sidebar-meter-head">
          <span>{t('CPU')}</span>
          <b className="mono">{formatCpu(snapshot.cpu)}</b>
        </div>        <span className="sidebar-meter-track">
          <span style={{ width: bar(snapshot.cpu, 100) }} />
        </span>
      </div>
      <div className="sidebar-meter">
        <div className="sidebar-meter-head">
          <span>{t('Memory')}</span>
          <b className="mono">{Math.round((snapshot.memoryUsedMB / memoryMax) * 100)}%</b>
        </div>
        <span className="sidebar-meter-track">
          <span style={{ width: bar(snapshot.memoryUsedMB, memoryMax) }} />
        </span>
      </div>
      <div className="sidebar-meter">
        <div className="sidebar-meter-head">
          <span>{t('GPU process')}</span>
          <b className="mono">{formatMB(snapshot.gpuMemoryMB)}</b>
        </div>
        <span className="sidebar-meter-track">
          <span style={{ width: bar(snapshot.gpuMemoryMB, memoryMax) }} />
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
  const memoryMax = snapshot?.memoryTotalMB || 1;
  return (
    <aside className="resource-panel" role="dialog" aria-modal="false" aria-label={t('Resource manager')}>
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
          <div className="resource-totals">
            <div>
              <span className="mono">{t('CPU')}</span>
              <strong>{formatCpu(snapshot.cpu)}</strong>
              <span className="resource-track">
                <span style={{ width: bar(snapshot.cpu, 100) }} />
              </span>
            </div>
            <div>
              <span className="mono">{t('MEMORY')}</span>
              <strong>{formatMB(snapshot.memoryUsedMB)}</strong>
              <span className="resource-track">
                <span style={{ width: bar(snapshot.memoryUsedMB, memoryMax) }} />
              </span>
              <em className="mono">{t('of {total}', { total: formatMB(snapshot.memoryTotalMB) })}</em>
            </div>
            <div>
              <span className="mono">{t('GPU PROCESS')}</span>
              <strong>{formatCpu(snapshot.gpuCpu)}</strong>
              <span className="resource-track">
                <span style={{ width: bar(snapshot.gpuCpu, 100) }} />
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
            <span className="mono resource-subhead">{t('PROCESSES')}</span>
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
              'Kryvex processes only. GPU is the Chromium GPU process; Windows does not expose total GPU utilization to Electron.',
            )}
          </p>
        </>
      )}
    </aside>
  );
}
