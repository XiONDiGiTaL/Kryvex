/**
 * Copy for Vexium's own lookup status, shown while a search or page read runs.
 *
 * The model's answer is translated by the model; these five lines are Kryvex's,
 * so they are translated here like every other label. Turkish lives in
 * `i18n-tr.ts`.
 */
type VexiumLanguage = 'es' | 'de' | 'fr';

export const vexiumCopy: Record<VexiumLanguage, Record<string, string>> = {
  es: {
    'Looking that up: {query}': 'Buscando: {query}',
    'Reading that page…': 'Leyendo esa página…',
    'That lookup did not come back.': 'Esa búsqueda no devolvió resultados.',
    'Read {count} sources.': 'Leídas {count} fuentes.',
    'Page read.': 'Página leída.',
  },
  de: {
    'Looking that up: {query}': 'Suche: {query}',
    'Reading that page…': 'Seite wird gelesen…',
    'That lookup did not come back.': 'Diese Suche lieferte kein Ergebnis.',
    'Read {count} sources.': '{count} Quellen gelesen.',
    'Page read.': 'Seite gelesen.',
  },
  fr: {
    'Looking that up: {query}': 'Recherche : {query}',
    'Reading that page…': 'Lecture de la page…',
    'That lookup did not come back.': 'Cette recherche n’a rien renvoyé.',
    'Read {count} sources.': '{count} sources lues.',
    'Page read.': 'Page lue.',
  },
};
