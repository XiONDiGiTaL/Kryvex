/**
 * Copy for the Home calculator and currency cards and the player's playlist
 * importer. English remains the source; these entries keep the four locales in
 * step without growing the already large per-language blocks in i18n.tsx.
 */
export const homeToolsCopy: Record<'es' | 'de' | 'fr', Record<string, string>> = {
  es: {
    Calculator: 'Calculadora',
    CALCULATOR: 'CALCULADORA',
    'Currency converter': 'Conversor de divisas',
    CURRENCY: 'DIVISAS',
    AMOUNT: 'IMPORTE',
    FROM: 'DE',
    TO: 'A',
    'Amount to convert': 'Importe a convertir',
    'From currency': 'Divisa de origen',
    'To currency': 'Divisa de destino',
    'Swap currencies': 'Intercambiar divisas',
    'Refresh rates': 'Actualizar tipos',
    'Enter a valid amount.': 'Escribe un importe válido.',
    'Converting…': 'Convirtiendo…',
    'Rates are unavailable right now.': 'Los tipos no están disponibles ahora mismo.',
    'That pair is not available.': 'Ese par no está disponible.',
    'EUROPEAN CENTRAL BANK': 'BANCO CENTRAL EUROPEO',
    'DAILY REFERENCE': 'REFERENCIA DIARIA',
    Error: 'Error',
    Backspace: 'Borrar',
    'Change sign': 'Cambiar signo',
    Multiply: 'Multiplicar',
    Divide: 'Dividir',
    Subtract: 'Restar',
    Add: 'Sumar',
    'Decimal point': 'Punto decimal',
    'Open parenthesis': 'Abrir paréntesis',
    'Close parenthesis': 'Cerrar paréntesis',
    Equals: 'Igual',
    'A transparent overlay on Home: clock, local weather, sticky tasks, a calculator, daily currency rates and a short board guide. Every widget can be hidden independently.':
      'Una capa transparente en Inicio: reloj, tiempo local, tareas adhesivas, una calculadora, tipos de cambio diarios y una breve guía. Cada tarjeta se puede ocultar por separado.',
    'This board is native to Kryvex: a clock and greeting, local weather, sticky tasks, a calculator, daily currency rates and a short guide to how the surface fits together. There is no extension, account or new-tab takeover.':
      'Este tablero es nativo de Kryvex: reloj y saludo, tiempo local, tareas adhesivas, una calculadora, tipos de cambio diarios y una breve guía de cómo encaja la superficie. No hay extensión, cuenta ni apropiación de la pestaña nueva.',
    'The calculator evaluates arithmetic locally without running code. Currency rates come from the ECB via Frankfurter only while the card is visible.':
      'La calculadora evalúa aritmética localmente sin ejecutar código. Los tipos de cambio vienen del BCE mediante Frankfurter solo mientras la tarjeta está visible.',
    'SPOTIFY PREVIEW': 'AVANCE DE SPOTIFY',
    YOUTUBE: 'YOUTUBE',
    'Open the full track': 'Abrir la canción completa',
    'Spotify rows play their public 30-second preview. Open the full track in Spotify for the whole song.':
      'Las filas de Spotify reproducen su avance público de 30 segundos. Abre la canción completa en Spotify para oírla entera.',
    'Spotify or YouTube playlist, or a direct media link':
      'Playlist de Spotify o YouTube, o un enlace directo al medio',
    'Playlist or direct media link': 'Enlace de lista de reproducción o medio directo',
    Playlist: 'Lista de reproducción',
    'Those tracks are already in the queue.': 'Esas canciones ya están en la cola.',
    '{count} tracks from {name} added · {skipped} skipped.':
      '{count} canciones de {name} añadidas · {skipped} omitidas.',
    '{count} tracks from {name} added to the queue.':
      '{count} canciones de {name} añadidas a la cola.',
    'That playlist is private, empty or unavailable.':
      'Esa playlist es privada, está vacía o no está disponible.',
    'There are no playable tracks in that playlist.':
      'No hay canciones reproducibles en esa playlist.',
    'That playlist is larger than the 500-track import limit.':
      'Esa playlist supera el límite de importación de 500 canciones.',
    'Could not read that playlist. Check the link and your connection.':
      'No se pudo leer esa playlist. Revisa el enlace y la conexión.',
    'Playlist import is available in the desktop app.':
      'La importación de playlists está disponible en la app de escritorio.',
    'That playlist could not be read right now.':
      'Esa playlist no se pudo leer ahora mismo.',
    'Point the player at a playlist, an audio or video file, or a direct media link.':
      'Indica al reproductor una playlist, un archivo de audio o vídeo, o un enlace directo al medio.',
    'Open {name} in its service': 'Abrir {name} en su servicio',
    'YouTube refused to play this video here. Open it in YouTube, or try another row.':
      'YouTube se negó a reproducir este vídeo aquí. Ábrelo en YouTube o prueba otra fila.',
    'Spotify did not provide a preview for this track. Open the full track in Spotify.':
      'Spotify no ofreció un avance de esta canción. Abre la canción completa en Spotify.',
    'Loading…': 'Cargando…',
    'Import a Spotify or YouTube playlist, open audio or video you already own, or paste a direct stream URL. Twitch and Vimeo pages still open in their own modules.':
      'Importa una playlist de Spotify o YouTube, abre audio o vídeo que ya tengas o pega una URL directa de emisión. Las páginas de Twitch y Vimeo siguen abriéndose en sus propios módulos.',
    'That city could not be found.': 'No se encontró esa ciudad.',
    'WORLD CLOCK': 'RELOJ MUNDIAL',
    'That place has no time zone on record.': 'Ese lugar no tiene zona horaria registrada.',
    'The lookup is unreachable right now.': 'La búsqueda no está disponible ahora mismo.',
    'Four places is the limit. Remove one first.':
      'El límite es de cuatro lugares. Quita uno primero.',
    'Four places is the limit. Remove one to add another.':
      'El límite es de cuatro lugares. Quita uno para añadir otro.',
    '{city} is on the clock.': '{city} ya está en el reloj.',
    'Use 24-hour time': 'Usar formato de 24 horas',
    'Use 12-hour time': 'Usar formato de 12 horas',
    'Remove {city}': 'Quitar {city}',
    'Showing this device and UTC. Add a city to list it by name.':
      'Se muestran este dispositivo y UTC. Añade una ciudad para verla con su nombre.',
    'City, like Izmir': 'Ciudad, por ejemplo Esmirna',
    'Search a city for the clock': 'Buscar una ciudad para el reloj',
    'Looking…': 'Buscando…',
    'Find': 'Buscar',
    'Add city': 'Añadir ciudad',
    'Screen capture': 'Captura de pantalla',
    'SCREEN CAPTURE': 'CAPTURA DE PANTALLA',
    'REC {time}': 'GRAB {time}',
    'UP TO 3:00': 'HASTA 3:00',
    'Capture a service or this window, then choose where to save it. Recordings stop themselves after three minutes.':
      'Captura un servicio o esta ventana y elige dónde guardarla. Las grabaciones se detienen solas a los tres minutos.',
    'What to capture': 'Qué capturar',
    'Choose a target…': 'Elige un destino…',
    'Windows': 'Ventanas',
    'Screens': 'Pantallas',
    'The browser asks which screen or window to share, then downloads the file.':
      'El navegador pregunta qué pantalla o ventana compartir y luego descarga el archivo.',
    'Refresh the targets': 'Actualizar los destinos',
    'Capture still': 'Capturar imagen',
    'Open preview window': 'Abrir ventana de vista previa',
    'The preview window could not be opened.':
      'No se pudo abrir la ventana de vista previa.',
    'Stop recording': 'Detener la grabación',
    'Record': 'Grabar',
    'Capture preview': 'Vista previa de la captura',
    'Recording preview': 'Vista previa de la grabación',
    'Saving…': 'Guardando…',
    'Save as…': 'Guardar como…',
    'Download': 'Descargar',
    'Discard': 'Descartar',
    'RECENT': 'RECIENTES',
    'Forget {name}': 'Olvidar {name}',
    'Forget this capture': 'Olvidar esta captura',
    'That target could not be captured. Choose another and try again.':
      'No se pudo capturar ese destino. Elige otro e inténtalo de nuevo.',
    'That target could not be recorded. Choose another and try again.':
      'No se pudo grabar ese destino. Elige otro e inténtalo de nuevo.',
    'The recording was empty. Try a longer clip.':
      'La grabación quedó vacía. Prueba un clip más largo.',
    'The capture could not be saved.': 'No se pudo guardar la captura.',
    'The capture was empty or too large to write.':
      'La captura estaba vacía o era demasiado grande para escribirla.',
    'Saved to {path}': 'Guardado en {path}',
    'Downloaded {name}.': 'Se descargó {name}.',
    'Copied to the clipboard.': 'Copiado al portapapeles.',
    'The clipboard refused the image.': 'El portapapeles rechazó la imagen.',
    'screen': 'pantalla',
    'capture': 'captura',
    'window': 'ventana',
  },
  de: {
    Calculator: 'Taschenrechner',
    CALCULATOR: 'TASCHENRECHNER',
    'Currency converter': 'Währungsrechner',
    CURRENCY: 'WÄHRUNG',
    AMOUNT: 'BETRAG',
    FROM: 'VON',
    TO: 'NACH',
    'Amount to convert': 'Umgerechneter Betrag',
    'From currency': 'Ausgangswährung',
    'To currency': 'Zielwährung',
    'Swap currencies': 'Währungen tauschen',
    'Refresh rates': 'Kurse aktualisieren',
    'Enter a valid amount.': 'Gib einen gültigen Betrag ein.',
    'Converting…': 'Wird umgerechnet…',
    'Rates are unavailable right now.': 'Kurse sind gerade nicht verfügbar.',
    'That pair is not available.': 'Dieses Paar ist nicht verfügbar.',
    'EUROPEAN CENTRAL BANK': 'EUROPÄISCHE ZENTRALBANK',
    'DAILY REFERENCE': 'TÄGLICHER REFERENZWERT',
    Error: 'Fehler',
    Backspace: 'Löschen',
    'Change sign': 'Vorzeichen ändern',
    Multiply: 'Multiplizieren',
    Divide: 'Dividieren',
    Subtract: 'Subtrahieren',
    Add: 'Addieren',
    'Decimal point': 'Dezimalpunkt',
    'Open parenthesis': 'Klammer öffnen',
    'Close parenthesis': 'Klammer schließen',
    Equals: 'Gleich',
    'A transparent overlay on Home: clock, local weather, sticky tasks, a calculator, daily currency rates and a short board guide. Every widget can be hidden independently.':
      'Eine transparente Ebene auf Home: Uhr, lokales Wetter, Haftnotizen, ein Taschenrechner, tägliche Wechselkurse und ein kurzer Board-Leitfaden. Jede Karte lässt sich einzeln ausblenden.',
    'This board is native to Kryvex: a clock and greeting, local weather, sticky tasks, a calculator, daily currency rates and a short guide to how the surface fits together. There is no extension, account or new-tab takeover.':
      'Dieses Board gehört zu Kryvex: Uhr und Begrüßung, lokales Wetter, Haftnotizen, ein Taschenrechner, tägliche Wechselkurse und ein kurzer Leitfaden, wie die Oberfläche zusammenspielt. Keine Erweiterung, kein Konto und keine übernommene neue Tab-Seite.',
    'The calculator evaluates arithmetic locally without running code. Currency rates come from the ECB via Frankfurter only while the card is visible.':
      'Der Taschenrechner rechnet lokal, ohne Code auszuführen. Wechselkurse kommen von der EZB über Frankfurter, nur solange die Karte sichtbar ist.',
    'SPOTIFY PREVIEW': 'SPOTIFY-VORSCHAU',
    YOUTUBE: 'YOUTUBE',
    'Open the full track': 'Ganzen Titel öffnen',
    'Spotify rows play their public 30-second preview. Open the full track in Spotify for the whole song.':
      'Spotify-Zeilen spielen die öffentliche 30-Sekunden-Vorschau. Öffne den ganzen Titel in Spotify für das vollständige Lied.',
    'Spotify or YouTube playlist, or a direct media link':
      'Spotify- oder YouTube-Playlist oder ein direkter Medienlink',
    'Playlist or direct media link': 'Playlist- oder direkter Medienlink',
    Playlist: 'Wiedergabeliste',
    'Those tracks are already in the queue.': 'Diese Titel sind bereits in der Warteschlange.',
    '{count} tracks from {name} added · {skipped} skipped.':
      '{count} Titel aus {name} hinzugefügt · {skipped} übersprungen.',
    '{count} tracks from {name} added to the queue.':
      '{count} Titel aus {name} zur Warteschlange hinzugefügt.',
    'That playlist is private, empty or unavailable.':
      'Diese Playlist ist privat, leer oder nicht verfügbar.',
    'There are no playable tracks in that playlist.':
      'In dieser Playlist sind keine abspielbaren Titel.',
    'That playlist is larger than the 500-track import limit.':
      'Diese Playlist überschreitet das Importlimit von 500 Titeln.',
    'Could not read that playlist. Check the link and your connection.':
      'Diese Playlist konnte nicht gelesen werden. Prüfe Link und Verbindung.',
    'Playlist import is available in the desktop app.':
      'Der Playlist-Import ist in der Desktop-App verfügbar.',
    'That playlist could not be read right now.':
      'Diese Playlist konnte gerade nicht gelesen werden.',
    'Point the player at a playlist, an audio or video file, or a direct media link.':
      'Gib dem Player eine Playlist, eine Audio- oder Videodatei oder einen direkten Medienlink.',
    'Open {name} in its service': '{name} im Dienst öffnen',
    'YouTube refused to play this video here. Open it in YouTube, or try another row.':
      'YouTube hat dieses Video hier nicht abgespielt. Öffne es in YouTube oder probiere eine andere Zeile.',
    'Spotify did not provide a preview for this track. Open the full track in Spotify.':
      'Spotify hat für diesen Titel keine Vorschau geliefert. Öffne den ganzen Titel in Spotify.',
    'Loading…': 'Wird geladen…',
    'Import a Spotify or YouTube playlist, open audio or video you already own, or paste a direct stream URL. Twitch and Vimeo pages still open in their own modules.':
      'Importiere eine Spotify- oder YouTube-Playlist, öffne vorhandenes Audio oder Video oder füge eine direkte Stream-URL ein. Twitch- und Vimeo-Seiten öffnen weiterhin in ihren eigenen Modulen.',
    'That city could not be found.': 'Diese Stadt wurde nicht gefunden.',
    'WORLD CLOCK': 'WELTZEITUHR',
    'That place has no time zone on record.': 'Für diesen Ort ist keine Zeitzone verzeichnet.',
    'The lookup is unreachable right now.': 'Die Suche ist gerade nicht erreichbar.',
    'Four places is the limit. Remove one first.':
      'Vier Orte sind das Limit. Entferne zuerst einen.',
    'Four places is the limit. Remove one to add another.':
      'Vier Orte sind das Limit. Entferne einen, um einen weiteren hinzuzufügen.',
    '{city} is on the clock.': '{city} steht jetzt auf der Uhr.',
    'Use 24-hour time': '24-Stunden-Format verwenden',
    'Use 12-hour time': '12-Stunden-Format verwenden',
    'Remove {city}': '{city} entfernen',
    'Showing this device and UTC. Add a city to list it by name.':
      'Dieses Gerät und UTC werden angezeigt. Füge eine Stadt hinzu, um sie mit Namen zu sehen.',
    'City, like Izmir': 'Stadt, etwa Izmir',
    'Search a city for the clock': 'Stadt für die Uhr suchen',
    'Looking…': 'Suche läuft…',
    'Find': 'Suchen',
    'Add city': 'Stadt hinzufügen',
    'Screen capture': 'Bildschirmaufnahme',
    'SCREEN CAPTURE': 'BILDSCHIRMAUFNAHME',
    'REC {time}': 'AUFZ {time}',
    'UP TO 3:00': 'BIS 3:00',
    'Capture a service or this window, then choose where to save it. Recordings stop themselves after three minutes.':
      'Nimm einen Dienst oder dieses Fenster auf und wähle, wohin es gespeichert wird. Aufnahmen stoppen nach drei Minuten von selbst.',
    'What to capture': 'Was aufnehmen',
    'Choose a target…': 'Ziel wählen…',
    'Windows': 'Fenster',
    'Screens': 'Bildschirme',
    'The browser asks which screen or window to share, then downloads the file.':
      'Der Browser fragt, welcher Bildschirm oder welches Fenster geteilt wird, und lädt die Datei dann herunter.',
    'Refresh the targets': 'Ziele aktualisieren',
    'Capture still': 'Standbild aufnehmen',
    'Open preview window': 'Vorschaufenster öffnen',
    'The preview window could not be opened.':
      'Das Vorschaufenster konnte nicht geöffnet werden.',
    'Stop recording': 'Aufnahme stoppen',
    'Record': 'Aufnehmen',
    'Capture preview': 'Vorschau der Aufnahme',
    'Recording preview': 'Vorschau der Aufzeichnung',
    'Saving…': 'Speichern…',
    'Save as…': 'Speichern unter…',
    'Download': 'Herunterladen',
    'Discard': 'Verwerfen',
    'RECENT': 'ZULETZT',
    'Forget {name}': '{name} vergessen',
    'Forget this capture': 'Diese Aufnahme vergessen',
    'That target could not be captured. Choose another and try again.':
      'Dieses Ziel konnte nicht aufgenommen werden. Wähle ein anderes und versuche es erneut.',
    'That target could not be recorded. Choose another and try again.':
      'Dieses Ziel konnte nicht aufgezeichnet werden. Wähle ein anderes und versuche es erneut.',
    'The recording was empty. Try a longer clip.':
      'Die Aufnahme war leer. Versuche einen längeren Clip.',
    'The capture could not be saved.': 'Die Aufnahme konnte nicht gespeichert werden.',
    'The capture was empty or too large to write.':
      'Die Aufnahme war leer oder zu groß zum Schreiben.',
    'Saved to {path}': 'Gespeichert unter {path}',
    'Downloaded {name}.': '{name} heruntergeladen.',
    'Copied to the clipboard.': 'In die Zwischenablage kopiert.',
    'The clipboard refused the image.': 'Die Zwischenablage hat das Bild abgelehnt.',
    'screen': 'Bildschirm',
    'capture': 'Aufnahme',
    'window': 'Fenster',
  },
  fr: {
    Calculator: 'Calculatrice',
    CALCULATOR: 'CALCULATRICE',
    'Currency converter': 'Convertisseur de devises',
    CURRENCY: 'DEVISES',
    AMOUNT: 'MONTANT',
    FROM: 'DE',
    TO: 'VERS',
    'Amount to convert': 'Montant à convertir',
    'From currency': 'Devise de départ',
    'To currency': 'Devise cible',
    'Swap currencies': 'Inverser les devises',
    'Refresh rates': 'Actualiser les taux',
    'Enter a valid amount.': 'Saisissez un montant valide.',
    'Converting…': 'Conversion…',
    'Rates are unavailable right now.': 'Les taux sont indisponibles pour le moment.',
    'That pair is not available.': 'Cette paire n’est pas disponible.',
    'EUROPEAN CENTRAL BANK': 'BANQUE CENTRALE EUROPÉENNE',
    'DAILY REFERENCE': 'RÉFÉRENCE QUOTIDIENNE',
    Error: 'Erreur',
    Backspace: 'Effacer',
    'Change sign': 'Changer le signe',
    Multiply: 'Multiplier',
    Divide: 'Diviser',
    Subtract: 'Soustraire',
    Add: 'Additionner',
    'Decimal point': 'Virgule décimale',
    'Open parenthesis': 'Ouvrir la parenthèse',
    'Close parenthesis': 'Fermer la parenthèse',
    Equals: 'Égal',
    'A transparent overlay on Home: clock, local weather, sticky tasks, a calculator, daily currency rates and a short board guide. Every widget can be hidden independently.':
      'Une couche transparente sur Accueil : horloge, météo locale, notes autocollantes, calculatrice, taux de change quotidiens et un court guide. Chaque carte peut être masquée séparément.',
    'This board is native to Kryvex: a clock and greeting, local weather, sticky tasks, a calculator, daily currency rates and a short guide to how the surface fits together. There is no extension, account or new-tab takeover.':
      'Ce tableau est natif à Kryvex : horloge et salutation, météo locale, notes autocollantes, calculatrice, taux de change quotidiens et un court guide de l’ensemble. Aucune extension, aucun compte et aucune reprise du nouvel onglet.',
    'The calculator evaluates arithmetic locally without running code. Currency rates come from the ECB via Frankfurter only while the card is visible.':
      'La calculatrice évalue l’arithmétique localement sans exécuter de code. Les taux viennent de la BCE via Frankfurter, uniquement tant que la carte est visible.',
    'SPOTIFY PREVIEW': 'APERÇU SPOTIFY',
    YOUTUBE: 'YOUTUBE',
    'Open the full track': 'Ouvrir le titre complet',
    'Spotify rows play their public 30-second preview. Open the full track in Spotify for the whole song.':
      'Les lignes Spotify jouent leur aperçu public de 30 secondes. Ouvrez le titre complet dans Spotify pour écouter tout le morceau.',
    'Spotify or YouTube playlist, or a direct media link':
      'Playlist Spotify ou YouTube, ou lien direct vers le média',
    'Playlist or direct media link': 'Lien de liste de lecture ou média direct',
    Playlist: 'Liste de lecture',
    'Those tracks are already in the queue.': 'Ces titres sont déjà dans la file.',
    '{count} tracks from {name} added · {skipped} skipped.':
      '{count} titres de {name} ajoutés · {skipped} ignorés.',
    '{count} tracks from {name} added to the queue.':
      '{count} titres de {name} ajoutés à la file.',
    'That playlist is private, empty or unavailable.':
      'Cette playlist est privée, vide ou indisponible.',
    'There are no playable tracks in that playlist.':
      'Cette playlist ne contient aucun titre lisible.',
    'That playlist is larger than the 500-track import limit.':
      'Cette playlist dépasse la limite d’importation de 500 titres.',
    'Could not read that playlist. Check the link and your connection.':
      'Impossible de lire cette playlist. Vérifiez le lien et la connexion.',
    'Playlist import is available in the desktop app.':
      'L’importation de playlists est disponible dans l’application de bureau.',
    'That playlist could not be read right now.':
      'Cette playlist n’a pas pu être lue pour le moment.',
    'Point the player at a playlist, an audio or video file, or a direct media link.':
      'Indiquez une playlist, un fichier audio ou vidéo, ou un lien direct vers le média.',
    'Open {name} in its service': 'Ouvrir {name} dans son service',
    'YouTube refused to play this video here. Open it in YouTube, or try another row.':
      'YouTube a refusé de lire cette vidéo ici. Ouvrez-la dans YouTube ou essayez une autre ligne.',
    'Spotify did not provide a preview for this track. Open the full track in Spotify.':
      'Spotify n’a pas fourni d’aperçu pour ce titre. Ouvrez le titre complet dans Spotify.',
    'Loading…': 'Chargement…',
    'Import a Spotify or YouTube playlist, open audio or video you already own, or paste a direct stream URL. Twitch and Vimeo pages still open in their own modules.':
      'Importez une playlist Spotify ou YouTube, ouvrez un audio ou une vidéo que vous possédez, ou collez une URL de flux direct. Les pages Twitch et Vimeo s’ouvrent toujours dans leurs propres modules.',
    'That city could not be found.': 'Cette ville est introuvable.',
    'WORLD CLOCK': 'HORLOGE MONDIALE',
    'That place has no time zone on record.': 'Ce lieu n’a pas de fuseau horaire enregistré.',
    'The lookup is unreachable right now.': 'La recherche est injoignable pour le moment.',
    'Four places is the limit. Remove one first.':
      'Quatre lieux, c’est la limite. Retirez-en un d’abord.',
    'Four places is the limit. Remove one to add another.':
      'Quatre lieux, c’est la limite. Retirez-en un pour en ajouter un autre.',
    '{city} is on the clock.': '{city} est sur l’horloge.',
    'Use 24-hour time': 'Utiliser le format 24 heures',
    'Use 12-hour time': 'Utiliser le format 12 heures',
    'Remove {city}': 'Retirer {city}',
    'Showing this device and UTC. Add a city to list it by name.':
      'Cet appareil et UTC sont affichés. Ajoutez une ville pour l’afficher par son nom.',
    'City, like Izmir': 'Ville, par exemple Izmir',
    'Search a city for the clock': 'Rechercher une ville pour l’horloge',
    'Looking…': 'Recherche…',
    'Find': 'Chercher',
    'Add city': 'Ajouter la ville',
    'Screen capture': 'Capture d’écran',
    'SCREEN CAPTURE': 'CAPTURE D’ÉCRAN',
    'REC {time}': 'ENR {time}',
    'UP TO 3:00': 'JUSQU’À 3:00',
    'Capture a service or this window, then choose where to save it. Recordings stop themselves after three minutes.':
      'Capturez un service ou cette fenêtre, puis choisissez où l’enregistrer. Les enregistrements s’arrêtent seuls après trois minutes.',
    'What to capture': 'Quoi capturer',
    'Choose a target…': 'Choisir une cible…',
    'Windows': 'Fenêtres',
    'Screens': 'Écrans',
    'The browser asks which screen or window to share, then downloads the file.':
      'Le navigateur demande quel écran ou quelle fenêtre partager, puis télécharge le fichier.',
    'Refresh the targets': 'Actualiser les cibles',
    'Capture still': 'Capturer une image',
    'Open preview window': 'Ouvrir la fenêtre d’aperçu',
    'The preview window could not be opened.':
      'La fenêtre d’aperçu n’a pas pu être ouverte.',
    'Stop recording': 'Arrêter l’enregistrement',
    'Record': 'Enregistrer',
    'Capture preview': 'Aperçu de la capture',
    'Recording preview': 'Aperçu de l’enregistrement',
    'Saving…': 'Enregistrement…',
    'Save as…': 'Enregistrer sous…',
    'Download': 'Télécharger',
    'Discard': 'Écarter',
    'RECENT': 'RÉCENTS',
    'Forget {name}': 'Oublier {name}',
    'Forget this capture': 'Oublier cette capture',
    'That target could not be captured. Choose another and try again.':
      'Cette cible n’a pas pu être capturée. Choisissez-en une autre et réessayez.',
    'That target could not be recorded. Choose another and try again.':
      'Cette cible n’a pas pu être enregistrée. Choisissez-en une autre et réessayez.',
    'The recording was empty. Try a longer clip.':
      'L’enregistrement était vide. Essayez un clip plus long.',
    'The capture could not be saved.': 'La capture n’a pas pu être enregistrée.',
    'The capture was empty or too large to write.':
      'La capture était vide ou trop volumineuse pour être écrite.',
    'Saved to {path}': 'Enregistré dans {path}',
    'Downloaded {name}.': '{name} téléchargé.',
    'Copied to the clipboard.': 'Copié dans le presse-papiers.',
    'The clipboard refused the image.': 'Le presse-papiers a refusé l’image.',
    'screen': 'écran',
    'capture': 'capture d’écran',
    'window': 'fenêtre',
  },
};
