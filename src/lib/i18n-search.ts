/**
 * Copy for the palette's own rows.
 *
 * The palette is the one surface where every row has to say, in a word, what
 * Enter will do with it: a command opens a view, a bookmark opens a tab, a
 * download shows a file, a past query searches again. That verb is only useful
 * if it is in the reader's language, so the words live here with the rest of
 * the feature copy rather than as English literals.
 */
export const searchCopy = {
  es: {
    'Recent searches': 'Búsquedas recientes',
    'Recent search': 'Búsqueda reciente',
    'Searches again': 'Busca de nuevo',
    'Opens the view': 'Abre la vista',
    'Runs the action': 'Ejecuta la acción',
    'Opens the module': 'Abre el módulo',
    'Switches the theme': 'Cambia el tema',
    'Opens in Browser': 'Abre en el navegador',
    'Shows the file': 'Muestra el archivo',
  },
  de: {
    'Recent searches': 'Letzte Suchen',
    'Recent search': 'Letzte Suche',
    'Searches again': 'Sucht erneut',
    'Opens the view': 'Öffnet die Ansicht',
    'Runs the action': 'Führt die Aktion aus',
    'Opens the module': 'Öffnet das Modul',
    'Switches the theme': 'Wechselt das Theme',
    'Opens in Browser': 'Öffnet im Browser',
    'Shows the file': 'Zeigt die Datei',
  },
  fr: {
    'Recent searches': 'Recherches récentes',
    'Recent search': 'Recherche récente',
    'Searches again': 'Relance la recherche',
    'Opens the view': 'Ouvre la vue',
    'Runs the action': 'Lance l’action',
    'Opens the module': 'Ouvre le module',
    'Switches the theme': 'Change le thème',
    'Opens in Browser': 'Ouvre dans le navigateur',
    'Shows the file': 'Affiche le fichier',
  },
  tr: {
    'Recent searches': 'Son aramalar',
    'Recent search': 'Son arama',
    'Searches again': 'Yeniden arar',
    'Opens the view': 'Görünümü açar',
    'Runs the action': 'Eylemi çalıştırır',
    'Opens the module': 'Modülü açar',
    'Switches the theme': 'Temayı değiştirir',
    'Opens in Browser': 'Tarayıcıda açar',
    'Shows the file': 'Dosyayı gösterir',
  },
} as const;
