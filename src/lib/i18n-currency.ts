/**
 * Copy for the currency card: the searchable picker, the source attribution and
 * the staleness warning. English is the source language, so a missing key falls
 * back to the English string rather than inventing a translation.
 */
export const currencyCopy: Record<'es' | 'de' | 'fr', Record<string, string>> = {
  es: {
    'Search a currency': 'Buscar una moneda',
    'No currency matches that.': 'Ninguna moneda coincide.',
    'Currency': 'Moneda',
    'The reference source does not quote {code}.':
      'La fuente de referencia no cotiza {code}.',
    'Rates are unavailable right now. Your last conversion is not shown, because it would be out of date.':
      'Los tipos de cambio no están disponibles ahora. No se muestra tu última conversión porque estaría desactualizada.',
    'QUOTED {date}': 'COTIZADO {date}',
    'Fetched {time}': 'Obtenido a las {time}',
    'ECB reference rate via Frankfurter. Banks, cards and cash exchanges add their own spread, so their rate will differ.':
      'Tipo de referencia del BCE vía Frankfurter. Los bancos, las tarjetas y las casas de cambio añaden su propio margen, así que su tipo será distinto.',
    'This quote is from {date}. It may be out of date.':
      'Esta cotización es del {date}. Puede estar desactualizada.',
    'This quote is {days} days old. It may be out of date.':
      'Esta cotización tiene {days} días. Puede estar desactualizada.',
  },
  de: {
    'Search a currency': 'Währung suchen',
    'No currency matches that.': 'Keine Währung passt dazu.',
    'Currency': 'Währung',
    'The reference source does not quote {code}.':
      'Die Referenzquelle notiert {code} nicht.',
    'Rates are unavailable right now. Your last conversion is not shown, because it would be out of date.':
      'Kurse sind derzeit nicht verfügbar. Die letzte Umrechnung wird nicht angezeigt, weil sie veraltet wäre.',
    'QUOTED {date}': 'NOTIERT {date}',
    'Fetched {time}': 'Abgerufen {time}',
    'ECB reference rate via Frankfurter. Banks, cards and cash exchanges add their own spread, so their rate will differ.':
      'EZB-Referenzkurs über Frankfurter. Banken, Karten und Wechselstuben schlagen eigene Margen auf, daher weicht ihr Kurs ab.',
    'This quote is from {date}. It may be out of date.':
      'Dieser Kurs ist vom {date}. Er kann veraltet sein.',
    'This quote is {days} days old. It may be out of date.':
      'Dieser Kurs ist {days} Tage alt. Er kann veraltet sein.',
  },
  fr: {
    'Search a currency': 'Rechercher une devise',
    'No currency matches that.': 'Aucune devise ne correspond.',
    'Currency': 'Devise',
    'The reference source does not quote {code}.':
      'La source de référence ne cote pas {code}.',
    'Rates are unavailable right now. Your last conversion is not shown, because it would be out of date.':
      'Les taux ne sont pas disponibles pour l’instant. Votre dernière conversion n’est pas affichée, car elle serait périmée.',
    'QUOTED {date}': 'COTÉ {date}',
    'Fetched {time}': 'Récupéré à {time}',
    'ECB reference rate via Frankfurter. Banks, cards and cash exchanges add their own spread, so their rate will differ.':
      'Taux de référence de la BCE via Frankfurter. Les banques, les cartes et les bureaux de change ajoutent leur marge : leur taux sera différent.',
    'This quote is from {date}. It may be out of date.':
      'Cette cotation date du {date}. Elle peut être périmée.',
    'This quote is {days} days old. It may be out of date.':
      'Cette cotation a {days} jours. Elle peut être périmée.',
  },
};
