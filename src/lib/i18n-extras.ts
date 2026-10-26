/**
 * Translations for the shield's filter editor, the Vexium model-file runner and
 * the embedded-browser sign-in notice.
 *
 * These are kept in their own catalogue rather than scattered through
 * `i18n.tsx`: they ship as one feature set, and merging them last means a new
 * key never has to be inserted into three large language blocks by hand.
 */
type ExtraLanguage = 'es' | 'de' | 'fr';

export const featureCopy: Record<ExtraLanguage, Record<string, string>> = {
  es: {
    'MY FILTERS': 'MIS FILTROS',
    '{rules} active rules · {lines} lines': '{rules} reglas activas · {lines} líneas',
    'uBlock Origin syntax, one rule per line: ||ads.example.com^ blocks a request, example.com##.ad hides a selector, example.com##+js(…) runs a scriptlet. Applying recompiles from the cached lists, so no download is needed.':
      'Sintaxis de uBlock Origin, una regla por línea: ||ads.example.com^ bloquea una petición, example.com##.ad oculta un selector y example.com##+js(…) ejecuta un scriptlet. Al aplicar se recompila desde las listas en caché, sin descargar nada.',
    '! Your rules go here\n||ads.example.com^\nwww.youtube.com##ytd-ad-slot-renderer':
      '! Tus reglas aquí\n||ads.example.com^\nwww.youtube.com##ytd-ad-slot-renderer',
    'Apply changes': 'Aplicar cambios',
    'Applying…': 'Aplicando…',
    Revert: 'Revertir',
    'Import and append…': 'Importar y añadir…',
    'Export…': 'Exportar…',
    'Enable my custom filters': 'Activar mis filtros personalizados',
    'When off, the rules are kept but not compiled into the shield.':
      'Si está desactivado, las reglas se conservan pero no se compilan en el escudo.',
    'Allow scriptlet rules (+js)': 'Permitir reglas scriptlet (+js)',
    'Scriptlets run small scripts in the page to switch off ad-block popups. Kryvex implements uBO’s set and set-constant; other scriptlet names are ignored. Rules using them are skipped while this is off.':
      'Los scriptlets ejecutan pequeños scripts en la página para desactivar los avisos de bloqueo. Kryvex implementa set y set-constant de uBO; otros nombres se ignoran. Las reglas que los usan se omiten mientras está desactivado.',
    'YouTube: block ads and feed noise': 'YouTube: bloquear anuncios y ruido del feed',
    'Hides ad slots, sponsored feed cards and recommendation shelves on youtube.com, switches off the ad-block popup, and blocks three ad hosts on that site only.':
      'Oculta espacios publicitarios, tarjetas patrocinadas y estantes de recomendaciones en youtube.com, desactiva el aviso de bloqueo y bloquea tres hosts de anuncios solo en ese sitio.',
    '{count} rule(s) are on hold until scriptlet rules are allowed.':
      '{count} regla(s) en espera hasta permitir los scriptlets.',
    'Unapplied edits. Nothing is compiled until you apply.':
      'Cambios sin aplicar. Nada se compila hasta que apliques.',
    'Filter rules applied.': 'Reglas aplicadas.',
    'The filter rules could not be applied.': 'No se pudieron aplicar las reglas.',
    'The file could not be imported.': 'No se pudo importar el archivo.',
    'The rules could not be exported.': 'No se pudieron exportar las reglas.',

    'RUN A MODEL FILE': 'EJECUTAR UN ARCHIVO DE MODELO',
    IDLE: 'INACTIVO',
    'Pick a .gguf model you already downloaded. Kryvex starts llama.cpp on loopback and Vexium uses it like any other runtime. The CPU runtime is included; no weights are downloaded or hosted by us.':
      'Elige un modelo .gguf que ya hayas descargado. Kryvex inicia llama.cpp en loopback y Vexium lo usa como cualquier otro motor. El motor de CPU está incluido; no descargamos ni alojamos pesos.',
    'Model file': 'Archivo de modelo',
    'No model file chosen. Download the reviewed starter below, or choose a .gguf you already have.':
      'Ningún archivo elegido. Descarga el modelo inicial revisado abajo o elige un .gguf que ya tengas.',
    'Included with Kryvex and ready for the model you choose. Point Kryvex at another llama.cpp build if you want GPU acceleration.':
      'Incluido con Kryvex y listo para el modelo que elijas. Indica otro build de llama.cpp si quieres aceleración por GPU.',
    'Other builds': 'Otros builds',
    'Use another runtime…': 'Usar otro motor…',
    'Choose model…': 'Elegir modelo…',
    'Get models': 'Obtener modelos',
    'not found': 'no encontrado',
    'Kryvex uses llama.cpp’s llama-server. If it is not on your PATH, point Kryvex at the executable once.':
      'Kryvex usa llama-server de llama.cpp. Si no está en el PATH, indícale el ejecutable una vez.',
    'Download llama.cpp': 'Descargar llama.cpp',
    'Find runtime…': 'Buscar motor…',
    'Start server': 'Iniciar servidor',
    'Starting…': 'Iniciando…',
    'Stop server': 'Detener servidor',
    'Context window': 'Ventana de contexto',
    'Tokens the model can hold. Larger needs more memory. A change applies the next time the server starts.':
      'Tokens que caben en el modelo. Más grande exige más memoria. El cambio se aplica al reiniciar el servidor.',
    'GPU layers: {count}': 'Capas GPU: {count}',
    'Serving {name} at {url}: Vexium is pointed at it.':
      '{name} sirviéndose en {url}: Vexium ya apunta ahí.',
    'Models are yours to source: Hugging Face GGUF builds, Ollama’s library, or LM Studio’s catalogue. Kryvex never uploads or redistributes them.':
      'Los modelos los buscas tú: builds GGUF en Hugging Face, la biblioteca de Ollama o el catálogo de LM Studio. Kryvex nunca los sube ni los redistribuye.',
    'MODEL FILE': 'ARCHIVO DE MODELO',
    'Get a model': 'Obtener un modelo',
    'The model file could not be opened.': 'No se pudo abrir el archivo de modelo.',
    'The runtime could not be set.': 'No se pudo configurar el motor.',
    'Loading the model. Large files can take a minute.':
      'Cargando el modelo. Los archivos grandes pueden tardar un minuto.',
    '{name} is serving on {url}.': '{name} está sirviendo en {url}.',
    'The model could not be started.': 'No se pudo iniciar el modelo.',
    'The local model stopped.': 'El modelo local se detuvo.',
    'The model could not be stopped.': 'No se pudo detener el modelo.',

    'Google will not sign in inside an embedded browser.':
      'Google no permite el acceso dentro de un navegador embebido.',
    'Google blocks sign-in in app-embedded browsers. Kryvex already reports one consistent Chrome identity, so if this card still appears the refusal is Google’s policy, not a missing setting. A stale Google session makes it worse: clearing it and signing in fresh often gets further.':
      'Google bloquea el acceso en navegadores embebidos en apps. Kryvex ya presenta una identidad Chrome coherente; si este aviso sigue apareciendo, la negativa es política de Google y no una opción que falte. Una sesión antigua de Google lo empeora: borrarla y entrar de nuevo suele llegar más lejos.',
    'Reset session & retry': 'Borrar sesión y reintentar',
    'Open in my browser': 'Abrir en mi navegador',
    Dismiss: 'Descartar',

    'Likely your network': 'Probablemente tu red',
    'Virtual adapter: a phone usually cannot reach this one':
      'Adaptador virtual: un teléfono normalmente no puede acceder a esta',
    'Can’t connect from the phone?': '¿No conecta desde el teléfono?',
    'Both devices must be on the same Wi-Fi or Ethernet network, and Kryvex must be allowed through the firewall on private networks. VPN and virtual adapters cannot reach the phone, so use the address marked as your network.':
      'Ambos dispositivos deben estar en la misma red Wi-Fi o Ethernet, y Kryvex debe estar permitido en el cortafuegos para redes privadas. Las VPN y los adaptadores virtuales no llegan al teléfono, así que usa la dirección marcada como tu red.',

    'Clock style': 'Estilo del reloj',
    'Show the clock': 'Mostrar el reloj',
    Bare: 'Suelto',
    Card: 'Tarjeta',
    'Clock radio': 'Radio-reloj',
    Colour: 'Color',
    Font: 'Fuente',
    'Clock font': 'Fuente del reloj',
    Muted: 'Atenuado',
    Capture: 'Capturar',
    'Capture the screen, a service or a window': 'Captura la pantalla, un servicio o una ventana',
    'Window animation': 'Animación de ventanas',
    Subtle: 'Sutil',
    Bouncy: 'Con rebote',
    None: 'Ninguna',
    'Animation speed': 'Velocidad de la animación',
  },
  de: {
    'MY FILTERS': 'MEINE FILTER',
    '{rules} active rules · {lines} lines': '{rules} aktive Regeln · {lines} Zeilen',
    'uBlock Origin syntax, one rule per line: ||ads.example.com^ blocks a request, example.com##.ad hides a selector, example.com##+js(…) runs a scriptlet. Applying recompiles from the cached lists, so no download is needed.':
      'uBlock-Origin-Syntax, eine Regel pro Zeile: ||ads.example.com^ blockiert eine Anfrage, example.com##.ad blendet einen Selektor aus, example.com##+js(…) führt ein Scriptlet aus. Beim Anwenden wird aus den zwischengespeicherten Listen neu kompiliert, ohne Download.',
    '! Your rules go here\n||ads.example.com^\nwww.youtube.com##ytd-ad-slot-renderer':
      '! Deine Regeln hier\n||ads.example.com^\nwww.youtube.com##ytd-ad-slot-renderer',
    'Apply changes': 'Änderungen anwenden',
    'Applying…': 'Wird angewendet…',
    Revert: 'Zurücksetzen',
    'Import and append…': 'Importieren und anhängen…',
    'Export…': 'Exportieren…',
    'Enable my custom filters': 'Eigene Filter aktivieren',
    'When off, the rules are kept but not compiled into the shield.':
      'Aus bedeutet: Die Regeln bleiben erhalten, werden aber nicht in den Schutz kompiliert.',
    'Allow scriptlet rules (+js)': 'Scriptlet-Regeln erlauben (+js)',
    'Scriptlets run small scripts in the page to switch off ad-block popups. Kryvex implements uBO’s set and set-constant; other scriptlet names are ignored. Rules using them are skipped while this is off.':
      'Scriptlets führen kleine Skripte in der Seite aus, um Adblock-Hinweise abzuschalten. Kryvex implementiert set und set-constant von uBO; andere Namen werden ignoriert. Regeln damit werden bei ausgeschalteter Option übersprungen.',
    'YouTube: block ads and feed noise': 'YouTube: Werbung und Feed-Rauschen blockieren',
    'Hides ad slots, sponsored feed cards and recommendation shelves on youtube.com, switches off the ad-block popup, and blocks three ad hosts on that site only.':
      'Blendet Werbeplätze, gesponserte Feed-Karten und Empfehlungsregale auf youtube.com aus, schaltet den Adblock-Hinweis ab und blockiert drei Werbe-Hosts nur auf dieser Seite.',
    '{count} rule(s) are on hold until scriptlet rules are allowed.':
      '{count} Regel(n) warten, bis Scriptlets erlaubt sind.',
    'Unapplied edits. Nothing is compiled until you apply.':
      'Nicht angewendete Änderungen. Erst beim Anwenden wird kompiliert.',
    'Filter rules applied.': 'Filterregeln angewendet.',
    'The filter rules could not be applied.': 'Die Filterregeln konnten nicht angewendet werden.',
    'The file could not be imported.': 'Die Datei konnte nicht importiert werden.',
    'The rules could not be exported.': 'Die Regeln konnten nicht exportiert werden.',

    'RUN A MODEL FILE': 'MODELLDATEI AUSFÜHREN',
    IDLE: 'BEREIT',
    'Pick a .gguf model you already downloaded. Kryvex starts llama.cpp on loopback and Vexium uses it like any other runtime. The CPU runtime is included; no weights are downloaded or hosted by us.':
      'Wähle ein .gguf-Modell, das du bereits heruntergeladen hast. Kryvex startet llama.cpp auf Loopback, Vexium nutzt es wie jede andere Laufzeit. Die CPU-Laufzeit ist enthalten; wir laden oder hosten keine Gewichte.',
    'Model file': 'Modelldatei',
    'No model file chosen. Download the reviewed starter below, or choose a .gguf you already have.':
      'Keine Modelldatei gewählt. Lade unten das geprüfte Startmodell herunter oder wähle eine vorhandene .gguf-Datei.',
    'Included with Kryvex and ready for the model you choose. Point Kryvex at another llama.cpp build if you want GPU acceleration.':
      'In Kryvex enthalten und bereit für dein Modell. Zeige auf einen anderen llama.cpp-Build, wenn du GPU-Beschleunigung willst.',
    'Other builds': 'Andere Builds',
    'Use another runtime…': 'Andere Laufzeit verwenden…',
    'Choose model…': 'Modell wählen…',
    'Get models': 'Modelle holen',
    'not found': 'nicht gefunden',
    'Kryvex uses llama.cpp’s llama-server. If it is not on your PATH, point Kryvex at the executable once.':
      'Kryvex nutzt llama-server aus llama.cpp. Ist es nicht im PATH, zeige Kryvex einmal auf die ausführbare Datei.',
    'Download llama.cpp': 'llama.cpp herunterladen',
    'Find runtime…': 'Laufzeit suchen…',
    'Start server': 'Server starten',
    'Starting…': 'Startet…',
    'Stop server': 'Server stoppen',
    'Context window': 'Kontextfenster',
    'Tokens the model can hold. Larger needs more memory. A change applies the next time the server starts.':
      'Tokens, die das Modell halten kann. Mehr braucht mehr Speicher. Änderungen gelten beim nächsten Serverstart.',
    'GPU layers: {count}': 'GPU-Schichten: {count}',
    'Serving {name} at {url}: Vexium is pointed at it.':
      '{name} läuft auf {url}: Vexium zeigt darauf.',
    'Models are yours to source: Hugging Face GGUF builds, Ollama’s library, or LM Studio’s catalogue. Kryvex never uploads or redistributes them.':
      'Modelle besorgst du selbst: GGUF-Builds von Hugging Face, Ollamas Bibliothek oder der LM-Studio-Katalog. Kryvex lädt sie weder hoch noch gibt es sie weiter.',
    'MODEL FILE': 'MODELLDATEI',
    'Get a model': 'Modell besorgen',
    'The model file could not be opened.': 'Die Modelldatei konnte nicht geöffnet werden.',
    'The runtime could not be set.': 'Die Laufzeit konnte nicht gesetzt werden.',
    'Loading the model. Large files can take a minute.':
      'Modell wird geladen. Große Dateien brauchen manchmal eine Minute.',
    '{name} is serving on {url}.': '{name} läuft auf {url}.',
    'The model could not be started.': 'Das Modell konnte nicht gestartet werden.',
    'The local model stopped.': 'Das lokale Modell wurde gestoppt.',
    'The model could not be stopped.': 'Das Modell konnte nicht gestoppt werden.',

    'Google will not sign in inside an embedded browser.':
      'Google meldet sich in einem eingebetteten Browser nicht an.',
    'Google blocks sign-in in app-embedded browsers. Kryvex already reports one consistent Chrome identity, so if this card still appears the refusal is Google’s policy, not a missing setting. A stale Google session makes it worse: clearing it and signing in fresh often gets further.':
      'Google blockiert die Anmeldung in eingebetteten Browsern. Kryvex meldet bereits eine stimmige Chrome-Identität; erscheint dieser Hinweis trotzdem, ist die Ablehnung Googles Richtlinie und keine fehlende Einstellung. Eine alte Google-Sitzung verschärft das: löschen und neu anmelden kommt oft weiter.',
    'Reset session & retry': 'Sitzung löschen und erneut versuchen',
    'Open in my browser': 'In meinem Browser öffnen',
    Dismiss: 'Ausblenden',

    'Likely your network': 'Wahrscheinlich dein Netzwerk',
    'Virtual adapter: a phone usually cannot reach this one':
      'Virtueller Adapter: ein Telefon erreicht diese Adresse meist nicht',
    'Can’t connect from the phone?': 'Keine Verbindung vom Telefon?',
    'Both devices must be on the same Wi-Fi or Ethernet network, and Kryvex must be allowed through the firewall on private networks. VPN and virtual adapters cannot reach the phone, so use the address marked as your network.':
      'Beide Geräte müssen im selben WLAN- oder Ethernet-Netz sein, und Kryvex muss in der Firewall für private Netzwerke zugelassen sein. VPN- und virtuelle Adapter erreichen das Telefon nicht, nimm also die als dein Netzwerk markierte Adresse.',

    'Clock style': 'Uhrstil',
    'Show the clock': 'Uhr anzeigen',
    Bare: 'Frei',
    Card: 'Karte',
    'Clock radio': 'Radiouhr',
    Colour: 'Farbe',
    Font: 'Schrift',
    'Clock font': 'Schrift der Uhr',
    Muted: 'Gedämpft',
    Capture: 'Aufnehmen',
    'Capture the screen, a service or a window': 'Bildschirm, Dienst oder Fenster aufnehmen',
    'Window animation': 'Fensteranimation',
    Subtle: 'Dezent',
    Bouncy: 'Federnd',
    None: 'Keine',
    'Animation speed': 'Animationsgeschwindigkeit',
  },
  fr: {
    'MY FILTERS': 'MES FILTRES',
    '{rules} active rules · {lines} lines': '{rules} règles actives · {lines} lignes',
    'uBlock Origin syntax, one rule per line: ||ads.example.com^ blocks a request, example.com##.ad hides a selector, example.com##+js(…) runs a scriptlet. Applying recompiles from the cached lists, so no download is needed.':
      'Syntaxe uBlock Origin, une règle par ligne : ||ads.example.com^ bloque une requête, example.com##.ad masque un sélecteur, example.com##+js(…) exécute un scriptlet. L’application recompile depuis les listes en cache, sans téléchargement.',
    '! Your rules go here\n||ads.example.com^\nwww.youtube.com##ytd-ad-slot-renderer':
      '! Vos règles ici\n||ads.example.com^\nwww.youtube.com##ytd-ad-slot-renderer',
    'Apply changes': 'Appliquer les modifications',
    'Applying…': 'Application…',
    Revert: 'Rétablir',
    'Import and append…': 'Importer et ajouter…',
    'Export…': 'Exporter…',
    'Enable my custom filters': 'Activer mes filtres personnalisés',
    'When off, the rules are kept but not compiled into the shield.':
      'Désactivé, les règles sont conservées mais ne sont pas compilées dans le bouclier.',
    'Allow scriptlet rules (+js)': 'Autoriser les règles scriptlet (+js)',
    'Scriptlets run small scripts in the page to switch off ad-block popups. Kryvex implements uBO’s set and set-constant; other scriptlet names are ignored. Rules using them are skipped while this is off.':
      'Les scriptlets exécutent de petits scripts dans la page pour désactiver les messages anti-bloqueur. Kryvex implémente set et set-constant d’uBO ; les autres noms sont ignorés. Les règles concernées sont ignorées tant que cette option est désactivée.',
    'YouTube: block ads and feed noise': 'YouTube : bloquer les pubs et le bruit du fil',
    'Hides ad slots, sponsored feed cards and recommendation shelves on youtube.com, switches off the ad-block popup, and blocks three ad hosts on that site only.':
      'Masque les emplacements publicitaires, les cartes sponsorisées et les rayons de recommandations sur youtube.com, désactive le message anti-bloqueur et bloque trois hôtes publicitaires sur ce seul site.',
    '{count} rule(s) are on hold until scriptlet rules are allowed.':
      '{count} règle(s) en attente jusqu’à autoriser les scriptlets.',
    'Unapplied edits. Nothing is compiled until you apply.':
      'Modifications non appliquées. Rien n’est compilé avant application.',
    'Filter rules applied.': 'Règles appliquées.',
    'The filter rules could not be applied.': 'Impossible d’appliquer les règles.',
    'The file could not be imported.': 'Impossible d’importer le fichier.',
    'The rules could not be exported.': 'Impossible d’exporter les règles.',

    'RUN A MODEL FILE': 'EXÉCUTER UN FICHIER DE MODÈLE',
    IDLE: 'INACTIF',
    'Pick a .gguf model you already downloaded. Kryvex starts llama.cpp on loopback and Vexium uses it like any other runtime. The CPU runtime is included; no weights are downloaded or hosted by us.':
      'Choisissez un modèle .gguf déjà téléchargé. Kryvex lance llama.cpp en loopback et Vexium l’utilise comme n’importe quel moteur. Le moteur CPU est inclus ; nous ne téléchargeons ni n’hébergeons aucun poids.',
    'Model file': 'Fichier de modèle',
    'No model file chosen. Download the reviewed starter below, or choose a .gguf you already have.':
      'Aucun fichier choisi. Téléchargez le modèle de départ vérifié ci-dessous ou choisissez un .gguf existant.',
    'Included with Kryvex and ready for the model you choose. Point Kryvex at another llama.cpp build if you want GPU acceleration.':
      'Inclus avec Kryvex et prêt pour le modèle choisi. Indiquez un autre build llama.cpp pour l’accélération GPU.',
    'Other builds': 'Autres builds',
    'Use another runtime…': 'Utiliser un autre moteur…',
    'Choose model…': 'Choisir un modèle…',
    'Get models': 'Obtenir des modèles',
    'not found': 'introuvable',
    'Kryvex uses llama.cpp’s llama-server. If it is not on your PATH, point Kryvex at the executable once.':
      'Kryvex utilise llama-server de llama.cpp. S’il n’est pas dans le PATH, indiquez l’exécutable une fois.',
    'Download llama.cpp': 'Télécharger llama.cpp',
    'Find runtime…': 'Trouver le moteur…',
    'Start server': 'Démarrer le serveur',
    'Starting…': 'Démarrage…',
    'Stop server': 'Arrêter le serveur',
    'Context window': 'Fenêtre de contexte',
    'Tokens the model can hold. Larger needs more memory. A change applies the next time the server starts.':
      'Tokens que le modèle peut contenir. Plus grand demande plus de mémoire. Le changement s’applique au prochain démarrage du serveur.',
    'GPU layers: {count}': 'Couches GPU : {count}',
    'Serving {name} at {url}: Vexium is pointed at it.':
      '{name} est servi sur {url}: Vexium pointe dessus.',
    'Models are yours to source: Hugging Face GGUF builds, Ollama’s library, or LM Studio’s catalogue. Kryvex never uploads or redistributes them.':
      'Les modèles sont à trouver vous-même : builds GGUF sur Hugging Face, bibliothèque d’Ollama ou catalogue de LM Studio. Kryvex ne les envoie ni ne les redistribue.',
    'MODEL FILE': 'FICHIER DE MODÈLE',
    'Get a model': 'Obtenir un modèle',
    'The model file could not be opened.': 'Impossible d’ouvrir le fichier de modèle.',
    'The runtime could not be set.': 'Impossible de définir le moteur.',
    'Loading the model. Large files can take a minute.':
      'Chargement du modèle. Les gros fichiers peuvent prendre une minute.',
    '{name} is serving on {url}.': '{name} est servi sur {url}.',
    'The model could not be started.': 'Impossible de démarrer le modèle.',
    'The local model stopped.': 'Le modèle local s’est arrêté.',
    'The model could not be stopped.': 'Impossible d’arrêter le modèle.',

    'Google will not sign in inside an embedded browser.':
      'Google refuse la connexion dans un navigateur intégré.',
    'Google blocks sign-in in app-embedded browsers. Kryvex already reports one consistent Chrome identity, so if this card still appears the refusal is Google’s policy, not a missing setting. A stale Google session makes it worse: clearing it and signing in fresh often gets further.':
      'Google bloque la connexion dans les navigateurs intégrés aux applis. Kryvex présente déjà une identité Chrome cohérente ; si cette carte apparaît encore, le refus vient de la politique de Google, pas d’un réglage manquant. Une session Google périmée aggrave les choses : la supprimer et se reconnecter va souvent plus loin.',
    'Reset session & retry': 'Réinitialiser la session et réessayer',
    'Open in my browser': 'Ouvrir dans mon navigateur',
    Dismiss: 'Ignorer',

    'Likely your network': 'Probablement votre réseau',
    'Virtual adapter: a phone usually cannot reach this one':
      'Adaptateur virtuel : un téléphone ne peut généralement pas l’atteindre',
    'Can’t connect from the phone?': 'Pas de connexion depuis le téléphone ?',
    'Both devices must be on the same Wi-Fi or Ethernet network, and Kryvex must be allowed through the firewall on private networks. VPN and virtual adapters cannot reach the phone, so use the address marked as your network.':
      'Les deux appareils doivent être sur le même réseau Wi-Fi ou Ethernet, et Kryvex doit être autorisé dans le pare-feu pour les réseaux privés. Les VPN et les adaptateurs virtuels n’atteignent pas le téléphone : utilisez l’adresse indiquée comme votre réseau.',

    'Clock style': 'Style de l’horloge',
    'Show the clock': 'Afficher l’horloge',
    Bare: 'Libre',
    Card: 'Carte',
    'Clock radio': 'Radio-réveil',
    Colour: 'Couleur',
    Font: 'Police',
    'Clock font': 'Police de l’horloge',
    Muted: 'Atténué',
    Capture: 'Capturer',
    'Capture the screen, a service or a window': 'Capturer l’écran, un service ou une fenêtre',
    'Window animation': 'Animation des fenêtres',
    Subtle: 'Discrète',
    Bouncy: 'Rebondissante',
    None: 'Aucune',
    'Animation speed': 'Vitesse de l’animation',
  },
};
