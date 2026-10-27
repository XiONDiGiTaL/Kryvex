/**
 * Copy for the screen capture card's area picker.
 *
 * Two ideas need wording here: a capture can take the whole target or a dragged
 * area, and the area is drawn on a frozen frame before anything is written.
 * English stays the source; this module keeps the other three locales in step.
 */
export const captureCopy: Record<'es' | 'de' | 'fr', Record<string, string>> = {
  es: {
    'How much to capture': 'Cuánto capturar',
    'Whole target': 'Todo el objetivo',
    'An area': 'Un área',
    'The next capture asks you to drag the area.':
      'La próxima captura te pedirá que arrastres el área.',
    'Area {size} — every capture takes this part.': 'Área {size}: cada captura toma esta parte.',
    'Choose another area': 'Elegir otra área',
    'That area no longer fits the target, so the whole target was captured.':
      'Esa área ya no cabe en el objetivo, así que se capturó todo el objetivo.',
    'Choose the area to capture': 'Elige el área que quieres capturar',
    'The target, frozen for selection': 'El objetivo, congelado para seleccionar',
    'Drag across the part you want to capture, then confirm.':
      'Arrastra sobre la parte que quieras capturar y confirma.',
    'The area is too small. Drag a larger box.':
      'El área es demasiado pequeña. Arrastra un recuadro más grande.',
    '{size} selected.': '{size} seleccionado.',
    'Capture this area': 'Capturar esta área',
    'Record this area': 'Grabar esta área',
  },
  de: {
    'How much to capture': 'Wie viel aufnehmen',
    'Whole target': 'Ganzes Ziel',
    'An area': 'Ein Bereich',
    'The next capture asks you to drag the area.':
      'Die nächste Aufnahme fordert dich auf, den Bereich aufzuziehen.',
    'Area {size} — every capture takes this part.': 'Bereich {size} — jede Aufnahme nimmt diesen Teil.',
    'Choose another area': 'Anderen Bereich wählen',
    'That area no longer fits the target, so the whole target was captured.':
      'Dieser Bereich passt nicht mehr ins Ziel, deshalb wurde das ganze Ziel aufgenommen.',
    'Choose the area to capture': 'Bereich zum Aufnehmen wählen',
    'The target, frozen for selection': 'Das Ziel, für die Auswahl eingefroren',
    'Drag across the part you want to capture, then confirm.':
      'Zieh über den Teil, den du aufnehmen willst, und bestätige.',
    'The area is too small. Drag a larger box.':
      'Der Bereich ist zu klein. Zieh ein größeres Rechteck auf.',
    '{size} selected.': '{size} ausgewählt.',
    'Capture this area': 'Diesen Bereich aufnehmen',
    'Record this area': 'Diesen Bereich aufzeichnen',
  },
  fr: {
    'How much to capture': 'Quelle portion capturer',
    'Whole target': 'Toute la cible',
    'An area': 'Une zone',
    'The next capture asks you to drag the area.':
      'La prochaine capture vous demandera de tracer la zone.',
    'Area {size} — every capture takes this part.': 'Zone {size} — chaque capture prend cette partie.',
    'Choose another area': 'Choisir une autre zone',
    'That area no longer fits the target, so the whole target was captured.':
      'Cette zone ne tient plus dans la cible : c’est toute la cible qui a été capturée.',
    'Choose the area to capture': 'Choisir la zone à capturer',
    'The target, frozen for selection': 'La cible, figée pour la sélection',
    'Drag across the part you want to capture, then confirm.':
      'Tracez la partie à capturer, puis confirmez.',
    'The area is too small. Drag a larger box.': 'La zone est trop petite. Tracez un rectangle plus grand.',
    '{size} selected.': '{size} sélectionné.',
    'Capture this area': 'Capturer cette zone',
    'Record this area': 'Enregistrer cette zone',
  },
};
