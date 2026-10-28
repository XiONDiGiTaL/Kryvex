/**
 * Copy for the optional second engine (Dreamcast, via Flycast).
 *
 * One block per language, one key per English string, so a string is
 * translated once no matter which part of the emulator asks for it. That
 * includes the failure sentences the panel builds from a main-process id: they
 * never appear as literals inside a `t(...)` call, so the coverage audit cannot
 * collect them, and leaving them out here would silently show English.
 *
 * Turkish lives in `i18n-tr.ts` with the rest of that language.
 */
type FlycastLanguage = 'es' | 'de' | 'fr';

export const flycastCopy: Record<FlycastLanguage, Record<string, string>> = {
  es: {
    'SECOND ENGINE': 'SEGUNDO MOTOR',
    // "Experimental" would be the same word in Spanish, and the coverage audit
    // reads a string identical to its key as untranslated; "en pruebas" says
    // the same thing in Spanish and keeps the ratchet honest.
    'Dreamcast (experimental)': 'Dreamcast (en pruebas)',
    'Runs on its own engine, off by default.':
      'Funciona con su propio motor, desactivado por defecto.',
    'A pinned WebAssembly build of Flycast, fetched from its own release on first use. It is GPLv2 and is never bundled with Kryvex.':
      'Una compilación fijada de Flycast en WebAssembly, descargada de su propia publicación la primera vez que se usa. Es GPLv2 y nunca se incluye con Kryvex.',
    'Ready · {version}': 'Listo · {version}',
    'Downloading the engine… {percent}%': 'Descargando el motor… {percent} %',
    'The engine could not be installed.': 'El motor no se pudo instalar.',
    'Not installed': 'No instalado',
    'Remove the engine': 'Quitar el motor',
    'Download the engine ({size})': 'Descargar el motor ({size})',
    'Stop the download': 'Detener la descarga',
    'The second engine runs in the desktop app only.':
      'El segundo motor solo funciona en la aplicación de escritorio.',
    'Emulation by Flycast (GPLv2), loaded from its own release and not bundled with Kryvex.':
      'Emulación por Flycast (GPLv2), cargado desde su propia publicación y no incluido con Kryvex.',
    'Starting the second engine…': 'Iniciando el segundo motor…',
    'The core is read from this machine and packed for the screen. Nothing is uploaded.':
      'El núcleo se lee en este equipo y se empaqueta para la pantalla. No se sube nada.',
    'Install the engine before starting a Dreamcast game.':
      'Instala el motor antes de iniciar un juego de Dreamcast.',
    'The engine is ready. Load a Dreamcast image with its BIOS.':
      'El motor está listo. Carga una imagen de Dreamcast con su BIOS.',
    'The engine was removed.': 'El motor se ha quitado.',
    'Dreamcast runs on the second engine. Naomi arcade boards are still not offered: a set is several files and the slot takes one.':
      'Dreamcast funciona con el segundo motor. Las placas arcade Naomi siguen sin ofrecerse: un conjunto son varios archivos y la ranura admite uno.',
    'Link play keeps the two machines together by sending save states, and a Dreamcast state is too large for that. Load the same image on both machines instead.':
      'El juego enlazado mantiene las dos máquinas sincronizadas enviando estados guardados, y un estado de Dreamcast es demasiado grande para eso. Carga la misma imagen en ambos equipos.',
    'Experimental: a second engine, downloaded separately. One file per slot: use a .cdi or .chd, or a .zip of a full set. The Dreamcast BIOS is required.':
      'Experimental: un segundo motor, descargado aparte. Un archivo por ranura: usa un .cdi o .chd, o un .zip de un conjunto completo. Se necesita la BIOS de Dreamcast.',
    'That download did not match the pinned release, so it was discarded.':
      'Esa descarga no coincide con la publicación fijada, así que se descartó.',
    'The engine arrived incomplete and was discarded.':
      'El motor llegó incompleto y se descartó.',
    'There is not enough free space for the engine.':
      'No hay espacio libre suficiente para el motor.',
    'The engine download was cancelled.': 'La descarga del motor se canceló.',
    'The engine could not be written to disk.': 'El motor no se pudo escribir en el disco.',
    'The engine is already being installed.': 'El motor ya se está instalando.',
    'The engine download was interrupted. Check the connection and try again.':
      'La descarga del motor se interrumpió. Comprueba la conexión y vuelve a intentarlo.',
  },
  de: {
    'SECOND ENGINE': 'ZWEITE ENGINE',
    'Dreamcast (experimental)': 'Dreamcast (experimentell)',
    'Runs on its own engine, off by default.':
      'Läuft auf einer eigenen Engine, standardmäßig aus.',
    'A pinned WebAssembly build of Flycast, fetched from its own release on first use. It is GPLv2 and is never bundled with Kryvex.':
      'Ein festgeschriebener WebAssembly-Build von Flycast, beim ersten Einsatz aus dem eigenen Release geladen. Er ist GPLv2 und wird nie mit Kryvex gebündelt.',
    'Ready · {version}': 'Bereit · {version}',
    'Downloading the engine… {percent}%': 'Engine wird geladen… {percent} %',
    'The engine could not be installed.': 'Die Engine konnte nicht installiert werden.',
    'Not installed': 'Nicht installiert',
    'Remove the engine': 'Engine entfernen',
    'Download the engine ({size})': 'Engine herunterladen ({size})',
    'Stop the download': 'Download stoppen',
    'The second engine runs in the desktop app only.':
      'Die zweite Engine läuft nur in der Desktop-App.',
    'Emulation by Flycast (GPLv2), loaded from its own release and not bundled with Kryvex.':
      'Emulation durch Flycast (GPLv2), aus dem eigenen Release geladen und nicht mit Kryvex gebündelt.',
    'Starting the second engine…': 'Zweite Engine wird gestartet…',
    'The core is read from this machine and packed for the screen. Nothing is uploaded.':
      'Der Kern wird auf diesem Rechner gelesen und für den Bildschirm gepackt. Nichts wird hochgeladen.',
    'Install the engine before starting a Dreamcast game.':
      'Installiere die Engine, bevor du ein Dreamcast-Spiel startest.',
    'The engine is ready. Load a Dreamcast image with its BIOS.':
      'Die Engine ist bereit. Lade ein Dreamcast-Abbild mit seiner BIOS.',
    'The engine was removed.': 'Die Engine wurde entfernt.',
    'Dreamcast runs on the second engine. Naomi arcade boards are still not offered: a set is several files and the slot takes one.':
      'Dreamcast läuft auf der zweiten Engine. Naomi-Arcade-Boards werden weiterhin nicht angeboten: ein Satz besteht aus mehreren Dateien, der Slot nimmt eine.',
    'Link play keeps the two machines together by sending save states, and a Dreamcast state is too large for that. Load the same image on both machines instead.':
      'Link-Spiel hält beide Rechner über Speicherstände zusammen, und ein Dreamcast-Zustand ist dafür zu groß. Lade dasselbe Abbild auf beiden Rechnern.',
    'Experimental: a second engine, downloaded separately. One file per slot: use a .cdi or .chd, or a .zip of a full set. The Dreamcast BIOS is required.':
      'Experimentell: eine zweite Engine, separat geladen. Eine Datei pro Slot: nutze .cdi oder .chd, oder ein .zip eines vollständigen Satzes. Die Dreamcast-BIOS ist erforderlich.',
    'That download did not match the pinned release, so it was discarded.':
      'Dieser Download entsprach nicht dem festgeschriebenen Release und wurde verworfen.',
    'The engine arrived incomplete and was discarded.':
      'Die Engine kam unvollständig an und wurde verworfen.',
    'There is not enough free space for the engine.':
      'Es ist nicht genug freier Speicher für die Engine.',
    'The engine download was cancelled.': 'Der Download der Engine wurde abgebrochen.',
    'The engine could not be written to disk.':
      'Die Engine konnte nicht auf die Festplatte geschrieben werden.',
    'The engine is already being installed.': 'Die Engine wird bereits installiert.',
    'The engine download was interrupted. Check the connection and try again.':
      'Der Download der Engine wurde unterbrochen. Prüfe die Verbindung und versuche es erneut.',
  },
  fr: {
    'SECOND ENGINE': 'SECOND MOTEUR',
    'Dreamcast (experimental)': 'Dreamcast (expérimental)',
    'Runs on its own engine, off by default.':
      'Fonctionne sur son propre moteur, désactivé par défaut.',
    'A pinned WebAssembly build of Flycast, fetched from its own release on first use. It is GPLv2 and is never bundled with Kryvex.':
      'Une compilation WebAssembly figée de Flycast, récupérée depuis sa propre version lors de la première utilisation. Elle est sous GPLv2 et n’est jamais fournie avec Kryvex.',
    'Ready · {version}': 'Prêt · {version}',
    'Downloading the engine… {percent}%': 'Téléchargement du moteur… {percent} %',
    'The engine could not be installed.': 'Le moteur n’a pas pu être installé.',
    'Not installed': 'Non installé',
    'Remove the engine': 'Retirer le moteur',
    'Download the engine ({size})': 'Télécharger le moteur ({size})',
    'Stop the download': 'Arrêter le téléchargement',
    'The second engine runs in the desktop app only.':
      'Le second moteur ne fonctionne que dans l’application de bureau.',
    'Emulation by Flycast (GPLv2), loaded from its own release and not bundled with Kryvex.':
      'Émulation par Flycast (GPLv2), chargée depuis sa propre version et non fournie avec Kryvex.',
    'Starting the second engine…': 'Démarrage du second moteur…',
    'The core is read from this machine and packed for the screen. Nothing is uploaded.':
      'Le cœur est lu sur cette machine et empaqueté pour l’écran. Rien n’est envoyé.',
    'Install the engine before starting a Dreamcast game.':
      'Installez le moteur avant de lancer un jeu Dreamcast.',
    'The engine is ready. Load a Dreamcast image with its BIOS.':
      'Le moteur est prêt. Chargez une image Dreamcast avec sa BIOS.',
    'The engine was removed.': 'Le moteur a été retiré.',
    'Dreamcast runs on the second engine. Naomi arcade boards are still not offered: a set is several files and the slot takes one.':
      'Dreamcast fonctionne sur le second moteur. Les cartes arcade Naomi ne sont toujours pas proposées : un ensemble regroupe plusieurs fichiers et l’emplacement n’en prend qu’un.',
    'Link play keeps the two machines together by sending save states, and a Dreamcast state is too large for that. Load the same image on both machines instead.':
      'Le jeu en lien synchronise les deux machines par des sauvegardes d’état, et un état Dreamcast est trop volumineux pour cela. Chargez la même image sur les deux machines.',
    'Experimental: a second engine, downloaded separately. One file per slot: use a .cdi or .chd, or a .zip of a full set. The Dreamcast BIOS is required.':
      'Expérimental : un second moteur, téléchargé séparément. Un fichier par emplacement : utilisez un .cdi ou .chd, ou un .zip d’un ensemble complet. La BIOS Dreamcast est nécessaire.',
    'That download did not match the pinned release, so it was discarded.':
      'Ce téléchargement ne correspondait pas à la version figée et a été écarté.',
    'The engine arrived incomplete and was discarded.':
      'Le moteur est arrivé incomplet et a été écarté.',
    'There is not enough free space for the engine.':
      'Il n’y a pas assez d’espace libre pour le moteur.',
    'The engine download was cancelled.': 'Le téléchargement du moteur a été annulé.',
    'The engine could not be written to disk.':
      'Le moteur n’a pas pu être écrit sur le disque.',
    'The engine is already being installed.': 'Le moteur est déjà en cours d’installation.',
    'The engine download was interrupted. Check the connection and try again.':
      'Le téléchargement du moteur a été interrompu. Vérifiez la connexion et réessayez.',
  },
};
