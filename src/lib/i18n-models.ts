/**
 * Copy for the reviewed model catalogue.
 *
 * Only the panel's own sentences live here. Model names, repositories,
 * revisions, hashes and licence ids are data and stay verbatim; failure text
 * is selected from stable error codes, never from a server message.
 */
type ModelLanguage = 'es' | 'de' | 'fr';

export const modelsCopy: Record<ModelLanguage, Record<string, string>> = {
  es: {
    'DOWNLOAD MODELS': 'DESCARGAR MODELOS',
    'PINNED CATALOGUE': 'CATÁLOGO FIJADO',
    'One reviewed file per model, with its publisher, revision, size, checksum and licence shown before anything is fetched. Downloads start only when you press Download, and a running model is never replaced.':
      'Un archivo revisado por modelo, con su editor, revisión, tamaño, suma de comprobación y licencia antes de descargar nada. La descarga solo empieza al pulsar Descargar, y un modelo en ejecución nunca se reemplaza.',
    'Model downloads are available in the desktop app.':
      'Las descargas de modelos están disponibles en la aplicación de escritorio.',
    'ALREADY INSTALLED': 'YA INSTALADO',
    STARTER: 'INICIAL',
    'DEFAULT CORE': 'NÚCLEO PREDETERMINADO',
    'VEXIUM CORE': 'VEXIUM CORE',
    'Vexium Core is running': 'Vexium Core está en ejecución',
    'Vexium Core is starting…': 'Vexium Core está iniciando…',
    '{name} is configured, but the local server is stopped.':
      '{name} está configurado, pero el servidor local está detenido.',
    'Start Vexium Core': 'Iniciar Vexium Core',
    'Download Vexium Core': 'Descargar Vexium Core',
    Installed: 'Instalado',
    'Not installed': 'No instalado',
    'Active build': 'Compilación activa',
    RUNNING: 'EN EJECUCIÓN',
    STOPPED: 'DETENIDO',
    STARTING: 'INICIANDO',
    ERROR: 'ERROR',
    'Install Vexium Core in Settings to start it here.':
      'Instala Vexium Core en Ajustes para iniciarlo aquí.',
    'Vexium Core is installed. Start it when you are ready; downloading never starts a server.':
      'Vexium Core está instalado. Inícialo cuando quieras; la descarga nunca inicia un servidor.',
    'Vexium Core is the supported local stack: the included llama.cpp runtime runs the reviewed Qwen2.5-1.5B-Instruct weights on loopback. Qwen and its Apache-2.0 licence stay visible; Kryvex packages the runtime and verifies the file, not the weights.':
      'Vexium Core es la pila local compatible: el motor llama.cpp incluido ejecuta los pesos revisados de Qwen2.5-1.5B-Instruct en loopback. Qwen y su licencia Apache-2.0 siguen visibles; Kryvex empaqueta el motor y verifica el archivo, no los pesos.',
    'Vexium Core is already running.': 'Vexium Core ya está en ejecución.',
    'Vexium Core is serving on {url}.': 'Vexium Core sirve en {url}.',
    '{name} is already serving on {url}.': '{name} ya sirve en {url}.',
    'Run Vexium Core locally, or choose any .gguf you already have. The included llama.cpp runtime keeps inference on loopback; there is no account, key or cloud call.':
      'Ejecuta Vexium Core en local o elige cualquier .gguf que ya tengas. El motor llama.cpp incluido mantiene la inferencia en loopback; no hay cuenta, clave ni llamada a la nube.',
    'No model file chosen. Install Vexium Core below, or choose a .gguf you already have.':
      'Ningún archivo de modelo elegido. Instala Vexium Core abajo o elige un .gguf que ya tengas.',
    'Set up Vexium Core in Settings, or start Ollama (ollama serve) or the LM Studio local server and point Vexium at its loopback port.':
      'Configura Vexium Core en Ajustes, o inicia Ollama (ollama serve) o el servidor local de LM Studio y apunta Vexium a su puerto loopback.',
    'Set up Vexium Core for real answers': 'Configurar Vexium Core para respuestas reales',
    Source: 'Origen',
    Revision: 'Revisión',
    File: 'Archivo',
    'Download size': 'Tamaño de descarga',
    Licence: 'Licencia',
    'commercial use permitted': 'uso comercial permitido',
    Architecture: 'Arquitectura',
    context: 'contexto',
    'Estimated memory': 'Memoria estimada',
    estimate: 'estimación',
    Languages: 'Idiomas',
    'Good at': 'Sirve para',
    Limits: 'Límites',
    'Download progress': 'Progreso de la descarga',
    'Verifying the checksum…': 'Verificando la suma de comprobación…',
    'Downloading {done} of {total}': 'Descargando {done} de {total}',
    'Use this model': 'Usar este modelo',
    Remove: 'Eliminar',
    Keep: 'Conservar',
    Delete: 'Borrar',
    'The file is missing from disk.': 'El archivo no está en el disco.',
    'Cancel download': 'Cancelar descarga',
    Download: 'Descargar',
    'The llama.cpp runtime is included with Kryvex. Downloading a model does not start it.':
      'El motor llama.cpp está incluido con Kryvex. Descargar un modelo no lo inicia.',
    'llama-server was found. Downloading does not start it.':
      'Se encontró llama-server. Descargar no lo inicia.',
    'llama-server was not found. You can download now and point Kryvex at the runtime before starting.':
      'No se encontró llama-server. Puedes descargar ahora y señalar el runtime antes de iniciar.',
    'No downloaded models. This panel fetched nothing on its own.':
      'No hay modelos descargados. Este panel no descargó nada por su cuenta.',
    'file missing': 'archivo ausente',
    'Model installed. Use this model to hand it to Vexium, then start the server.':
      'Modelo instalado. Usa «Usar este modelo» para entregarlo a Vexium y luego inicia el servidor.',
    'The model file was deleted.': 'Se borró el archivo del modelo.',
    'The download was cancelled.': 'La descarga se canceló.',
    'Size mismatch: nothing was installed.': 'Tamaño incorrecto: no se instaló nada.',
    'Checksum mismatch: nothing was installed.': 'Suma de comprobación incorrecta: no se instaló nada.',
    'Not enough free disk space for this model.': 'No hay espacio libre suficiente para este modelo.',
    'That model is already installed.': 'Ese modelo ya está instalado.',
    'That model is running. Stop the server before deleting it.':
      'Ese modelo está en ejecución. Detén el servidor antes de borrarlo.',
    'That catalogue entry is incomplete, so it cannot be downloaded.':
      'Esa entrada del catálogo está incompleta y no se puede descargar.',
    'That model is not in the reviewed catalogue.': 'Ese modelo no está en el catálogo revisado.',
    'The download could not be completed.': 'No se pudo completar la descarga.',
    'Ordinary conversation': 'Conversación normal',
    'Rewriting and editing': 'Reescribir y editar',
    'Short summaries of text you paste': 'Resúmenes breves del texto que pegues',
    'Explanations and how-to': 'Explicaciones y pasos',
    'Multi-step reasoning': 'Razonamiento de varios pasos',
    'Arithmetic: use the calculator': 'Aritmética: usa la calculadora',
    'Current facts without a search': 'Datos actuales sin búsqueda',
    English: 'Inglés',
    Spanish: 'Español',
    German: 'Alemán',
    French: 'Francés',
  },
  de: {
    'DOWNLOAD MODELS': 'MODELLE HERUNTERLADEN',
    'PINNED CATALOGUE': 'FESTGESCHRIEBENER KATALOG',
    'One reviewed file per model, with its publisher, revision, size, checksum and licence shown before anything is fetched. Downloads start only when you press Download, and a running model is never replaced.':
      'Eine geprüfte Datei pro Modell, mit Herausgeber, Revision, Größe, Prüfsumme und Lizenz vor jedem Abruf. Der Download startet erst mit „Herunterladen“, und ein laufendes Modell wird nie ersetzt.',
    'Model downloads are available in the desktop app.': 'Modell-Downloads gibt es in der Desktop-App.',
    'ALREADY INSTALLED': 'BEREITS INSTALLIERT',
    STARTER: 'STARTMODELL',
    'DEFAULT CORE': 'STANDARD-KERN',
    'VEXIUM CORE': 'VEXIUM CORE',
    'Vexium Core is running': 'Vexium Core läuft',
    'Vexium Core is starting…': 'Vexium Core startet…',
    '{name} is configured, but the local server is stopped.':
      '{name} ist konfiguriert, aber der lokale Server ist gestoppt.',
    'Start Vexium Core': 'Vexium Core starten',
    'Download Vexium Core': 'Vexium Core herunterladen',
    Installed: 'Installiert',
    'Not installed': 'Nicht installiert',
    'Active build': 'Aktiver Build',
    RUNNING: 'LÄUFT',
    STOPPED: 'GESTOPPT',
    STARTING: 'STARTET',
    ERROR: 'FEHLER',
    'Install Vexium Core in Settings to start it here.':
      'Installiere Vexium Core in den Einstellungen, um es hier zu starten.',
    'Vexium Core is installed. Start it when you are ready; downloading never starts a server.':
      'Vexium Core ist installiert. Starte es, wenn du bereit bist; ein Download startet nie einen Server.',
    'Vexium Core is the supported local stack: the included llama.cpp runtime runs the reviewed Qwen2.5-1.5B-Instruct weights on loopback. Qwen and its Apache-2.0 licence stay visible; Kryvex packages the runtime and verifies the file, not the weights.':
      'Vexium Core ist der unterstützte lokale Stack: Die mitgelieferte llama.cpp-Laufzeit führt die geprüften Qwen2.5-1.5B-Instruct-Gewichte auf Loopback aus. Qwen und die Apache-2.0-Lizenz bleiben sichtbar; Kryvex paketiert die Laufzeit und prüft die Datei, nicht die Gewichte.',
    'Vexium Core is already running.': 'Vexium Core läuft bereits.',
    'Vexium Core is serving on {url}.': 'Vexium Core bedient {url}.',
    '{name} is already serving on {url}.': '{name} bedient bereits {url}.',
    'Run Vexium Core locally, or choose any .gguf you already have. The included llama.cpp runtime keeps inference on loopback; there is no account, key or cloud call.':
      'Führe Vexium Core lokal aus oder wähle eine eigene .gguf-Datei. Die mitgelieferte llama.cpp-Laufzeit hält Inferenz auf Loopback; kein Konto, kein Schlüssel, kein Cloud-Aufruf.',
    'No model file chosen. Install Vexium Core below, or choose a .gguf you already have.':
      'Keine Modelldatei gewählt. Installiere unten Vexium Core oder wähle eine eigene .gguf-Datei.',
    'Set up Vexium Core in Settings, or start Ollama (ollama serve) or the LM Studio local server and point Vexium at its loopback port.':
      'Richte Vexium Core in den Einstellungen ein oder starte Ollama (ollama serve) bzw. den lokalen LM-Studio-Server und verweise Vexium auf dessen Loopback-Port.',
    'Set up Vexium Core for real answers': 'Vexium Core für echte Antworten einrichten',
    Source: 'Quelle',
    Revision: 'Revision',
    File: 'Datei',
    'Download size': 'Downloadgröße',
    Licence: 'Lizenz',
    'commercial use permitted': 'kommerzielle Nutzung erlaubt',
    Architecture: 'Architektur',
    context: 'Kontext',
    'Estimated memory': 'Geschätzter Speicher',
    estimate: 'Schätzung',
    Languages: 'Sprachen',
    'Good at': 'Geeignet für',
    Limits: 'Grenzen',
    'Download progress': 'Downloadfortschritt',
    'Verifying the checksum…': 'Prüfsumme wird geprüft…',
    'Downloading {done} of {total}': '{done} von {total} heruntergeladen',
    'Use this model': 'Dieses Modell verwenden',
    Remove: 'Entfernen',
    Keep: 'Behalten',
    Delete: 'Löschen',
    'The file is missing from disk.': 'Die Datei fehlt auf dem Datenträger.',
    'Cancel download': 'Download abbrechen',
    Download: 'Herunterladen',
    'The llama.cpp runtime is included with Kryvex. Downloading a model does not start it.':
      'Die llama.cpp-Laufzeit ist in Kryvex enthalten. Der Download eines Modells startet sie nicht.',
    'llama-server was found. Downloading does not start it.':
      'llama-server wurde gefunden. Der Download startet ihn nicht.',
    'llama-server was not found. You can download now and point Kryvex at the runtime before starting.':
      'llama-server wurde nicht gefunden. Du kannst jetzt herunterladen und Kryvex vor dem Start auf die Laufzeit zeigen.',
    'No downloaded models. This panel fetched nothing on its own.':
      'Keine heruntergeladenen Modelle. Dieses Panel hat nichts von selbst geladen.',
    'file missing': 'Datei fehlt',
    'Model installed. Use this model to hand it to Vexium, then start the server.':
      'Modell installiert. Mit „Dieses Modell verwenden“ an Vexium übergeben und dann den Server starten.',
    'The model file was deleted.': 'Die Modelldatei wurde gelöscht.',
    'The download was cancelled.': 'Der Download wurde abgebrochen.',
    'Size mismatch: nothing was installed.': 'Größe stimmt nicht: Nichts wurde installiert.',
    'Checksum mismatch: nothing was installed.': 'Prüfsumme stimmt nicht: Nichts wurde installiert.',
    'Not enough free disk space for this model.': 'Nicht genug freier Speicher für dieses Modell.',
    'That model is already installed.': 'Dieses Modell ist bereits installiert.',
    'That model is running. Stop the server before deleting it.':
      'Dieses Modell läuft. Vor dem Löschen den Server stoppen.',
    'That catalogue entry is incomplete, so it cannot be downloaded.':
      'Dieser Katalogeintrag ist unvollständig und kann nicht geladen werden.',
    'That model is not in the reviewed catalogue.': 'Dieses Modell steht nicht im geprüften Katalog.',
    'The download could not be completed.': 'Der Download konnte nicht abgeschlossen werden.',
    'Ordinary conversation': 'Normale Unterhaltung',
    'Rewriting and editing': 'Umformulieren und bearbeiten',
    'Short summaries of text you paste': 'Kurze Zusammenfassungen eingefügter Texte',
    'Explanations and how-to': 'Erklärungen und Anleitungen',
    'Multi-step reasoning': 'Mehrstufiges Schlussfolgern',
    'Arithmetic: use the calculator': 'Arithmetik: den Rechner nutzen',
    'Current facts without a search': 'Aktuelle Fakten ohne Suche',
    English: 'Englisch',
    Spanish: 'Spanisch',
    German: 'Deutsch',
    French: 'Französisch',
  },
  fr: {
    'DOWNLOAD MODELS': 'TÉLÉCHARGER DES MODÈLES',
    'PINNED CATALOGUE': 'CATALOGUE ÉPINGLÉ',
    'One reviewed file per model, with its publisher, revision, size, checksum and licence shown before anything is fetched. Downloads start only when you press Download, and a running model is never replaced.':
      "Un fichier vérifié par modèle, avec son éditeur, sa révision, sa taille, son empreinte et sa licence avant tout téléchargement. Le téléchargement ne démarre qu'avec le bouton, et un modèle en cours n'est jamais remplacé.",
    'Model downloads are available in the desktop app.':
      "Les téléchargements de modèles sont disponibles dans l'application de bureau.",
    'ALREADY INSTALLED': 'DÉJÀ INSTALLÉ',
    STARTER: 'MODÈLE DE DÉPART',
    'DEFAULT CORE': 'NOYAU PAR DÉFAUT',
    'VEXIUM CORE': 'VEXIUM CORE',
    'Vexium Core is running': 'Vexium Core est en cours d’exécution',
    'Vexium Core is starting…': 'Vexium Core démarre…',
    '{name} is configured, but the local server is stopped.':
      '{name} est configuré, mais le serveur local est arrêté.',
    'Start Vexium Core': 'Démarrer Vexium Core',
    'Download Vexium Core': 'Télécharger Vexium Core',
    Installed: 'Installé',
    'Not installed': 'Non installé',
    'Active build': 'Build actif',
    RUNNING: 'EN COURS',
    STOPPED: 'ARRÊTÉ',
    STARTING: 'DÉMARRAGE',
    ERROR: 'ERREUR',
    'Install Vexium Core in Settings to start it here.':
      'Installez Vexium Core dans les réglages pour le démarrer ici.',
    'Vexium Core is installed. Start it when you are ready; downloading never starts a server.':
      'Vexium Core est installé. Démarrez-le quand vous êtes prêt ; un téléchargement ne démarre jamais un serveur.',
    'Vexium Core is the supported local stack: the included llama.cpp runtime runs the reviewed Qwen2.5-1.5B-Instruct weights on loopback. Qwen and its Apache-2.0 licence stay visible; Kryvex packages the runtime and verifies the file, not the weights.':
      'Vexium Core est la pile locale prise en charge : le runtime llama.cpp inclus exécute les poids vérifiés de Qwen2.5-1.5B-Instruct sur loopback. Qwen et sa licence Apache-2.0 restent visibles ; Kryvex fournit le runtime et vérifie le fichier, pas les poids.',
    'Vexium Core is already running.': 'Vexium Core est déjà en cours d’exécution.',
    'Vexium Core is serving on {url}.': 'Vexium Core sert sur {url}.',
    '{name} is already serving on {url}.': '{name} sert déjà sur {url}.',
    'Run Vexium Core locally, or choose any .gguf you already have. The included llama.cpp runtime keeps inference on loopback; there is no account, key or cloud call.':
      'Exécutez Vexium Core localement ou choisissez un fichier .gguf existant. Le runtime llama.cpp inclus garde l’inférence sur loopback ; aucun compte, clé ni appel cloud.',
    'No model file chosen. Install Vexium Core below, or choose a .gguf you already have.':
      'Aucun fichier de modèle choisi. Installez Vexium Core ci-dessous ou choisissez un fichier .gguf existant.',
    'Set up Vexium Core in Settings, or start Ollama (ollama serve) or the LM Studio local server and point Vexium at its loopback port.':
      'Configurez Vexium Core dans les réglages, ou démarrez Ollama (ollama serve) ou le serveur local LM Studio et pointez Vexium vers son port loopback.',
    'Set up Vexium Core for real answers': 'Configurer Vexium Core pour de vraies réponses',
    Source: 'Source',
    Revision: 'Révision',
    File: 'Fichier',
    'Download size': 'Taille du téléchargement',
    Licence: 'Licence',
    'commercial use permitted': 'usage commercial autorisé',
    Architecture: 'Architecture',
    context: 'contexte',
    'Estimated memory': 'Mémoire estimée',
    estimate: 'estimation',
    Languages: 'Langues',
    'Good at': 'Adapté à',
    Limits: 'Limites',
    'Download progress': 'Progression du téléchargement',
    'Verifying the checksum…': "Vérification de l'empreinte…",
    'Downloading {done} of {total}': 'Téléchargé {done} sur {total}',
    'Use this model': 'Utiliser ce modèle',
    Remove: 'Retirer',
    Keep: 'Conserver',
    Delete: 'Supprimer',
    'The file is missing from disk.': 'Le fichier est absent du disque.',
    'Cancel download': 'Annuler le téléchargement',
    Download: 'Télécharger',
    'The llama.cpp runtime is included with Kryvex. Downloading a model does not start it.':
      'Le moteur llama.cpp est inclus avec Kryvex. Le téléchargement d’un modèle ne le démarre pas.',
    'llama-server was found. Downloading does not start it.':
      "llama-server a été trouvé. Le téléchargement ne le démarre pas.",
    'llama-server was not found. You can download now and point Kryvex at the runtime before starting.':
      "llama-server est introuvable. Vous pouvez télécharger maintenant et indiquer l'exécutable avant de démarrer.",
    'No downloaded models. This panel fetched nothing on its own.':
      "Aucun modèle téléchargé. Ce panneau n'a rien récupéré de lui-même.",
    'file missing': 'fichier absent',
    'Model installed. Use this model to hand it to Vexium, then start the server.':
      "Modèle installé. Utilisez « Utiliser ce modèle » pour le confier à Vexium, puis démarrez le serveur.",
    'The model file was deleted.': 'Le fichier du modèle a été supprimé.',
    'The download was cancelled.': 'Le téléchargement a été annulé.',
    'Size mismatch: nothing was installed.': "Taille incorrecte: rien n'a été installé.",
    'Checksum mismatch: nothing was installed.': "Empreinte incorrecte: rien n'a été installé.",
    'Not enough free disk space for this model.': 'Espace disque insuffisant pour ce modèle.',
    'That model is already installed.': 'Ce modèle est déjà installé.',
    'That model is running. Stop the server before deleting it.':
      'Ce modèle est en cours. Arrêtez le serveur avant de le supprimer.',
    'That catalogue entry is incomplete, so it cannot be downloaded.':
      'Cette entrée du catalogue est incomplète et ne peut pas être téléchargée.',
    'That model is not in the reviewed catalogue.': "Ce modèle n'est pas dans le catalogue vérifié.",
    'The download could not be completed.': "Le téléchargement n'a pas pu aboutir.",
    'Ordinary conversation': 'Conversation courante',
    'Rewriting and editing': 'Réécriture et édition',
    'Short summaries of text you paste': 'Résumés courts du texte collé',
    'Explanations and how-to': 'Explications et pas-à-pas',
    'Multi-step reasoning': 'Raisonnement en plusieurs étapes',
    'Arithmetic: use the calculator': 'Arithmétique: utilisez la calculatrice',
    'Current facts without a search': 'Faits actuels sans recherche',
    English: 'Anglais',
    Spanish: 'Espagnol',
    German: 'Allemand',
    French: 'Français',
  },
};
