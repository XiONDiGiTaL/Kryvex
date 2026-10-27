/**
 * Copy for the Virtual LAN strip in a room.
 *
 * Three ideas need wording here, and getting them wrong would over-claim: the
 * network belongs to an engine the user installed, Kryvex only reads and
 * publishes the address, and the address is used by hand in a game or a
 * service. English stays the source; this module keeps the other three locales
 * in step, with Turkish in `i18n-tr.ts`.
 */
export const vlanCopy: Record<'es' | 'de' | 'fr', Record<string, string>> = {
  es: {
    'Virtual LAN': 'LAN virtual',
    'Sharing {ip}': 'Compartiendo {ip}',
    '{count} devices': '{count} dispositivos',
    Hide: 'Ocultar',
    Expand: 'Ampliar',
    'MY VIRTUAL IP': 'MI IP VIRTUAL',
    'DEVICES ON THIS NETWORK': 'DISPOSITIVOS EN ESTA RED',
    'Detected network': 'Red detectada',
    'Stop sharing my address': 'Dejar de compartir mi dirección',
    'Share this address with the room': 'Compartir esta dirección con la sala',
    'Virtual LAN needs the desktop app. The desktop reads the tunnel an engine on your machine has already created.':
      'La LAN virtual necesita la aplicación de escritorio. El escritorio lee el túnel que ya ha creado un motor en tu equipo.',
    'No tunnel adapter is running. Start your own ZeroTier, EasyTier, Tailscale, WireGuard, Hamachi or OpenVPN network, then reopen this panel.':
      'No hay ningún adaptador de túnel activo. Inicia tu propia red ZeroTier, EasyTier, Tailscale, WireGuard, Hamachi u OpenVPN y vuelve a abrir este panel.',
    'Nothing is shared yet. Members appear here when they publish an address.':
      'Todavía no se comparte nada. Los miembros aparecen aquí cuando publican una dirección.',
    'This device': 'Este dispositivo',
    'The address is no longer shared.': 'La dirección ya no se comparte.',
    'The address was shared with the room.': 'La dirección se compartió con la sala.',
    'The address could not be shared. Rejoin the room and try again.':
      'No se pudo compartir la dirección. Vuelve a entrar en la sala e inténtalo de nuevo.',
    'The clipboard refused the address.': 'El portapapeles rechazó la dirección.',
    'Use a member’s virtual IP in a compatible game or service’s direct-connect field. The host must have that game or service running. Kryvex shows the address; it does not create the network, route it or admit anyone.':
      'Usa la IP virtual de un miembro en el campo de conexión directa de un juego o servicio compatible. Quien aloja debe tener ese juego o servicio en marcha. Kryvex muestra la dirección: no crea la red, no la enruta ni admite a nadie.',
  },
  de: {
    'Virtual LAN': 'Virtuelles LAN',
    'Sharing {ip}': 'Teilt {ip}',
    '{count} devices': '{count} Geräte',
    Hide: 'Ausblenden',
    Expand: 'Erweitern',
    'MY VIRTUAL IP': 'MEINE VIRTUELLE IP',
    'DEVICES ON THIS NETWORK': 'GERÄTE IN DIESEM NETZWERK',
    'Detected network': 'Erkanntes Netzwerk',
    'Stop sharing my address': 'Meine Adresse nicht mehr teilen',
    'Share this address with the room': 'Diese Adresse im Raum teilen',
    'Virtual LAN needs the desktop app. The desktop reads the tunnel an engine on your machine has already created.':
      'Das virtuelle LAN braucht die Desktop-App. Der Desktop liest den Tunnel, den eine Engine auf diesem Rechner bereits erstellt hat.',
    'No tunnel adapter is running. Start your own ZeroTier, EasyTier, Tailscale, WireGuard, Hamachi or OpenVPN network, then reopen this panel.':
      'Es läuft kein Tunnel-Adapter. Starte dein eigenes Netzwerk mit ZeroTier, EasyTier, Tailscale, WireGuard, Hamachi oder OpenVPN und öffne dieses Panel erneut.',
    'Nothing is shared yet. Members appear here when they publish an address.':
      'Noch wird nichts geteilt. Mitglieder erscheinen hier, sobald sie eine Adresse veröffentlichen.',
    'This device': 'Dieses Gerät',
    'The address is no longer shared.': 'Die Adresse wird nicht mehr geteilt.',
    'The address was shared with the room.': 'Die Adresse wurde im Raum geteilt.',
    'The address could not be shared. Rejoin the room and try again.':
      'Die Adresse konnte nicht geteilt werden. Tritt dem Raum erneut bei und versuche es noch einmal.',
    'The clipboard refused the address.': 'Die Zwischenablage hat die Adresse abgelehnt.',
    'Use a member’s virtual IP in a compatible game or service’s direct-connect field. The host must have that game or service running. Kryvex shows the address; it does not create the network, route it or admit anyone.':
      'Nutze die virtuelle IP eines Mitglieds im Direktverbindungsfeld eines kompatiblen Spiels oder Dienstes. Wer hostet, muss dieses Spiel oder diesen Dienst laufen haben. Kryvex zeigt die Adresse; es erstellt das Netzwerk nicht, leitet es nicht weiter und lässt niemanden zu.',
  },
  fr: {
    'Virtual LAN': 'LAN virtuel',
    'Sharing {ip}': 'Partage de {ip}',
    '{count} devices': '{count} appareils',
    Hide: 'Masquer',
    Expand: 'Développer',
    'MY VIRTUAL IP': 'MON IP VIRTUELLE',
    'DEVICES ON THIS NETWORK': 'APPAREILS SUR CE RÉSEAU',
    'Detected network': 'Réseau détecté',
    'Stop sharing my address': 'Ne plus partager mon adresse',
    'Share this address with the room': 'Partager cette adresse avec le salon',
    'Virtual LAN needs the desktop app. The desktop reads the tunnel an engine on your machine has already created.':
      'Le LAN virtuel nécessite l’application de bureau. Le bureau lit le tunnel qu’un moteur a déjà créé sur votre machine.',
    'No tunnel adapter is running. Start your own ZeroTier, EasyTier, Tailscale, WireGuard, Hamachi or OpenVPN network, then reopen this panel.':
      'Aucun adaptateur tunnel n’est actif. Démarrez votre propre réseau ZeroTier, EasyTier, Tailscale, WireGuard, Hamachi ou OpenVPN, puis rouvrez ce panneau.',
    'Nothing is shared yet. Members appear here when they publish an address.':
      'Rien n’est encore partagé. Les membres apparaissent ici lorsqu’ils publient une adresse.',
    'This device': 'Cet appareil',
    'The address is no longer shared.': 'L’adresse n’est plus partagée.',
    'The address was shared with the room.': 'L’adresse a été partagée avec le salon.',
    'The address could not be shared. Rejoin the room and try again.':
      'L’adresse n’a pas pu être partagée. Rejoignez le salon et réessayez.',
    'The clipboard refused the address.': 'Le presse-papiers a refusé l’adresse.',
    'Use a member’s virtual IP in a compatible game or service’s direct-connect field. The host must have that game or service running. Kryvex shows the address; it does not create the network, route it or admit anyone.':
      'Utilisez l’IP virtuelle d’un membre dans le champ de connexion directe d’un jeu ou d’un service compatible. L’hôte doit avoir ce jeu ou ce service en cours d’exécution. Kryvex affiche l’adresse ; il ne crée pas le réseau, ne l’achemine pas et n’admet personne.',
  },
};
