/**
 * Copy for placing a service on the Workspace canvas.
 *
 * Two ideas need wording here: an installed service can be framed without being
 * added again, and a site may hold a second copy on purpose. English stays the
 * source; this module keeps the other three locales in step.
 */
export const placementCopy: Record<'es' | 'de' | 'fr', Record<string, string>> = {
  es: {
    'INSTALLED SERVICES': 'SERVICIOS INSTALADOS',
    '{count} READY': '{count} LISTOS',
    'Open one of these in a window, or add something new below.':
      'Abre uno de estos en una ventana o añade algo nuevo abajo.',
    'Allow more than one instance of this site': 'Permitir más de una instancia de este sitio',
    'A second instance keeps its own session, so two copies can be signed in to different accounts.':
      'Cada instancia adicional conserva su propia sesión, así que dos copias pueden estar abiertas con cuentas distintas.',
    '{name} is already installed. Saving opens the one you have instead of adding a second.':
      '{name} ya está instalado. Al guardar se abrirá el que ya tienes en lugar de añadir otro.',
    '{name} is already installed. Opened the one you have.':
      '{name} ya está instalado. Se abrió el que ya tienes.',
  },
  de: {
    'INSTALLED SERVICES': 'INSTALLIERTE DIENSTE',
    '{count} READY': '{count} BEREIT',
    'Open one of these in a window, or add something new below.':
      'Öffne einen davon in einem Fenster oder füge unten etwas Neues hinzu.',
    'Allow more than one instance of this site': 'Mehr als eine Instanz dieser Seite erlauben',
    'A second instance keeps its own session, so two copies can be signed in to different accounts.':
      'Jede weitere Instanz behält ihre eigene Sitzung, sodass zwei Kopien mit verschiedenen Konten angemeldet sein können.',
    '{name} is already installed. Saving opens the one you have instead of adding a second.':
      '{name} ist bereits installiert. Beim Speichern wird die vorhandene Instanz geöffnet, statt eine zweite anzulegen.',
    '{name} is already installed. Opened the one you have.':
      '{name} ist bereits installiert. Die vorhandene Instanz wurde geöffnet.',
  },
  fr: {
    'INSTALLED SERVICES': 'SERVICES INSTALLÉS',
    '{count} READY': '{count} PRÊTS',
    'Open one of these in a window, or add something new below.':
      'Ouvrez l’un d’eux dans une fenêtre, ou ajoutez quelque chose de nouveau ci-dessous.',
    'Allow more than one instance of this site': 'Autoriser plusieurs instances de ce site',
    'A second instance keeps its own session, so two copies can be signed in to different accounts.':
      'Chaque instance supplémentaire conserve sa propre session : deux copies peuvent donc être connectées à des comptes différents.',
    '{name} is already installed. Saving opens the one you have instead of adding a second.':
      '{name} est déjà installé. L’enregistrement ouvrira celui que vous avez au lieu d’en ajouter un second.',
    '{name} is already installed. Opened the one you have.':
      '{name} est déjà installé. Celui que vous avez a été ouvert.',
  },
};
