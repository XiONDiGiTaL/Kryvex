/**
 * Copy for the speech engine Windows already ships.
 *
 * Two things had to be said in words rather than left to a number: this engine
 * is language-specific, so a recording in a language it does not have is
 * refused instead of answered in another language, and a dictation result is
 * only as good as the engine's confidence in it. English is the source; this
 * module keeps the other three locales in step, with Turkish in `i18n-tr.ts`.
 */
export const lexiumDictationCopy: Record<'es' | 'de' | 'fr', Record<string, string>> = {
  es: {
    'This PC has a dictation engine for {installed} only, so it cannot hear {language}. Add that language with speech in Windows settings, or use a Whisper server, which handles it far better.':
      'Este equipo solo tiene un motor de dictado para {installed}, así que no puede entender {language}. Añade ese idioma con voz en la configuración de Windows o usa un servidor Whisper, que lo hace mucho mejor.',
    'no language': 'ningún idioma',
    'this language': 'este idioma',
    'The engine was not confident about these words. For accents, music, singing or several speakers a Whisper server is far more accurate.':
      'El motor no estaba seguro de estas palabras. Para acentos, música, canciones o varias personas, un servidor Whisper es mucho más preciso.',
    'Dictated on this PC by the speech engine Windows ships. Clear speech only: a Whisper server is far more accurate for accents, music and several speakers.':
      'Dictado en este equipo por el motor de voz incluido en Windows. Solo para voz clara: un servidor Whisper es mucho más preciso para acentos, música y varias personas.',
  },
  de: {
    'This PC has a dictation engine for {installed} only, so it cannot hear {language}. Add that language with speech in Windows settings, or use a Whisper server, which handles it far better.':
      'Dieser PC hat nur ein Diktier-Engine für {installed} und kann {language} deshalb nicht hören. Füge diese Sprache mit Spracherkennung in den Windows-Einstellungen hinzu oder nutze einen Whisper-Server, der das deutlich besser kann.',
    'no language': 'keine Sprache',
    'this language': 'diese Sprache',
    'The engine was not confident about these words. For accents, music, singing or several speakers a Whisper server is far more accurate.':
      'Die Engine war sich dieser Wörter nicht sicher. Für Akzente, Musik, Gesang oder mehrere Sprecher ist ein Whisper-Server deutlich genauer.',
    'Dictated on this PC by the speech engine Windows ships. Clear speech only: a Whisper server is far more accurate for accents, music and several speakers.':
      'Auf diesem PC diktiert vom Spracherkennungsmodul von Windows. Nur für klare Sprache: Für Akzente, Musik und mehrere Sprecher ist ein Whisper-Server deutlich genauer.',
  },
  fr: {
    'This PC has a dictation engine for {installed} only, so it cannot hear {language}. Add that language with speech in Windows settings, or use a Whisper server, which handles it far better.':
      'Ce PC ne dispose d’un moteur de dictée que pour {installed} : il ne peut donc pas entendre {language}. Ajoutez cette langue avec la reconnaissance vocale dans les paramètres Windows, ou utilisez un serveur Whisper, bien plus performant.',
    'no language': 'aucune langue',
    'this language': 'cette langue',
    'The engine was not confident about these words. For accents, music, singing or several speakers a Whisper server is far more accurate.':
      'Le moteur n’était pas sûr de ces mots. Pour les accents, la musique, le chant ou plusieurs personnes, un serveur Whisper est bien plus précis.',
    'Dictated on this PC by the speech engine Windows ships. Clear speech only: a Whisper server is far more accurate for accents, music and several speakers.':
      'Dicté sur ce PC par le moteur vocal fourni avec Windows. Uniquement pour une parole claire : un serveur Whisper est bien plus précis pour les accents, la musique et plusieurs personnes.',
  },
};
