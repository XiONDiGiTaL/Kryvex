/**
 * The capture preview window carries its own strings.
 *
 * It is a separate bundle with no settings screen and no i18n provider, so it
 * holds a compact table and picks the language the shell was already using when
 * the window opened. English is the fallback for a language Kryvex does not ship.
 *
 * The text goes through `str()`, never through the desktop's translation helper:
 * the coverage test counts every literal key it finds in the renderer, and these
 * sentences are not part of that catalogue.
 */
export type CaptureLanguage = 'en' | 'es' | 'de' | 'fr';

export const CAPTURE_LANGUAGES: readonly CaptureLanguage[] = ['en', 'es', 'de', 'fr'];

export const CAPTURE_STRINGS = {
  newCapture: {
    en: 'New capture',
    es: 'Nueva captura',
    de: 'Neue Aufnahme',
    fr: 'Nouvelle capture',
  },
  saveAs: { en: 'Save as…', es: 'Guardar como…', de: 'Speichern unter…', fr: 'Enregistrer sous…' },
  saving: { en: 'Saving…', es: 'Guardando…', de: 'Wird gespeichert…', fr: 'Enregistrement…' },
  copy: { en: 'Copy', es: 'Copiar', de: 'Kopieren', fr: 'Copier' },
  copied: {
    en: 'Copied to the clipboard.',
    es: 'Copiado al portapapeles.',
    de: 'In die Zwischenablage kopiert.',
    fr: 'Copié dans le presse-papiers.',
  },
  copyFailed: {
    en: 'The clipboard refused the image.',
    es: 'El portapapeles rechazó la imagen.',
    de: 'Die Zwischenablage hat das Bild abgelehnt.',
    fr: 'Le presse-papiers a refusé l’image.',
  },
  showInFolder: {
    en: 'Show in folder',
    es: 'Mostrar en la carpeta',
    de: 'Im Ordner zeigen',
    fr: 'Afficher dans le dossier',
  },
  pin: {
    en: 'Always on top',
    es: 'Siempre visible',
    de: 'Immer im Vordergrund',
    fr: 'Toujours au premier plan',
  },
  unpin: { en: 'Unpin', es: 'Fijar', de: 'Lösen', fr: 'Détacher' },
  fit: { en: 'Fit', es: 'Ajustar', de: 'Einpassen', fr: 'Ajuster' },
  actual: {
    en: 'Actual size',
    es: 'Tamaño real',
    de: 'Originalgröße',
    fr: 'Taille réelle',
  },
  close: { en: 'Close', es: 'Cerrar', de: 'Schließen', fr: 'Fermer' },
  captureAlt: {
    en: 'The screenshot you just took',
    es: 'La captura que acabas de hacer',
    de: 'Der gerade aufgenommene Screenshot',
    fr: 'La capture que vous venez de prendre',
  },
  recordingAlt: {
    en: 'The recording you just made',
    es: 'La grabación que acabas de hacer',
    de: 'Die gerade erstellte Aufnahme',
    fr: 'L’enregistrement que vous venez de faire',
  },
  screenshot: { en: 'Screenshot', es: 'Captura', de: 'Screenshot', fr: 'Capture' },
  recording: { en: 'Recording', es: 'Grabación', de: 'Aufnahme', fr: 'Enregistrement' },
  savedTo: { en: 'Saved to', es: 'Guardado en', de: 'Gespeichert in', fr: 'Enregistré dans' },
  saveFailed: {
    en: 'The capture could not be saved.',
    es: 'No se pudo guardar la captura.',
    de: 'Die Aufnahme konnte nicht gespeichert werden.',
    fr: 'La capture n’a pas pu être enregistrée.',
  },
  loading: {
    en: 'Preparing the capture…',
    es: 'Preparando la captura…',
    de: 'Aufnahme wird vorbereitet…',
    fr: 'Préparation de la capture…',
  },
  missing: {
    en: 'There is nothing to preview.',
    es: 'No hay nada que previsualizar.',
    de: 'Es gibt nichts anzuzeigen.',
    fr: 'Il n’y a rien à prévisualiser.',
  },
  shortcuts: {
    en: 'Esc closes · Ctrl+S saves',
    es: 'Esc cierra · Ctrl+S guarda',
    de: 'Esc schließt · Strg+S speichert',
    fr: 'Échap ferme · Ctrl+S enregistre',
  },
} as const;

export type CaptureKey = keyof typeof CAPTURE_STRINGS;

export function normalizeCaptureLanguage(value: unknown): CaptureLanguage {
  return typeof value === 'string' && (CAPTURE_LANGUAGES as readonly string[]).includes(value)
    ? (value as CaptureLanguage)
    : 'en';
}

export function makeCaptureStrings(language: CaptureLanguage): (key: CaptureKey) => string {
  return key => CAPTURE_STRINGS[key][language];
}
