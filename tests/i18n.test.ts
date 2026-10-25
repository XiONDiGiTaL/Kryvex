import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { extensionMessage, languageLabel, makeI18n, normalizeLanguage } from '../src/lib/i18n';
import { playbackCopy } from '../src/lib/i18n-playback';

describe('normalizeLanguage', () => {
  it('maps system locales to a supported base language', () => {
    expect(normalizeLanguage('es-MX')).toBe('es');
    expect(normalizeLanguage('de-AT')).toBe('de');
    expect(normalizeLanguage('fr-CA')).toBe('fr');
  });

  it('falls back to English for unsupported locales', () => {
    expect(normalizeLanguage('ja-JP')).toBe('en');
    expect(normalizeLanguage(undefined)).toBe('en');
  });
});

describe('feature copy', () => {
  it('translates the shield filter editor, model runner and sign-in notice', () => {
    expect(makeI18n('es').t('MY FILTERS')).toBe('MIS FILTROS');
    expect(makeI18n('de').t('MY FILTERS')).toBe('MEINE FILTER');
    expect(makeI18n('fr').t('MY FILTERS')).toBe('MES FILTRES');

    expect(makeI18n('es').t('YouTube: block ads and feed noise')).toContain('anuncios');
    expect(makeI18n('de').t('YouTube: block ads and feed noise')).toContain('Werbung');
    expect(makeI18n('fr').t('YouTube: block ads and feed noise')).toContain('pubs');

    expect(makeI18n('es').t('RUN A MODEL FILE')).toBe('EJECUTAR UN ARCHIVO DE MODELO');
    expect(makeI18n('de').t('Start server')).toBe('Server starten');
    expect(makeI18n('fr').t('Choose model…')).toBe('Choisir un modèle…');
    expect(makeI18n('es').t('Start Vexium Core')).toBe('Iniciar Vexium Core');
    expect(makeI18n('de').t('Download Vexium Core')).toBe('Vexium Core herunterladen');
    expect(makeI18n('fr').t('Vexium Core is running')).toContain('Vexium Core');

    expect(makeI18n('fr').t('{count} rule(s) are on hold until scriptlet rules are allowed.', { count: 3 }))
      .toBe('3 règle(s) en attente jusqu’à autoriser les scriptlets.');
    expect(makeI18n('de').t('GPU layers: {count}', { count: 999 })).toBe('GPU-Schichten: 999');
  });

  it('localizes the up-to-date verdict shown after a check', () => {
    expect(makeI18n('es').t('UP TO DATE')).toBe('AL DÍA');
    expect(makeI18n('de').t('UP TO DATE')).toBe('AKTUELL');
    expect(makeI18n('fr').t('UP TO DATE')).toBe('À JOUR');
    expect(
      makeI18n('de').t('Kryvex {version} is up to date.', { version: '1.2.3' }),
    ).toBe('Kryvex 1.2.3 ist auf dem neuesten Stand.');
    expect(makeI18n('en').t('UP TO DATE')).toBe('UP TO DATE');
  });

  it('localizes the developer credit links', () => {
    expect(makeI18n('es').t('{name} on GitHub', { name: 'player529' })).toBe('player529 en GitHub');
    expect(makeI18n('de').t('{name} on GitHub', { name: 'XiONDiGiTaL' })).toBe('XiONDiGiTaL auf GitHub');
    expect(makeI18n('fr').t('{name} on GitHub', { name: 'player529' })).toBe('player529 sur GitHub');
  });

  it('keeps English as the source and does not invent keys', () => {
    expect(makeI18n('en').t('MY FILTERS')).toBe('MY FILTERS');
    expect(makeI18n('es').t('A string nobody translated')).toBe('A string nobody translated');
  });
});

describe('makeI18n', () => {
  it('leaves English as the source language', () => {
    const { t } = makeI18n('en');
    expect(t('Settings')).toBe('Settings');
    expect(t('{count} SAVED', { count: 3 })).toBe('3 SAVED');
  });

  it('translates browser, brand and extension copy', () => {
    const es = makeI18n('es');
    expect(es.t('Settings')).toBe('Ajustes');
    expect(es.t('THEMES')).toBe('TEMAS');
    expect(es.t('Remove {name} from history', { name: 'Example' })).toBe(
      'Quitar Example del historial',
    );

    const de = makeI18n('de');
    expect(de.t('Clear filter')).toBe('Filter löschen');
    expect(de.t('Kryvex Dark')).toBe('Kryvex Dunkel');

    const fr = makeI18n('fr');
    expect(fr.t('Dark')).toBe('Sombre');
    expect(fr.t('Web preview')).toBe('Aperçu web');
  });

  it('translates service-app copy and keeps English as the source', () => {
    const de = makeI18n('de');
    expect(de.t('Desktop notifications')).toBe('Desktop-Benachrichtigungen');
    expect(de.t('AI')).toBe('KI');
    expect(de.t('Clear this session')).toBe('Diese Sitzung löschen');

    const fr = makeI18n('fr');
    expect(fr.t('Resources')).toBe('Ressources');
    expect(fr.t('Clear this session')).toBe('Effacer cette session');

    const es = makeI18n('es');
    expect(es.t('Service apps')).toBe('Apps de servicio');
    expect(es.t('{count} unread', { count: 4 })).toBe('4 sin leer');
    expect(makeI18n('en').t('Desktop notifications')).toBe('Desktop notifications');
  });

  it('localizes the periodic theme picker and custom colours', () => {
    expect(makeI18n('es').t('CORE')).toBe('NÚCLEO');
    expect(makeI18n('es').t('Custom theme')).toBe('Tema personalizado');
    expect(makeI18n('de').t('METALS')).toBe('METALLE');
    expect(makeI18n('fr').t('Apply custom theme')).toBe(
      'Appliquer le thème personnalisé',
    );
  });

  it('localizes the Chromium engine panel without translating engine names', () => {
    expect(makeI18n('es').t('Chromium engine')).toBe('Motor Chromium');
    expect(makeI18n('de').t('Chromium engine')).toBe('Chromium-Engine');
    expect(makeI18n('fr').t('Rebuild open pages')).toBe('Reconstruire les pages ouvertes');
    expect(makeI18n('de').t('{count} embedded pages rebuilt.', { count: 2 })).toBe(
      '2 eingebettete Seiten neu aufgebaut.',
    );
    // Engine and API names stay as written in every language.
    expect(makeI18n('es').t('JavaScript')).toBe('JavaScript');
    expect(makeI18n('fr').t('WebGL')).toBe('WebGL');
  });

  it('localizes the opt-in wallpaper panel', () => {
    expect(makeI18n('es').t('Theme wash')).toBe('Degradado del tema');
    expect(makeI18n('de').t('My image')).toBe('Eigenes Bild');
    expect(makeI18n('fr').t('Show a backdrop')).toBe('Afficher un fond');
    expect(makeI18n('en').t('THEME WASH')).toBe('THEME WASH');
  });

  it('localizes the reusable one-time-code relay', () => {
    expect(makeI18n('es').t('Verification code')).toBe('Código de verificación');
    expect(makeI18n('de').t('Submit code')).toBe('Code senden');
    expect(makeI18n('fr').t('Sign-in code')).toBe('Code de connexion');
    expect(
      makeI18n('de').t(
        'Enter the {count}-character code from your authenticator app or email.',
        { count: 6 },
      ),
    ).toContain('6-stelligen');
    expect(
      makeI18n('fr').t('Code sent to {service}.', { service: 'Discord' }),
    ).toBe('Code envoyé à Discord.');
  });

  it('resolves every Spotify playback key that has a translation', () => {
    for (const language of ['es', 'de', 'fr'] as const) {
      const { t } = makeI18n(language);
      for (const [key, value] of Object.entries(playbackCopy[language])) {
        expect(t(key), `${language}: ${key}`).toBe(value);
      }
    }
  });

  it('localizes the Spotify ad guard settings', () => {
    expect(makeI18n('es').t('Service playback')).toBe('Reproducción de servicios');
    expect(makeI18n('de').t('Mute Spotify ads and try to skip them')).toContain('Spotify');
    expect(makeI18n('fr').t('GUARDED')).toBe('PROTÉGÉ');
    expect(makeI18n('en').t('Service playback')).toBe('Service playback');
  });

  it('localizes the system-language option label', () => {
    const { t } = makeI18n('de');
    expect(languageLabel('system', t)).toMatch(/^Systemsprache \([A-Z]{2}\)$/);
  });
});

describe('renderer copy audit', () => {
  it('finds no hardcoded UI strings outside the translation table', () => {
    const report = execFileSync(process.execPath, ['scripts/audit-i18n.cjs'], { encoding: 'utf8' });
    expect(report).toContain('No hardcoded UI strings');
  });
});

describe('extensionMessage', () => {
  it('translates dynamic install results without touching the name', () => {
    const { t } = makeI18n('es');
    expect(extensionMessage(t, 'Google Translate installed.')).toBe(
      'Google Translate instalado.',
    );
    expect(extensionMessage(t, 'Chrome Web Store returned HTTP 404.')).toBe(
      'Chrome Web Store devolvió HTTP 404.',
    );
  });

  it('translates stable failure messages', () => {
    const { t } = makeI18n('de');
    expect(extensionMessage(t, 'The extension could not be installed.')).toBe(
      'Die Erweiterung konnte nicht installiert werden.',
    );
  });
});

describe('service lifecycle copy', () => {
  it('translates the five policies and the capability notes', () => {
    const es = makeI18n('es');
    expect(es.t('Keep running')).toBe('Seguir en ejecución');
    expect(es.t('Pause on leave')).toBe('Pausar al salir');
    expect(es.t('This service cannot suspend, so it stays in the background.')).toBe(
      'Este servicio no puede suspenderse, así que sigue en segundo plano.',
    );

    const de = makeI18n('de');
    expect(de.t('Service lifecycle')).toBe('Lebenszyklus der Dienste');
    expect(de.t('Stop when leaving')).toBe('Beim Verlassen beenden');
    expect(de.t('Now: {state}.', { state: de.t('Pause when idle') })).toBe(
      'Jetzt: Bei Untätigkeit pausieren.',
    );

    const fr = makeI18n('fr');
    expect(fr.t('Use the default')).toBe('Utiliser le comportement par défaut');
    expect(fr.t('This service has no audio to silence, so it keeps running with sound.')).toContain(
      'pas d’audio à couper',
    );
  });

  it('translates the save panel and its failure messages', () => {
    const es = makeI18n('es');
    expect(es.t('SAVE STATES')).toBe('ESTADOS GUARDADOS');
    expect(es.t('Quick save')).toBe('Guardado rápido');
    expect(es.t('Saved {name}.', { name: 'Contra' })).toBe('Guardado Contra.');
    expect(es.t('State restored.')).toBe('Estado restaurado.');

    const de = makeI18n('de');
    expect(de.t('Choose save folder…')).toBe('Speicherordner wählen…');
    expect(de.t('Stored in this browser profile; it survives a reload.')).toContain('Browserprofil');

    const fr = makeI18n('fr');
    expect(fr.t('Quick load')).toBe('Chargement rapide');
    expect(fr.t('Export')).toBe('Exporter');
    expect(fr.t('This browser has no save folder picker.')).toContain('sélecteur');
  });
});
