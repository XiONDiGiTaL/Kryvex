import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useT } from '../lib/i18n';
import { Icon } from './ui';

/**
 * The options popover behind the sliders button.
 *
 * It closes four ways: its own trigger, either close control, Escape, or a press
 * anywhere outside it — including another card's trigger or the page behind it,
 * which is how a person expects a settings panel to behave. A press inside the
 * panel, or on the trigger that opened it, is not an outside press, so a toggle
 * is never lost halfway through. Only one panel is open at a time.
 *
 * A press that lands on a service's own page cannot reach this renderer at all,
 * so the panel also closes itself when the view behind it changes.
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
    // Capture phase, so the press is judged before any handler inside the page
    // can stop it from travelling, and the containment test keeps the trigger
    // and the panel itself out of the "outside" set.
    const onOutsidePress = (event: Event) => {
      const target = event.target as Node | null;
      if (target && wrapper.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener(PANEL_OPEN_EVENT, closeOthers);
    document.addEventListener(OPTIONS_CLOSE_EVENT, closeSelf);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onOutsidePress, true);
    return () => {
      document.removeEventListener(PANEL_OPEN_EVENT, closeOthers);
      document.removeEventListener(OPTIONS_CLOSE_EVENT, closeSelf);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onOutsidePress, true);
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
      onClick={event => {
        // A press inside the panel must not reach the card behind it, which
        // would open the service. The outside-press test does its own
        // containment check, so it does not depend on this.
        event.stopPropagation();
      }}
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
