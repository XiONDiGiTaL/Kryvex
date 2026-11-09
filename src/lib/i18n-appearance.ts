/**
 * Per-service appearance copy.
 *
 * Kept out of `i18n.tsx` for the same reason the other feature catalogues are:
 * the strings ship together and merge last, so a new key is written once.
 */
export const appearanceCopy: Record<'es' | 'de' | 'fr' | 'tr', Record<string, string>> = {
  es: {
    Appearance: 'Aspecto',
    'CSS only: recolours this service and never runs a script in its page.':
      'Solo CSS: recolorea este servicio y nunca ejecuta un script en su página.',
    'Appearance for {name}': 'Aspecto de {name}',
    'Site colours': 'Colores del sitio',
    'Follow the app theme': 'Seguir el tema de la app',
    'Kryvex Graphite': 'Kryvex Grafito',
    Arcade: 'Recreativa',
  },
  de: {
    Appearance: 'Aussehen',
    'CSS only: recolours this service and never runs a script in its page.':
      'Nur CSS: färbt diesen Dienst ein und führt niemals ein Skript in seiner Seite aus.',
    'Appearance for {name}': 'Aussehen von {name}',
    'Site colours': 'Farben der Website',
    'Follow the app theme': 'App-Theme folgen',
    'Kryvex Graphite': 'Kryvex Graphit',
    Arcade: 'Spielhalle',
  },
  fr: {
    Appearance: 'Apparence',
    'CSS only: recolours this service and never runs a script in its page.':
      'CSS uniquement : recolore ce service et n’exécute jamais de script dans sa page.',
    'Appearance for {name}': 'Apparence de {name}',
    'Site colours': 'Couleurs du site',
    'Follow the app theme': 'Suivre le thème de l’app',
    'Kryvex Graphite': 'Graphite Kryvex',
    Arcade: 'Borne d’arcade',
  },
  tr: {
    Appearance: 'Görünüm',
    'CSS only: recolours this service and never runs a script in its page.':
      'Yalnızca CSS: bu hizmeti renklendirir ve sayfasında asla script çalıştırmaz.',
    'Appearance for {name}': '{name} görünümü',
    'Site colours': 'Site renkleri',
    'Follow the app theme': 'Uygulama temasını izle',
    'Kryvex Graphite': 'Kryvex Grafit',
    Arcade: 'Atari salonu',
  },
};
