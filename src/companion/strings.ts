/**
 * The companion page carries its own strings.
 *
 * The desktop catalogue in `src/lib/i18n.tsx` is keyed by English sentences and
 * translated through the app's provider; the phone page is a separate bundle
 * with no settings screen, so it reads `navigator.language` once and holds a
 * compact table instead of pulling every desktop string onto the phone. English
 * is the fallback for a language Kryvex does not ship yet.
 *
 * The text goes through `msg()`, never through the desktop's translation
 * helper: the coverage test counts every literal key it finds in the renderer,
 * and these sentences are not part of that catalogue.
 */

export type CompanionLanguage = 'en' | 'es' | 'de' | 'fr';

export const COMPANION_STRINGS = {
  pair: {
    en: 'Pair with Kryvex',
    es: 'Emparejar con Kryvex',
    de: 'Mit Kryvex koppeln',
    fr: 'Associer à Kryvex',
  },
  pairHint: {
    en: 'Type the six-digit code shown in Kryvex, on the Kyvex Link card.',
    es: 'Escribe el código de seis dígitos que aparece en Kryvex, en la tarjeta Kyvex Link.',
    de: 'Gib den sechsstelligen Code ein, der in Kryvex auf der Kyvex-Link-Karte steht.',
    fr: 'Saisissez le code à six chiffres affiché dans Kryvex, sur la carte Kyvex Link.',
  },
  pairingCode: {
    en: 'Pairing code',
    es: 'Código de emparejamiento',
    de: 'Kopplungscode',
    fr: 'Code d’association',
  },
  pairButton: { en: 'Pair', es: 'Emparejar', de: 'Koppeln', fr: 'Associer' },
  phoneName: {
    en: 'Phone name',
    es: 'Nombre del teléfono',
    de: 'Name des Telefons',
    fr: 'Nom du téléphone',
  },
  pairWrong: {
    en: 'That code is wrong or has expired. Ask Kryvex for a new one.',
    es: 'Ese código es incorrecto o ha caducado. Pide uno nuevo a Kryvex.',
    de: 'Der Code ist falsch oder abgelaufen. Fordere in Kryvex einen neuen an.',
    fr: 'Ce code est erroné ou expiré. Demandez-en un nouveau à Kryvex.',
  },
  pairMany: {
    en: 'Too many tries. Wait a minute and type the code again.',
    es: 'Demasiados intentos. Espera un minuto y vuelve a escribir el código.',
    de: 'Zu viele Versuche. Warte eine Minute und gib den Code erneut ein.',
    fr: 'Trop de tentatives. Attendez une minute puis saisissez à nouveau le code.',
  },
  pairOffline: {
    en: 'Kryvex is not serving the link. Turn it on in Kryvex under Services → Kyvex Link.',
    es: 'Kryvex no está sirviendo el enlace. Actívalo en Kryvex, en Servicios → Kyvex Link.',
    de: 'Kryvex stellt den Link nicht bereit. Schalte ihn in Kryvex unter Dienste → Kyvex Link ein.',
    fr: 'Kryvex ne diffuse pas le lien. Activez-le dans Kryvex, sous Services → Kyvex Link.',
  },
  clipboard: {
    en: 'Clipboard',
    es: 'Portapapeles',
    de: 'Zwischenablage',
    fr: 'Presse-papiers',
  },
  files: { en: 'Files', es: 'Archivos', de: 'Dateien', fr: 'Fichiers' },
  send: { en: 'Send', es: 'Enviar', de: 'Senden', fr: 'Envoyer' },
  remote: { en: 'Remote', es: 'Control remoto', de: 'Fernsteuerung', fr: 'Télécommande' },
  thisPhone: { en: 'This phone', es: 'Este teléfono', de: 'Dieses Telefon', fr: 'Ce téléphone' },
  clipboardEmpty: {
    en: 'Text you copy on your desktop shows up here.',
    es: 'El texto que copies en tu escritorio aparece aquí.',
    de: 'Text, den du am Desktop kopierst, erscheint hier.',
    fr: 'Le texte copié sur votre bureau apparaît ici.',
  },
  clipboardPlaceholder: {
    en: 'Paste or type text for the desktop',
    es: 'Pega o escribe texto para el escritorio',
    de: 'Text für den Desktop einfügen oder tippen',
    fr: 'Collez ou saisissez du texte pour le bureau',
  },
  sendToDesktop: {
    en: 'Send to desktop',
    es: 'Enviar al escritorio',
    de: 'An den Desktop senden',
    fr: 'Envoyer au bureau',
  },
  copied: { en: 'Copied.', es: 'Copiado.', de: 'Kopiert.', fr: 'Copié.' },
  sent: { en: 'Sent.', es: 'Enviado.', de: 'Gesendet.', fr: 'Envoyé.' },
  sentToDesktop: {
    en: 'Sent to the desktop',
    es: 'Enviado al escritorio',
    de: 'An den Desktop gesendet',
    fr: 'Envoyé au bureau',
  },
  copy: { en: 'Copy', es: 'Copiar', de: 'Kopieren', fr: 'Copier' },
  chooseFiles: {
    en: 'Choose files',
    es: 'Elegir archivos',
    de: 'Dateien auswählen',
    fr: 'Choisir des fichiers',
  },
  sending: { en: 'Sending…', es: 'Enviando…', de: 'Wird gesendet…', fr: 'Envoi…' },
  fromDesktop: {
    en: 'From your desktop',
    es: 'Desde tu escritorio',
    de: 'Von deinem Desktop',
    fr: 'Depuis votre bureau',
  },
  download: { en: 'Download', es: 'Descargar', de: 'Herunterladen', fr: 'Télécharger' },
  nothingYet: { en: 'Nothing here yet.', es: 'Todavía no hay nada.', de: 'Noch nichts hier.', fr: 'Rien pour l’instant.' },
  openOnDesktop: {
    en: 'Open on the desktop',
    es: 'Abrir en el escritorio',
    de: 'Auf dem Desktop öffnen',
    fr: 'Ouvrir sur le bureau',
  },
  linkPlaceholder: {
    en: 'Paste a link or some text',
    es: 'Pega un enlace o texto',
    de: 'Link oder Text einfügen',
    fr: 'Collez un lien ou du texte',
  },
  play: { en: 'Play', es: 'Reproducir', de: 'Wiedergabe', fr: 'Lecture' },
  pause: { en: 'Pause', es: 'Pausar', de: 'Pause', fr: 'Pause' },
  next: { en: 'Next', es: 'Siguiente', de: 'Weiter', fr: 'Suivant' },
  previous: { en: 'Previous', es: 'Anterior', de: 'Zurück', fr: 'Précédent' },
  volumeDown: { en: 'Quieter', es: 'Bajar volumen', de: 'Leiser', fr: 'Baisser le son' },
  volumeUp: { en: 'Louder', es: 'Subir volumen', de: 'Lauter', fr: 'Monter le son' },
  mute: { en: 'Mute', es: 'Silenciar', de: 'Stumm', fr: 'Muet' },
  unmute: { en: 'Unmute', es: 'Activar sonido', de: 'Ton an', fr: 'Son activé' },
  bringFront: {
    en: 'Bring Kryvex forward',
    es: 'Traer Kryvex al frente',
    de: 'Kryvex nach vorn holen',
    fr: 'Ramener Kryvex au premier plan',
  },
  openRooms: { en: 'Open Rooms', es: 'Abrir Rooms', de: 'Rooms öffnen', fr: 'Ouvrir Rooms' },
  goHome: { en: 'Go to Home', es: 'Ir a Inicio', de: 'Zur Startseite', fr: 'Aller à l’accueil' },
  paired: { en: 'Paired', es: 'Emparejado', de: 'Gekoppelt', fr: 'Associé' },
  notPaired: { en: 'Not paired', es: 'Sin emparejar', de: 'Nicht gekoppelt', fr: 'Non associé' },
  unpair: {
    en: 'Unpair this phone',
    es: 'Desemparejar este teléfono',
    de: 'Dieses Telefon entkoppeln',
    fr: 'Dissocier ce téléphone',
  },
  unpairedNow: {
    en: 'This phone is unpaired.',
    es: 'Este teléfono ya no está emparejado.',
    de: 'Dieses Telefon ist entkoppelt.',
    fr: 'Ce téléphone est dissocié.',
  },
  install: {
    en: 'Add this page to your home screen for an app icon.',
    es: 'Añade esta página a tu pantalla de inicio para tener un icono.',
    de: 'Füge diese Seite zum Startbildschirm hinzu, um ein App-Symbol zu erhalten.',
    fr: 'Ajoutez cette page à votre écran d’accueil pour obtenir une icône.',
  },
  where: {
    en: 'Files land in Downloads/Kryvex Link on your desktop.',
    es: 'Los archivos llegan a Descargas/Kryvex Link en tu escritorio.',
    de: 'Dateien landen in Downloads/Kryvex Link auf deinem Desktop.',
    fr: 'Les fichiers arrivent dans Téléchargements/Kryvex Link sur votre bureau.',
  },
  enableNotifications: {
    en: 'Enable notifications',
    es: 'Activar notificaciones',
    de: 'Hinweise aktivieren',
    fr: 'Activer les notifications',
  },
  notificationsOn: {
    en: 'Notifications are on.',
    es: 'Las notificaciones están activadas.',
    de: 'Hinweise sind aktiviert.',
    fr: 'Les notifications sont activées.',
  },
  notifyHint: {
    en: 'On a plain local address notifications only appear while this page is open.',
    es: 'En una dirección local sin cifrar las notificaciones solo aparecen con esta página abierta.',
    de: 'Auf einer unverschlüsselten lokalen Adresse erscheinen Hinweise nur, solange die Seite offen ist.',
    fr: 'Sur une adresse locale non chiffrée, les notifications n’apparaissent que si cette page est ouverte.',
  },
  live: { en: 'Live', es: 'En vivo', de: 'Live', fr: 'En direct' },
  offline: { en: 'Offline', es: 'Sin conexión', de: 'Offline', fr: 'Hors ligne' },
  reconnecting: {
    en: 'Reconnecting…',
    es: 'Reconectando…',
    de: 'Verbindung wird wiederhergestellt…',
    fr: 'Reconnexion…',
  },
} as const satisfies Record<string, Record<CompanionLanguage, string>>;

export type CompanionKey = keyof typeof COMPANION_STRINGS;

export function pickCompanionLanguage(tag: string | undefined): CompanionLanguage {
  const value = (tag ?? '').toLowerCase();
  if (value.startsWith('es')) return 'es';
  if (value.startsWith('de')) return 'de';
  if (value.startsWith('fr')) return 'fr';
  return 'en';
}

export function companionLanguage(): CompanionLanguage {
  try {
    return pickCompanionLanguage(navigator.language);
  } catch {
    return 'en';
  }
}

/** One lookup for the whole page; unknown keys render as themselves. */
export function makeCompanionStrings(language: CompanionLanguage) {
  return (key: CompanionKey): string => COMPANION_STRINGS[key]?.[language] ?? key;
}
