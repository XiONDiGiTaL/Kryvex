import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './styles-board.css';
import './styles-tools.css';
import './styles-disk.css';
import './styles-emulator.css';
import './styles-link.css';
import './styles-mobile.css';
import './styles-web.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element missing');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The desktop shell loads from file:// and has no service worker; the web/PWA
// build registers one so the shell opens offline after the first visit.
if (!window.kryvex && import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
