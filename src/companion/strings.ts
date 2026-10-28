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
 *
 * Turkish is here in full rather than progressively: the table is small enough to
 * translate in one pass, and a phone that has just paired should not meet a
 * half-English page. The `satisfies` below is what guarantees it stays complete —
 * adding a key without a `tr` string is a type error, not a silent fallback.
 */

export type CompanionLanguage = 'en' | 'es' | 'de' | 'fr' | 'tr';

export const COMPANION_STRINGS = {
  pair: {
    en: 'Pair with Kryvex',
    es: 'Emparejar con Kryvex',
    de: 'Mit Kryvex koppeln',
    fr: 'Associer à Kryvex',
    tr: 'Kryvex ile eşleştir',
  },
  pairHint: {
    en: 'Type the six-digit code shown in Kryvex, on the Kryvex Link card.',
    es: 'Escribe el código de seis dígitos que aparece en Kryvex, en la tarjeta Kryvex Link.',
    de: 'Gib den sechsstelligen Code ein, der in Kryvex auf der Kryvex-Link-Karte steht.',
    fr: 'Saisissez le code à six chiffres affiché dans Kryvex, sur la carte Kryvex Link.',
    tr: 'Kryvex’te Kryvex Link kartında gösterilen altı haneli kodu yazın.',
  },
  pairingCode: {
    en: 'Pairing code',
    es: 'Código de emparejamiento',
    de: 'Kopplungscode',
    fr: 'Code d’association',
    tr: 'Eşleştirme kodu',
  },
  pairButton: {
    en: 'Pair',
    es: 'Emparejar',
    de: 'Koppeln',
    fr: 'Associer',
    tr: 'Eşleştir',
  },
  phoneName: {
    en: 'Phone name',
    es: 'Nombre del teléfono',
    de: 'Name des Telefons',
    fr: 'Nom du téléphone',
    tr: 'Telefon adı',
  },
  pairWrong: {
    en: 'That code is wrong or has expired. Ask Kryvex for a new one.',
    es: 'Ese código es incorrecto o ha caducado. Pide uno nuevo a Kryvex.',
    de: 'Der Code ist falsch oder abgelaufen. Fordere in Kryvex einen neuen an.',
    fr: 'Ce code est erroné ou expiré. Demandez-en un nouveau à Kryvex.',
    tr: 'Kod yanlış ya da süresi dolmuş. Kryvex’ten yeni bir kod isteyin.',
  },
  pairMany: {
    en: 'Too many tries. Wait a minute and type the code again.',
    es: 'Demasiados intentos. Espera un minuto y vuelve a escribir el código.',
    de: 'Zu viele Versuche. Warte eine Minute und gib den Code erneut ein.',
    fr: 'Trop de tentatives. Attendez une minute puis saisissez à nouveau le code.',
    tr: 'Çok fazla deneme. Bir dakika bekleyip kodu yeniden yazın.',
  },
  pairOffline: {
    en: 'Kryvex is not serving the link. Turn it on in Kryvex under Services → Kryvex Link.',
    es: 'Kryvex no está sirviendo el enlace. Actívalo en Kryvex, en Servicios → Kryvex Link.',
    de: 'Kryvex stellt den Link nicht bereit. Schalte ihn in Kryvex unter Dienste → Kryvex Link ein.',
    fr: 'Kryvex ne diffuse pas le lien. Activez-le dans Kryvex, sous Services → Kryvex Link.',
    tr: 'Kryvex bağlantıyı sunmuyor. Kryvex’te Servisler → Kryvex Link altından açın.',
  },
  clipboard: {
    en: 'Clipboard',
    es: 'Portapapeles',
    de: 'Zwischenablage',
    fr: 'Presse-papiers',
    tr: 'Pano',
  },
  files: { en: 'Files', es: 'Archivos', de: 'Dateien', fr: 'Fichiers', tr: 'Dosyalar' },
  send: { en: 'Send', es: 'Enviar', de: 'Senden', fr: 'Envoyer', tr: 'Gönder' },
  remote: {
    en: 'Remote',
    es: 'Control remoto',
    de: 'Fernsteuerung',
    fr: 'Télécommande',
    tr: 'Uzaktan kumanda',
  },
  thisPhone: {
    en: 'This phone',
    es: 'Este teléfono',
    de: 'Dieses Telefon',
    fr: 'Ce téléphone',
    tr: 'Bu telefon',
  },
  clipboardEmpty: {
    en: 'Text you copy on your desktop shows up here.',
    es: 'El texto que copies en tu escritorio aparece aquí.',
    de: 'Text, den du am Desktop kopierst, erscheint hier.',
    fr: 'Le texte copié sur votre bureau apparaît ici.',
    tr: 'Masaüstünüzde kopyaladığınız metin burada görünür.',
  },
  clipboardPlaceholder: {
    en: 'Paste or type text for the desktop',
    es: 'Pega o escribe texto para el escritorio',
    de: 'Text für den Desktop einfügen oder tippen',
    fr: 'Collez ou saisissez du texte pour le bureau',
    tr: 'Masaüstü için metin yapıştırın ya da yazın',
  },
  sendToDesktop: {
    en: 'Send to desktop',
    es: 'Enviar al escritorio',
    de: 'An den Desktop senden',
    fr: 'Envoyer au bureau',
    tr: 'Masaüstüne gönder',
  },
  copied: {
    en: 'Copied.',
    es: 'Copiado.',
    de: 'Kopiert.',
    fr: 'Copié.',
    tr: 'Kopyalandı.',
  },
  sent: { en: 'Sent.', es: 'Enviado.', de: 'Gesendet.', fr: 'Envoyé.', tr: 'Gönderildi.' },
  sentToDesktop: {
    en: 'Sent to the desktop',
    es: 'Enviado al escritorio',
    de: 'An den Desktop gesendet',
    fr: 'Envoyé au bureau',
    tr: 'Masaüstüne gönderildi',
  },
  copy: { en: 'Copy', es: 'Copiar', de: 'Kopieren', fr: 'Copier', tr: 'Kopyala' },
  chooseFiles: {
    en: 'Choose files',
    es: 'Elegir archivos',
    de: 'Dateien auswählen',
    fr: 'Choisir des fichiers',
    tr: 'Dosya seç',
  },
  sending: {
    en: 'Sending…',
    es: 'Enviando…',
    de: 'Wird gesendet…',
    fr: 'Envoi…',
    tr: 'Gönderiliyor…',
  },
  fromDesktop: {
    en: 'From your desktop',
    es: 'Desde tu escritorio',
    de: 'Von deinem Desktop',
    fr: 'Depuis votre bureau',
    tr: 'Masaüstünüzden',
  },
  download: {
    en: 'Download',
    es: 'Descargar',
    de: 'Herunterladen',
    fr: 'Télécharger',
    tr: 'İndir',
  },
  nothingYet: {
    en: 'Nothing here yet.',
    es: 'Todavía no hay nada.',
    de: 'Noch nichts hier.',
    fr: 'Rien pour l’instant.',
    tr: 'Burada henüz bir şey yok.',
  },
  openOnDesktop: {
    en: 'Open on the desktop',
    es: 'Abrir en el escritorio',
    de: 'Auf dem Desktop öffnen',
    fr: 'Ouvrir sur le bureau',
    tr: 'Masaüstünde aç',
  },
  linkPlaceholder: {
    en: 'Paste a link or some text',
    es: 'Pega un enlace o texto',
    de: 'Link oder Text einfügen',
    fr: 'Collez un lien ou du texte',
    tr: 'Bir bağlantı ya da metin yapıştırın',
  },
  play: { en: 'Play', es: 'Reproducir', de: 'Wiedergabe', fr: 'Lecture', tr: 'Oynat' },
  pause: { en: 'Pause', es: 'Pausar', de: 'Pause', fr: 'Pause', tr: 'Duraklat' },
  next: { en: 'Next', es: 'Siguiente', de: 'Weiter', fr: 'Suivant', tr: 'Sonraki' },
  previous: { en: 'Previous', es: 'Anterior', de: 'Zurück', fr: 'Précédent', tr: 'Önceki' },
  volumeDown: {
    en: 'Quieter',
    es: 'Bajar volumen',
    de: 'Leiser',
    fr: 'Baisser le son',
    tr: 'Sesi azalt',
  },
  volumeUp: {
    en: 'Louder',
    es: 'Subir volumen',
    de: 'Lauter',
    fr: 'Monter le son',
    tr: 'Sesi artır',
  },
  mute: { en: 'Mute', es: 'Silenciar', de: 'Stumm', fr: 'Muet', tr: 'Sessize al' },
  unmute: { en: 'Unmute', es: 'Activar sonido', de: 'Ton an', fr: 'Son activé', tr: 'Sesi aç' },
  bringFront: {
    en: 'Bring Kryvex forward',
    es: 'Traer Kryvex al frente',
    de: 'Kryvex nach vorn holen',
    fr: 'Ramener Kryvex au premier plan',
    tr: 'Kryvex’i öne getir',
  },
  openRooms: {
    en: 'Open Rooms',
    es: 'Abrir Rooms',
    de: 'Rooms öffnen',
    fr: 'Ouvrir Rooms',
    tr: 'Odalar’ı aç',
  },
  goHome: {
    en: 'Go to Home',
    es: 'Ir a Inicio',
    de: 'Zur Startseite',
    fr: 'Aller à l’accueil',
    tr: 'Ana sayfaya git',
  },
  paired: { en: 'Paired', es: 'Emparejado', de: 'Gekoppelt', fr: 'Associé', tr: 'Eşleşti' },
  notPaired: {
    en: 'Not paired',
    es: 'Sin emparejar',
    de: 'Nicht gekoppelt',
    fr: 'Non associé',
    tr: 'Eşleşmedi',
  },
  unpair: {
    en: 'Unpair this phone',
    es: 'Desemparejar este teléfono',
    de: 'Dieses Telefon entkoppeln',
    fr: 'Dissocier ce téléphone',
    tr: 'Bu telefonun eşleşmesini kaldır',
  },
  unpairedNow: {
    en: 'This phone is unpaired.',
    es: 'Este teléfono ya no está emparejado.',
    de: 'Dieses Telefon ist entkoppelt.',
    fr: 'Ce téléphone est dissocié.',
    tr: 'Bu telefonun eşleşmesi kaldırıldı.',
  },
  install: {
    en: 'Add this page to your home screen for an app icon.',
    es: 'Añade esta página a tu pantalla de inicio para tener un icono.',
    de: 'Füge diese Seite zum Startbildschirm hinzu, um ein App-Symbol zu erhalten.',
    fr: 'Ajoutez cette page à votre écran d’accueil pour obtenir une icône.',
    tr: 'Uygulama simgesi için bu sayfayı ana ekranınıza ekleyin.',
  },
  where: {
    en: 'Files land in Downloads/Kryvex Link on your desktop.',
    es: 'Los archivos llegan a Descargas/Kryvex Link en tu escritorio.',
    de: 'Dateien landen in Downloads/Kryvex Link auf deinem Desktop.',
    fr: 'Les fichiers arrivent dans Téléchargements/Kryvex Link sur votre bureau.',
    tr: 'Dosyalar masaüstünüzde İndirilenler/Kryvex Link klasörüne iner.',
  },
  enableNotifications: {
    en: 'Enable notifications',
    es: 'Activar notificaciones',
    de: 'Hinweise aktivieren',
    fr: 'Activer les notifications',
    tr: 'Bildirimleri aç',
  },
  notificationsOn: {
    en: 'Notifications are on.',
    es: 'Las notificaciones están activadas.',
    de: 'Hinweise sind aktiviert.',
    fr: 'Les notifications sont activées.',
    tr: 'Bildirimler açık.',
  },
  notifyHint: {
    en: 'On a plain local address notifications only appear while this page is open.',
    es: 'En una dirección local sin cifrar las notificaciones solo aparecen con esta página abierta.',
    de: 'Auf einer unverschlüsselten lokalen Adresse erscheinen Hinweise nur, solange die Seite offen ist.',
    fr: 'Sur une adresse locale non chiffrée, les notifications n’apparaissent que si cette page est ouverte.',
    tr: 'Şifrelenmemiş yerel bir adreste bildirimler yalnızca bu sayfa açıkken görünür.',
  },
  live: { en: 'Live', es: 'En vivo', de: 'Live', fr: 'En direct', tr: 'Canlı' },
  offline: { en: 'Offline', es: 'Sin conexión', de: 'Offline', fr: 'Hors ligne', tr: 'Çevrimdışı' },
  reconnecting: {
    en: 'Reconnecting…',
    es: 'Reconectando…',
    de: 'Verbindung wird wiederhergestellt…',
    fr: 'Reconnexion…',
    tr: 'Yeniden bağlanıyor…',
  },
} as const satisfies Record<string, Record<CompanionLanguage, string>>;

export type CompanionKey = keyof typeof COMPANION_STRINGS;

export function pickCompanionLanguage(tag: string | undefined): CompanionLanguage {
  const value = (tag ?? '').toLowerCase();
  if (value.startsWith('es')) return 'es';
  if (value.startsWith('de')) return 'de';
  if (value.startsWith('fr')) return 'fr';
  if (value.startsWith('tr')) return 'tr';
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
