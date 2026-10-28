/**
 * Copy for real netplay, which runs on the RetroArch the user installed.
 *
 * Separate from `i18n-flycast.ts` because the two features fail differently:
 * the second engine is a download Kryvex owns, while this is a program it only
 * launches, so its sentences talk about finding and starting something that is
 * already on the machine.
 *
 * Turkish lives in `i18n-tr.ts` with the rest of that language.
 */
type NetplayLanguage = 'es' | 'de' | 'fr';

export const netplayCopy: Record<NetplayLanguage, Record<string, string>> = {
  es: {
    'NETPLAY (RETROARCH)': 'JUEGO EN RED (RETROARCH)',
    'Frame-synchronised netplay runs on RetroArch, which you install and keep. Kryvex starts it for you and never downloads or bundles it. Both machines need the same game and the same core.':
      'El juego en red sincronizado por fotogramas funciona en RetroArch, que instalas y conservas. Kryvex lo inicia por ti y nunca lo descarga ni lo incluye. Ambas máquinas necesitan el mismo juego y el mismo núcleo.',
    'Netplay runs in the desktop app only.': 'El juego en red solo funciona en la aplicación de escritorio.',
    'RetroArch: {path}': 'RetroArch en {path}',
    'RetroArch was not found on this machine.': 'No se encontró RetroArch en este equipo.',
    'Choose another copy': 'Elegir otra copia',
    'Locate RetroArch': 'Ubicar RetroArch',
    'Stop netplay': 'Detener el juego en red',
    'RetroArch said': 'Lo que dijo RetroArch',
    'The core for {system} is missing: add {file} from RetroArch’s own core updater.':
      'Falta el núcleo de {system}: añade {file} desde el actualizador de núcleos de RetroArch.',
    'Hosting. The other player enters {address}.': 'Alojando. El otro jugador introduce {address}.',
    'Joined {address}.': 'Conectado a {address}.',
    'e.g. 192.168.1.20:55435': 'p. ej. 192.168.1.20:55435',
    'Host address': 'Dirección del anfitrión',
    'Host with RetroArch': 'Alojar con RetroArch',
    'Join with RetroArch': 'Unirse con RetroArch',
    'The host may have to allow TCP {port} through the firewall, and forward it on the router for a player outside the network. RetroArch opens in its own window; Kryvex stops it when you quit.':
      'Puede que el anfitrión deba permitir TCP {port} en el cortafuegos y reenviarlo en el router para un jugador fuera de la red. RetroArch se abre en su propia ventana; Kryvex lo detiene al salir.',
    // The failure sentences arrive as a main-process id, so they are listed
    // here rather than inside a `t(...)` literal.
    'RetroArch was not found. Install it, then point Kryvex at retroarch.exe.':
      'No se encontró RetroArch. Instálalo y luego indica a Kryvex dónde está retroarch.exe.',
    'The core for {system} is not installed: add {file} from RetroArch’s own core updater.':
      'El núcleo de {system} no está instalado: añade {file} desde el actualizador de núcleos de RetroArch.',
    'That is not an address Kryvex can dial. Use the host’s IP or name, with an optional port.':
      'Esa dirección no es válida. Usa la IP o el nombre del anfitrión, con un puerto opcional.',
    'Load a cartridge before starting netplay.': 'Carga un cartucho antes de iniciar el juego en red.',
    'The cartridge could not be written for RetroArch to open.':
      'No se pudo escribir el cartucho para que RetroArch lo abra.',
    'A netplay session is already running.': 'Ya hay una sesión de juego en red en marcha.',
    'RetroArch could not be started.': 'No se pudo iniciar RetroArch.',
    'Netplay could not start.': 'El juego en red no pudo iniciarse.',
  },
  de: {
    'NETPLAY (RETROARCH)': 'NETZSPIEL (RETROARCH)',
    'Frame-synchronised netplay runs on RetroArch, which you install and keep. Kryvex starts it for you and never downloads or bundles it. Both machines need the same game and the same core.':
      'Bildsynchrones Netplay läuft auf RetroArch, das du installierst und behältst. Kryvex startet es für dich und lädt oder bündelt es nie. Beide Rechner brauchen dasselbe Spiel und denselben Core.',
    'Netplay runs in the desktop app only.': 'Netplay läuft nur in der Desktop-App.',
    'RetroArch: {path}': 'RetroArch unter {path}',
    'RetroArch was not found on this machine.': 'RetroArch wurde auf diesem Rechner nicht gefunden.',
    'Choose another copy': 'Andere Kopie wählen',
    'Locate RetroArch': 'RetroArch suchen',
    'Stop netplay': 'Netplay beenden',
    'RetroArch said': 'Was RetroArch gesagt hat',
    'The core for {system} is missing: add {file} from RetroArch’s own core updater.':
      'Der Core für {system} fehlt: füge {file} über den Core-Updater von RetroArch hinzu.',
    'Hosting. The other player enters {address}.': 'Host läuft. Der andere Spieler gibt {address} ein.',
    'Joined {address}.': 'Verbunden mit {address}.',
    'e.g. 192.168.1.20:55435': 'z. B. 192.168.1.20:55435',
    'Host address': 'Host-Adresse',
    'Host with RetroArch': 'Mit RetroArch hosten',
    'Join with RetroArch': 'Mit RetroArch beitreten',
    'The host may have to allow TCP {port} through the firewall, and forward it on the router for a player outside the network. RetroArch opens in its own window; Kryvex stops it when you quit.':
      'Der Host muss TCP {port} in der Firewall erlauben und im Router weiterleiten, wenn jemand von außerhalb mitspielt. RetroArch öffnet ein eigenes Fenster; Kryvex beendet es beim Schließen.',
    'RetroArch was not found. Install it, then point Kryvex at retroarch.exe.':
      'RetroArch wurde nicht gefunden. Installiere es und zeige Kryvex dann retroarch.exe.',
    'The core for {system} is not installed: add {file} from RetroArch’s own core updater.':
      'Der Core für {system} ist nicht installiert: füge {file} über den Core-Updater von RetroArch hinzu.',
    'That is not an address Kryvex can dial. Use the host’s IP or name, with an optional port.':
      'Diese Adresse kann Kryvex nicht anwählen. Nutze die IP oder den Namen des Hosts, optional mit Port.',
    'Load a cartridge before starting netplay.': 'Lade ein Modul, bevor du Netplay startest.',
    'The cartridge could not be written for RetroArch to open.':
      'Das Modul konnte nicht für RetroArch geschrieben werden.',
    'A netplay session is already running.': 'Es läuft bereits eine Netplay-Sitzung.',
    'RetroArch could not be started.': 'RetroArch konnte nicht gestartet werden.',
    'Netplay could not start.': 'Netplay konnte nicht gestartet werden.',
  },
  fr: {
    'NETPLAY (RETROARCH)': 'JEU EN RÉSEAU (RETROARCH)',
    'Frame-synchronised netplay runs on RetroArch, which you install and keep. Kryvex starts it for you and never downloads or bundles it. Both machines need the same game and the same core.':
      'Le jeu en réseau synchronisé image par image fonctionne sur RetroArch, que vous installez et conservez. Kryvex le lance pour vous et ne le télécharge ni ne le fournit jamais. Les deux machines ont besoin du même jeu et du même cœur.',
    'Netplay runs in the desktop app only.': 'Le jeu en réseau ne fonctionne que dans l’application de bureau.',
    'RetroArch: {path}': 'RetroArch : {path}',
    'RetroArch was not found on this machine.': 'RetroArch est introuvable sur cette machine.',
    'Choose another copy': 'Choisir une autre copie',
    'Locate RetroArch': 'Localiser RetroArch',
    'Stop netplay': 'Arrêter le jeu en réseau',
    'RetroArch said': 'Ce que RetroArch a dit',
    'The core for {system} is missing: add {file} from RetroArch’s own core updater.':
      'Le cœur de {system} est absent : ajoutez {file} depuis le gestionnaire de cœurs de RetroArch.',
    'Hosting. The other player enters {address}.': 'Hébergement en cours. L’autre joueur saisit {address}.',
    'Joined {address}.': 'Connecté à {address}.',
    'e.g. 192.168.1.20:55435': 'p. ex. 192.168.1.20:55435',
    'Host address': 'Adresse de l’hôte',
    'Host with RetroArch': 'Héberger avec RetroArch',
    'Join with RetroArch': 'Rejoindre avec RetroArch',
    'The host may have to allow TCP {port} through the firewall, and forward it on the router for a player outside the network. RetroArch opens in its own window; Kryvex stops it when you quit.':
      'L’hôte devra peut-être autoriser TCP {port} dans le pare-feu et le rediriger sur le routeur pour un joueur hors du réseau. RetroArch s’ouvre dans sa propre fenêtre ; Kryvex l’arrête à la fermeture.',
    'RetroArch was not found. Install it, then point Kryvex at retroarch.exe.':
      'RetroArch est introuvable. Installez-le, puis indiquez retroarch.exe à Kryvex.',
    'The core for {system} is not installed: add {file} from RetroArch’s own core updater.':
      'Le cœur de {system} n’est pas installé : ajoutez {file} depuis le gestionnaire de cœurs de RetroArch.',
    'That is not an address Kryvex can dial. Use the host’s IP or name, with an optional port.':
      'Cette adresse n’est pas valide. Utilisez l’IP ou le nom de l’hôte, avec un port facultatif.',
    'Load a cartridge before starting netplay.': 'Chargez une cartouche avant de lancer le jeu en réseau.',
    'The cartridge could not be written for RetroArch to open.':
      'La cartouche n’a pas pu être écrite pour que RetroArch l’ouvre.',
    'A netplay session is already running.': 'Une session de jeu en réseau est déjà en cours.',
    'RetroArch could not be started.': 'RetroArch n’a pas pu être lancé.',
    'Netplay could not start.': 'Le jeu en réseau n’a pas pu démarrer.',
  },
};
