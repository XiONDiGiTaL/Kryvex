/**
 * Copy for the three tools that shipped together with the built-in windows:
 * Arcade (x535), File Forge (x536) and Canvas (x537).
 *
 * One block per language, one key per English string, so the same string is
 * translated once no matter which view asks for it. Turkish lives in its own
 * catalogue (`i18n-tr.ts`) with the rest of that language.
 */
type SecretLanguage = 'es' | 'de' | 'fr';

export const secretServicesCopy: Record<SecretLanguage, Record<string, string>> = {
  es: {
    // Arcade
    'x535 / ARCADE': 'x535 / SALÓN',
    'The xiondigital.net arcade, embedded here with its own saved session so scores and saves survive a restart.':
      'La recreativa de xiondigital.net, incrustada aquí con su propia sesión guardada, para que las puntuaciones y las partidas sobrevivan a un reinicio.',
    'Direct access to the xiondigital.net arcade, showcasing games made by Kryvex’s developer.':
      'Acceso directo a la recreativa de xiondigital.net, con juegos creados por el desarrollador de Kryvex.',
    'The arcade did not load.': 'La recreativa no se cargó.',
    'Check the connection, then try again.': 'Comprueba la conexión y vuelve a intentarlo.',
    'The arcade runs in the desktop app, which embeds it with its own saved session. The web build opens it in a browser tab instead.':
      'La recreativa funciona en la aplicación de escritorio, que la incrusta con su propia sesión guardada. La versión web la abre en una pestaña del navegador.',

    // File Forge
    'x536 / FILES': 'x536 / ARCHIVOS',
    'Resize and convert images, merge, split or reorder PDFs, turn JSON into CSV and rename in batches. Copies are exported; your originals stay where they are.':
      'Cambia el tamaño y convierte imágenes, une, divide o reordena PDF, convierte JSON en CSV y renombra por lotes. Se exportan copias; tus originales se quedan donde están.',
    'Resize and convert images, merge, split or reorder PDFs, turn JSON into CSV and rename in batches. Everything runs on this machine and originals are left alone.':
      'Cambia el tamaño y convierte imágenes, une, divide o reordena PDF, convierte JSON en CSV y renombra por lotes. Todo se ejecuta en este equipo y los originales no se tocan.',
    'Add files': 'Añadir archivos',
    'Clear the list': 'Vaciar la lista',
    Options: 'Opciones',
    Images: 'Imágenes',
    Data: 'Datos',
    Rename: 'Renombrar',
    'Output format': 'Formato de salida',
    'Longest edge': 'Lado más largo',
    Original: 'Tamaño original',
    'Quality {percent}%': 'Calidad {percent} %',
    'BMP keeps no quality setting: it is written without compression.':
      'BMP no admite ajuste de calidad: se escribe sin compresión.',
    'What to do': 'Qué hacer',
    'Images into a PDF': 'Imágenes a un PDF',
    Merge: 'Unir',
    Split: 'Dividir',
    Reorder: 'Reordenar',
    'A PDF per image': 'Un PDF por imagen',
    'One PDF with all of them': 'Un solo PDF con todas',
    'A PDF per page': 'Un PDF por página',
    'Choose ranges': 'Elegir rangos',
    'Page ranges': 'Rangos de páginas',
    'Page order': 'Orden de páginas',
    'Turn every page 90°': 'Girar todas las páginas 90°',
    'A PDF cannot be turned back into images here: that needs a page renderer Kryvex does not ship.':
      'Aquí un PDF no puede volver a ser imágenes: eso requiere un renderizador de páginas que Kryvex no incluye.',
    Direction: 'Dirección',
    'JSON to CSV': 'JSON a CSV',
    'CSV to JSON': 'CSV a JSON',
    'A list of records becomes a table with one column per field. Numbers and true/false are read back as such; everything else stays text.':
      'Una lista de registros se convierte en una tabla con una columna por campo. Los números y true/false se leen como tales; todo lo demás sigue siendo texto.',
    'New name': 'Nombre nuevo',
    'Use {name}, {n}, {ext}, {date} and {count}.':
      'Usa {name}, {n}, {ext}, {date} y {count}.',
    'Start counting at': 'Empezar a contar en',
    'Renaming touches the originals. Nothing is overwritten, and the list below is exactly what will happen.':
      'Renombrar afecta a los originales. No se sobrescribe nada y la lista de abajo es exactamente lo que ocurrirá.',
    'NOTHING READY': 'NADA LISTO',
    '{count} FILES READY': '{count} ARCHIVOS LISTOS',
    'Add files to begin.': 'Añade archivos para empezar.',
    'would collide': 'se repetiría',
    'FIRST LINES': 'PRIMERAS LÍNEAS',
    'Apply the batch': 'Aplicar el lote',
    'Convert and export a copy': 'Convertir y exportar una copia',
    'Show in folder': 'Mostrar en la carpeta',
    'Copy the preview': 'Copiar la vista previa',
    'Kryvex tool': 'Herramienta de Kryvex',

    // File Forge, what goes wrong
    'One file is larger than the 48 MB this tool opens at once: {name}':
      'Un archivo supera los 48 MB que esta herramienta abre de una vez: {name}',
    'That selection is more than 96 MB in total. Pick fewer files at once.':
      'Esa selección supera los 96 MB en total. Elige menos archivos a la vez.',
    'That file could not be read: {name}': 'No se pudo leer ese archivo: {name}',
    'No readable file was chosen.': 'No se eligió ningún archivo legible.',
    'An export had no usable extension: {name}': 'Una exportación no tenía extensión utilizable: {name}',
    'That export was empty or too large to write: {name}':
      'Esa exportación estaba vacía o era demasiado grande para escribirla: {name}',
    'That export did not contain the format it claimed: {name}':
      'Esa exportación no contenía el formato que decía: {name}',
    'Nothing was ready to export.': 'No había nada listo para exportar.',
    'The file could not be written.': 'No se pudo escribir el archivo.',
    'That file was not chosen in this session.': 'Ese archivo no se eligió en esta sesión.',
    'That is not a usable file name: {name}': 'Ese nombre de archivo no sirve: {name}',
    'Two files would both become {name}.': 'Dos archivos pasarían a llamarse {name}.',
    '{name} already exists.': '{name} ya existe.',
    'The work could not be finished.': 'El trabajo no se pudo completar.',
    'Waiting for a choice…': 'Esperando una elección…',
    'Converting images…': 'Convirtiendo imágenes…',
    'Working on the PDF…': 'Trabajando en el PDF…',
    'Converting data…': 'Convirtiendo datos…',
    'Renaming…': 'Renombrando…',
    'Saving…': 'Guardando…',
    'Encoding…': 'Codificando…',
    'Exported {count} file(s).': 'Se exportaron {count} archivo(s).',
    'Renamed {count} file(s).': 'Se renombraron {count} archivo(s).',
    'Add at least one image first.': 'Añade al menos una imagen primero.',
    'Add a JSON or CSV file first.': 'Añade primero un archivo JSON o CSV.',
    'Nothing in that list converts with the options above.':
      'Nada de esa lista se convierte con las opciones de arriba.',
    'Merging needs two or more PDFs.': 'Unir necesita dos PDF o más.',
    'Splitting works on one PDF at a time.': 'Dividir trabaja con un PDF a la vez.',
    'Reordering works on one PDF at a time.': 'Reordenar trabaja con un PDF a la vez.',
    'That page range could not be read. Try a form like 1-3,5.':
      'No se pudo leer ese rango de páginas. Prueba un formato como 1-3,5.',
    'That order needs every page exactly once, from 1 to {count}.':
      'Ese orden necesita cada página exactamente una vez, del 1 al {count}.',
    'That PDF could not be read.': 'No se pudo leer ese PDF.',
    'That PDF is encrypted, so it has to be unlocked before Kryvex can read it.':
      'Ese PDF está cifrado, así que hay que desbloquearlo antes de que Kryvex pueda leerlo.',
    'That file could not be written.': 'No se pudo escribir ese archivo.',
    '{name} could not be converted.': 'No se pudo convertir {name}.',
    '{name} could not be read as a table.': 'No se pudo leer {name} como tabla.',
    '{name} could not be read.': 'No se pudo leer {name}.',
    '{name} is too large to read as text.': '{name} es demasiado grande para leerlo como texto.',
    '{name} is not a list of records that can become a table.':
      '{name} no es una lista de registros que pueda convertirse en tabla.',
    'Fix the highlighted names before applying the batch.':
      'Corrige los nombres marcados antes de aplicar el lote.',
    'File Forge needs the desktop app: the web build cannot open files on this machine.':
      'File Forge necesita la aplicación de escritorio: la versión web no puede abrir archivos de este equipo.',
    'Renaming needs the desktop app.': 'Renombrar necesita la aplicación de escritorio.',
    'Saving needs the desktop app.': 'Guardar necesita la aplicación de escritorio.',

    // Canvas
    'x537 / CANVAS': 'x537 / LIENZO',
    'Sketch, draw and type on a sheet that stays on this machine, then save it as an image or send its words to the sticky notes.':
      'Dibuja, esboza y escribe en una hoja que se queda en este equipo; luego guárdala como imagen o envía sus palabras a las notas.',
    'Draw, sketch and type on a sheet that stays on this machine. Save it as an image, send its words to a sticky note, or keep the sheet itself to carry on later.':
      'Dibuja, esboza y escribe en una hoja que se queda en este equipo. Guárdala como imagen, envía sus palabras a una nota, o conserva la hoja para seguir después.',
    Tools: 'Herramientas',
    Brush: 'Pincel',
    Eraser: 'Goma',
    Line: 'Línea',
    Rectangle: 'Rectángulo',
    Ellipse: 'Elipse',
    Text: 'Texto',
    Colour: 'Color',
    'Colour {value}': 'Color {value}',
    'Stroke size': 'Grosor del trazo',
    Undo: 'Deshacer',
    Redo: 'Rehacer',
    'Clear the sheet': 'Vaciar la hoja',
    'Drawing sheet': 'Hoja de dibujo',
    'Text to place': 'Texto que colocar',
    'Text size {size}px': 'Tamaño del texto {size} px',
    Export: 'Exportar',
    'Save a copy': 'Guardar una copia',
    Words: 'Palabras',
    'Text file': 'Archivo de texto',
    'Rich text': 'Texto enriquecido',
    'Send to sticky notes': 'Enviar a las notas',
    'Sent {count} note(s) to the Home board.': 'Se enviaron {count} nota(s) al panel de inicio.',
    'There is no typed text on the sheet yet.': 'Todavía no hay texto escrito en la hoja.',
    'Type the words below, then click the sheet to place them.':
      'Escribe el texto abajo y luego haz clic en la hoja para colocarlo.',
    Sheet: 'Hoja',
    'Open a sheet': 'Abrir una hoja',
    'Keep the sheet': 'Conservar la hoja',
    Ground: 'Fondo',
    'Ground {value}': 'Fondo {value}',
    'Saved {name}.': 'Guardado {name}.',
    'The sheet could not be encoded.': 'No se pudo codificar la hoja.',
    'No sheet was chosen.': 'No se eligió ninguna hoja.',
    '{name} is not a Kryvex sheet.': '{name} no es una hoja de Kryvex.',
    '{name} is open.': '{name} está abierta.',
    'Opening a sheet needs the desktop app.': 'Abrir una hoja necesita la aplicación de escritorio.',
    'The sheet is drawn in this tab and kept for the session: saving it needs the desktop app.':
      'La hoja se dibuja en esta pestaña y se conserva durante la sesión: guardarla necesita la aplicación de escritorio.',
    'The board already holds forty notes. Clear one to make room.':
      'El panel ya tiene cuarenta notas. Borra una para hacer sitio.',

    // Built-in windows
    'BUILT IN': 'INTEGRADO',
    'BUILT-IN SERVICES': 'SERVICIOS INTEGRADOS',
    'NO ACCOUNT': 'SIN CUENTA',
    'Arcade, File Forge and Canvas run on this machine. They go straight into a window, with no sign-in and nothing added to your service list.':
      'Arcade, File Forge y Canvas funcionan en este equipo. Van directamente a una ventana, sin iniciar sesión y sin añadir nada a tu lista de servicios.',
    'Built-in tool windows': 'Ventanas de herramientas integradas',
    'Minimized windows': 'Ventanas minimizadas',
    'Resize this window': 'Cambiar el tamaño de esta ventana',
    'Drag to resize': 'Arrastra para cambiar el tamaño',

    'Secret services are the tools built into Kryvex that run on this machine: Lexium, the media player, the emulator, Disk pulse, Kryvex Link, Arcade, File Forge and Canvas. They need no account and no server, and their files stay local.':
      'Los servicios secretos son las herramientas integradas en Kryvex que funcionan en este equipo: Lexium, el reproductor multimedia, el emulador, Disk pulse, Kryvex Link, Arcade, File Forge y Canvas. No necesitan cuenta ni servidor, y sus archivos se quedan aquí.',
  },

  de: {
    // Arcade
    'x535 / ARCADE': 'x535 / SPIELHALLE',
    'The xiondigital.net arcade, embedded here with its own saved session so scores and saves survive a restart.':
      'Die Spielhalle von xiondigital.net, hier eingebettet mit eigener gespeicherter Sitzung, damit Punkte und Spielstände einen Neustart überstehen.',
    'Direct access to the xiondigital.net arcade, showcasing games made by Kryvex’s developer.':
      'Direkter Zugang zur Spielhalle von xiondigital.net mit Spielen des Kryvex-Entwicklers.',
    'The arcade did not load.': 'Die Spielhalle wurde nicht geladen.',
    'Check the connection, then try again.': 'Prüfe die Verbindung und versuche es erneut.',
    'The arcade runs in the desktop app, which embeds it with its own saved session. The web build opens it in a browser tab instead.':
      'Die Spielhalle läuft in der Desktop-App, die sie mit eigener gespeicherter Sitzung einbettet. Die Web-Version öffnet sie stattdessen in einem Browser-Tab.',

    // File Forge
    'x536 / FILES': 'x536 / DATEIEN',
    'Resize and convert images, merge, split or reorder PDFs, turn JSON into CSV and rename in batches. Copies are exported; your originals stay where they are.':
      'Bilder skalieren und umwandeln, PDFs zusammenfügen, teilen oder umsortieren, JSON in CSV umwandeln und im Stapel umbenennen. Exportiert werden Kopien; die Originale bleiben, wo sie sind.',
    'Resize and convert images, merge, split or reorder PDFs, turn JSON into CSV and rename in batches. Everything runs on this machine and originals are left alone.':
      'Bilder skalieren und umwandeln, PDFs zusammenfügen, teilen oder umsortieren, JSON in CSV umwandeln und im Stapel umbenennen. Alles läuft auf diesem Rechner, die Originale bleiben unangetastet.',
    'Add files': 'Dateien hinzufügen',
    'Clear the list': 'Liste leeren',
    Options: 'Optionen',
    Images: 'Bilder',
    Data: 'Daten',
    Rename: 'Umbenennen',
    'Output format': 'Ausgabeformat',
    'Longest edge': 'Längste Kante',
    Original: 'Originalgröße',
    'Quality {percent}%': 'Qualität {percent} %',
    'BMP keeps no quality setting: it is written without compression.':
      'BMP kennt keine Qualitätseinstellung: Es wird unkomprimiert geschrieben.',
    'What to do': 'Was tun',
    'Images into a PDF': 'Bilder in ein PDF',
    Merge: 'Zusammenfügen',
    Split: 'Teilen',
    Reorder: 'Umsortieren',
    'A PDF per image': 'Ein PDF pro Bild',
    'One PDF with all of them': 'Ein PDF mit allen',
    'A PDF per page': 'Ein PDF pro Seite',
    'Choose ranges': 'Bereiche wählen',
    'Page ranges': 'Seitenbereiche',
    'Page order': 'Seitenreihenfolge',
    'Turn every page 90°': 'Jede Seite um 90° drehen',
    'A PDF cannot be turned back into images here: that needs a page renderer Kryvex does not ship.':
      'Ein PDF lässt sich hier nicht zurück in Bilder verwandeln: Dafür bräuchte es einen Seitenrenderer, den Kryvex nicht mitbringt.',
    Direction: 'Richtung',
    'JSON to CSV': 'JSON nach CSV',
    'CSV to JSON': 'CSV nach JSON',
    'A list of records becomes a table with one column per field. Numbers and true/false are read back as such; everything else stays text.':
      'Eine Liste von Datensätzen wird zu einer Tabelle mit einer Spalte pro Feld. Zahlen und true/false werden als solche zurückgelesen; alles andere bleibt Text.',
    'New name': 'Neuer Name',
    'Use {name}, {n}, {ext}, {date} and {count}.':
      'Verwende {name}, {n}, {ext}, {date} und {count}.',
    'Start counting at': 'Zählung beginnen bei',
    'Renaming touches the originals. Nothing is overwritten, and the list below is exactly what will happen.':
      'Umbenennen betrifft die Originale. Nichts wird überschrieben, und die Liste unten zeigt genau, was passieren wird.',
    'NOTHING READY': 'NICHTS BEREIT',
    '{count} FILES READY': '{count} DATEIEN BEREIT',
    'Add files to begin.': 'Füge Dateien hinzu, um zu beginnen.',
    'would collide': 'würde kollidieren',
    'FIRST LINES': 'ERSTE ZEILEN',
    'Apply the batch': 'Stapel anwenden',
    'Convert and export a copy': 'Umwandeln und Kopie exportieren',
    'Show in folder': 'Im Ordner zeigen',
    'Copy the preview': 'Vorschau kopieren',
    'Kryvex tool': 'Kryvex-Werkzeug',

    // File Forge, what goes wrong
    'One file is larger than the 48 MB this tool opens at once: {name}':
      'Eine Datei ist größer als die 48 MB, die dieses Werkzeug auf einmal öffnet: {name}',
    'That selection is more than 96 MB in total. Pick fewer files at once.':
      'Diese Auswahl ist insgesamt größer als 96 MB. Wähle weniger Dateien auf einmal.',
    'That file could not be read: {name}': 'Diese Datei konnte nicht gelesen werden: {name}',
    'No readable file was chosen.': 'Es wurde keine lesbare Datei gewählt.',
    'An export had no usable extension: {name}': 'Ein Export hatte keine brauchbare Endung: {name}',
    'That export was empty or too large to write: {name}':
      'Dieser Export war leer oder zu groß zum Schreiben: {name}',
    'That export did not contain the format it claimed: {name}':
      'Dieser Export enthielt nicht das angegebene Format: {name}',
    'Nothing was ready to export.': 'Nichts war zum Export bereit.',
    'The file could not be written.': 'Die Datei konnte nicht geschrieben werden.',
    'That file was not chosen in this session.': 'Diese Datei wurde in dieser Sitzung nicht gewählt.',
    'That is not a usable file name: {name}': 'Das ist kein brauchbarer Dateiname: {name}',
    'Two files would both become {name}.': 'Zwei Dateien hießen dann {name}.',
    '{name} already exists.': '{name} existiert bereits.',
    'The work could not be finished.': 'Die Arbeit konnte nicht abgeschlossen werden.',
    'Waiting for a choice…': 'Warte auf eine Auswahl…',
    'Converting images…': 'Bilder werden umgewandelt…',
    'Working on the PDF…': 'PDF wird bearbeitet…',
    'Converting data…': 'Daten werden umgewandelt…',
    'Renaming…': 'Wird umbenannt…',
    'Saving…': 'Wird gespeichert…',
    'Encoding…': 'Wird kodiert…',
    'Exported {count} file(s).': '{count} Datei(en) exportiert.',
    'Renamed {count} file(s).': '{count} Datei(en) umbenannt.',
    'Add at least one image first.': 'Füge zuerst mindestens ein Bild hinzu.',
    'Add a JSON or CSV file first.': 'Füge zuerst eine JSON- oder CSV-Datei hinzu.',
    'Nothing in that list converts with the options above.':
      'Nichts in dieser Liste lässt sich mit den Optionen oben umwandeln.',
    'Merging needs two or more PDFs.': 'Zusammenfügen braucht zwei oder mehr PDFs.',
    'Splitting works on one PDF at a time.': 'Teilen arbeitet mit jeweils einem PDF.',
    'Reordering works on one PDF at a time.': 'Umsortieren arbeitet mit jeweils einem PDF.',
    'That page range could not be read. Try a form like 1-3,5.':
      'Dieser Seitenbereich konnte nicht gelesen werden. Versuche eine Form wie 1-3,5.',
    'That order needs every page exactly once, from 1 to {count}.':
      'Diese Reihenfolge braucht jede Seite genau einmal, von 1 bis {count}.',
    'That PDF could not be read.': 'Dieses PDF konnte nicht gelesen werden.',
    'That PDF is encrypted, so it has to be unlocked before Kryvex can read it.':
      'Dieses PDF ist verschlüsselt und muss entsperrt werden, bevor Kryvex es lesen kann.',
    'That file could not be written.': 'Diese Datei konnte nicht geschrieben werden.',
    '{name} could not be converted.': '{name} konnte nicht umgewandelt werden.',
    '{name} could not be read as a table.': '{name} konnte nicht als Tabelle gelesen werden.',
    '{name} could not be read.': '{name} konnte nicht gelesen werden.',
    '{name} is too large to read as text.': '{name} ist zu groß, um als Text gelesen zu werden.',
    '{name} is not a list of records that can become a table.':
      '{name} ist keine Liste von Datensätzen, die zu einer Tabelle werden kann.',
    'Fix the highlighted names before applying the batch.':
      'Korrigiere die markierten Namen, bevor du den Stapel anwendest.',
    'File Forge needs the desktop app: the web build cannot open files on this machine.':
      'File Forge braucht die Desktop-App: Die Web-Version kann keine Dateien dieses Rechners öffnen.',
    'Renaming needs the desktop app.': 'Umbenennen braucht die Desktop-App.',
    'Saving needs the desktop app.': 'Speichern braucht die Desktop-App.',

    // Canvas
    'x537 / CANVAS': 'x537 / LEINWAND',
    'Sketch, draw and type on a sheet that stays on this machine, then save it as an image or send its words to the sticky notes.':
      'Skizziere, zeichne und schreibe auf einem Blatt, das auf diesem Rechner bleibt, und speichere es als Bild oder schicke seine Worte an die Notizzettel.',
    'Draw, sketch and type on a sheet that stays on this machine. Save it as an image, send its words to a sticky note, or keep the sheet itself to carry on later.':
      'Zeichne, skizziere und schreibe auf einem Blatt, das auf diesem Rechner bleibt. Speichere es als Bild, schicke seine Worte an einen Notizzettel oder behalte das Blatt, um später weiterzumachen.',
    Tools: 'Werkzeuge',
    Brush: 'Pinsel',
    Eraser: 'Radierer',
    Line: 'Linie',
    Rectangle: 'Rechteck',
    Ellipse: 'Ellipse',
    Text: 'Text',
    Colour: 'Farbe',
    'Colour {value}': 'Farbe {value}',
    'Stroke size': 'Strichstärke',
    Undo: 'Rückgängig',
    Redo: 'Wiederholen',
    'Clear the sheet': 'Blatt leeren',
    'Drawing sheet': 'Zeichenblatt',
    'Text to place': 'Einzusetzender Text',
    'Text size {size}px': 'Textgröße {size} px',
    Export: 'Exportieren',
    'Save a copy': 'Kopie speichern',
    Words: 'Worte',
    'Text file': 'Textdatei',
    'Rich text': 'Rich Text',
    'Send to sticky notes': 'An Notizzettel senden',
    'Sent {count} note(s) to the Home board.': '{count} Notizzettel an die Startseite gesendet.',
    'There is no typed text on the sheet yet.': 'Auf dem Blatt steht noch kein getippter Text.',
    'Type the words below, then click the sheet to place them.':
      'Tippe die Worte unten und klicke dann auf das Blatt, um sie zu setzen.',
    Sheet: 'Blatt',
    'Open a sheet': 'Blatt öffnen',
    'Keep the sheet': 'Blatt behalten',
    Ground: 'Untergrund',
    'Ground {value}': 'Untergrund {value}',
    'Saved {name}.': '{name} gespeichert.',
    'The sheet could not be encoded.': 'Das Blatt konnte nicht kodiert werden.',
    'No sheet was chosen.': 'Es wurde kein Blatt gewählt.',
    '{name} is not a Kryvex sheet.': '{name} ist kein Kryvex-Blatt.',
    '{name} is open.': '{name} ist geöffnet.',
    'Opening a sheet needs the desktop app.': 'Ein Blatt zu öffnen braucht die Desktop-App.',
    'The sheet is drawn in this tab and kept for the session: saving it needs the desktop app.':
      'Das Blatt wird in diesem Tab gezeichnet und für die Sitzung behalten: Zum Speichern braucht es die Desktop-App.',
    'The board already holds forty notes. Clear one to make room.':
      'Die Startseite hat schon vierzig Notizen. Lösche eine, um Platz zu schaffen.',

    // Built-in windows
    'BUILT IN': 'INTEGRIERT',
    'BUILT-IN SERVICES': 'INTEGRIERTE DIENSTE',
    'NO ACCOUNT': 'OHNE KONTO',
    'Arcade, File Forge and Canvas run on this machine. They go straight into a window, with no sign-in and nothing added to your service list.':
      'Arcade, File Forge und Canvas laufen auf diesem Rechner. Sie gehen direkt in ein Fenster, ohne Anmeldung und ohne dass etwas zu deiner Dienstliste hinzugefügt wird.',
    'Built-in tool windows': 'Fenster integrierter Werkzeuge',
    'Minimized windows': 'Minimierte Fenster',
    'Resize this window': 'Fenstergröße ändern',
    'Drag to resize': 'Zum Ändern der Größe ziehen',

    'Secret services are the tools built into Kryvex that run on this machine: Lexium, the media player, the emulator, Disk pulse, Kryvex Link, Arcade, File Forge and Canvas. They need no account and no server, and their files stay local.':
      'Die geheimen Dienste sind die in Kryvex eingebauten Werkzeuge, die auf diesem Rechner laufen: Lexium, der Mediaplayer, der Emulator, Disk pulse, Kryvex Link, Arcade, File Forge und Canvas. Sie brauchen kein Konto und keinen Server, und ihre Dateien bleiben lokal.',
  },

  fr: {
    // Arcade
    'x535 / ARCADE': 'x535 / BORNE',
    'The xiondigital.net arcade, embedded here with its own saved session so scores and saves survive a restart.':
      'La salle d’arcade de xiondigital.net, intégrée ici avec sa propre session enregistrée, pour que scores et sauvegardes survivent à un redémarrage.',
    'Direct access to the xiondigital.net arcade, showcasing games made by Kryvex’s developer.':
      'Accès direct à la salle d’arcade de xiondigital.net, avec les jeux créés par le développeur de Kryvex.',
    'The arcade did not load.': 'La salle d’arcade ne s’est pas chargée.',
    'Check the connection, then try again.': 'Vérifiez la connexion, puis réessayez.',
    'The arcade runs in the desktop app, which embeds it with its own saved session. The web build opens it in a browser tab instead.':
      'La salle d’arcade tourne dans l’application de bureau, qui l’intègre avec sa propre session enregistrée. La version web l’ouvre dans un onglet du navigateur.',

    // File Forge
    'x536 / FILES': 'x536 / FICHIERS',
    'Resize and convert images, merge, split or reorder PDFs, turn JSON into CSV and rename in batches. Copies are exported; your originals stay where they are.':
      'Redimensionnez et convertissez des images, fusionnez, divisez ou réordonnez des PDF, transformez du JSON en CSV et renommez par lots. Des copies sont exportées ; vos originaux restent où ils sont.',
    'Resize and convert images, merge, split or reorder PDFs, turn JSON into CSV and rename in batches. Everything runs on this machine and originals are left alone.':
      'Redimensionnez et convertissez des images, fusionnez, divisez ou réordonnez des PDF, transformez du JSON en CSV et renommez par lots. Tout se passe sur cette machine et les originaux ne sont pas touchés.',
    'Add files': 'Ajouter des fichiers',
    'Clear the list': 'Vider la liste',
    Options: 'Réglages',
    Images: 'Images',
    Data: 'Données',
    Rename: 'Renommer',
    'Output format': 'Format de sortie',
    'Longest edge': 'Plus grand côté',
    Original: 'Taille d’origine',
    'Quality {percent}%': 'Qualité {percent} %',
    'BMP keeps no quality setting: it is written without compression.':
      'Le BMP n’a pas de réglage de qualité : il est écrit sans compression.',
    'What to do': 'Que faire',
    'Images into a PDF': 'Des images vers un PDF',
    Merge: 'Fusionner',
    Split: 'Diviser',
    Reorder: 'Réordonner',
    'A PDF per image': 'Un PDF par image',
    'One PDF with all of them': 'Un seul PDF avec toutes',
    'A PDF per page': 'Un PDF par page',
    'Choose ranges': 'Choisir des plages',
    'Page ranges': 'Plages de pages',
    'Page order': 'Ordre des pages',
    'Turn every page 90°': 'Tourner chaque page de 90°',
    'A PDF cannot be turned back into images here: that needs a page renderer Kryvex does not ship.':
      'Un PDF ne peut pas redevenir des images ici : cela demande un moteur de rendu de pages que Kryvex ne fournit pas.',
    Direction: 'Sens',
    'JSON to CSV': 'JSON vers CSV',
    'CSV to JSON': 'CSV vers JSON',
    'A list of records becomes a table with one column per field. Numbers and true/false are read back as such; everything else stays text.':
      'Une liste d’enregistrements devient un tableau avec une colonne par champ. Les nombres et true/false sont relus tels quels ; tout le reste reste du texte.',
    'New name': 'Nouveau nom',
    'Use {name}, {n}, {ext}, {date} and {count}.':
      'Utilisez {name}, {n}, {ext}, {date} et {count}.',
    'Start counting at': 'Commencer à compter à',
    'Renaming touches the originals. Nothing is overwritten, and the list below is exactly what will happen.':
      'Renommer touche les originaux. Rien n’est écrasé, et la liste ci-dessous montre exactement ce qui se passera.',
    'NOTHING READY': 'RIEN DE PRÊT',
    '{count} FILES READY': '{count} FICHIERS PRÊTS',
    'Add files to begin.': 'Ajoutez des fichiers pour commencer.',
    'would collide': 'entrerait en conflit',
    'FIRST LINES': 'PREMIÈRES LIGNES',
    'Apply the batch': 'Appliquer le lot',
    'Convert and export a copy': 'Convertir et exporter une copie',
    'Show in folder': 'Afficher dans le dossier',
    'Copy the preview': 'Copier l’aperçu',
    'Kryvex tool': 'Outil Kryvex',

    // File Forge, what goes wrong
    'One file is larger than the 48 MB this tool opens at once: {name}':
      'Un fichier dépasse les 48 Mo que cet outil ouvre d’un coup : {name}',
    'That selection is more than 96 MB in total. Pick fewer files at once.':
      'Cette sélection dépasse 96 Mo au total. Choisissez moins de fichiers à la fois.',
    'That file could not be read: {name}': 'Ce fichier n’a pas pu être lu : {name}',
    'No readable file was chosen.': 'Aucun fichier lisible n’a été choisi.',
    'An export had no usable extension: {name}': 'Un export n’avait pas d’extension utilisable : {name}',
    'That export was empty or too large to write: {name}':
      'Cet export était vide ou trop volumineux pour être écrit : {name}',
    'That export did not contain the format it claimed: {name}':
      'Cet export ne contenait pas le format annoncé : {name}',
    'Nothing was ready to export.': 'Rien n’était prêt à exporter.',
    'The file could not be written.': 'Le fichier n’a pas pu être écrit.',
    'That file was not chosen in this session.': 'Ce fichier n’a pas été choisi dans cette session.',
    'That is not a usable file name: {name}': 'Ce nom de fichier n’est pas utilisable : {name}',
    'Two files would both become {name}.': 'Deux fichiers deviendraient {name}.',
    '{name} already exists.': '{name} existe déjà.',
    'The work could not be finished.': 'Le travail n’a pas pu être terminé.',
    'Waiting for a choice…': 'En attente d’un choix…',
    'Converting images…': 'Conversion des images…',
    'Working on the PDF…': 'Traitement du PDF…',
    'Converting data…': 'Conversion des données…',
    'Renaming…': 'Renommage…',
    'Saving…': 'Enregistrement…',
    'Encoding…': 'Encodage…',
    'Exported {count} file(s).': '{count} fichier(s) exporté(s).',
    'Renamed {count} file(s).': '{count} fichier(s) renommé(s).',
    'Add at least one image first.': 'Ajoutez d’abord au moins une image.',
    'Add a JSON or CSV file first.': 'Ajoutez d’abord un fichier JSON ou CSV.',
    'Nothing in that list converts with the options above.':
      'Rien dans cette liste ne se convertit avec les options ci-dessus.',
    'Merging needs two or more PDFs.': 'La fusion demande au moins deux PDF.',
    'Splitting works on one PDF at a time.': 'La division traite un PDF à la fois.',
    'Reordering works on one PDF at a time.': 'Le réordonnancement traite un PDF à la fois.',
    'That page range could not be read. Try a form like 1-3,5.':
      'Cette plage de pages n’a pas pu être lue. Essayez une forme comme 1-3,5.',
    'That order needs every page exactly once, from 1 to {count}.':
      'Cet ordre exige chaque page exactement une fois, de 1 à {count}.',
    'That PDF could not be read.': 'Ce PDF n’a pas pu être lu.',
    'That PDF is encrypted, so it has to be unlocked before Kryvex can read it.':
      'Ce PDF est chiffré : il doit être déverrouillé avant que Kryvex puisse le lire.',
    'That file could not be written.': 'Ce fichier n’a pas pu être écrit.',
    '{name} could not be converted.': '{name} n’a pas pu être converti.',
    '{name} could not be read as a table.': '{name} n’a pas pu être lu comme un tableau.',
    '{name} could not be read.': '{name} n’a pas pu être lu.',
    '{name} is too large to read as text.': '{name} est trop volumineux pour être lu en texte.',
    '{name} is not a list of records that can become a table.':
      '{name} n’est pas une liste d’enregistrements convertible en tableau.',
    'Fix the highlighted names before applying the batch.':
      'Corrigez les noms surlignés avant d’appliquer le lot.',
    'File Forge needs the desktop app: the web build cannot open files on this machine.':
      'File Forge a besoin de l’application de bureau : la version web ne peut pas ouvrir les fichiers de cette machine.',
    'Renaming needs the desktop app.': 'Renommer a besoin de l’application de bureau.',
    'Saving needs the desktop app.': 'Enregistrer a besoin de l’application de bureau.',

    // Canvas
    'x537 / CANVAS': 'x537 / TOILE',
    'Sketch, draw and type on a sheet that stays on this machine, then save it as an image or send its words to the sticky notes.':
      'Croquez, dessinez et écrivez sur une feuille qui reste sur cette machine, puis enregistrez-la en image ou envoyez ses mots aux pense-bêtes.',
    'Draw, sketch and type on a sheet that stays on this machine. Save it as an image, send its words to a sticky note, or keep the sheet itself to carry on later.':
      'Dessinez, croquez et écrivez sur une feuille qui reste sur cette machine. Enregistrez-la en image, envoyez ses mots vers un pense-bête, ou gardez la feuille pour continuer plus tard.',
    Tools: 'Outils',
    Brush: 'Pinceau',
    Eraser: 'Gomme',
    Line: 'Ligne',
    Rectangle: 'Rectangle',
    Ellipse: 'Ellipse',
    Text: 'Texte',
    Colour: 'Couleur',
    'Colour {value}': 'Couleur {value}',
    'Stroke size': 'Épaisseur du trait',
    Undo: 'Annuler',
    Redo: 'Rétablir',
    'Clear the sheet': 'Vider la feuille',
    'Drawing sheet': 'Feuille de dessin',
    'Text to place': 'Texte à placer',
    'Text size {size}px': 'Taille du texte {size} px',
    Export: 'Exporter',
    'Save a copy': 'Enregistrer une copie',
    Words: 'Mots',
    'Text file': 'Fichier texte',
    'Rich text': 'Texte enrichi',
    'Send to sticky notes': 'Envoyer aux pense-bêtes',
    'Sent {count} note(s) to the Home board.': '{count} pense-bête(s) envoyé(s) à l’accueil.',
    'There is no typed text on the sheet yet.': 'Aucun texte saisi sur la feuille pour l’instant.',
    'Type the words below, then click the sheet to place them.':
      'Saisissez les mots ci-dessous, puis cliquez sur la feuille pour les placer.',
    Sheet: 'Feuille',
    'Open a sheet': 'Ouvrir une feuille',
    'Keep the sheet': 'Conserver la feuille',
    Ground: 'Fond',
    'Ground {value}': 'Fond {value}',
    'Saved {name}.': '{name} enregistré.',
    'The sheet could not be encoded.': 'La feuille n’a pas pu être encodée.',
    'No sheet was chosen.': 'Aucune feuille n’a été choisie.',
    '{name} is not a Kryvex sheet.': '{name} n’est pas une feuille Kryvex.',
    '{name} is open.': '{name} est ouverte.',
    'Opening a sheet needs the desktop app.': 'Ouvrir une feuille demande l’application de bureau.',
    'The sheet is drawn in this tab and kept for the session: saving it needs the desktop app.':
      'La feuille est dessinée dans cet onglet et conservée pour la session : l’enregistrer demande l’application de bureau.',
    'The board already holds forty notes. Clear one to make room.':
      'L’accueil contient déjà quarante notes. Supprimez-en une pour faire de la place.',

    // Built-in windows
    'BUILT IN': 'INTÉGRÉ',
    'BUILT-IN SERVICES': 'SERVICES INTÉGRÉS',
    'NO ACCOUNT': 'SANS COMPTE',
    'Arcade, File Forge and Canvas run on this machine. They go straight into a window, with no sign-in and nothing added to your service list.':
      'Arcade, File Forge et Canvas tournent sur cette machine. Ils s’ouvrent directement dans une fenêtre, sans connexion et sans rien ajouter à votre liste de services.',
    'Built-in tool windows': 'Fenêtres des outils intégrés',
    'Minimized windows': 'Fenêtres réduites',
    'Resize this window': 'Redimensionner cette fenêtre',
    'Drag to resize': 'Glissez pour redimensionner',

    'Secret services are the tools built into Kryvex that run on this machine: Lexium, the media player, the emulator, Disk pulse, Kryvex Link, Arcade, File Forge and Canvas. They need no account and no server, and their files stay local.':
      'Les services secrets sont les outils intégrés à Kryvex qui tournent sur cette machine : Lexium, le lecteur multimédia, l’émulateur, Disk pulse, Kryvex Link, Arcade, File Forge et Canvas. Ils n’ont besoin ni de compte ni de serveur, et leurs fichiers restent locaux.',
  },
};
