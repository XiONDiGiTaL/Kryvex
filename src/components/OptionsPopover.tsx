import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useT } from '../lib/i18n';
import { Icon } from './ui';

/**
 * The options popover behind the sliders button.
 *
 * It is a popover, not a menu: it holds switches and fields the user is reading
 * and clicking, so an outside click does not dismiss it. Losing the panel
 * halfway through a toggle is worse than one extra click, and a settings panel
 * that vanishes when the pointer lands anywhere else reads as a bug. It closes
 * on its own trigger, on Escape, or on the close button, and only one panel is
 * open at a time.
 *
 * While it is open it paints above the canvas, so a webview can never slide over
 * the switches that belong to the page it is showing.
 */
const PANEL_OPEN_EVENT = 'kryvex:options-open';

/**
 * Dispatched by an action inside the panel that opens a dialog or leaves the
 * view. The panel closes itself first, so a delete confirmation is never left
 * sitting behind the popover that asked for it.
 */
export const OPTIONS_CLOSE_EVENT = 'kryvex:options-close';

export function OptionsPopover({
  name,
  triggerTitle,
  variant = 'card',
  children,
}: {
  /** Used to label the trigger and the panel for assistive tech. */
  name: string;
  triggerTitle: string;
  variant?: 'card' | 'toolbar';
  children: ReactNode;
}) {
  const t = useT();
  const panelId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOthers = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== panelId) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      wrapper.current?.querySelector<HTMLElement>('.icon-btn')?.focus();
    };
    const closeSelf = () => setOpen(false);
    document.addEventListener(PANEL_OPEN_EVENT, closeOthers);
    document.addEventListener(OPTIONS_CLOSE_EVENT, closeSelf);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener(PANEL_OPEN_EVENT, closeOthers);
      document.removeEventListener(OPTIONS_CLOSE_EVENT, closeSelf);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, panelId]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) document.dispatchEvent(new CustomEvent(PANEL_OPEN_EVENT, { detail: panelId }));
  }

  return (
    <div
      className={`service-quick is-${variant} ${open ? 'is-open' : ''}`}
      ref={wrapper}
      onClick={event => event.stopPropagation()}
    >
      <button
        className="icon-btn"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={t('Options for {name}', { name })}
        title={triggerTitle}
        onClick={toggle}
      >
        <Icon name="sliders" size={15} />
      </button>
      {open ? (
        <div
          className="service-quick-panel"
          id={panelId}
          role="group"
          aria-label={t('{name} options', { name })}
        >
          <div className="service-quick-head">
            <span className="mono service-quick-sticky">
              <Icon name="pin" size={11} />
              {t('ALWAYS ON TOP')}
            </span>
            <button
              className="icon-btn"
              onClick={() => setOpen(false)}
              aria-label={t('Close options')}
              title={t('Close options')}
            >
              <Icon name="close" size={13} />
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </div>
  );
}
