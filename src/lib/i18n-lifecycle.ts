/**
 * Copy for the service lifecycle panel and the emulator's save management.
 *
 * The lifecycle vocabulary ("parked", "paused", "stopped") is ordinary UI text,
 * so it is translated like everything else. The three capability notes are
 * translated too, because the settings panel shows them verbatim: a service
 * that cannot pause has to say so in the user's language.
 */
type LifecycleLanguage = 'es' | 'de' | 'fr';

export const lifecycleCopy: Record<LifecycleLanguage, Record<string, string>> = {
  es: {
    'Keep running': 'Seguir en ejecución',
    'The service keeps working while another screen is in front.':
      'El servicio sigue funcionando mientras otra pantalla está delante.',
    'Keep running, muted': 'Seguir en ejecución, en silencio',
    'It keeps working, but its audio is silenced until it is shown again.':
      'Sigue funcionando, pero su audio se silencia hasta que vuelve a mostrarse.',
    'Pause on leave': 'Pausar al salir',
    'It suspends when you leave and picks up where it stopped when you return.':
      'Se suspende al salir y continúa donde se quedó al volver.',
    'Pause when idle': 'Pausar por inactividad',
    'It keeps running for a while, then suspends after the interval below.':
      'Sigue funcionando un tiempo y luego se suspende tras el intervalo indicado.',
    'Stop when leaving': 'Detener al salir',
    'It is closed when you leave. Reopening starts it again from scratch.':
      'Se cierra al salir. Al reabrirlo empieza de nuevo desde cero.',
    '8-bit emulator': 'Emulador de 8 bits',
    'A running game and its core stay loaded.':
      'El juego en marcha y su núcleo permanecen cargados.',
    'Disk pulse': 'Pulso del disco',
    'A scan runs in the main process; leaving the page never cancels it.':
      'El análisis se ejecuta en el proceso principal; salir de la página nunca lo cancela.',
    Rooms: 'Salas',
    'Membership, chat history and a shared stream stay connected.':
      'La membresía, el historial del chat y la transmisión compartida siguen conectados.',
    'Web modules': 'Módulos web',
    'Each module keeps its own Chromium session, cookies and sign-in.':
      'Cada módulo mantiene su propia sesión de Chromium, sus cookies y su inicio de sesión.',
    'This service cannot suspend, so it stays in the background.':
      'Este servicio no puede suspenderse, así que sigue en segundo plano.',
    'This service cannot keep running in the background.':
      'Este servicio no puede seguir ejecutándose en segundo plano.',
    'This service has no audio to silence, so it keeps running with sound.':
      'Este servicio no tiene audio que silenciar, así que sigue con sonido.',

    'Service lifecycle': 'Ciclo de vida de los servicios',
    'What happens to a service once you are looking somewhere else. Pinning a service only makes it easy to reach: it never starts it or keeps it running on its own.':
      'Qué le ocurre a un servicio cuando miras a otra parte. Fijar un servicio solo lo deja a mano: nunca lo inicia ni lo mantiene en marcha por sí solo.',
    'Default behaviour': 'Comportamiento predeterminado',
    'Pause after': 'Pausar tras',
    'Currently {interval}. Any value from {min} to {max} minutes.':
      'Ahora: {interval}. Cualquier valor de {min} a {max} minutos.',
    '{count}m': '{count} min',
    '{count}h': '{count} h',
    'Minutes before pausing': 'Minutos antes de pausar',
    'PER SERVICE': 'POR SERVICIO',
    'Now: {state}.': 'Ahora: {state}.',
    'Lifecycle for {name}': 'Ciclo de vida de {name}',
    'Use the default': 'Usar el predeterminado',
    'A parked service stays loaded at zero opacity; a paused one is asked to suspend but keeps its memory. Only “stop” closes it, and reopening then starts from scratch.':
      'Un servicio aparcado sigue cargado con opacidad cero; a uno pausado se le pide suspender pero conserva su memoria. Solo «detener» lo cierra, y al reabrirlo empieza de cero.',

    'Save states': 'Estados guardados',
    'SAVE STATES': 'ESTADOS GUARDADOS',
    'Quick save': 'Guardado rápido',
    'Quick load': 'Carga rápida',
    'Save state': 'Guardar estado',
    'Import state': 'Importar estado',
    'Saved {name}.': 'Guardado {name}.',
    'Saved in Kryvex, but the save folder refused the file. Choose it again in the save panel.':
      'Guardado en Kryvex, pero la carpeta de guardado rechazó el archivo. Vuelve a elegirla en el panel de guardado.',
    'That state could not be stored on this device.':
      'Ese estado no se pudo guardar en este dispositivo.',
    'Load a cartridge before restoring a state.':
      'Carga un cartucho antes de restaurar un estado.',
    'That state belongs to a different cartridge.':
      'Ese estado pertenece a otro cartucho.',
    'There is no saved state for this cartridge yet.':
      'Todavía no hay ningún estado guardado para este cartucho.',
    'State restored.': 'Estado restaurado.',
    'That state could not be loaded.': 'Ese estado no se pudo cargar.',
    'That state could not be saved.': 'Ese estado no se pudo guardar.',
    'In-game save written.': 'Partida guardada del propio juego escrita.',
    'The in-game save could not be stored.': 'La partida del juego no se pudo guardar.',
    'This cartridge has no in-game save stored yet.':
      'Este cartucho aún no tiene ninguna partida guardada por el juego.',
    'In-game save loaded.': 'Partida del juego cargada.',
    'That in-game save could not be used.': 'Esa partida del juego no se pudo usar.',
    'Load a cartridge before saving.': 'Carga un cartucho antes de guardar.',
    'Wait for the core to finish starting.': 'Espera a que el núcleo termine de arrancar.',
    'This browser cannot open a save folder. Export a state file instead; it works everywhere.':
      'Este navegador no puede abrir una carpeta de guardado. Exporta un archivo de estado; funciona en todas partes.',
    'This browser has no save folder picker.':
      'Este navegador no tiene selector de carpeta de guardado.',
    'New states are also written to {folder}.':
      'Los nuevos estados también se escriben en {folder}.',
    'That file does not look like a save state.':
      'Ese archivo no parece un estado guardado.',
    'That state file could not be read.': 'Ese archivo de estado no se pudo leer.',
    'Cartridge closed. Saved states are kept for next time.':
      'Cartucho cerrado. Los estados guardados se conservan para la próxima vez.',
    'State deleted.': 'Estado eliminado.',
    'Also writing to {folder}.': 'También se escribe en {folder}.',
    'Stored in this browser profile; it survives a reload.':
      'Guardado en este perfil del navegador; sobrevive a una recarga.',
    'Close cartridge': 'Cerrar cartucho',
    'PAUSED · {system}': 'EN PAUSA · {system}',
    'Exported {name}.': 'Exportado {name}.',
    'Overwrites the quick save slot for this cartridge.':
      'Sobrescribe el espacio de guardado rápido de este cartucho.',
    'Import a state file': 'Importar un archivo de estado',
    'No states for this cartridge yet. Quick save writes one under a second; save state keeps up to {count} per game.':
      'Aún no hay estados para este cartucho. El guardado rápido escribe uno al instante; guardar estado conserva hasta {count} por juego.',
    'Choose another save folder': 'Elegir otra carpeta de guardado',
    'Choose save folder…': 'Elegir carpeta de guardado…',
    'A state is the core’s memory; in-game saves written by the game itself are kept separately, and both live outside Downloads.':
      'Un estado es la memoria del núcleo; las partidas que escribe el propio juego se guardan aparte, y ambas cosas quedan fuera de Descargas.',
    'The core could not read its state. Save once the game has started.':
      'El núcleo no pudo leer su estado. Guarda cuando el juego haya empezado.',
    'The core returned an empty state.': 'El núcleo devolvió un estado vacío.',
    'The core did not return a state.': 'El núcleo no devolvió ningún estado.',
    'The core is not ready for that state.': 'El núcleo no está listo para ese estado.',
    'That state belongs to a different core or is damaged.':
      'Ese estado pertenece a otro núcleo o está dañado.',
    'The game is still starting.': 'El juego todavía está arrancando.',
    'Kryvex does not offer netplay yet: the core can share a game, but only through a relay server we do not ship. Two controllers on this machine already work, and the core’s own menu handles button mapping.':
      'Kryvex aún no ofrece juego en red: el núcleo puede compartir una partida, pero solo mediante un servidor de retransmisión que no incluimos. Dos mandos en esta máquina ya funcionan, y el menú del propio núcleo gestiona las asignaciones de botones.',
    'The page is sandboxed: the emulator cannot reach Kryvex’s bridge, files or settings. Save states and in-game saves are handed to Kryvex and stored by it, not by the core.':
      'La página está aislada: el emulador no puede acceder al puente, los archivos ni los ajustes de Kryvex. Los estados y las partidas del juego se entregan a Kryvex, que los almacena, no el núcleo.',

    Calculator: 'Calculadora',
    'Click the calculator, then type: digits, operators, Enter to evaluate, Backspace to delete and Escape to clear.':
      'Haz clic en la calculadora y escribe: dígitos, operadores, Intro para calcular, Retroceso para borrar y Escape para limpiar.',

    Load: 'Cargar',
    Delete: 'Eliminar',
    Export: 'Exportar',
  },

  de: {
    'Keep running': 'Weiterlaufen lassen',
    'The service keeps working while another screen is in front.':
      'Der Dienst arbeitet weiter, während ein anderer Bildschirm vorn ist.',
    'Keep running, muted': 'Weiterlaufen, stumm',
    'It keeps working, but its audio is silenced until it is shown again.':
      'Er arbeitet weiter, aber sein Ton bleibt stumm, bis er wieder angezeigt wird.',
    'Pause on leave': 'Beim Verlassen pausieren',
    'It suspends when you leave and picks up where it stopped when you return.':
      'Er hält beim Verlassen an und macht beim Zurückkehren dort weiter, wo er war.',
    'Pause when idle': 'Bei Untätigkeit pausieren',
    'It keeps running for a while, then suspends after the interval below.':
      'Er läuft eine Weile weiter und hält dann nach dem unten gewählten Zeitraum an.',
    'Stop when leaving': 'Beim Verlassen beenden',
    'It is closed when you leave. Reopening starts it again from scratch.':
      'Er wird beim Verlassen geschlossen. Beim erneuten Öffnen beginnt er von vorn.',
    '8-bit emulator': '8-Bit-Emulator',
    'A running game and its core stay loaded.':
      'Ein laufendes Spiel und sein Kern bleiben geladen.',
    'Disk pulse': 'Datenträgerpuls',
    'A scan runs in the main process; leaving the page never cancels it.':
      'Ein Scan läuft im Hauptprozess; das Verlassen der Seite bricht ihn nie ab.',
    Rooms: 'Räume',
    'Membership, chat history and a shared stream stay connected.':
      'Mitgliedschaft, Chatverlauf und ein geteilter Stream bleiben verbunden.',
    'Web modules': 'Web-Module',
    'Each module keeps its own Chromium session, cookies and sign-in.':
      'Jedes Modul behält seine eigene Chromium-Sitzung, Cookies und Anmeldung.',
    'This service cannot suspend, so it stays in the background.':
      'Dieser Dienst kann nicht pausieren und bleibt daher im Hintergrund.',
    'This service cannot keep running in the background.':
      'Dieser Dienst kann im Hintergrund nicht weiterlaufen.',
    'This service has no audio to silence, so it keeps running with sound.':
      'Dieser Dienst hat keinen Ton zum Stummschalten und läuft daher mit Ton weiter.',

    'Service lifecycle': 'Lebenszyklus der Dienste',
    'What happens to a service once you are looking somewhere else. Pinning a service only makes it easy to reach: it never starts it or keeps it running on its own.':
      'Was mit einem Dienst geschieht, wenn Sie woanders hinschauen. Anheften macht einen Dienst nur schnell erreichbar: Es startet ihn nie und hält ihn nicht von selbst am Laufen.',
    'Default behaviour': 'Standardverhalten',
    'Pause after': 'Pausieren nach',
    'Currently {interval}. Any value from {min} to {max} minutes.':
      'Derzeit {interval}. Jeder Wert von {min} bis {max} Minuten.',
    '{count}m': '{count} Min.',
    '{count}h': '{count} Std.',
    'Minutes before pausing': 'Minuten bis zur Pause',
    'PER SERVICE': 'PRO DIENST',
    'Now: {state}.': 'Jetzt: {state}.',
    'Lifecycle for {name}': 'Lebenszyklus für {name}',
    'Use the default': 'Standard verwenden',
    'A parked service stays loaded at zero opacity; a paused one is asked to suspend but keeps its memory. Only “stop” closes it, and reopening then starts from scratch.':
      'Ein geparkter Dienst bleibt bei Deckkraft null geladen; ein pausierter wird gebeten anzuhalten, behält aber seinen Speicher. Nur „Beenden“ schließt ihn, und beim erneuten Öffnen beginnt er von vorn.',

    'Save states': 'Spielstände',
    'SAVE STATES': 'SPIELSTÄNDE',
    'Quick save': 'Schnellspeichern',
    'Quick load': 'Schnellladen',
    'Save state': 'Spielstand sichern',
    'Import state': 'Spielstand importieren',
    'Saved {name}.': '{name} gespeichert.',
    'Saved in Kryvex, but the save folder refused the file. Choose it again in the save panel.':
      'In Kryvex gespeichert, aber der Speicherordner hat die Datei abgelehnt. Wählen Sie ihn im Speicherbereich erneut.',
    'That state could not be stored on this device.':
      'Dieser Spielstand konnte auf diesem Gerät nicht gespeichert werden.',
    'Load a cartridge before restoring a state.':
      'Laden Sie ein Modul, bevor Sie einen Spielstand wiederherstellen.',
    'That state belongs to a different cartridge.':
      'Dieser Spielstand gehört zu einem anderen Modul.',
    'There is no saved state for this cartridge yet.':
      'Für dieses Modul gibt es noch keinen Spielstand.',
    'State restored.': 'Spielstand wiederhergestellt.',
    'That state could not be loaded.': 'Dieser Spielstand konnte nicht geladen werden.',
    'That state could not be saved.': 'Dieser Spielstand konnte nicht gespeichert werden.',
    'In-game save written.': 'Spielinterner Speicherstand geschrieben.',
    'The in-game save could not be stored.':
      'Der spielinterne Speicherstand konnte nicht gespeichert werden.',
    'This cartridge has no in-game save stored yet.':
      'Für dieses Modul ist noch kein spielinterner Speicherstand abgelegt.',
    'In-game save loaded.': 'Spielinterner Speicherstand geladen.',
    'That in-game save could not be used.':
      'Dieser spielinterne Speicherstand konnte nicht verwendet werden.',
    'Load a cartridge before saving.': 'Laden Sie ein Modul, bevor Sie speichern.',
    'Wait for the core to finish starting.':
      'Warten Sie, bis der Kern fertig gestartet ist.',
    'This browser cannot open a save folder. Export a state file instead; it works everywhere.':
      'Dieser Browser kann keinen Speicherordner öffnen. Exportieren Sie stattdessen eine Spielstanddatei; das funktioniert überall.',
    'This browser has no save folder picker.':
      'Dieser Browser hat keine Ordnerauswahl zum Speichern.',
    'New states are also written to {folder}.':
      'Neue Spielstände werden auch in {folder} geschrieben.',
    'That file does not look like a save state.':
      'Diese Datei sieht nicht wie ein Spielstand aus.',
    'That state file could not be read.': 'Diese Spielstanddatei konnte nicht gelesen werden.',
    'Cartridge closed. Saved states are kept for next time.':
      'Modul geschlossen. Gespeicherte Spielstände bleiben für das nächste Mal erhalten.',
    'State deleted.': 'Spielstand gelöscht.',
    'Also writing to {folder}.': 'Schreibt zusätzlich in {folder}.',
    'Stored in this browser profile; it survives a reload.':
      'In diesem Browserprofil gespeichert; übersteht ein Neuladen.',
    'Close cartridge': 'Modul schließen',
    'PAUSED · {system}': 'PAUSIERT · {system}',
    'Exported {name}.': '{name} exportiert.',
    'Overwrites the quick save slot for this cartridge.':
      'Überschreibt den Schnellspeicherplatz dieses Moduls.',
    'Import a state file': 'Spielstanddatei importieren',
    'No states for this cartridge yet. Quick save writes one under a second; save state keeps up to {count} per game.':
      'Noch keine Spielstände für dieses Modul. Schnellspeichern schreibt sofort einen; „Spielstand sichern“ behält bis zu {count} pro Spiel.',
    'Choose another save folder': 'Anderen Speicherordner wählen',
    'Choose save folder…': 'Speicherordner wählen…',
    'A state is the core’s memory; in-game saves written by the game itself are kept separately, and both live outside Downloads.':
      'Ein Spielstand ist der Speicher des Kerns; Speicherstände des Spiels selbst liegen getrennt davon, und beide bleiben außerhalb von „Downloads“.',
    'The core could not read its state. Save once the game has started.':
      'Der Kern konnte seinen Speicher nicht lesen. Speichern Sie, sobald das Spiel läuft.',
    'The core returned an empty state.': 'Der Kern hat einen leeren Spielstand geliefert.',
    'The core did not return a state.': 'Der Kern hat keinen Spielstand geliefert.',
    'The core is not ready for that state.':
      'Der Kern ist für diesen Spielstand nicht bereit.',
    'That state belongs to a different core or is damaged.':
      'Dieser Spielstand gehört zu einem anderen Kern oder ist beschädigt.',
    'The game is still starting.': 'Das Spiel startet noch.',
    'Kryvex does not offer netplay yet: the core can share a game, but only through a relay server we do not ship. Two controllers on this machine already work, and the core’s own menu handles button mapping.':
      'Kryvex bietet noch kein Netzwerkspiel: Der Kern kann ein Spiel teilen, aber nur über einen Relay-Server, den wir nicht mitliefern. Zwei Controller an diesem Rechner funktionieren bereits, und das Menü des Kerns verwaltet die Tastenbelegung.',
    'The page is sandboxed: the emulator cannot reach Kryvex’s bridge, files or settings. Save states and in-game saves are handed to Kryvex and stored by it, not by the core.':
      'Die Seite ist isoliert: Der Emulator erreicht weder Kryvex-Brücke noch Dateien oder Einstellungen. Spielstände werden an Kryvex übergeben und von Kryvex gespeichert, nicht vom Kern.',

    Calculator: 'Rechner',
    'Click the calculator, then type: digits, operators, Enter to evaluate, Backspace to delete and Escape to clear.':
      'Klicken Sie auf den Rechner und tippen Sie: Ziffern, Operatoren, Eingabe zum Ausrechnen, Rücktaste zum Löschen und Escape zum Leeren.',

    Load: 'Laden',
    Delete: 'Löschen',
    Export: 'Exportieren',
  },

  fr: {
    'Keep running': 'Continuer à tourner',
    'The service keeps working while another screen is in front.':
      'Le service continue de fonctionner pendant qu’un autre écran est au premier plan.',
    'Keep running, muted': 'Continuer à tourner, en sourdine',
    'It keeps working, but its audio is silenced until it is shown again.':
      'Il continue de fonctionner, mais son audio est coupé jusqu’à ce qu’il soit réaffiché.',
    'Pause on leave': 'Mettre en pause en quittant',
    'It suspends when you leave and picks up where it stopped when you return.':
      'Il se suspend quand vous partez et reprend où il s’était arrêté à votre retour.',
    'Pause when idle': 'Mettre en pause après inactivité',
    'It keeps running for a while, then suspends after the interval below.':
      'Il continue un moment, puis se suspend après l’intervalle ci-dessous.',
    'Stop when leaving': 'Arrêter en quittant',
    'It is closed when you leave. Reopening starts it again from scratch.':
      'Il est fermé quand vous partez. Le rouvrir recommence de zéro.',
    '8-bit emulator': 'Émulateur 8 bits',
    'A running game and its core stay loaded.':
      'Une partie en cours et son cœur restent chargés.',
    'Disk pulse': 'Pouls du disque',
    'A scan runs in the main process; leaving the page never cancels it.':
      'Une analyse s’exécute dans le processus principal ; quitter la page ne l’annule jamais.',
    Rooms: 'Salons',
    'Membership, chat history and a shared stream stay connected.':
      'L’appartenance, l’historique du chat et un flux partagé restent connectés.',
    'Web modules': 'Modules web',
    'Each module keeps its own Chromium session, cookies and sign-in.':
      'Chaque module conserve sa session Chromium, ses cookies et sa connexion.',
    'This service cannot suspend, so it stays in the background.':
      'Ce service ne peut pas se suspendre : il reste en arrière-plan.',
    'This service cannot keep running in the background.':
      'Ce service ne peut pas continuer en arrière-plan.',
    'This service has no audio to silence, so it keeps running with sound.':
      'Ce service n’a pas d’audio à couper : il continue avec le son.',

    'Service lifecycle': 'Cycle de vie des services',
    'What happens to a service once you are looking somewhere else. Pinning a service only makes it easy to reach: it never starts it or keeps it running on its own.':
      'Ce qui arrive à un service lorsque vous regardez ailleurs. Épingler un service le rend seulement accessible : cela ne le démarre jamais et ne le maintient pas en marche.',
    'Default behaviour': 'Comportement par défaut',
    'Pause after': 'Mettre en pause après',
    'Currently {interval}. Any value from {min} to {max} minutes.':
      'Actuellement {interval}. Toute valeur de {min} à {max} minutes.',
    '{count}m': '{count} min',
    '{count}h': '{count} h',
    'Minutes before pausing': 'Minutes avant la pause',
    'PER SERVICE': 'PAR SERVICE',
    'Now: {state}.': 'Actuellement : {state}.',
    'Lifecycle for {name}': 'Cycle de vie de {name}',
    'Use the default': 'Utiliser le comportement par défaut',
    'A parked service stays loaded at zero opacity; a paused one is asked to suspend but keeps its memory. Only “stop” closes it, and reopening then starts from scratch.':
      'Un service garé reste chargé à opacité nulle ; un service en pause est invité à se suspendre mais garde sa mémoire. Seul « arrêter » le ferme, et le rouvrir repart de zéro.',

    'Save states': 'Sauvegardes d’état',
    'SAVE STATES': 'SAUVEGARDES D’ÉTAT',
    'Quick save': 'Sauvegarde rapide',
    'Quick load': 'Chargement rapide',
    'Save state': 'Sauvegarder l’état',
    'Import state': 'Importer un état',
    'Saved {name}.': '{name} enregistré.',
    'Saved in Kryvex, but the save folder refused the file. Choose it again in the save panel.':
      'Enregistré dans Kryvex, mais le dossier de sauvegarde a refusé le fichier. Choisissez-le à nouveau dans le panneau de sauvegarde.',
    'That state could not be stored on this device.':
      'Cet état n’a pas pu être enregistré sur cet appareil.',
    'Load a cartridge before restoring a state.':
      'Chargez une cartouche avant de restaurer un état.',
    'That state belongs to a different cartridge.':
      'Cet état appartient à une autre cartouche.',
    'There is no saved state for this cartridge yet.':
      'Il n’y a pas encore d’état enregistré pour cette cartouche.',
    'State restored.': 'État restauré.',
    'That state could not be loaded.': 'Cet état n’a pas pu être chargé.',
    'That state could not be saved.': 'Cet état n’a pas pu être enregistré.',
    'In-game save written.': 'Sauvegarde interne du jeu écrite.',
    'The in-game save could not be stored.':
      'La sauvegarde interne du jeu n’a pas pu être enregistrée.',
    'This cartridge has no in-game save stored yet.':
      'Cette cartouche n’a pas encore de sauvegarde interne enregistrée.',
    'In-game save loaded.': 'Sauvegarde interne du jeu chargée.',
    'That in-game save could not be used.':
      'Cette sauvegarde interne n’a pas pu être utilisée.',
    'Load a cartridge before saving.': 'Chargez une cartouche avant de sauvegarder.',
    'Wait for the core to finish starting.': 'Attendez que le cœur ait fini de démarrer.',
    'This browser cannot open a save folder. Export a state file instead; it works everywhere.':
      'Ce navigateur ne peut pas ouvrir de dossier de sauvegarde. Exportez plutôt un fichier d’état ; cela fonctionne partout.',
    'This browser has no save folder picker.':
      'Ce navigateur n’a pas de sélecteur de dossier de sauvegarde.',
    'New states are also written to {folder}.':
      'Les nouveaux états sont aussi écrits dans {folder}.',
    'That file does not look like a save state.':
      'Ce fichier ne ressemble pas à un état sauvegardé.',
    'That state file could not be read.': 'Ce fichier d’état n’a pas pu être lu.',
    'Cartridge closed. Saved states are kept for next time.':
      'Cartouche fermée. Les états enregistrés sont conservés pour la prochaine fois.',
    'State deleted.': 'État supprimé.',
    'Also writing to {folder}.': 'Écrit aussi dans {folder}.',
    'Stored in this browser profile; it survives a reload.':
      'Stocké dans ce profil de navigateur ; survit à un rechargement.',
    'Close cartridge': 'Fermer la cartouche',
    'PAUSED · {system}': 'EN PAUSE · {system}',
    'Exported {name}.': '{name} exporté.',
    'Overwrites the quick save slot for this cartridge.':
      'Écrase l’emplacement de sauvegarde rapide de cette cartouche.',
    'Import a state file': 'Importer un fichier d’état',
    'No states for this cartridge yet. Quick save writes one under a second; save state keeps up to {count} per game.':
      'Aucun état pour cette cartouche pour l’instant. La sauvegarde rapide en écrit un aussitôt ; « sauvegarder l’état » en garde jusqu’à {count} par jeu.',
    'Choose another save folder': 'Choisir un autre dossier de sauvegarde',
    'Choose save folder…': 'Choisir un dossier de sauvegarde…',
    'A state is the core’s memory; in-game saves written by the game itself are kept separately, and both live outside Downloads.':
      'Un état est la mémoire du cœur ; les sauvegardes écrites par le jeu lui-même sont conservées séparément, et les deux restent hors de Téléchargements.',
    'The core could not read its state. Save once the game has started.':
      'Le cœur n’a pas pu lire son état. Sauvegardez une fois le jeu lancé.',
    'The core returned an empty state.': 'Le cœur a renvoyé un état vide.',
    'The core did not return a state.': 'Le cœur n’a renvoyé aucun état.',
    'The core is not ready for that state.': 'Le cœur n’est pas prêt pour cet état.',
    'That state belongs to a different core or is damaged.':
      'Cet état appartient à un autre cœur ou est endommagé.',
    'The game is still starting.': 'Le jeu est encore en train de démarrer.',
    'Kryvex does not offer netplay yet: the core can share a game, but only through a relay server we do not ship. Two controllers on this machine already work, and the core’s own menu handles button mapping.':
      'Kryvex ne propose pas encore de jeu en réseau : le cœur peut partager une partie, mais seulement via un serveur relais que nous ne fournissons pas. Deux manettes sur cette machine fonctionnent déjà, et le menu du cœur gère les affectations de boutons.',
    'The page is sandboxed: the emulator cannot reach Kryvex’s bridge, files or settings. Save states and in-game saves are handed to Kryvex and stored by it, not by the core.':
      'La page est isolée : l’émulateur ne peut atteindre ni le pont Kryvex, ni les fichiers, ni les réglages. Les états et les sauvegardes internes sont remis à Kryvex, qui les stocke, et non au cœur.',

    Calculator: 'Calculatrice',
    'Click the calculator, then type: digits, operators, Enter to evaluate, Backspace to delete and Escape to clear.':
      'Cliquez sur la calculatrice puis tapez : chiffres, opérateurs, Entrée pour calculer, Retour arrière pour effacer et Échap pour tout effacer.',

    Load: 'Charger',
    Delete: 'Supprimer',
    Export: 'Exporter',
  },
};
