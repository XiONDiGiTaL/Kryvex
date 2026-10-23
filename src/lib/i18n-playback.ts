/**
 * Service playback copy for the opt-in Spotify ad guard. English is the source
 * language; the keys are the exact strings used in Settings, so a missing
 * translation falls back rather than inventing text.
 */
export const playbackCopy: Record<'es' | 'de' | 'fr', Record<string, string>> = {
  es: {
    'Service playback': 'Reproducción de servicios',
    GUARDED: 'PROTEGIDO',
    'Mute Spotify ads and try to skip them': 'Silenciar los anuncios de Spotify e intentar saltarlos',
    'Volume and looping in the media dock apply to any module. This optional guard is narrower: it only watches Spotify’s own player.':
      'El volumen y la repetición del dock de medios se aplican a cualquier módulo. Este guardián opcional es más limitado: solo vigila el reproductor de Spotify.',
    'Local only. The module is muted while Spotify labels an ad, including podcast breaks. Kryvex uses the page’s own Skip ad control, or Next for a track ad, and never advances past an episode; unskippable ads still play.':
      'Solo local. El módulo se silencia mientras Spotify marca un anuncio, incluidos los cortes publicitarios de pódcasts. Kryvex usa el control Saltar anuncio de la página, o Siguiente en un anuncio de canción, y nunca avanza más allá del episodio; los anuncios no saltables siguen sonando.',
    'No account, cookie or request is changed, and ad audio is not downloaded or blocked: the module is simply quiet and the player is asked to move on. Detection depends on Spotify’s labels, so an unlabelled ad, such as a host-read segment inside a podcast, is left alone. Shield handles network-level rules separately.':
      'No se modifica ninguna cuenta, cookie ni solicitud, y el audio del anuncio no se descarga ni se bloquea: el módulo simplemente queda en silencio y se pide al reproductor que avance. La detección depende de las etiquetas de Spotify, así que un anuncio sin etiquetar, como un segmento leído por el presentador dentro de un pódcast, no se toca. Shield gestiona las reglas de red por separado.',
  },
  de: {
    'Service playback': 'Wiedergabe in Diensten',
    GUARDED: 'GESCHÜTZT',
    'Mute Spotify ads and try to skip them': 'Spotify-Werbung stummschalten und überspringen versuchen',
    'Volume and looping in the media dock apply to any module. This optional guard is narrower: it only watches Spotify’s own player.':
      'Lautstärke und Wiederholung im Medien-Dock gelten für jedes Modul. Dieser optionale Wächter ist enger: Er beobachtet nur Spotifys eigenen Player.',
    'Local only. The module is muted while Spotify labels an ad, including podcast breaks. Kryvex uses the page’s own Skip ad control, or Next for a track ad, and never advances past an episode; unskippable ads still play.':
      'Nur lokal. Das Modul wird stummgeschaltet, solange Spotify eine Anzeige kennzeichnet, auch bei Werbeunterbrechungen in Podcasts. Kryvex nutzt die Schaltfläche Anzeige überspringen der Seite oder Weiter bei einer Titelanzeige und springt nie über die Folge hinaus; nicht überspringbare Anzeigen laufen weiter.',
    'No account, cookie or request is changed, and ad audio is not downloaded or blocked: the module is simply quiet and the player is asked to move on. Detection depends on Spotify’s labels, so an unlabelled ad, such as a host-read segment inside a podcast, is left alone. Shield handles network-level rules separately.':
      'Es werden weder Konto, Cookie noch Anfrage geändert, und die Werbe-Audiodaten werden weder geladen noch blockiert: Das Modul ist einfach leise und der Player wird gebeten, weiterzugehen. Die Erkennung hängt von Spotifys Beschriftungen ab, daher bleibt eine unbeschriftete Anzeige, etwa ein vom Moderator gelesener Abschnitt in einem Podcast, unberührt. Shield regelt Netzwerkregeln separat.',
  },
  fr: {
    'Service playback': 'Lecture des services',
    GUARDED: 'PROTÉGÉ',
    'Mute Spotify ads and try to skip them': 'Couper le son des pubs Spotify et tenter de les passer',
    'Volume and looping in the media dock apply to any module. This optional guard is narrower: it only watches Spotify’s own player.':
      'Le volume et la répétition du dock média s’appliquent à tous les modules. Ce garde optionnel est plus étroit : il ne surveille que le lecteur de Spotify.',
    'Local only. The module is muted while Spotify labels an ad, including podcast breaks. Kryvex uses the page’s own Skip ad control, or Next for a track ad, and never advances past an episode; unskippable ads still play.':
      'Local uniquement. Le module est coupé pendant que Spotify signale une pub, y compris les coupures publicitaires d’un podcast. Kryvex utilise le bouton Ignorer la pub de la page, ou Suivant pour une pub de morceau, et ne dépasse jamais l’épisode ; les pubs non passables continuent.',
    'No account, cookie or request is changed, and ad audio is not downloaded or blocked: the module is simply quiet and the player is asked to move on. Detection depends on Spotify’s labels, so an unlabelled ad, such as a host-read segment inside a podcast, is left alone. Shield handles network-level rules separately.':
      'Aucun compte, cookie ou requête n’est modifié, et l’audio de la pub n’est ni téléchargé ni bloqué : le module est simplement silencieux et le lecteur est invité à avancer. La détection dépend des libellés de Spotify, donc une pub non étiquetée, comme un passage lu par l’animateur dans un podcast, reste intacte. Shield gère les règles réseau séparément.',
  },
};
