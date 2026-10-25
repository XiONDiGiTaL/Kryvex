import { useEffect, useState, type ReactNode } from 'react';
import type { LifecycleServiceId, LifecycleSettings } from '../types';
import {
  idleWaitMs,
  lifecycleService,
  modeFor,
  resolveLifecycle,
  type LifecycleVerdict,
} from '../lib/lifecycle';

/**
 * Resolves the shared lifecycle policy for one service.
 *
 * The only state this keeps is "how long has it been off screen", and only
 * `auto-pause` needs it: one timer is armed at the idle boundary instead of
 * polling, so an idle service costs nothing while it waits.
 */
export function useLifecycle(
  id: LifecycleServiceId,
  visible: boolean,
  settings: LifecycleSettings,
): LifecycleVerdict {
  const capabilities = lifecycleService(id);
  const mode = modeFor(settings, id);
  const [hiddenForMs, setHiddenForMs] = useState(0);

  useEffect(() => {
    if (visible || mode !== 'auto-pause') {
      setHiddenForMs(0);
      return;
    }
    const since = Date.now();
    const timer = window.setTimeout(
      () => setHiddenForMs(Date.now() - since),
      idleWaitMs(settings.idleMinutes),
    );
    return () => window.clearTimeout(timer);
  }, [mode, settings.idleMinutes, visible]);

  return resolveLifecycle({
    visible,
    mode,
    idleMinutes: settings.idleMinutes,
    hiddenForMs,
    capabilities,
  });
}

/**
 * Keeps a service view mounted while it is parked.
 *
 * Same rule the webview stage already follows: an inactive view is rendered at
 * zero opacity instead of `display: none`, because a display-none frame is
 * reported as a hidden page and Chromium then throttles its timers and
 * animation frames. Parked means invisible and inert, not asleep. Only the
 * `stop` policy actually unmounts, and a view is never constructed before the
 * user first opens it.
 */
export function KeepAlive({
  id,
  active,
  keep,
  children,
}: {
  id: LifecycleServiceId;
  active: boolean;
  keep: boolean;
  children: ReactNode;
}) {
  const [opened, setOpened] = useState(active);

  useEffect(() => {
    if (active) setOpened(true);
  }, [active]);

  useEffect(() => {
    if (!active && !keep) setOpened(false);
  }, [active, keep]);

  if (!active && (!opened || !keep)) return null;

  return (
    <div
      className={`lifecycle-pane ${active ? 'is-active' : 'is-parked'}`}
      data-service={id}
      aria-hidden={!active}
    >
      {children}
    </div>
  );
}
