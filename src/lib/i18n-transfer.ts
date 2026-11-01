/**
 * Copy for room file transfer.
 *
 * Two ideas need wording here: the bytes go straight between the two machines,
 * and the person receiving chooses where the file lands. English stays the
 * source; this module keeps the other three locales in step.
 */
export const transferCopy: Record<'es' | 'de' | 'fr', Record<string, string>> = {
  es: {
    'File transfer': 'Transferencia de archivos',
    'SEND FILES': 'ENVIAR ARCHIVOS',
    'Send files': 'Enviar archivos',
    'Clear finished': 'Quitar las terminadas',
    'Send the invite first: the files start when the other person is here.':
      'Envía primero la invitación: los archivos empiezan cuando la otra persona esté aquí.',
    'Files go straight to the other person over the room. Nothing is uploaded, there is no size limit, and the receiver chooses where it lands.':
      'Los archivos van directos a la otra persona a través de la sala. Nada se sube, no hay límite de tamaño y quien recibe elige dónde se guarda.',
    '{name} wants to send {size}.': '{name} quiere enviarte {size}.',
    'Decline': 'Rechazar',
    'SENDING': 'ENVIANDO',
    'RECEIVING': 'RECIBIENDO',
    'Waiting for the other side…': 'Esperando a la otra parte…',
    'Waiting for a destination…': 'Esperando un destino…',
    'Paused until the other side comes back.': 'En pausa hasta que vuelva la otra parte.',
    'Sent.': 'Enviado.',
    'Declined.': 'Rechazado.',
    'Cancelled.': 'Cancelado.',
    'Offering {count} file(s) to the room.': 'Ofreciendo {count} archivo(s) a la sala.',
    'No file could be offered.': 'No se pudo ofrecer ningún archivo.',
    'No folder was chosen, so the transfer was cancelled.':
      'No se eligió ninguna carpeta, así que la transferencia se canceló.',
    'The file could not be written.': 'No se pudo escribir el archivo.',
    'The transfer failed.': 'La transferencia falló.',
    'The file did not arrive intact. Try again.': 'El archivo no llegó intacto. Inténtalo de nuevo.',
    'The other peer left the room.': 'La otra persona salió de la sala.',
    'The other side did not come back, so the transfer stopped.':
      'La otra parte no volvió, así que la transferencia se detuvo.',
    'The other side cancelled the transfer.': 'La otra parte canceló la transferencia.',
    'The other side is busy with another transfer.':
      'La otra parte está ocupada con otra transferencia.',
  },
  de: {
    'File transfer': 'Dateiübertragung',
    'SEND FILES': 'DATEIEN SENDEN',
    'Send files': 'Dateien senden',
    'Clear finished': 'Beendete entfernen',
    'Send the invite first: the files start when the other person is here.':
      'Schick zuerst die Einladung: Die Dateien starten, sobald die andere Person da ist.',
    'Files go straight to the other person over the room. Nothing is uploaded, there is no size limit, and the receiver chooses where it lands.':
      'Dateien gehen über den Raum direkt an die andere Person. Nichts wird hochgeladen, es gibt keine Größenbegrenzung, und wer empfängt, wählt den Speicherort.',
    '{name} wants to send {size}.': '{name} möchte {size} senden.',
    'Decline': 'Ablehnen',
    'SENDING': 'SENDEN',
    'RECEIVING': 'EMPFANGEN',
    'Waiting for the other side…': 'Warten auf die andere Seite…',
    'Waiting for a destination…': 'Warten auf einen Speicherort…',
    'Paused until the other side comes back.': 'Pausiert, bis die andere Seite zurückkommt.',
    'Sent.': 'Gesendet.',
    'Declined.': 'Abgelehnt.',
    'Cancelled.': 'Abgebrochen.',
    'Offering {count} file(s) to the room.': '{count} Datei(en) werden dem Raum angeboten.',
    'No file could be offered.': 'Es konnte keine Datei angeboten werden.',
    'No folder was chosen, so the transfer was cancelled.':
      'Es wurde kein Ordner gewählt, also wurde die Übertragung abgebrochen.',
    'The file could not be written.': 'Die Datei konnte nicht geschrieben werden.',
    'The transfer failed.': 'Die Übertragung ist fehlgeschlagen.',
    'The file did not arrive intact. Try again.': 'Die Datei kam nicht unversehrt an. Versuch es erneut.',
    'The other peer left the room.': 'Die andere Person hat den Raum verlassen.',
    'The other side did not come back, so the transfer stopped.':
      'Die andere Seite kam nicht zurück, also wurde die Übertragung beendet.',
    'The other side cancelled the transfer.': 'Die andere Seite hat die Übertragung abgebrochen.',
    'The other side is busy with another transfer.':
      'Die andere Seite ist mit einer anderen Übertragung beschäftigt.',
  },
  fr: {
    'File transfer': 'Transfert de fichiers',
    'SEND FILES': 'ENVOYER DES FICHIERS',
    'Send files': 'Envoyer des fichiers',
    'Clear finished': 'Retirer les terminés',
    'Send the invite first: the files start when the other person is here.':
      'Envoyez d’abord l’invitation : les fichiers démarrent quand l’autre personne est là.',
    'Files go straight to the other person over the room. Nothing is uploaded, there is no size limit, and the receiver chooses where it lands.':
      'Les fichiers passent par la salle, directement à l’autre personne. Rien n’est téléversé, il n’y a aucune limite de taille, et la personne qui reçoit choisit l’emplacement.',
    '{name} wants to send {size}.': '{name} veut vous envoyer {size}.',
    'Decline': 'Refuser',
    'SENDING': 'ENVOI',
    'RECEIVING': 'RÉCEPTION',
    'Waiting for the other side…': 'En attente de l’autre côté…',
    'Waiting for a destination…': 'En attente d’une destination…',
    'Paused until the other side comes back.': 'En pause jusqu’au retour de l’autre côté.',
    'Sent.': 'Envoyé.',
    'Declined.': 'Refusé.',
    'Cancelled.': 'Annulé.',
    'Offering {count} file(s) to the room.': 'Proposition de {count} fichier(s) à la salle.',
    'No file could be offered.': 'Aucun fichier n’a pu être proposé.',
    'No folder was chosen, so the transfer was cancelled.':
      'Aucun dossier n’a été choisi : le transfert a été annulé.',
    'The file could not be written.': 'Le fichier n’a pas pu être écrit.',
    'The transfer failed.': 'Le transfert a échoué.',
    'The file did not arrive intact. Try again.': 'Le fichier n’est pas arrivé intact. Réessayez.',
    'The other peer left the room.': 'L’autre personne a quitté la salle.',
    'The other side did not come back, so the transfer stopped.':
      'L’autre côté n’est pas revenu, le transfert s’est arrêté.',
    'The other side cancelled the transfer.': 'L’autre côté a annulé le transfert.',
    'The other side is busy with another transfer.': 'L’autre côté est occupé par un autre transfert.',
  },
};
