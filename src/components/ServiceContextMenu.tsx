import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Service, ServicePersistence } from '../types';
import { useT } from '../lib/i18n';
import { Icon } from './ui';

export interface ServiceMenuPoint {
  x: number;
  y: number;
}

/**
 * The pinned rail's right-click menu.
 *
 * It is drawn by the app, not by Electron, so it inherits the active theme
 * tokens and reads like the rest of the shell. Every action maps to a field
 * already owned by the service, which keeps the menu honest: nothing here is a
 * shortcut that the service page cannot also do.
 */
export function ServiceContextMenu({
  service,
  point,
  notificationsGloballyOn,
  onClose,
  onOpen,
  onEdit,
  onRemove,
  onChange,
}: {
  service: Service;
  point: ServiceMenuPoint;
  notificationsGloballyOn: boolean;
  onClose: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onChange: (patch: Partial<Service>) => void;
}) {
  const t = useT();
  const menu = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState(point);
  const notificationsOn = service.notifications !== false;
  const keepRunning = (service.persistence ?? 'keep') === 'keep';

  // Measure after paint so a menu opened near the right or bottom edge flips
  // inward instead of leaving the viewport.
  useLayoutEffect(() => {
    const node = menu.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const margin = 10;
    const x = Math.min(point.x, window.innerWidth - rect.width - margin);
    const y = Math.min(point.y, window.innerHeight - rect.height - margin);
    setPosition({ x: Math.max(margin, x), y: Math.max(margin, y) });
  }, [point.x, point.y]);

  useEffect(() => {
    const node = menu.current;
    node?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const items = [...(node?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
      if (items.length === 0) return;
      event.preventDefault();
      const at = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'ArrowDown' ? at + 1 : at - 1;
      items[(next + items.length) % items.length]?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const item = (
    label: string,
    icon: 'external' | 'edit' | 'mute' | 'bell' | 'monitor' | 'pin' | 'trash',
    action: () => void,
    options: { checked?: boolean; danger?: boolean; note?: string } = {},
  ) => (
    <button
      type="button"
      role="menuitem"
      className={`service-context-item ${options.danger ? 'is-danger' : ''}`}
      onClick={() => {
        action();
        onClose();
      }}
    >
      <span className="service-context-icon" aria-hidden="true">
        <Icon name={icon} size={14} />
      </span>
      <span className="service-context-copy">
        <strong>{label}</strong>
        {options.note ? <em>{options.note}</em> : null}
      </span>
      {options.checked === undefined ? null : (
        <span className={`service-context-check ${options.checked ? 'is-on' : ''}`} aria-hidden="true">
          {options.checked ? <Icon name="check" size={12} /> : null}
        </span>
      )}
    </button>
  );

  return createPortal(
    <div
      ref={menu}
      className="service-context"
      style={{ left: position.x, top: position.y }}
      role="menu"
      aria-label={t('{name} options', { name: service.name })}
    >
      <header className="service-context-head">
        <span className="service-context-dot" style={{ background: service.color }} aria-hidden="true" />
        <span className="service-context-title">{service.name}</span>
        {service.pinned ? <span className="tag mono accent">{t('PINNED')}</span> : null}
      </header>
      <div className="service-context-sep" role="separator" />

      {item(t('Open'), 'external', onOpen)}
      {item(t('Edit service'), 'edit', onEdit)}
      <div className="service-context-sep" role="separator" />
      {item(t('Mute sound'), 'mute', () => onChange({ muted: !service.muted }), {
        checked: Boolean(service.muted),
        note: t('Silences this service without changing the site’s own setting.'),
      })}
      {item(t('Notifications'), 'bell', () => onChange({ notifications: !notificationsOn }), {
        checked: notificationsOn,
        note: notificationsGloballyOn ? undefined : t('The global notification switch in Settings is off.'),
      })}
      {item(t('Keep running in the background'), 'monitor', () =>
        onChange({ persistence: (keepRunning ? 'pause' : 'keep') as ServicePersistence }), {
        checked: keepRunning,
        note: keepRunning
          ? t('Session stays warm, like a desktop chat app.')
          : t('Audio and video pause while another view is open.'),
      })}
      <div className="service-context-sep" role="separator" />
      {item(t('Unpin'), 'pin', () => onChange({ pinned: false }))}
      {item(t('Remove'), 'trash', onRemove, { danger: true })}
    </div>,
    document.body,
  );
}
