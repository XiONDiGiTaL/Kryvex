/**
 * Copy for couch co-op, the disc join and the windowed tools.
 *
 * Kept together because they are one release: the seats are what a shared
 * screen needs, the disc join is what makes a PlayStation rip startable, and the
 * docking card is what a single-instance tool says when its window holds it.
 *
 * Turkish lives in `i18n-tr.ts` with the rest of that language.
 */
type CouchLanguage = 'es' | 'de' | 'fr';

export const couchCopy: Record<CouchLanguage, Record<string, string>> = {
  es: {
    'COUCH CO-OP': 'COOPERATIVO LOCAL',
    'One screen, one seat each. Claim a controller by pressing a button on it, or give a seat its own keys. Two players can share one keyboard: each keeps its own corner.':
      'Una pantalla, un puesto para cada uno. Reclama un mando pulsando un botón en él o asigna a un puesto sus propias teclas. Dos jugadores pueden compartir un teclado: cada uno conserva su esquina.',
    'Player {number}': 'Jugador {number}',
    'Controller {number}': 'Mando {number}',
    'No device yet': 'Sin dispositivo todavía',
    'Use a controller': 'Usar un mando',
    'Press a button…': 'Pulsa un botón…',
    'Keys for player {number}': 'Teclas del jugador {number}',
    'Keyboard…': 'Teclado…',
    'Free seat': 'Liberar puesto',
    'Press any button on the controller for player {number}.':
      'Pulsa cualquier botón del mando del jugador {number}.',
    'Seats travel with link play: every machine sees all four players.':
      'Los puestos viajan con el juego enlazado: cada máquina ve a los cuatro jugadores.',
    'Link play carries the seats. A seat with no device stays free for another player.':
      'El juego enlazado transporta los puestos. Un puesto sin dispositivo queda libre para otro jugador.',
    'A disc is too large for this link. Use NETPLAY (RETROARCH) below: both machines need the same image, and it synchronises the two cores frame by frame.':
      'Un disco es demasiado grande para este enlace. Usa JUEGO EN RED (RETROARCH) abajo: ambas máquinas necesitan la misma imagen y los dos núcleos se sincronizan fotograma a fotograma.',
    'A .cue needs the .bin track beside it. Select both files and Kryvex joins them into one disc image.':
      'Un .cue necesita la pista .bin a su lado. Selecciona los dos archivos y Kryvex los une en una sola imagen de disco.',
    'The disc was joined from its data track only. If the game’s music is missing, use a .chd of the whole disc.':
      'El disco se unió solo desde su pista de datos. Si falta la música del juego, usa un .chd del disco completo.',
    'Most titles need a PlayStation BIOS. A .cue and its .bin work together: pick both files and Kryvex joins them into one disc image.':
      'La mayoría de los títulos necesitan una BIOS de PlayStation. Un .cue y su .bin funcionan juntos: elige los dos archivos y Kryvex los une en una sola imagen de disco.',
    '{name} is open in a window.': '{name} está abierto en una ventana.',
    'It keeps running there while you use the rest of Kryvex.':
      'Sigue funcionando ahí mientras usas el resto de Kryvex.',
    '{name} put you in seat {number}.': '{name} te puso en el puesto {number}.',
    'The host': 'El anfitrión',
    'IN THE ROOM': 'EN LA SALA',
    '{name} has control of this screen and plays as player {number}.':
      '{name} controla esta pantalla y juega como jugador {number}.',
    '{name} is asking to control this screen.': '{name} pide controlar esta pantalla.',
    'Who plays in seat {number}': 'Quién juega en el puesto {number}',
    'This PC': 'Este equipo',
  },
  de: {
    'COUCH CO-OP': 'COUCH-KOOP',
    'One screen, one seat each. Claim a controller by pressing a button on it, or give a seat its own keys. Two players can share one keyboard: each keeps its own corner.':
      'Ein Bildschirm, ein Platz pro Person. Belege einen Controller mit einer Taste darauf, oder gib einem Platz eigene Tasten. Zwei Spieler können sich eine Tastatur teilen: jeder behält seine Ecke.',
    'Player {number}': 'Spieler {number}',
    'Controller {number}': 'Controller {number}',
    'No device yet': 'Noch kein Gerät',
    'Use a controller': 'Controller verwenden',
    'Press a button…': 'Taste drücken …',
    'Keys for player {number}': 'Tasten für Spieler {number}',
    'Keyboard…': 'Tastatur …',
    'Free seat': 'Platz freigeben',
    'Press any button on the controller for player {number}.':
      'Drücke eine beliebige Taste am Controller für Spieler {number}.',
    'Seats travel with link play: every machine sees all four players.':
      'Die Plätze reisen mit dem Link-Spiel: jeder Rechner sieht alle vier Spieler.',
    'Link play carries the seats. A seat with no device stays free for another player.':
      'Das Link-Spiel überträgt die Plätze. Ein Platz ohne Gerät bleibt für jemand anderen frei.',
    'A disc is too large for this link. Use NETPLAY (RETROARCH) below: both machines need the same image, and it synchronises the two cores frame by frame.':
      'Eine Disc ist zu groß für diese Verbindung. Nutze unten NETZSPIEL (RETROARCH): beide Rechner brauchen dasselbe Abbild, und es synchronisiert die beiden Cores Bild für Bild.',
    'A .cue needs the .bin track beside it. Select both files and Kryvex joins them into one disc image.':
      'Eine .cue braucht die .bin-Spur daneben. Wähle beide Dateien, dann fügt Kryvex sie zu einem Disc-Abbild zusammen.',
    'The disc was joined from its data track only. If the game’s music is missing, use a .chd of the whole disc.':
      'Die Disc wurde nur aus ihrer Datenspur zusammengefügt. Fehlt die Musik des Spiels, nutze ein .chd der ganzen Disc.',
    'Most titles need a PlayStation BIOS. A .cue and its .bin work together: pick both files and Kryvex joins them into one disc image.':
      'Die meisten Titel brauchen ein PlayStation-BIOS. Eine .cue und ihre .bin gehören zusammen: wähle beide Dateien, dann fügt Kryvex sie zu einem Disc-Abbild zusammen.',
    '{name} is open in a window.': '{name} ist in einem Fenster geöffnet.',
    'It keeps running there while you use the rest of Kryvex.':
      'Es läuft dort weiter, während du den Rest von Kryvex nutzt.',
    '{name} put you in seat {number}.': '{name} hat dir Platz {number} gegeben.',
    'The host': 'Der Host',
    'IN THE ROOM': 'IM RAUM',
    '{name} has control of this screen and plays as player {number}.':
      '{name} steuert diesen Bildschirm und spielt als Spieler {number}.',
    '{name} is asking to control this screen.': '{name} möchte diesen Bildschirm steuern.',
    'Who plays in seat {number}': 'Wer spielt auf Platz {number}',
    'This PC': 'Dieser PC',
  },
  fr: {
    'COUCH CO-OP': 'COOP LOCALE',
    'One screen, one seat each. Claim a controller by pressing a button on it, or give a seat its own keys. Two players can share one keyboard: each keeps its own corner.':
      'Un écran, une place chacun. Prenez une manette en appuyant sur un bouton, ou donnez à une place ses propres touches. Deux joueurs peuvent partager un clavier : chacun garde son coin.',
    'Player {number}': 'Joueur {number}',
    'Controller {number}': 'Manette {number}',
    'No device yet': 'Aucun appareil pour l’instant',
    'Use a controller': 'Utiliser une manette',
    'Press a button…': 'Appuyez sur un bouton…',
    'Keys for player {number}': 'Touches du joueur {number}',
    'Keyboard…': 'Clavier…',
    'Free seat': 'Libérer la place',
    'Press any button on the controller for player {number}.':
      'Appuyez sur n’importe quel bouton de la manette du joueur {number}.',
    'Seats travel with link play: every machine sees all four players.':
      'Les places suivent le jeu en réseau : chaque machine voit les quatre joueurs.',
    'Link play carries the seats. A seat with no device stays free for another player.':
      'Le jeu en réseau transporte les places. Une place sans appareil reste libre pour un autre joueur.',
    'A disc is too large for this link. Use NETPLAY (RETROARCH) below: both machines need the same image, and it synchronises the two cores frame by frame.':
      'Un disque est trop volumineux pour cette liaison. Utilisez JEU EN RÉSEAU (RETROARCH) ci-dessous : les deux machines ont besoin de la même image, et il synchronise les deux cœurs image par image.',
    'A .cue needs the .bin track beside it. Select both files and Kryvex joins them into one disc image.':
      'Un .cue a besoin de la piste .bin à côté. Sélectionnez les deux fichiers et Kryvex les réunit en une seule image disque.',
    'The disc was joined from its data track only. If the game’s music is missing, use a .chd of the whole disc.':
      'Le disque a été assemblé à partir de sa seule piste de données. Si la musique du jeu manque, utilisez un .chd du disque complet.',
    'Most titles need a PlayStation BIOS. A .cue and its .bin work together: pick both files and Kryvex joins them into one disc image.':
      'La plupart des titres ont besoin d’un BIOS PlayStation. Un .cue et son .bin vont ensemble : choisissez les deux fichiers et Kryvex les réunit en une seule image disque.',
    '{name} is open in a window.': '{name} est ouvert dans une fenêtre.',
    'It keeps running there while you use the rest of Kryvex.':
      'Il continue d’y tourner pendant que vous utilisez le reste de Kryvex.',
    '{name} put you in seat {number}.': '{name} vous a placé en place {number}.',
    'The host': 'L’hôte',
    'IN THE ROOM': 'DANS LA SALLE',
    '{name} has control of this screen and plays as player {number}.':
      '{name} contrôle cet écran et joue en tant que joueur {number}.',
    '{name} is asking to control this screen.': '{name} demande à contrôler cet écran.',
    'Who plays in seat {number}': 'Qui joue à la place {number}',
    'This PC': 'Cet ordinateur',
  },
};
