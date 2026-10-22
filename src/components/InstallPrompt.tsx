import { useEffect, useState } from 'react';
import { useT } from '../lib/i18n';
import { Icon } from './ui';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const KEY = 'kryvex.install.dismissed';

function installed(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * The browser owns the install prompt; this only surfaces it at the moment it
 * is available. The desktop shell never renders the banner, and a dismissal is
 * remembered so the app does not ask again on every launch.
 */
export function InstallPrompt() {
  const t = useT();
  const [offer, setOffer] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(() => {
    try {
      return installed() || window.localStorage.getItem(KEY) === '1';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (window.kryvex) return;
    const onOffer = (event: Event) => {
      event.preventDefault();
      setOffer(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setOffer(null);
      setHidden(true);
    };
    window.addEventListener('beforeinstallprompt', onOffer);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onOffer);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!offer || hidden) return null;

  function dismiss() {
    setHidden(true);
    try {
      window.localStorage.setItem(KEY, '1');
    } catch {
      /* private browsing: the banner simply returns next launch */
    }
  }

  async function install() {
    if (!offer) return;
    try {
      await offer.prompt();
      const choice = await offer.userChoice;
      if (choice.outcome === 'accepted') {
        setHidden(true);
      } else {
        dismiss();
      }
    } catch {
      dismiss();
    }
  }

  return (
    <aside className="install-prompt" aria-label={t('Install Kryvex')}>
      <span className="install-prompt-mark" aria-hidden="true">
        <Icon name="download" size={18} />
      </span>
      <div className="install-prompt-copy">
        <strong>{t('Install Kryvex')}</strong>
        <span>
          {t(
            'Keep the workspace on your home screen. It opens without browser chrome and caches the shell for offline use.',
          )}
        </span>
      </div>
      <div className="install-prompt-actions">
        <button className="btn primary small" onClick={() => void install()}>
          {t('Install')}
        </button>
        <button className="btn ghost small" onClick={dismiss}>
          {t('Not now')}
        </button>
      </div>
    </aside>
  );
}
