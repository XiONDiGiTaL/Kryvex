/**
 * Copy for the Whisper server Kryvex installs on this machine.
 *
 * The card is the first thing a new Lexium user is offered, so its sentences
 * matter more than most: they have to say what will be downloaded, how big it
 * is, that nothing is uploaded, and that this is the engine for accents, music
 * and singing. English is the source; Turkish lives in `i18n-tr.ts` with the
 * rest of that catalogue.
 */
export const speechCopy: Record<'es' | 'de' | 'fr', Record<string, string>> = {
  es: {
    'Whisper on this machine': 'Whisper en este equipo',
    'Kryvex downloads the whisper.cpp server and one speech model once, runs it on this machine and stops it when you ask. Nothing is uploaded. This is the engine to use for accents, music and singing, where the PC dictation engine cannot follow.':
      'Kryvex descarga una vez el servidor whisper.cpp y un modelo de voz, lo ejecuta en este equipo y lo detiene cuando se lo pidas. No se sube nada. Es el motor que conviene usar para acentos, música y canto, donde el dictado de Windows no puede seguir.',
    'One-click Whisper needs the desktop app on 64-bit Windows. The three servers below work from any build.':
      'Whisper con un clic necesita la app de escritorio en Windows de 64 bits. Los tres servidores de abajo funcionan en cualquier versión.',
    'One-click Whisper needs the desktop app on 64-bit Windows.':
      'Whisper con un clic necesita la app de escritorio en Windows de 64 bits.',
    'Speech model': 'Modelo de voz',
    downloaded: 'descargado',
    'Download and start': 'Descargar y empezar',
    'Start the engine': 'Iniciar el motor',
    'Stop the engine': 'Detener el motor',
    'Use this engine': 'Usar este motor',
    Remove: 'Quitar',
    'Working…': 'Trabajando…',
    'Checking the download…': 'Comprobando la descarga…',
    'Unpacking the server…': 'Descomprimiendo el servidor…',
    'Downloading the whisper.cpp server…': 'Descargando el servidor whisper.cpp…',
    'Downloading the speech model…': 'Descargando el modelo de voz…',
    'The download failed.': 'La descarga falló.',
    'The engine failed.': 'El motor falló.',
    'Running on {url}. Lexium uses it as soon as it is up.':
      'En marcha en {url}. Lexium lo usará en cuanto esté listo.',
    '{name} is downloaded and ready to start.':
      '{name} está descargado y listo para iniciar.',
    'Nothing is installed yet. The download is a one-time {size} for the model you pick.':
      'Aún no hay nada instalado. La descarga es única: {size} para el modelo que elijas.',
    'The server is whisper.cpp (MIT). The models are OpenAI’s Whisper weights, converted by the same project and also MIT. Kryvex fetches them from their own release pages and checks the SHA-256 before unpacking.':
      'El servidor es whisper.cpp (MIT). Los modelos son los pesos de Whisper de OpenAI, convertidos por el mismo proyecto y también MIT. Kryvex los obtiene de sus propias páginas de publicación y comprueba el SHA-256 antes de descomprimir.',
    'What the server said': 'Lo que dijo el servidor',
    'Transcribing with the model on this machine.':
      'Transcribiendo con el modelo de este equipo.',
    'The pinned speech build failed its own review, so Kryvex will not install it.':
      'La compilación de voz fijada no superó su propia revisión, así que Kryvex no la instalará.',
    'The download could not be reached. Check the connection and try again.':
      'No se pudo alcanzar la descarga. Comprueba la conexión e inténtalo de nuevo.',
    'Not enough free space for that model. Free some space, or pick a smaller one.':
      'No hay espacio libre suficiente para ese modelo. Libera espacio o elige uno más pequeño.',
    'The download did not match its checksum, so it was discarded. Try again.':
      'La descarga no coincidió con su suma de comprobación, así que se descartó. Inténtalo de nuevo.',
    'The download was incomplete, so it was discarded. Try again.':
      'La descarga quedó incompleta, así que se descartó. Inténtalo de nuevo.',
    'The download was cancelled.': 'La descarga se canceló.',
    'The files could not be written. Check that the folder is writable and try again.':
      'No se pudieron escribir los archivos. Comprueba que la carpeta permita escritura e inténtalo de nuevo.',
    'The server archive could not be unpacked, so it was discarded.':
      'El archivo del servidor no se pudo descomprimir, así que se descartó.',
    'The server could not be started.': 'El servidor no se pudo iniciar.',
    'The server did not answer in time. A larger model takes longer to load; try again.':
      'El servidor no respondió a tiempo. Un modelo más grande tarda más en cargar; inténtalo de nuevo.',
    'The server stopped on its own. The lines below say why.':
      'El servidor se detuvo solo. Las líneas de abajo dicen por qué.',
    'Download the server before starting it.': 'Descarga el servidor antes de iniciarlo.',
    'A download is already running.': 'Ya hay una descarga en curso.',
  },
  de: {
    'Whisper on this machine': 'Whisper auf diesem PC',
    'Kryvex downloads the whisper.cpp server and one speech model once, runs it on this machine and stops it when you ask. Nothing is uploaded. This is the engine to use for accents, music and singing, where the PC dictation engine cannot follow.':
      'Kryvex lädt einmalig den whisper.cpp-Server und ein Sprachmodell herunter, führt beides auf diesem PC aus und stoppt es auf deinen Wunsch. Nichts wird hochgeladen. Diese Engine ist die richtige für Akzente, Musik und Gesang, wo das Diktat von Windows nicht folgen kann.',
    'One-click Whisper needs the desktop app on 64-bit Windows. The three servers below work from any build.':
      'Whisper mit einem Klick braucht die Desktop-App unter 64-Bit-Windows. Die drei Server unten laufen in jeder Version.',
    'One-click Whisper needs the desktop app on 64-bit Windows.':
      'Whisper mit einem Klick braucht die Desktop-App unter 64-Bit-Windows.',
    'Speech model': 'Sprachmodell',
    downloaded: 'heruntergeladen',
    'Download and start': 'Herunterladen und starten',
    'Start the engine': 'Engine starten',
    'Stop the engine': 'Engine stoppen',
    'Use this engine': 'Diese Engine verwenden',
    Remove: 'Entfernen',
    'Working…': 'Arbeitet…',
    'Checking the download…': 'Download wird geprüft…',
    'Unpacking the server…': 'Server wird entpackt…',
    'Downloading the whisper.cpp server…': 'whisper.cpp-Server wird heruntergeladen…',
    'Downloading the speech model…': 'Sprachmodell wird heruntergeladen…',
    'The download failed.': 'Der Download ist fehlgeschlagen.',
    'The engine failed.': 'Die Engine ist fehlgeschlagen.',
    'Running on {url}. Lexium uses it as soon as it is up.':
      'Läuft auf {url}. Lexium nutzt sie, sobald sie bereit ist.',
    '{name} is downloaded and ready to start.': '{name} ist heruntergeladen und startbereit.',
    'Nothing is installed yet. The download is a one-time {size} for the model you pick.':
      'Noch ist nichts installiert. Der Download ist einmalig {size} für das gewählte Modell.',
    'The server is whisper.cpp (MIT). The models are OpenAI’s Whisper weights, converted by the same project and also MIT. Kryvex fetches them from their own release pages and checks the SHA-256 before unpacking.':
      'Der Server ist whisper.cpp (MIT). Die Modelle sind OpenAIs Whisper-Gewichte, konvertiert vom selben Projekt und ebenfalls MIT. Kryvex lädt sie von deren eigenen Release-Seiten und prüft die SHA-256 vor dem Entpacken.',
    'What the server said': 'Was der Server gemeldet hat',
    'Transcribing with the model on this machine.':
      'Transkription mit dem Modell auf diesem PC.',
    'The pinned speech build failed its own review, so Kryvex will not install it.':
      'Der geprüfte Sprach-Build hat seine eigene Prüfung nicht bestanden; Kryvex installiert ihn nicht.',
    'The download could not be reached. Check the connection and try again.':
      'Der Download war nicht erreichbar. Prüfe die Verbindung und versuche es erneut.',
    'Not enough free space for that model. Free some space, or pick a smaller one.':
      'Nicht genug freier Speicher für dieses Modell. Gib Speicher frei oder wähle ein kleineres.',
    'The download did not match its checksum, so it was discarded. Try again.':
      'Der Download passte nicht zu seiner Prüfsumme und wurde verworfen. Versuche es erneut.',
    'The download was incomplete, so it was discarded. Try again.':
      'Der Download war unvollständig und wurde verworfen. Versuche es erneut.',
    'The download was cancelled.': 'Der Download wurde abgebrochen.',
    'The files could not be written. Check that the folder is writable and try again.':
      'Die Dateien konnten nicht geschrieben werden. Prüfe, ob der Ordner beschreibbar ist.',
    'The server archive could not be unpacked, so it was discarded.':
      'Das Server-Archiv konnte nicht entpackt werden und wurde verworfen.',
    'The server could not be started.': 'Der Server konnte nicht gestartet werden.',
    'The server did not answer in time. A larger model takes longer to load; try again.':
      'Der Server hat nicht rechtzeitig geantwortet. Ein größeres Modell braucht länger; versuche es erneut.',
    'The server stopped on its own. The lines below say why.':
      'Der Server hat sich selbst beendet. Die Zeilen unten nennen den Grund.',
    'Download the server before starting it.': 'Lade den Server herunter, bevor du ihn startest.',
    'A download is already running.': 'Es läuft bereits ein Download.',
  },
  fr: {
    'Whisper on this machine': 'Whisper sur cet ordinateur',
    'Kryvex downloads the whisper.cpp server and one speech model once, runs it on this machine and stops it when you ask. Nothing is uploaded. This is the engine to use for accents, music and singing, where the PC dictation engine cannot follow.':
      'Kryvex télécharge une fois le serveur whisper.cpp et un modèle vocal, l’exécute sur cet ordinateur et l’arrête quand vous le demandez. Rien n’est envoyé. C’est le moteur à utiliser pour les accents, la musique et le chant, là où la dictée de Windows ne suit pas.',
    'One-click Whisper needs the desktop app on 64-bit Windows. The three servers below work from any build.':
      'Whisper en un clic nécessite l’application de bureau sous Windows 64 bits. Les trois serveurs ci-dessous fonctionnent dans toutes les versions.',
    'One-click Whisper needs the desktop app on 64-bit Windows.':
      'Whisper en un clic nécessite l’application de bureau sous Windows 64 bits.',
    'Speech model': 'Modèle vocal',
    downloaded: 'téléchargé',
    'Download and start': 'Télécharger et démarrer',
    'Start the engine': 'Démarrer le moteur',
    'Stop the engine': 'Arrêter le moteur',
    'Use this engine': 'Utiliser ce moteur',
    Remove: 'Supprimer',
    'Working…': 'En cours…',
    'Checking the download…': 'Vérification du téléchargement…',
    'Unpacking the server…': 'Décompression du serveur…',
    'Downloading the whisper.cpp server…': 'Téléchargement du serveur whisper.cpp…',
    'Downloading the speech model…': 'Téléchargement du modèle vocal…',
    'The download failed.': 'Le téléchargement a échoué.',
    'The engine failed.': 'Le moteur a échoué.',
    'Running on {url}. Lexium uses it as soon as it is up.':
      'En marche sur {url}. Lexium l’utilisera dès qu’il sera prêt.',
    '{name} is downloaded and ready to start.':
      '{name} est téléchargé et prêt à démarrer.',
    'Nothing is installed yet. The download is a one-time {size} for the model you pick.':
      'Rien n’est encore installé. Le téléchargement est unique : {size} pour le modèle choisi.',
    'The server is whisper.cpp (MIT). The models are OpenAI’s Whisper weights, converted by the same project and also MIT. Kryvex fetches them from their own release pages and checks the SHA-256 before unpacking.':
      'Le serveur est whisper.cpp (MIT). Les modèles sont les poids Whisper d’OpenAI, convertis par le même projet et également MIT. Kryvex les récupère sur leurs propres pages de publication et vérifie le SHA-256 avant de décompresser.',
    'What the server said': 'Ce que le serveur a dit',
    'Transcribing with the model on this machine.':
      'Transcription avec le modèle de cet ordinateur.',
    'The pinned speech build failed its own review, so Kryvex will not install it.':
      'La compilation vocale épinglée n’a pas passé sa propre vérification : Kryvex ne l’installe pas.',
    'The download could not be reached. Check the connection and try again.':
      'Le téléchargement est injoignable. Vérifiez la connexion et réessayez.',
    'Not enough free space for that model. Free some space, or pick a smaller one.':
      'Pas assez d’espace libre pour ce modèle. Libérez de l’espace ou choisissez-en un plus petit.',
    'The download did not match its checksum, so it was discarded. Try again.':
      'Le téléchargement ne correspondait pas à sa somme de contrôle : il a été supprimé. Réessayez.',
    'The download was incomplete, so it was discarded. Try again.':
      'Le téléchargement était incomplet : il a été supprimé. Réessayez.',
    'The download was cancelled.': 'Le téléchargement a été annulé.',
    'The files could not be written. Check that the folder is writable and try again.':
      'Les fichiers n’ont pas pu être écrits. Vérifiez que le dossier est accessible en écriture.',
    'The server archive could not be unpacked, so it was discarded.':
      'L’archive du serveur n’a pas pu être décompressée : elle a été supprimée.',
    'The server could not be started.': 'Le serveur n’a pas pu démarrer.',
    'The server did not answer in time. A larger model takes longer to load; try again.':
      'Le serveur n’a pas répondu à temps. Un modèle plus grand met plus longtemps ; réessayez.',
    'The server stopped on its own. The lines below say why.':
      'Le serveur s’est arrêté tout seul. Les lignes ci-dessous en donnent la raison.',
    'Download the server before starting it.': 'Téléchargez le serveur avant de le démarrer.',
    'A download is already running.': 'Un téléchargement est déjà en cours.',
  },
};
