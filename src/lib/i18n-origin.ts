/**
 * Copy for the server-origin chip in the address bar.
 *
 * The chip names the country a page is served from and opens a card with the
 * address, network, node, clock and coordinates. The provider hostname under
 * the card is a proper noun and stays literal, so it is deliberately absent
 * here.
 */
type OriginLanguage = 'es' | 'de' | 'fr';

export const originCopy: Record<OriginLanguage, Record<string, string>> = {
  es: {
    'Server origin unavailable': 'Origen del servidor no disponible',
    'Server origin': 'Origen del servidor',
    'Origin unknown': 'Origen desconocido',
    'Look up again': 'Consultar de nuevo',
    'Server IP': 'IP del servidor',
    Unknown: 'Desconocido',
    Node: 'Nodo',
    'Their time': 'Su hora',
    Coordinates: 'Coordenadas',
    'Copy IP': 'Copiar IP',
    'Resolving this site’s network…': 'Resolviendo la red de este sitio…',
  },
  de: {
    'Server origin unavailable': 'Serverherkunft nicht verfügbar',
    'Server origin': 'Serverherkunft',
    'Origin unknown': 'Herkunft unbekannt',
    'Look up again': 'Erneut abfragen',
    'Server IP': 'Server-IP',
    Unknown: 'Unbekannt',
    Node: 'Knoten',
    'Their time': 'Deren Zeit',
    Coordinates: 'Koordinaten',
    'Copy IP': 'IP kopieren',
    'Resolving this site’s network…': 'Netzwerk dieser Seite wird ermittelt…',
  },
  fr: {
    'Server origin unavailable': 'Origine du serveur indisponible',
    'Server origin': 'Origine du serveur',
    'Origin unknown': 'Origine inconnue',
    'Look up again': 'Interroger à nouveau',
    'Server IP': 'IP du serveur',
    Unknown: 'Inconnu',
    Node: 'Nœud',
    'Their time': 'Leur heure',
    Coordinates: 'Coordonnées',
    'Copy IP': 'Copier l’IP',
    'Resolving this site’s network…': 'Résolution du réseau de ce site…',
  },
};
