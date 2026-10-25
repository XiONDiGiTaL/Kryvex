/**
 * Copy for the player's visualizer and faults, the rooms share and control
 * surfaces, the typography panel and Lexium's diagnostics.
 *
 * This module exists so a new feature ships translated instead of falling back
 * to English: the coverage test in `tests/i18n-coverage.test.ts` checks every
 * literal the renderer asks for, and the historical backlog it still reports is
 * listed in docs/I18N.md.
 */
export const sessionCopy: Record<'es' | 'de' | 'fr', Record<string, string>> = {
  es: {
    'VISUALIZER': 'VISUALIZADOR',
    'Visualizer': 'Visualizador',
    'Visualizer level': 'Nivel del visualizador',
    'LEVEL': 'NIVEL',
    'Off': 'Apagado',
    'Spectrum bars': 'Barras de espectro',
    'Waveform': 'Forma de onda',
    'Radial spectrum': 'Espectro radial',
    'Ambient glow': 'Brillo ambiental',
    'Drawn from the audio Kryvex decodes.':
      'Dibujado a partir del audio que Kryvex decodifica.',
    'This row is drawn by an embed, so it has no analysable audio.':
      'Esta pista la dibuja un incrustado, así que no tiene audio analizable.',
    'Loading the video…': 'Cargando el vídeo…',
    'Open it there': 'Abrirlo allí',
    'The owner of this video does not allow it to be played outside YouTube.':
      'El propietario de este vídeo no permite reproducirlo fuera de YouTube.',
    'That video is private or no longer available.':
      'Ese vídeo es privado o ya no está disponible.',
    'YouTube refused this embed. The desktop app plays it through its own local bridge; if this keeps happening, open the video in YouTube.':
      'YouTube rechazó esta inserción. La aplicación de escritorio la reproduce mediante su propio puente local; si sigue ocurriendo, abre el vídeo en YouTube.',
    'Live streams are not supported in this player.':
      'Este reproductor no admite transmisiones en directo.',
    'Spotify does not publish a preview for this track. Open the full track in Spotify.':
      'Spotify no publica una vista previa de esta pista. Abre la pista completa en Spotify.',
    'Could not reach the playlist. Check the link and your connection.':
      'No se pudo contactar con la lista. Revisa el enlace y tu conexión.',
    'That provider refused the request from this network (it answered 403 or 429). Try again later, or open the playlist in its own service.':
      'Ese proveedor rechazó la solicitud desde esta red (respondió 403 o 429). Inténtalo más tarde o abre la lista en su propio servicio.',
    'SPOTIFY PREVIEW': 'VISTA PREVIA DE SPOTIFY',
    'SPOTIFY · NO PREVIEW': 'SPOTIFY · SIN VISTA PREVIA',
    'Spotify rows play their public 30-second preview. Open the full track in Spotify for the whole song.':
      'Las filas de Spotify reproducen su vista previa pública de 30 segundos. Abre la pista completa en Spotify para oír la canción entera.',

    'Typography': 'Tipografía',
    'Text size': 'Tamaño del texto',
    'Text style': 'Estilo del texto',
    'Scales every interface size together, from {min}% to {max}%. Embedded pages and media keep their own type.':
      'Escala todos los tamaños de la interfaz a la vez, del {min} % al {max} %. Las páginas incrustadas y los medios conservan su propia tipografía.',
    'A curated set of families that is already installed, so nothing is downloaded and the change applies at once. Code keeps its monospace face.':
      'Un conjunto seleccionado de familias ya instaladas, así que no se descarga nada y el cambio se aplica al instante. El código conserva su tipografía monoespaciada.',
    'The quick brown fox jumps over the lazy dog — 0123456789. This line uses the current size and family.':
      'El veloz murciélago hindú comía feliz cardillo y kiwi — 0123456789. Esta línea usa el tamaño y la familia actuales.',

    'Share stopped.': 'Transmisión detenida.',
    'Mute shared audio': 'Silenciar el audio compartido',
    'Unmute shared audio': 'Activar el audio compartido',
    'Play it here': 'Reproducirlo aquí',
    'Shared stream volume': 'Volumen de la transmisión',
    'Shared stream': 'Transmisión compartida',
    'Stream size': 'Tamaño de la transmisión',
    'Fullscreen': 'Pantalla completa',
    'Pop out': 'Abrir aparte',
    'POPPED OUT': 'ABIERTO APARTE',
    'This build keeps the stream docked; fullscreen gives it the whole window.':
      'Esta versión mantiene la transmisión acoplada; la pantalla completa le da toda la ventana.',
    'A separate window was blocked, so the share stays in this view.':
      'Se bloqueó una ventana aparte, así que la transmisión se queda en esta vista.',
    'This capture has no audio track.':
      'Esta captura no tiene pista de audio.',
    'Kryvex share': 'Transmisión de Kryvex',
    'CHAT OVERLAY': 'CAPA DE CHAT',
    'Overlay opacity': 'Opacidad de la capa',
    'Hide the overlay': 'Ocultar la capa',
    'Show chat': 'Mostrar el chat',
    'TODAY': 'HOY',
    'YESTERDAY': 'AYER',
    'Waiting for a share…': 'Esperando una transmisión…',

    'REMOTE CONTROL': 'CONTROL REMOTO',
    'Ask to control': 'Pedir el control',
    'Give control back': 'Devolver el control',
    'Allow': 'Permitir',
    'Take control back': 'Recuperar el control',
    '{name} is asking to control this share.':
      '{name} pide controlar esta transmisión.',
    '{name} can control this share.': '{name} puede controlar esta transmisión.',
    'You have control. Click the stream, then use the mouse and keyboard.':
      'Tienes el control. Haz clic en la transmisión y usa el ratón y el teclado.',
    'Waiting for the host to allow control…':
      'Esperando a que el anfitrión permita el control…',
    'Viewing is not controlling. Ask the host before your input is sent.':
      'Ver no es controlar. Pide permiso al anfitrión antes de enviar tu entrada.',
    'A viewer can ask to control this app. Nothing is granted until you allow it.':
      'Un espectador puede pedir controlar esta aplicación. No se concede nada hasta que lo permitas.',
    'Control is only offered for a Kryvex app. A screen or window capture needs a native helper, which this build does not ship.':
      'El control solo se ofrece para una aplicación Kryvex. Capturar una pantalla o ventana requiere un asistente nativo que esta versión no incluye.',
    'REMOTE CONTROL is on.': 'El CONTROL REMOTO está activo.',

    'Nothing answered at {url}. Start the transcription server, check its port, and make sure it is listening on 127.0.0.1 rather than only inside a container.':
      'Nadie respondió en {url}. Inicia el servidor de transcripción, revisa su puerto y asegúrate de que escucha en 127.0.0.1 y no solo dentro de un contenedor.',
    'The server answered {status}: {detail}': 'El servidor respondió {status}: {detail}',
    'The server answered HTTP {status}.': 'El servidor respondió HTTP {status}.',
    'No answer from {url}. The address is reachable but nothing is listening there.':
      'Sin respuesta de {url}. La dirección es accesible pero nada escucha allí.',
    'The health check could not run.': 'No se pudo ejecutar la comprobación.',
    'Connected to {url}.': 'Conectado a {url}.',
    'Set a valid http:// address first.': 'Indica primero una dirección http:// válida.',
  },

  de: {
    'VISUALIZER': 'VISUALISIERUNG',
    'Visualizer': 'Visualisierung',
    'Visualizer level': 'Stärke der Visualisierung',
    'LEVEL': 'STÄRKE',
    'Off': 'Aus',
    'Spectrum bars': 'Spektrum-Balken',
    'Waveform': 'Wellenform',
    'Radial spectrum': 'Radiales Spektrum',
    'Ambient glow': 'Ambientes Leuchten',
    'Drawn from the audio Kryvex decodes.':
      'Gezeichnet aus dem Ton, den Kryvex selbst dekodiert.',
    'This row is drawn by an embed, so it has no analysable audio.':
      'Diese Zeile wird von einem Embed gezeichnet und hat daher keinen analysierbaren Ton.',
    'Loading the video…': 'Video wird geladen …',
    'Open it there': 'Dort öffnen',
    'The owner of this video does not allow it to be played outside YouTube.':
      'Der Eigentümer dieses Videos erlaubt die Wiedergabe außerhalb von YouTube nicht.',
    'That video is private or no longer available.':
      'Dieses Video ist privat oder nicht mehr verfügbar.',
    'YouTube refused this embed. The desktop app plays it through its own local bridge; if this keeps happening, open the video in YouTube.':
      'YouTube hat dieses Embed abgelehnt. Die Desktop-App spielt es über ihre eigene lokale Brücke ab; wenn das weiter passiert, öffnen Sie das Video in YouTube.',
    'Live streams are not supported in this player.':
      'Livestreams werden von diesem Player nicht unterstützt.',
    'Spotify does not publish a preview for this track. Open the full track in Spotify.':
      'Spotify veröffentlicht für diesen Titel keine Vorschau. Öffnen Sie den vollständigen Titel in Spotify.',
    'Could not reach the playlist. Check the link and your connection.':
      'Die Playlist war nicht erreichbar. Prüfen Sie Link und Verbindung.',
    'That provider refused the request from this network (it answered 403 or 429). Try again later, or open the playlist in its own service.':
      'Dieser Anbieter hat die Anfrage aus diesem Netz abgelehnt (403 oder 429). Versuchen Sie es später erneut oder öffnen Sie die Playlist im jeweiligen Dienst.',
    'SPOTIFY PREVIEW': 'SPOTIFY-VORSCHAU',
    'SPOTIFY · NO PREVIEW': 'SPOTIFY · KEINE VORSCHAU',
    'Spotify rows play their public 30-second preview. Open the full track in Spotify for the whole song.':
      'Spotify-Zeilen spielen ihre öffentliche 30-Sekunden-Vorschau. Öffnen Sie den vollständigen Titel in Spotify für das ganze Lied.',

    'Typography': 'Typografie',
    'Text size': 'Textgröße',
    'Text style': 'Schriftstil',
    'Scales every interface size together, from {min}% to {max}%. Embedded pages and media keep their own type.':
      'Skaliert alle Größen der Oberfläche gemeinsam, von {min} % bis {max} %. Eingebettete Seiten und Medien behalten ihre eigene Schrift.',
    'A curated set of families that is already installed, so nothing is downloaded and the change applies at once. Code keeps its monospace face.':
      'Eine Auswahl bereits installierter Schriften: nichts wird heruntergeladen und die Änderung wirkt sofort. Code behält seine Monospace-Schrift.',
    'The quick brown fox jumps over the lazy dog — 0123456789. This line uses the current size and family.':
      'Falsches Üben von Xylophonmusik quält jeden größeren Zwerg — 0123456789. Diese Zeile nutzt die aktuelle Größe und Schrift.',

    'Share stopped.': 'Freigabe beendet.',
    'Mute shared audio': 'Geteilten Ton stummschalten',
    'Unmute shared audio': 'Geteilten Ton einschalten',
    'Play it here': 'Hier abspielen',
    'Shared stream volume': 'Lautstärke des Streams',
    'Shared stream': 'Geteilter Stream',
    'Stream size': 'Streamgröße',
    'Fullscreen': 'Vollbild',
    'Pop out': 'Herauslösen',
    'POPPED OUT': 'HERAUSGELÖST',
    'This build keeps the stream docked; fullscreen gives it the whole window.':
      'Diese Version hält den Stream angedockt; im Vollbild füllt er das ganze Fenster.',
    'A separate window was blocked, so the share stays in this view.':
      'Ein separates Fenster wurde blockiert, daher bleibt die Freigabe in dieser Ansicht.',
    'This capture has no audio track.': 'Diese Aufnahme hat keine Tonspur.',
    'Kryvex share': 'Kryvex-Freigabe',
    'CHAT OVERLAY': 'CHAT-EINBLENDUNG',
    'Overlay opacity': 'Deckkraft der Einblendung',
    'Hide the overlay': 'Einblendung ausblenden',
    'Show chat': 'Chat anzeigen',
    'TODAY': 'HEUTE',
    'YESTERDAY': 'GESTERN',
    'Waiting for a share…': 'Warte auf eine Freigabe …',

    'REMOTE CONTROL': 'FERNWARTUNG',
    'Ask to control': 'Um Steuerung bitten',
    'Give control back': 'Steuerung zurückgeben',
    'Allow': 'Erlauben',
    'Take control back': 'Steuerung zurückholen',
    '{name} is asking to control this share.':
      '{name} möchte diese Freigabe steuern.',
    '{name} can control this share.': '{name} kann diese Freigabe steuern.',
    'You have control. Click the stream, then use the mouse and keyboard.':
      'Sie haben die Steuerung. Klicken Sie den Stream an und nutzen Sie Maus und Tastatur.',
    'Waiting for the host to allow control…':
      'Warte, bis der Host die Steuerung erlaubt …',
    'Viewing is not controlling. Ask the host before your input is sent.':
      'Ansehen ist nicht Steuern. Fragen Sie den Host, bevor Eingaben gesendet werden.',
    'A viewer can ask to control this app. Nothing is granted until you allow it.':
      'Ein Zuschauer kann um Steuerung dieser App bitten. Nichts wird gewährt, bis Sie es erlauben.',
    'Control is only offered for a Kryvex app. A screen or window capture needs a native helper, which this build does not ship.':
      'Steuerung wird nur für eine Kryvex-App angeboten. Eine Bildschirm- oder Fensteraufnahme bräuchte einen nativen Helfer, den diese Version nicht enthält.',
    'REMOTE CONTROL is on.': 'FERNWARTUNG ist aktiv.',

    'Nothing answered at {url}. Start the transcription server, check its port, and make sure it is listening on 127.0.0.1 rather than only inside a container.':
      'Unter {url} hat nichts geantwortet. Starten Sie den Transkriptionsserver, prüfen Sie den Port und achten Sie darauf, dass er auf 127.0.0.1 lauscht und nicht nur in einem Container.',
    'The server answered {status}: {detail}': 'Der Server antwortete {status}: {detail}',
    'The server answered HTTP {status}.': 'Der Server antwortete HTTP {status}.',
    'No answer from {url}. The address is reachable but nothing is listening there.':
      'Keine Antwort von {url}. Die Adresse ist erreichbar, aber dort lauscht nichts.',
    'The health check could not run.': 'Die Prüfung konnte nicht ausgeführt werden.',
    'Connected to {url}.': 'Verbunden mit {url}.',
    'Set a valid http:// address first.': 'Geben Sie zuerst eine gültige http://-Adresse an.',
  },

  fr: {
    'VISUALIZER': 'VISUALISEUR',
    'Visualizer': 'Visualiseur',
    'Visualizer level': 'Niveau du visualiseur',
    'LEVEL': 'NIVEAU',
    'Off': 'Désactivé',
    'Spectrum bars': 'Barres de spectre',
    'Waveform': 'Forme d’onde',
    'Radial spectrum': 'Spectre radial',
    'Ambient glow': 'Lueur ambiante',
    'Drawn from the audio Kryvex decodes.':
      'Dessiné à partir de l’audio que Kryvex décode lui-même.',
    'This row is drawn by an embed, so it has no analysable audio.':
      'Cette piste est dessinée par un lecteur intégré : aucun audio analysable.',
    'Loading the video…': 'Chargement de la vidéo…',
    'Open it there': 'L’ouvrir là-bas',
    'The owner of this video does not allow it to be played outside YouTube.':
      'Le propriétaire de cette vidéo interdit sa lecture hors de YouTube.',
    'That video is private or no longer available.':
      'Cette vidéo est privée ou n’est plus disponible.',
    'YouTube refused this embed. The desktop app plays it through its own local bridge; if this keeps happening, open the video in YouTube.':
      'YouTube a refusé cette intégration. L’application de bureau la lit via son propre pont local ; si cela continue, ouvrez la vidéo dans YouTube.',
    'Live streams are not supported in this player.':
      'Ce lecteur ne prend pas en charge les diffusions en direct.',
    'Spotify does not publish a preview for this track. Open the full track in Spotify.':
      'Spotify ne publie pas d’extrait pour ce titre. Ouvrez le titre complet dans Spotify.',
    'Could not reach the playlist. Check the link and your connection.':
      'Impossible de joindre la playlist. Vérifiez le lien et votre connexion.',
    'That provider refused the request from this network (it answered 403 or 429). Try again later, or open the playlist in its own service.':
      'Ce fournisseur a refusé la requête depuis ce réseau (403 ou 429). Réessayez plus tard ou ouvrez la playlist dans son service.',
    'SPOTIFY PREVIEW': 'EXTRAIT SPOTIFY',
    'SPOTIFY · NO PREVIEW': 'SPOTIFY · SANS EXTRAIT',
    'Spotify rows play their public 30-second preview. Open the full track in Spotify for the whole song.':
      'Les lignes Spotify jouent leur extrait public de 30 secondes. Ouvrez le titre complet dans Spotify pour la chanson entière.',

    'Typography': 'Typographie',
    'Text size': 'Taille du texte',
    'Text style': 'Style du texte',
    'Scales every interface size together, from {min}% to {max}%. Embedded pages and media keep their own type.':
      'Met à l’échelle toutes les tailles de l’interface, de {min} % à {max} %. Les pages intégrées et les médias gardent leur propre typographie.',
    'A curated set of families that is already installed, so nothing is downloaded and the change applies at once. Code keeps its monospace face.':
      'Une sélection de familles déjà installées : rien n’est téléchargé et le changement s’applique aussitôt. Le code garde sa police à chasse fixe.',
    'The quick brown fox jumps over the lazy dog — 0123456789. This line uses the current size and family.':
      'Portez ce vieux whisky au juge blond qui fume — 0123456789. Cette ligne utilise la taille et la famille actuelles.',

    'Share stopped.': 'Partage arrêté.',
    'Mute shared audio': 'Couper l’audio partagé',
    'Unmute shared audio': 'Rétablir l’audio partagé',
    'Play it here': 'Le lire ici',
    'Shared stream volume': 'Volume du flux partagé',
    'Shared stream': 'Flux partagé',
    'Stream size': 'Taille du flux',
    'Fullscreen': 'Plein écran',
    'Pop out': 'Détacher',
    'POPPED OUT': 'DÉTACHÉ',
    'This build keeps the stream docked; fullscreen gives it the whole window.':
      'Cette version garde le flux ancré ; le plein écran lui donne toute la fenêtre.',
    'A separate window was blocked, so the share stays in this view.':
      'Une fenêtre séparée a été bloquée, le partage reste donc dans cette vue.',
    'This capture has no audio track.': 'Cette capture n’a pas de piste audio.',
    'Kryvex share': 'Partage Kryvex',
    'CHAT OVERLAY': 'CALQUE DE CHAT',
    'Overlay opacity': 'Opacité du calque',
    'Hide the overlay': 'Masquer le calque',
    'Show chat': 'Afficher le chat',
    'TODAY': 'AUJOURD’HUI',
    'YESTERDAY': 'HIER',
    'Waiting for a share…': 'En attente d’un partage…',

    'REMOTE CONTROL': 'CONTRÔLE À DISTANCE',
    'Ask to control': 'Demander le contrôle',
    'Give control back': 'Rendre le contrôle',
    'Allow': 'Autoriser',
    'Take control back': 'Reprendre le contrôle',
    '{name} is asking to control this share.':
      '{name} demande à contrôler ce partage.',
    '{name} can control this share.': '{name} peut contrôler ce partage.',
    'You have control. Click the stream, then use the mouse and keyboard.':
      'Vous avez le contrôle. Cliquez sur le flux, puis utilisez la souris et le clavier.',
    'Waiting for the host to allow control…':
      'En attente de l’autorisation de l’hôte…',
    'Viewing is not controlling. Ask the host before your input is sent.':
      'Regarder n’est pas contrôler. Demandez à l’hôte avant d’envoyer vos entrées.',
    'A viewer can ask to control this app. Nothing is granted until you allow it.':
      'Un spectateur peut demander à contrôler cette application. Rien n’est accordé avant votre autorisation.',
    'Control is only offered for a Kryvex app. A screen or window capture needs a native helper, which this build does not ship.':
      'Le contrôle n’est proposé que pour une application Kryvex. Capturer un écran ou une fenêtre demande un utilitaire natif que cette version ne fournit pas.',
    'REMOTE CONTROL is on.': 'Le CONTRÔLE À DISTANCE est actif.',

    'Nothing answered at {url}. Start the transcription server, check its port, and make sure it is listening on 127.0.0.1 rather than only inside a container.':
      'Rien n’a répondu à {url}. Démarrez le serveur de transcription, vérifiez son port et assurez-vous qu’il écoute sur 127.0.0.1 et pas seulement dans un conteneur.',
    'The server answered {status}: {detail}': 'Le serveur a répondu {status} : {detail}',
    'The server answered HTTP {status}.': 'Le serveur a répondu HTTP {status}.',
    'No answer from {url}. The address is reachable but nothing is listening there.':
      'Aucune réponse de {url}. L’adresse est joignable mais rien n’y écoute.',
    'The health check could not run.': 'Le contrôle de santé n’a pas pu s’exécuter.',
    'Connected to {url}.': 'Connecté à {url}.',
    'Set a valid http:// address first.': 'Indiquez d’abord une adresse http:// valide.',
  },
};
