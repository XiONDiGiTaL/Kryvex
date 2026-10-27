/**
 * Copy for Kryvex Link, the phone companion.
 *
 * English is the catalogue key, as everywhere else in the renderer. The phone
 * page itself is a separate bundle with its own table (`src/companion/strings.ts`)
 * because it is not rendered through this provider.
 */
export const linkCopy: Record<'es' | 'de' | 'fr', Record<string, string>> = {
  es: {
    'x534 / LINK': 'x534 / ENLACE',
    'Services': 'Servicios',
    'The phone companion is served by the desktop app. Open Kryvex on this computer to pair a phone.':
      'El acompañante para el teléfono lo sirve la aplicación de escritorio. Abre Kryvex en este equipo para emparejar un teléfono.',
    'Pair a phone with this computer over your own network: clipboard both ways, files both ways, and a remote for the player. Nothing is uploaded to a service.':
      'Empareja un teléfono con este equipo por tu propia red: portapapeles en ambos sentidos, archivos en ambos sentidos y un mando para el reproductor. Nada se sube a un servicio.',
    'Stop the link': 'Detener el enlace',
    'Start the link': 'Iniciar el enlace',
    'PAIRING CODE': 'CÓDIGO DE EMPAREJAMIENTO',
    'Type this on the phone when the page asks. It lasts {seconds} seconds.':
      'Escribe esto en el teléfono cuando la página lo pida. Dura {seconds} segundos.',
    'Start the link to get a code.': 'Inicia el enlace para obtener un código.',
    'New code issued.': 'Código nuevo emitido.',
    'New code': 'Código nuevo',
    'Listening on port {port}': 'A la escucha en el puerto {port}',
    'Off': 'Apagado',
    'OPEN THIS ON THE PHONE': 'ABRE ESTO EN EL TELÉFONO',
    'Copy': 'Copiar',
    'Copy {value}': 'Copiar {value}',
    'Copied.': 'Copiado.',
    'Start the link to see this machine’s addresses.':
      'Inicia el enlace para ver las direcciones de esta máquina.',
    'Open the address above in the phone’s browser.':
      'Abre la dirección de arriba en el navegador del teléfono.',
    'Type the pairing code.': 'Escribe el código de emparejamiento.',
    'Add the page to the home screen for an icon.':
      'Añade la página a la pantalla de inicio para tener un icono.',
    'PAIRED PHONES': 'TELÉFONOS EMPAREJADOS',
    'No phone is paired yet.': 'Todavía no hay ningún teléfono emparejado.',
    'seen {ago} ago': 'visto hace {ago}',
    'Unpair': 'Desemparejar',
    '{name} was unpaired.': '{name} se ha desemparejado.',
    'Unpair all': 'Desemparejar todos',
    'Every phone was unpaired.': 'Se han desemparejado todos los teléfonos.',
    'Kryvex Link is live': 'Kryvex Link está activo',
    'The phone relay works.': 'El aviso al teléfono funciona.',
    'Sent.': 'Enviado.',
    'Test the phone relay': 'Probar el aviso al teléfono',
    'FILES FROM THE PHONE': 'ARCHIVOS DEL TELÉFONO',
    'Received files land in {folder}.': 'Los archivos recibidos llegan a {folder}.',
    'Nothing has arrived yet.': 'Todavía no ha llegado nada.',
    'Open': 'Abrir',
    'Open {name}': 'Abrir {name}',
    'Show in folder': 'Mostrar en la carpeta',
    'Show {name} in its folder': 'Mostrar {name} en su carpeta',
    'Delete': 'Eliminar',
    'Delete {name}': 'Eliminar {name}',
    '{name} was removed.': '{name} se ha eliminado.',
    'The received list was cleared.': 'Se ha vaciado la lista de recibidos.',
    'Clear the list': 'Vaciar la lista',
    'FILES FOR THE PHONE': 'ARCHIVOS PARA EL TELÉFONO',
    'Offer a file here, then download it from the phone’s Files tab. It is served on this network only.':
      'Ofrece un archivo aquí y descárgalo desde la pestaña Archivos del teléfono. Solo se sirve en esta red.',
    'Nothing is offered yet.': 'Todavía no se ofrece nada.',
    'Offer a file': 'Ofrecer un archivo',
    'The page is only served on this machine’s private addresses and every request from outside them is refused. A phone gets access by entering the six-digit code once; you can unpair it here at any time.':
      'La página solo se sirve en las direcciones privadas de esta máquina y se rechaza cualquier petición de fuera de ellas. Un teléfono entra escribiendo el código de seis dígitos una vez; puedes desemparejarlo aquí cuando quieras.',
    'Pair a phone over your own network for clipboard, files and a remote; nothing leaves the two devices.':
      'Empareja un teléfono por tu propia red para el portapapeles, los archivos y un mando; nada sale de los dos dispositivos.',
      'Kryvex Link is listening. Open its page on the phone.':
      'Kryvex Link está a la escucha. Abre su página en el teléfono.',
    'Kryvex Link stopped listening.': 'Kryvex Link ha dejado de escuchar.',
  },
  de: {
    'x534 / LINK': 'x534 / VERBINDUNG',
    'Services': 'Dienste',
    'The phone companion is served by the desktop app. Open Kryvex on this computer to pair a phone.':
      'Die Telefon-Begleitung wird von der Desktop-App bereitgestellt. Öffne Kryvex auf diesem Computer, um ein Telefon zu koppeln.',
    'Pair a phone with this computer over your own network: clipboard both ways, files both ways, and a remote for the player. Nothing is uploaded to a service.':
      'Koppele ein Telefon über dein eigenes Netz mit diesem Computer: Zwischenablage in beide Richtungen, Dateien in beide Richtungen und eine Fernbedienung für den Player. Nichts wird zu einem Dienst hochgeladen.',
    'Stop the link': 'Verbindung beenden',
    'Start the link': 'Verbindung starten',
    'PAIRING CODE': 'KOPPLUNGSCODE',
    'Type this on the phone when the page asks. It lasts {seconds} seconds.':
      'Gib das am Telefon ein, wenn die Seite danach fragt. Es gilt {seconds} Sekunden.',
    'Start the link to get a code.': 'Starte die Verbindung, um einen Code zu erhalten.',
    'New code issued.': 'Neuer Code ausgegeben.',
    'New code': 'Neuer Code',
    'Listening on port {port}': 'Lauscht auf Port {port}',
    'Off': 'Aus',
    'OPEN THIS ON THE PHONE': 'DAS AM TELEFON ÖFFNEN',
    'Copy': 'Kopieren',
    'Copy {value}': '{value} kopieren',
    'Copied.': 'Kopiert.',
    'Start the link to see this machine’s addresses.':
      'Starte die Verbindung, um die Adressen dieses Rechners zu sehen.',
    'Open the address above in the phone’s browser.':
      'Öffne die Adresse oben im Browser des Telefons.',
    'Type the pairing code.': 'Gib den Kopplungscode ein.',
    'Add the page to the home screen for an icon.':
      'Füge die Seite zum Startbildschirm hinzu, um ein Symbol zu erhalten.',
    'PAIRED PHONES': 'GEKOPPELTE TELEFONE',
    'No phone is paired yet.': 'Noch ist kein Telefon gekoppelt.',
    'seen {ago} ago': 'gesehen vor {ago}',
    'Unpair': 'Entkoppeln',
    '{name} was unpaired.': '{name} wurde entkoppelt.',
    'Unpair all': 'Alle entkoppeln',
    'Every phone was unpaired.': 'Alle Telefone wurden entkoppelt.',
    'Kryvex Link is live': 'Kryvex Link ist aktiv',
    'The phone relay works.': 'Der Hinweis ans Telefon funktioniert.',
    'Sent.': 'Gesendet.',
    'Test the phone relay': 'Hinweis ans Telefon testen',
    'FILES FROM THE PHONE': 'DATEIEN VOM TELEFON',
    'Received files land in {folder}.': 'Empfangene Dateien landen in {folder}.',
    'Nothing has arrived yet.': 'Bisher ist nichts angekommen.',
    'Open': 'Öffnen',
    'Open {name}': '{name} öffnen',
    'Show in folder': 'Im Ordner zeigen',
    'Show {name} in its folder': '{name} im Ordner zeigen',
    'Delete': 'Löschen',
    'Delete {name}': '{name} löschen',
    '{name} was removed.': '{name} wurde entfernt.',
    'The received list was cleared.': 'Die Empfangsliste wurde geleert.',
    'Clear the list': 'Liste leeren',
    'FILES FOR THE PHONE': 'DATEIEN FÜR DAS TELEFON',
    'Offer a file here, then download it from the phone’s Files tab. It is served on this network only.':
      'Biete hier eine Datei an und lade sie im Dateien-Reiter des Telefons herunter. Sie wird nur in diesem Netz bereitgestellt.',
    'Nothing is offered yet.': 'Es wird noch nichts angeboten.',
    'Offer a file': 'Datei anbieten',
    'The page is only served on this machine’s private addresses and every request from outside them is refused. A phone gets access by entering the six-digit code once; you can unpair it here at any time.':
      'Die Seite wird nur auf den privaten Adressen dieses Rechners bereitgestellt, und jede Anfrage von außerhalb wird abgelehnt. Ein Telefon erhält Zugang, indem es den sechsstelligen Code einmal eingibt; du kannst es hier jederzeit entkoppeln.',
    'Pair a phone over your own network for clipboard, files and a remote; nothing leaves the two devices.':
      'Koppele ein Telefon über dein eigenes Netz für Zwischenablage, Dateien und Fernbedienung; nichts verlässt die beiden Geräte.',
      'Kryvex Link is listening. Open its page on the phone.':
      'Kryvex Link wartet auf Verbindungen. Öffne die Seite am Telefon.',
    'Kryvex Link stopped listening.': 'Kryvex Link wartet nicht mehr auf Verbindungen.',
  },
  fr: {
    'x534 / LINK': 'x534 / LIEN',
    'Services': 'Services',
    'The phone companion is served by the desktop app. Open Kryvex on this computer to pair a phone.':
      'Le compagnon téléphone est servi par l’application de bureau. Ouvrez Kryvex sur cet ordinateur pour associer un téléphone.',
    'Pair a phone with this computer over your own network: clipboard both ways, files both ways, and a remote for the player. Nothing is uploaded to a service.':
      'Associez un téléphone à cet ordinateur sur votre propre réseau : presse-papiers dans les deux sens, fichiers dans les deux sens et une télécommande pour le lecteur. Rien n’est envoyé à un service.',
    'Stop the link': 'Arrêter le lien',
    'Start the link': 'Démarrer le lien',
    'PAIRING CODE': 'CODE D’ASSOCIATION',
    'Type this on the phone when the page asks. It lasts {seconds} seconds.':
      'Saisissez ceci sur le téléphone quand la page le demande. Il dure {seconds} secondes.',
    'Start the link to get a code.': 'Démarrez le lien pour obtenir un code.',
    'New code issued.': 'Nouveau code émis.',
    'New code': 'Nouveau code',
    'Listening on port {port}': 'À l’écoute sur le port {port}',
    'Off': 'Arrêté',
    'OPEN THIS ON THE PHONE': 'OUVREZ CECI SUR LE TÉLÉPHONE',
    'Copy': 'Copier',
    'Copy {value}': 'Copier {value}',
    'Copied.': 'Copié.',
    'Start the link to see this machine’s addresses.':
      'Démarrez le lien pour voir les adresses de cette machine.',
    'Open the address above in the phone’s browser.':
      'Ouvrez l’adresse ci-dessus dans le navigateur du téléphone.',
    'Type the pairing code.': 'Saisissez le code d’association.',
    'Add the page to the home screen for an icon.':
      'Ajoutez la page à l’écran d’accueil pour obtenir une icône.',
    'PAIRED PHONES': 'TÉLÉPHONES ASSOCIÉS',
    'No phone is paired yet.': 'Aucun téléphone n’est encore associé.',
    'seen {ago} ago': 'vu il y a {ago}',
    'Unpair': 'Dissocier',
    '{name} was unpaired.': '{name} a été dissocié.',
    'Unpair all': 'Tout dissocier',
    'Every phone was unpaired.': 'Tous les téléphones ont été dissociés.',
    'Kryvex Link is live': 'Kryvex Link est actif',
    'The phone relay works.': 'Le relais vers le téléphone fonctionne.',
    'Sent.': 'Envoyé.',
    'Test the phone relay': 'Tester le relais vers le téléphone',
    'FILES FROM THE PHONE': 'FICHIERS DU TÉLÉPHONE',
    'Received files land in {folder}.': 'Les fichiers reçus arrivent dans {folder}.',
    'Nothing has arrived yet.': 'Rien n’est encore arrivé.',
    'Open': 'Ouvrir',
    'Open {name}': 'Ouvrir {name}',
    'Show in folder': 'Afficher dans le dossier',
    'Show {name} in its folder': 'Afficher {name} dans son dossier',
    'Delete': 'Supprimer',
    'Delete {name}': 'Supprimer {name}',
    '{name} was removed.': '{name} a été supprimé.',
    'The received list was cleared.': 'La liste des fichiers reçus a été vidée.',
    'Clear the list': 'Vider la liste',
    'FILES FOR THE PHONE': 'FICHIERS POUR LE TÉLÉPHONE',
    'Offer a file here, then download it from the phone’s Files tab. It is served on this network only.':
      'Proposez un fichier ici, puis téléchargez-le depuis l’onglet Fichiers du téléphone. Il n’est servi que sur ce réseau.',
    'Nothing is offered yet.': 'Rien n’est encore proposé.',
    'Offer a file': 'Proposer un fichier',
    'The page is only served on this machine’s private addresses and every request from outside them is refused. A phone gets access by entering the six-digit code once; you can unpair it here at any time.':
      'La page n’est servie que sur les adresses privées de cette machine, et toute requête venant d’ailleurs est refusée. Un téléphone y accède en saisissant une fois le code à six chiffres ; vous pouvez le dissocier ici à tout moment.',
    'Pair a phone over your own network for clipboard, files and a remote; nothing leaves the two devices.':
      'Associez un téléphone sur votre propre réseau pour le presse-papiers, les fichiers et une télécommande ; rien ne quitte les deux appareils.',
      'Kryvex Link is listening. Open its page on the phone.':
      'Kryvex Link est à l’écoute. Ouvrez sa page sur le téléphone.',
    'Kryvex Link stopped listening.': 'Kryvex Link n’est plus à l’écoute.',
  },
};
