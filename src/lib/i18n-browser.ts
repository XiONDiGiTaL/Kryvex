/**
 * Copy for the browser start page, the private-tab surface and the options
 * menu. Kept in its own catalogue so the three large language blocks in
 * `i18n.tsx` stay readable and a new browser string lands in one place.
 */
type BrowserLanguage = 'es' | 'de' | 'fr';

export const browserCopy: Record<BrowserLanguage, Record<string, string>> = {
  es: {
    'Enter a feed address, for example example.com/rss.':
      'Introduce una dirección de feed, por ejemplo example.com/rss.',
    'That feed is already on this page.': 'Ese feed ya está en esta página.',
    'A start page can hold up to {count} feeds.':
      'Una página de inicio puede tener hasta {count} feeds.',
    'Feed added to the start page.': 'Feed añadido a la página de inicio.',
    'No feeds were found in that OPML file.': 'No se encontraron feeds en ese archivo OPML.',
    'Those feeds are already on this page.': 'Esos feeds ya están en esta página.',
    '{count} feeds imported from {name}.': 'Se importaron {count} feeds desde {name}.',
    'That OPML file could not be read.': 'No se pudo leer ese archivo OPML.',
    'That feed address is not a web URL.': 'Esa dirección de feed no es una URL web.',
    'That feed is larger than 2 MB.': 'Ese feed supera los 2 MB.',
    'That address answered, but not with a feed.':
      'Esa dirección respondió, pero no con un feed.',
    'The feed is readable but has no entries.': 'El feed se puede leer pero no tiene entradas.',
    'The feed could not be reached.': 'No se pudo contactar con el feed.',
    'KRYVEX START / PRIVATE': 'KRYVEX START / PRIVADO',
    'KRYVEX START / ELEMENT x529': 'KRYVEX START / ELEMENTO x529',
    'A tab that leaves no trace': 'Una pestaña que no deja rastro',
    'Cookies, site storage and history from this tab stay in memory and disappear when it closes. Downloads still reach your disk, and the Shield still filters.':
      'Las cookies, el almacenamiento del sitio y el historial de esta pestaña permanecen en memoria y desaparecen al cerrarla. Las descargas siguen llegando al disco y el Escudo sigue filtrando.',
    'One address bar for the web, one place for your modules, and a start page that tells you what the browser is doing. Everything below is local.':
      'Una barra de direcciones para la web, un lugar para tus módulos y una página de inicio que te cuenta qué hace el navegador. Todo lo de abajo es local.',
    PRIVATE: 'PRIVADO',
    START: 'INICIO',
    'Search privately with {engine}': 'Buscar de forma privada con {engine}',
    'SHIELD / DESKTOP': 'ESCUDO / ESCRITORIO',
    'SHIELD / ON': 'ESCUDO / ACTIVO',
    'SHIELD / OFF': 'ESCUDO / INACTIVO',
    '{count} MODULES': '{count} MÓDULOS',
    '{count} BOOKMARKS': '{count} MARCADORES',
    '{count} FEEDS': '{count} FEEDS',
    'SHIELD / LIVE': 'ESCUDO / EN VIVO',
    'What was blocked': 'Qué se bloqueó',
    'The Shield runs inside the desktop app. This web preview cannot filter traffic.':
      'El Escudo funciona dentro de la app de escritorio. Esta vista web no puede filtrar tráfico.',
    'requests blocked this session': 'peticiones bloqueadas en esta sesión',
    'Network filters': 'Filtros de red',
    'HTTPS upgrades': 'Mejoras a HTTPS',
    'Tracking parameters stripped': 'Parámetros de seguimiento eliminados',
    '{lists} filter lists loaded{updated}.':
      'Se cargaron {lists} listas de filtros{updated}.',
    'updated {time}': 'actualizadas el {time}',
    'The Shield is currently off. Turn it on in Settings to filter requests.':
      'El Escudo está desactivado. Actívalo en Ajustes para filtrar peticiones.',
    'Reading the Shield counters…': 'Leyendo los contadores del Escudo…',
    'Open Shield settings': 'Abrir ajustes del Escudo',
    'FIELD GUIDE / 05 STEPS': 'GUÍA DE CAMPO / 05 PASOS',
    'How this browser works': 'Cómo funciona este navegador',
    'Type an address or a question above. Kryvex searches when the text is not a URL.':
      'Escribe una dirección o una pregunta arriba. Kryvex busca cuando el texto no es una URL.',
    'Ctrl T opens a tab, Ctrl Shift N opens a private one, Ctrl F finds inside a page.':
      'Ctrl T abre una pestaña, Ctrl Mayús N abre una privada y Ctrl F busca dentro de una página.',
    'The ribbon in the tab strip bookmarks a page. Downloads, history and bookmarks sit in the right-hand library.':
      'La cinta de la barra de pestañas guarda un marcador. Descargas, historial y marcadores están en la biblioteca de la derecha.',
    'Every tab has its own in-memory session, so a sign-in cannot leak into another tab.':
      'Cada pestaña tiene su propia sesión en memoria, así que un inicio de sesión no puede filtrarse a otra pestaña.',
    'Add a feed below and it is waiting here the next time you open a tab.':
      'Añade un feed abajo y estará aquí la próxima vez que abras una pestaña.',
    'FEEDS / LOCAL READER': 'FEEDS / LECTOR LOCAL',
    'Your reading list': 'Tu lista de lectura',
    Refresh: 'Actualizar',
    'Import OPML': 'Importar OPML',
    'Paste an RSS or Atom address': 'Pega una dirección RSS o Atom',
    'Feed address': 'Dirección del feed',
    'Add feed': 'Añadir feed',
    'Reading your feeds…': 'Leyendo tus feeds…',
    'No feeds on this page yet': 'Aún no hay feeds en esta página',
    'No entries to show': 'No hay entradas que mostrar',
    'Paste a feed address, or import the OPML file your current reader exports. Kryvex fetches only the feeds you add.':
      'Pega la dirección de un feed o importa el archivo OPML que exporta tu lector actual. Kryvex solo descarga los feeds que añadas.',
    'The feeds answered without entries. Refresh, or remove one below.':
      'Los feeds respondieron sin entradas. Actualiza o quita uno abajo.',
    '{count} SOURCES{errors}': '{count} FUENTES{errors}',
    '{count} UNAVAILABLE': '{count} NO DISPONIBLES',
    'Remove {name} feed': 'Quitar el feed {name}',
    'WORKSPACE / QUICK LAUNCH': 'ESPACIO / INICIO RÁPIDO',
    'Your modules and bookmarks': 'Tus módulos y marcadores',
    MODULES: 'MÓDULOS',
    BOOKMARKS: 'MARCADORES',
    'No modules yet. Add one in Services.': 'Aún no hay módulos. Añade uno en Servicios.',
    'Save a page with the ribbon in the tab strip and it appears here.':
      'Guarda una página con la cinta de la barra de pestañas y aparecerá aquí.',
    'New private tab': 'Nueva pestaña privada',
    'Private tabs closed. Their session data is gone.':
      'Pestañas privadas cerradas. Sus datos de sesión se han eliminado.',
    'Browser options': 'Opciones del navegador',
    'Shield settings': 'Ajustes del Escudo',
    'Search privately or enter an address': 'Busca de forma privada o introduce una dirección',
  },
  de: {
    'Enter a feed address, for example example.com/rss.':
      'Gib eine Feed-Adresse ein, zum Beispiel example.com/rss.',
    'That feed is already on this page.': 'Dieser Feed ist bereits auf dieser Seite.',
    'A start page can hold up to {count} feeds.':
      'Eine Startseite kann bis zu {count} Feeds halten.',
    'Feed added to the start page.': 'Feed zur Startseite hinzugefügt.',
    'No feeds were found in that OPML file.':
      'In dieser OPML-Datei wurden keine Feeds gefunden.',
    'Those feeds are already on this page.': 'Diese Feeds sind bereits auf dieser Seite.',
    '{count} feeds imported from {name}.': '{count} Feeds aus {name} importiert.',
    'That OPML file could not be read.': 'Diese OPML-Datei konnte nicht gelesen werden.',
    'That feed address is not a web URL.': 'Diese Feed-Adresse ist keine Web-URL.',
    'That feed is larger than 2 MB.': 'Dieser Feed ist größer als 2 MB.',
    'That address answered, but not with a feed.':
      'Diese Adresse antwortete, aber nicht mit einem Feed.',
    'The feed is readable but has no entries.': 'Der Feed ist lesbar, hat aber keine Einträge.',
    'The feed could not be reached.': 'Der Feed konnte nicht erreicht werden.',
    'KRYVEX START / PRIVATE': 'KRYVEX START / PRIVAT',
    'KRYVEX START / ELEMENT x529': 'KRYVEX START / ELEMENT x529',
    'A tab that leaves no trace': 'Ein Tab, der keine Spuren hinterlässt',
    'Cookies, site storage and history from this tab stay in memory and disappear when it closes. Downloads still reach your disk, and the Shield still filters.':
      'Cookies, Website-Speicher und Verlauf dieses Tabs bleiben im Arbeitsspeicher und verschwinden beim Schließen. Downloads landen weiterhin auf der Festplatte, und der Schutz filtert weiter.',
    'One address bar for the web, one place for your modules, and a start page that tells you what the browser is doing. Everything below is local.':
      'Eine Adressleiste für das Web, ein Ort für deine Module und eine Startseite, die zeigt, was der Browser tut. Alles hier unten ist lokal.',
    PRIVATE: 'PRIVAT',
    START: 'START',
    'Search privately with {engine}': 'Privat suchen mit {engine}',
    'SHIELD / DESKTOP': 'SCHUTZ / DESKTOP',
    'SHIELD / ON': 'SCHUTZ / AN',
    'SHIELD / OFF': 'SCHUTZ / AUS',
    '{count} MODULES': '{count} MODULE',
    '{count} BOOKMARKS': '{count} LESEZEICHEN',
    '{count} FEEDS': '{count} FEEDS',
    'SHIELD / LIVE': 'SCHUTZ / LIVE',
    'What was blocked': 'Was blockiert wurde',
    'The Shield runs inside the desktop app. This web preview cannot filter traffic.':
      'Der Schutz läuft in der Desktop-App. Diese Web-Vorschau kann keinen Datenverkehr filtern.',
    'requests blocked this session': 'Anfragen in dieser Sitzung blockiert',
    'Network filters': 'Netzwerkfilter',
    'HTTPS upgrades': 'HTTPS-Upgrades',
    'Tracking parameters stripped': 'Tracking-Parameter entfernt',
    '{lists} filter lists loaded{updated}.': '{lists} Filterlisten geladen{updated}.',
    'updated {time}': 'aktualisiert am {time}',
    'The Shield is currently off. Turn it on in Settings to filter requests.':
      'Der Schutz ist derzeit aus. Aktiviere ihn in den Einstellungen, um Anfragen zu filtern.',
    'Reading the Shield counters…': 'Schutz-Zähler werden gelesen…',
    'Open Shield settings': 'Schutz-Einstellungen öffnen',
    'FIELD GUIDE / 05 STEPS': 'FELDHILFE / 05 SCHRITTE',
    'How this browser works': 'So funktioniert dieser Browser',
    'Type an address or a question above. Kryvex searches when the text is not a URL.':
      'Gib oben eine Adresse oder eine Frage ein. Kryvex sucht, wenn der Text keine URL ist.',
    'Ctrl T opens a tab, Ctrl Shift N opens a private one, Ctrl F finds inside a page.':
      'Strg T öffnet einen Tab, Strg Umschalt N einen privaten, Strg F sucht auf einer Seite.',
    'The ribbon in the tab strip bookmarks a page. Downloads, history and bookmarks sit in the right-hand library.':
      'Das Band in der Tab-Leiste speichert ein Lesezeichen. Downloads, Verlauf und Lesezeichen liegen in der Bibliothek rechts.',
    'Every tab has its own in-memory session, so a sign-in cannot leak into another tab.':
      'Jeder Tab hat seine eigene Sitzung im Arbeitsspeicher, sodass eine Anmeldung nicht in einen anderen Tab gelangen kann.',
    'Add a feed below and it is waiting here the next time you open a tab.':
      'Füge unten einen Feed hinzu; er wartet beim nächsten Tab auf dich.',
    'FEEDS / LOCAL READER': 'FEEDS / LOKALER READER',
    'Your reading list': 'Deine Leseliste',
    Refresh: 'Aktualisieren',
    'Import OPML': 'OPML importieren',
    'Paste an RSS or Atom address': 'RSS- oder Atom-Adresse einfügen',
    'Feed address': 'Feed-Adresse',
    'Add feed': 'Feed hinzufügen',
    'Reading your feeds…': 'Deine Feeds werden gelesen…',
    'No feeds on this page yet': 'Noch keine Feeds auf dieser Seite',
    'No entries to show': 'Keine Einträge anzuzeigen',
    'Paste a feed address, or import the OPML file your current reader exports. Kryvex fetches only the feeds you add.':
      'Füge eine Feed-Adresse ein oder importiere die OPML-Datei deines aktuellen Readers. Kryvex ruft nur die Feeds ab, die du hinzufügst.',
    'The feeds answered without entries. Refresh, or remove one below.':
      'Die Feeds antworteten ohne Einträge. Aktualisiere oder entferne unten einen.',
    '{count} SOURCES{errors}': '{count} QUELLEN{errors}',
    '{count} UNAVAILABLE': '{count} NICHT ERREICHBAR',
    'Remove {name} feed': 'Feed {name} entfernen',
    'WORKSPACE / QUICK LAUNCH': 'ARBEITSBEREICH / SCHNELLSTART',
    'Your modules and bookmarks': 'Deine Module und Lesezeichen',
    MODULES: 'MODULE',
    BOOKMARKS: 'LESEZEICHEN',
    'No modules yet. Add one in Services.':
      'Noch keine Module. Füge in Dienste eines hinzu.',
    'Save a page with the ribbon in the tab strip and it appears here.':
      'Speichere eine Seite über das Band in der Tab-Leiste; sie erscheint hier.',
    'New private tab': 'Neuer privater Tab',
    'Private tabs closed. Their session data is gone.':
      'Private Tabs geschlossen. Ihre Sitzungsdaten sind weg.',
    'Browser options': 'Browser-Optionen',
    'Shield settings': 'Schutz-Einstellungen',
    'Search privately or enter an address': 'Privat suchen oder Adresse eingeben',
  },
  fr: {
    'Enter a feed address, for example example.com/rss.':
      'Saisissez une adresse de flux, par exemple example.com/rss.',
    'That feed is already on this page.': 'Ce flux est déjà sur cette page.',
    'A start page can hold up to {count} feeds.':
      'Une page de démarrage peut contenir jusqu’à {count} flux.',
    'Feed added to the start page.': 'Flux ajouté à la page de démarrage.',
    'No feeds were found in that OPML file.': 'Aucun flux trouvé dans ce fichier OPML.',
    'Those feeds are already on this page.': 'Ces flux sont déjà sur cette page.',
    '{count} feeds imported from {name}.': '{count} flux importés depuis {name}.',
    'That OPML file could not be read.': 'Ce fichier OPML n’a pas pu être lu.',
    'That feed address is not a web URL.': 'Cette adresse de flux n’est pas une URL web.',
    'That feed is larger than 2 MB.': 'Ce flux dépasse 2 Mo.',
    'That address answered, but not with a feed.':
      'Cette adresse a répondu, mais pas avec un flux.',
    'The feed is readable but has no entries.': 'Le flux est lisible mais ne contient aucune entrée.',
    'The feed could not be reached.': 'Le flux n’a pas pu être joint.',
    'KRYVEX START / PRIVATE': 'KRYVEX START / PRIVÉ',
    'KRYVEX START / ELEMENT x529': 'KRYVEX START / ÉLÉMENT x529',
    'A tab that leaves no trace': 'Un onglet qui ne laisse aucune trace',
    'Cookies, site storage and history from this tab stay in memory and disappear when it closes. Downloads still reach your disk, and the Shield still filters.':
      'Les cookies, le stockage du site et l’historique de cet onglet restent en mémoire et disparaissent à sa fermeture. Les téléchargements vont toujours sur le disque et le Bouclier filtre toujours.',
    'One address bar for the web, one place for your modules, and a start page that tells you what the browser is doing. Everything below is local.':
      'Une barre d’adresse pour le web, un endroit pour vos modules et une page de démarrage qui montre ce que fait le navigateur. Tout ce qui suit reste local.',
    PRIVATE: 'PRIVÉ',
    START: 'DÉMARRAGE',
    'Search privately with {engine}': 'Rechercher en privé avec {engine}',
    'SHIELD / DESKTOP': 'BOUCLIER / BUREAU',
    'SHIELD / ON': 'BOUCLIER / ACTIF',
    'SHIELD / OFF': 'BOUCLIER / INACTIF',
    '{count} MODULES': '{count} MODULES',
    '{count} BOOKMARKS': '{count} SIGNETS',
    '{count} FEEDS': '{count} FLUX',
    'SHIELD / LIVE': 'BOUCLIER / EN DIRECT',
    'What was blocked': 'Ce qui a été bloqué',
    'The Shield runs inside the desktop app. This web preview cannot filter traffic.':
      'Le Bouclier fonctionne dans l’application de bureau. Cet aperçu web ne peut pas filtrer le trafic.',
    'requests blocked this session': 'requêtes bloquées pendant cette session',
    'Network filters': 'Filtres réseau',
    'HTTPS upgrades': 'Passages en HTTPS',
    'Tracking parameters stripped': 'Paramètres de suivi supprimés',
    '{lists} filter lists loaded{updated}.': '{lists} listes de filtres chargées{updated}.',
    'updated {time}': 'mises à jour le {time}',
    'The Shield is currently off. Turn it on in Settings to filter requests.':
      'Le Bouclier est désactivé. Activez-le dans Réglages pour filtrer les requêtes.',
    'Reading the Shield counters…': 'Lecture des compteurs du Bouclier…',
    'Open Shield settings': 'Ouvrir les réglages du Bouclier',
    'FIELD GUIDE / 05 STEPS': 'GUIDE DE TERRAIN / 05 ÉTAPES',
    'How this browser works': 'Comment fonctionne ce navigateur',
    'Type an address or a question above. Kryvex searches when the text is not a URL.':
      'Saisissez une adresse ou une question ci-dessus. Kryvex effectue une recherche lorsque le texte n’est pas une URL.',
    'Ctrl T opens a tab, Ctrl Shift N opens a private one, Ctrl F finds inside a page.':
      'Ctrl T ouvre un onglet, Ctrl Maj N un onglet privé, Ctrl F cherche dans la page.',
    'The ribbon in the tab strip bookmarks a page. Downloads, history and bookmarks sit in the right-hand library.':
      'Le ruban de la barre d’onglets enregistre un signet. Téléchargements, historique et signets sont dans la bibliothèque à droite.',
    'Every tab has its own in-memory session, so a sign-in cannot leak into another tab.':
      'Chaque onglet a sa propre session en mémoire : une connexion ne peut pas fuir vers un autre onglet.',
    'Add a feed below and it is waiting here the next time you open a tab.':
      'Ajoutez un flux ci-dessous ; il sera là à la prochaine ouverture d’un onglet.',
    'FEEDS / LOCAL READER': 'FLUX / LECTEUR LOCAL',
    'Your reading list': 'Votre liste de lecture',
    Refresh: 'Actualiser',
    'Import OPML': 'Importer OPML',
    'Paste an RSS or Atom address': 'Collez une adresse RSS ou Atom',
    'Feed address': 'Adresse du flux',
    'Add feed': 'Ajouter le flux',
    'Reading your feeds…': 'Lecture de vos flux…',
    'No feeds on this page yet': 'Aucun flux sur cette page',
    'No entries to show': 'Aucune entrée à afficher',
    'Paste a feed address, or import the OPML file your current reader exports. Kryvex fetches only the feeds you add.':
      'Collez l’adresse d’un flux ou importez le fichier OPML exporté par votre lecteur actuel. Kryvex ne récupère que les flux que vous ajoutez.',
    'The feeds answered without entries. Refresh, or remove one below.':
      'Les flux ont répondu sans entrées. Actualisez ou supprimez-en un ci-dessous.',
    '{count} SOURCES{errors}': '{count} SOURCES{errors}',
    '{count} UNAVAILABLE': '{count} INDISPONIBLES',
    'Remove {name} feed': 'Supprimer le flux {name}',
    'WORKSPACE / QUICK LAUNCH': 'ESPACE / LANCEMENT RAPIDE',
    'Your modules and bookmarks': 'Vos modules et signets',
    MODULES: 'MODULES',
    BOOKMARKS: 'SIGNETS',
    'No modules yet. Add one in Services.': 'Aucun module. Ajoutez-en un dans Services.',
    'Save a page with the ribbon in the tab strip and it appears here.':
      'Enregistrez une page avec le ruban de la barre d’onglets ; elle apparaîtra ici.',
    'New private tab': 'Nouvel onglet privé',
    'Private tabs closed. Their session data is gone.':
      'Onglets privés fermés. Leurs données de session ont disparu.',
    'Browser options': 'Options du navigateur',
    'Shield settings': 'Réglages du Bouclier',
    'Search privately or enter an address': 'Rechercher en privé ou saisir une adresse',
  },
};
