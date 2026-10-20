import { describe, expect, it } from 'vitest';
import { extensionMessage, languageLabel, makeI18n, normalizeLanguage } from '../src/lib/i18n';

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

  it('localizes the system-language option label', () => {
    const { t } = makeI18n('de');
    expect(languageLabel('system', t)).toMatch(/^Systemsprache \([A-Z]{2}\)$/);
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
