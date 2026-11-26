import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../lib/i18n';
import type { PageMenuItem } from '../lib/page-menu';

/**
 * The menu a right-click on a page opens.
 *
 * It is drawn by the app rather than by Electron so it takes the active theme,
 * the language and the app's own keyboard habits. The entries come from
 * `pageMenuEntries`, which has already decided what is honest for this click;
 * this component only positions them, walks them with the keyboard and draws
 * one level of submenu for "Send to…".
 */
export function PageContextMenu({
  items,
  header,
  point,
  onPick,
  onClose,
}: {
  items: PageMenuItem[];
  /** The host or address the menu is about, shown above the entries. */
  header: string;
  point: { x: number; y: number };
  onPick: (item: PageMenuItem) => void;
  onClose: () => void;
}) {
  const t = useT();
  const menu = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState(point);
  const [openId, setOpenId] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);

  // Measure after paint so a menu opened near an edge flips inward instead of
  // leaving the viewport, and keep measuring: a longer translation or a font
  // that lands late makes the menu taller than it was on its first frame, and a
  // menu measured once then grew past the bottom edge of the window.
  useLayoutEffect(() => {
    const node = menu.current;
    if (!node) return;
    const place = () => {
      const rect = node.getBoundingClientRect();
      const margin = 10;
      setPosition({
        x: Math.max(margin, Math.min(point.x, window.innerWidth - rect.width - margin)),
        y: Math.max(margin, Math.min(point.y, window.innerHeight - rect.height - margin)),
      });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(node);
    return () => observer.disconnect();
  }, [point.x, point.y]);

  // A submenu opens to the right; when there is no room there it opens to the
  // left, which is what a browser's own menu does.
  useLayoutEffect(() => {
    if (!openId) {
      setFlipped(false);
      return;
    }
    const node = menu.current?.querySelector<HTMLElement>(`[data-submenu="${openId}"]`);
    if (!node) return;
    setFlipped(node.getBoundingClientRect().right > window.innerWidth - 10);
  }, [openId]);

  useEffect(() => {
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const visible = (): HTMLButtonElement[] => {
      const node = menu.current;
      if (!node) return [];
      return Array.from(node.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (openId) {
          setOpenId(null);
          return;
        }
        onClose();
        return;
      }
      if (event.key === 'ArrowRight') {
        const current = document.activeElement as HTMLElement | null;
        const line = current?.closest<HTMLElement>('[data-item]');
        const item = items.find(entry => entry.id === line?.dataset.item);
        if (!item?.children?.length) return;
        event.preventDefault();
        setOpenId(item.id);
        // The children mount on the next paint; hand focus over then.
        window.requestAnimationFrame(() => {
          menu.current
            ?.querySelector<HTMLButtonElement>(`[data-submenu="${item.id}"] [role="menuitem"]`)
            ?.focus();
        });
        return;
      }
      if (event.key === 'ArrowLeft' && openId) {
        event.preventDefault();
        const parent = openId;
        setOpenId(null);
        menu.current
          ?.querySelector<HTMLButtonElement>(`[data-item="${parent}"] > [role="menuitem"]`)
          ?.focus();
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const all = visible();
      if (all.length === 0) return;
      event.preventDefault();
      const at = all.indexOf(document.activeElement as HTMLButtonElement);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      all[(at + step + all.length) % all.length]?.focus();
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
  }, [items, onClose, openId]);

  const entry = (item: PageMenuItem) => (
    <button
      type="button"
      role="menuitem"
      className="page-context-item"
      disabled={item.disabled}
      aria-haspopup={item.children ? 'menu' : undefined}
      aria-expanded={item.children ? openId === item.id : undefined}
      onClick={() => {
        if (item.children) {
          setOpenId(current => (current === item.id ? null : item.id));
          return;
        }
        onPick(item);
        onClose();
      }}
      onPointerEnter={() => {
        if (item.children) setOpenId(item.id);
        else if (openId) setOpenId(null);
      }}
    >
      <span className="page-context-label">{t(item.label)}</span>
      {item.hint ? <span className="page-context-key mono">{item.hint}</span> : null}
      {item.children ? (
        <span className="page-context-chevron" aria-hidden="true">
          ›
        </span>
      ) : null}
    </button>
  );

  return createPortal(
    <div
      ref={menu}
      className="service-context page-context"
      style={{ left: position.x, top: position.y }}
      role="menu"
      aria-label={t('Page options')}
    >
      <header className="service-context-head">
        <span className="mono service-context-title">{header}</span>
      </header>
      <div className="service-context-sep" role="separator" />
      {items.map(item => (
        <div className="page-context-line" key={item.id} data-item={item.id}>
          {item.separatorBefore ? <div className="service-context-sep" role="separator" /> : null}
          {entry(item)}
          {openId === item.id && item.children ? (
            <div
              className={`page-context-submenu ${flipped ? 'is-flipped' : ''}`}
              role="menu"
              data-submenu={item.id}
              aria-label={t(item.label)}
            >
              {item.children.map(child => (
                <div className="page-context-line" key={child.id}>
                  {entry(child)}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>,
    document.body,
  );
}
