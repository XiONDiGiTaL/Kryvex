/**
 * Spanish sweep: the historical backlog that predates the coverage ratchet.
 *
 * Keys are the English catalogue entries. A value identical to the key marks a
 * token that is not translated on purpose (product names, units, protocol
 * labels); everything else is real copy.
 */
export const sweepEs: Record<string, string> = {
  '! Your rules go here\n||ads.example.com^\nwww.youtube.com##ytd-ad-slot-renderer':
    '! Tus reglas van aquí\n||ads.example.com^\nwww.youtube.com##ytd-ad-slot-renderer',
  '250 ml': '250 ml',
  '8-BIT MODE': 'MODO 8 BITS',
  'A calmer home, built into the shell': 'Un inicio más tranquilo, integrado en el shell',
  'A checkpoint from the host did not fit this core. Ask for the cartridge again.':
    'Un punto de control del anfitrión no encajó en este núcleo. Pide el cartucho de nuevo.',
  'A local cartridge slot for files you already own. Nothing is uploaded, indexed or streamed, and Kryvex does not provide ROMs.':
    'Una ranura local para archivos que ya posees. Nada se sube, se indexa ni se transmite, y Kryvex no proporciona ROMs.',
  'A read-only analyzer with a guarded cleaner. Nothing leaves the machine, and system paths are never candidates.':
    'Un analizador de solo lectura con un limpiador protegido. Nada sale del equipo y las rutas del sistema nunca son candidatas.',
  'A transparent overlay only; it never touches the game output.':
    'Solo una capa transparente; nunca toca la salida del juego.',
  'A tunnel needs the OpenVPN TAP/TUN driver and, on Windows, usually administrator rights. Kryvex reports OpenVPN’s own output and stops the process when you disconnect or quit.':
    'Un túnel necesita el controlador TAP/TUN de OpenVPN y, en Windows, normalmente permisos de administrador. Kryvex muestra la salida de OpenVPN y detiene el proceso al desconectar o salir.',
  'ALWAYS ON TOP': 'SIEMPRE VISIBLE',
  AUDIO: 'AUDIO',
  Accent: 'Acento',
  'Accent 2': 'Acento 2',
  'Add task': 'Añadir tarea',
  'Adds an Activity button to the header and a detailed pop-up panel.':
    'Añade un botón de Actividad a la cabecera y un panel detallado.',
  'Already installed': 'Ya instalado',
  Analyze: 'Analizar',
  Architecture: 'Arquitectura',
  'Ask GitHub shortly after launch and every six hours. Downloads never start without you.':
    'Consulta GitHub poco después del arranque y cada seis horas. Las descargas nunca empiezan sin ti.',
  'Asking the host for the cartridge…': 'Pidiendo el cartucho al anfitrión…',
  'Atari 8-bit computers, Pokemon Mini, Arduboy, Dreamcast and Naomi have no EmulatorJS core here, so those formats are not offered.':
    'Los ordenadores Atari de 8 bits, Pokemon Mini, Arduboy, Dreamcast y Naomi no tienen núcleo de EmulatorJS aquí, así que esos formatos no se ofrecen.',
  'Audio and video pause while another view is open.':
    'El audio y el vídeo se pausan mientras otra vista está abierta.',
  'Audio and video pause while this view is hidden.':
    'El audio y el vídeo se pausan mientras esta vista está oculta.',
  'BIOS (OPTIONAL)': 'BIOS (OPCIONAL)',
  'BIOS file ready. Reload the game to use it.':
    'Archivo BIOS listo. Recarga el juego para usarlo.',
  BMI: 'IMC',
  'BOARD GUIDE': 'GUÍA DEL PANEL',
  BUILD: 'COMPILACIÓN',
  'BUILT IN · LOCAL FILES': 'INTEGRADO · ARCHIVOS LOCALES',
  'Before you clean anything': 'Antes de limpiar nada',
  'Before you load a cartridge': 'Antes de cargar un cartucho',
  BitTorrent: 'BitTorrent',
  'Board settings': 'Ajustes del panel',
  Browser: 'Navegador',
  CAPTURE: 'CAPTURA',
  CARTRIDGE: 'CARTUCHO',
  CAUTION: 'PRECAUCIÓN',
  CHROMIUM: 'CHROMIUM',
  'CLEANUP PLAN': 'PLAN DE LIMPIEZA',
  CODE: 'CÓDIGO',
  COMPOSITING: 'COMPOSICIÓN',
  'CORE ERROR': 'ERROR DEL NÚCLEO',
  CPU: 'CPU',
  'CPU, memory and GPU-process bars under your pinned services.':
    'Barras de CPU, memoria y proceso de GPU bajo tus servicios fijados.',
  'CRT scanlines': 'Líneas de exploración CRT',
  'Close options': 'Cerrar opciones',
  'Cartridge received. The host’s game is now your game.':
    'Cartucho recibido. El juego del anfitrión ahora es tu juego.',
  'Choose BIOS': 'Elegir BIOS',
  'Choose Home widgets': 'Elegir widgets de inicio',
  'Choose a BIOS file': 'Elegir un archivo BIOS',
  'Choose a ROM': 'Elegir una ROM',
  'Choose a console': 'Elegir una consola',
  'Choose a file from the cartridge slot. The emulator core is fetched from the official EmulatorJS CDN on first use.':
    'Elige un archivo en la ranura de cartucho. El núcleo del emulador se descarga del CDN oficial de EmulatorJS la primera vez.',
  'Choose executable': 'Elegir ejecutable',
  'Choose profile': 'Elegir perfil',
  'Chrome Web Store': 'Chrome Web Store',
  Chromium: 'Chromium',
  'City for weather': 'Ciudad para el tiempo',
  'City or town': 'Ciudad o pueblo',
  'Clean permanently': 'Limpiar definitivamente',
  'Clean {size}': 'Limpiar {size}',
  Cleaning: 'Limpiando',
  'Close private tabs': 'Cerrar pestañas privadas',
  'Closing Kryvex to install…': 'Cerrando Kryvex para instalar…',
  'Collapse media controls': 'Contraer controles multimedia',
  Color: 'Color',
  'Color {value}': 'Color {value}',
  'Conditions by Open-Meteo · only the place you choose leaves this device':
    'Datos de Open-Meteo · solo el lugar que eliges sale de este dispositivo',
  'Confirm killing {name}': '¿Confirmas cerrar {name}?',
  Connect: 'Conectar',
  'Connect on launch': 'Conectar al iniciar',
  'Connected to the host. Waiting for the cartridge…':
    'Conectado al anfitrión. Esperando el cartucho…',
  'Connecting…': 'Conectando…',
  Console: 'Consola',
  'Custom filter rules': 'Reglas de filtro personalizadas',
  'DNS servers': 'Servidores DNS',
  'DONKEY EDITION': 'EDICIÓN DONKEY',
  DOWNLOADS: 'DESCARGAS',
  DRIVE: 'UNIDAD',
  'Deletion bypasses the Recycle Bin. Files removed here cannot be restored from Kryvex.':
    'El borrado omite la Papelera de reciclaje. Los archivos eliminados aquí no se pueden restaurar desde Kryvex.',
  Desktop: 'Escritorio',
  'Desktop notifications are on for this service.':
    'Las notificaciones de escritorio están activas para este servicio.',
  Disconnect: 'Desconectar',
  'Disk pulse runs in the desktop app: the web build has no filesystem access.':
    'Disk Pulse se ejecuta en la app de escritorio: la versión web no tiene acceso al sistema de archivos.',
  'Disk pulse scans your drives locally and can permanently delete the cache and temporary files you select.':
    'Disk Pulse analiza tus unidades localmente y puede borrar definitivamente la caché y los archivos temporales que selecciones.',
  'Dock this module': 'Anclar este módulo',
  'Download the installer, then Kryvex verifies it against the release checksum.':
    'Descarga el instalador; Kryvex lo verifica con la suma de comprobación de la versión.',
  'Downloading Kryvex {version}…': 'Descargando Kryvex {version}…',
  Downloads: 'Descargas',
  'Drag this window': 'Arrastrar esta ventana',
  'Drag to move · arrows to nudge': 'Arrastra para mover · flechas para ajustar',
  'Drag to resize': 'Arrastra para redimensionar',
  'Drive usage pulse': 'Pulso de uso de la unidad',
  'Drive used': 'Unidad usada',
  'Drop a ROM here': 'Suelta una ROM aquí',
  'ELEMENT x529 / Kx': 'ELEMENTO x529 / Kx',
  'ELEMENT x529 · Kx': 'ELEMENTO x529 · Kx',
  'EMULATION SETTINGS': 'AJUSTES DE EMULACIÓN',
  ERROR: 'ERROR',
  'Emulator screen': 'Pantalla del emulador',
  'Enable the resource manager': 'Activar el gestor de recursos',
  'Enables the controls below. The tunnel only starts when you press Connect.':
    'Activa los controles de abajo. El túnel solo se inicia cuando pulsas Conectar.',
  'End link play': 'Terminar el juego enlazado',
  Error: 'Error',
  'Expand media controls': 'Expandir controles multimedia',
  Extensions: 'Extensiones',
  'Extra OpenVPN arguments': 'Argumentos adicionales de OpenVPN',
  'Extracted text': 'Texto extraído',
  FREE: 'LIBRE',
  'Feels {temp}': 'Sensación {temp}',
  'Flags that run another program are refused.':
    'Se rechazan los indicadores que ejecutan otro programa.',
  'Float this module': 'Flotar este módulo',
  'Float this module over the workspace': 'Flotar este módulo sobre el espacio de trabajo',
  'Force close': 'Forzar cierre',
  'Force close this service': 'Forzar el cierre de este servicio',
  'Freed {size}.': 'Liberados {size}.',
  'GPU PROCESS': 'PROCESO GPU',
  'GPU process': 'Proceso de GPU',
  Gamepad: 'Mando',
  'Google blocks sign-in in app-embedded browsers. Kryvex already reports one consistent Chrome identity, so if this card still appears the refusal is Google’s policy, not a missing setting. A stale Google session makes it worse: clearing it and signing in fresh often gets further.':
    'Google bloquea el inicio de sesión en navegadores integrados en apps. Kryvex ya presenta una identidad Chrome coherente, así que si esta tarjeta sigue apareciendo el rechazo es la política de Google, no un ajuste que falte. Una sesión de Google caducada lo empeora: borrarla y entrar de nuevo suele llegar más lejos.',
  'Got it': 'Entendido',
  Hardware: 'Hardware',
  'Hide resource manager': 'Ocultar el gestor de recursos',
  'Hide resources': 'Ocultar recursos',
  'Hide sticky notes': 'Ocultar notas',
  'Hide the resource manager': 'Ocultar el gestor de recursos',
  'Home board': 'Panel de inicio',
  'Home widgets': 'Widgets de inicio',
  'Host this cartridge': 'Alojar este cartucho',
  'LINK LIVE': 'ENLACE ACTIVO',
  'LINK · WAITING FOR HOST': 'ENLACE · ESPERANDO AL ANFITRIÓN',
  'Ask again': 'Volver a pedir',
  'No host answered. The other machine has to open this cartridge in its own emulator and press Host this cartridge.':
    'Nadie respondió. La otra máquina tiene que abrir este cartucho en su emulador y pulsar «Alojar este cartucho».',
  'Humidity {value}%': 'Humedad {value}%',
  'I understand': 'Entiendo',
  'INSERT CARTRIDGE': 'INSERTA UN CARTUCHO',
  'INSTALLED RAM': 'RAM INSTALADA',
  Imperial: 'Imperial',
  'Installed builds can replace themselves with a checksum-verified release installer. Portable builds download and verify the EXE, then ask you to run it. A git checkout is never modified.':
    'Las versiones instaladas pueden sustituirse con un instalador verificado por suma de comprobación. Las versiones portables descargan y verifican el EXE, y luego te piden ejecutarlo. Una copia de git nunca se modifica.',
  'It draws over your active theme with a translucent pane, so the workspace still looks like Kryvex rather than a page pasted on top of it.':
    'Se dibuja sobre tu tema activo con un panel translúcido, así que el espacio de trabajo sigue pareciendo Kryvex y no una página pegada encima.',
  'Join a room first: Rooms is the link between the two machines.':
    'Únete primero a una sala: Salas es el enlace entre las dos máquinas.',
  'Join as player 2': 'Unirse como jugador 2',
  'KRYVEX / PROCESS ACTIVITY': 'KRYVEX / ACTIVIDAD DE PROCESOS',
  'KRYVEX CPU': 'CPU DE KRYVEX',
  'KRYVEX MEMORY': 'MEMORIA DE KRYVEX',
  'KRYVEX START / ELEMENT x529': 'INICIO DE KRYVEX / ELEMENTO x529',
  'Keep running in the background': 'Seguir ejecutándose en segundo plano',
  'Keep {name} running': 'Mantener {name} en ejecución',
  Kill: 'Cerrar',
  'Kill {name}': 'Cerrar {name}',
  'Kill?': '¿Cerrar?',
  'Kryvex CPU': 'CPU de Kryvex',
  'Kryvex asks GitHub Releases for the newest published version. Only the public release feed is contacted.':
    'Kryvex consulta en GitHub Releases la última versión publicada. Solo se contacta con el canal público de versiones.',
  'Kryvex could not read a console header from this file, and the extension is used by more than one system. Pick the console this ROM belongs to and it will start that core.':
    'Kryvex no pudo leer una cabecera de consola en este archivo, y la extensión la usan varios sistemas. Elige la consola a la que pertenece esta ROM y se iniciará ese núcleo.',
  'Emulation by EmulatorJS, GPL-3.0, loaded from its official CDN and not bundled with Kryvex.':
    'Emulación por EmulatorJS, GPL-3.0, cargado desde su CDN oficial y no incluido en Kryvex.',
  'Source and licence': 'Código fuente y licencia',
  'Kryvex does not host, provide or link to ROMs, and does not promote piracy. Use only ROMs and BIOS files you are legally entitled to use.':
    'Kryvex no aloja, proporciona ni enlaza ROMs, y no promueve la piratería. Usa solo ROMs y archivos BIOS que tengas derecho legal a usar.',
  'Kryvex does not provide, host, link to or endorse ROMs, BIOS files or any copyrighted game data. The emulator only plays files you already have, and you are responsible for having the legal right to use them.':
    'Kryvex no proporciona, aloja, enlaza ni respalda ROMs, archivos BIOS ni datos de juegos con derechos de autor. El emulador solo reproduce archivos que ya tienes, y tú eres responsable de tener el derecho legal de usarlos.',
  'Kryvex memory': 'Memoria de Kryvex',
  'Kryvex {version} is ready to install.': 'Kryvex {version} está listo para instalarse.',
  LINK: 'ENLACE',
  'LINK PLAY': 'JUEGO ENLAZADO',
  LIVE: 'EN VIVO',
  'LOADING CORE…': 'CARGANDO NÚCLEO…',
  LOCAL: 'LOCAL',
  'LOW SPACE': 'POCO ESPACIO',
  Leechers: 'Leechers',
  Lexium: 'Lexium',
  'Lexium tools': 'Herramientas de Lexium',
  Licence: 'Licencia',
  'Link play ended.': 'Juego enlazado terminado.',
  'Links and junctions are never followed, files in use are skipped, and system categories that need elevation are not offered in this build.':
    'Los enlaces y uniones nunca se siguen, se omiten los archivos en uso y las categorías del sistema que requieren elevación no se ofrecen en esta compilación.',
  'Load Nintendo, Sega, Atari, PC Engine, WonderSwan, Neo Geo Pocket, Virtual Boy and PlayStation files you already own.':
    'Carga archivos de Nintendo, Sega, Atari, PC Engine, WonderSwan, Neo Geo Pocket, Virtual Boy y PlayStation que ya poseas.',
  'Load ROM': 'Cargar ROM',
  'Load a cartridge before hosting a link session.':
    'Carga un cartucho antes de alojar una sesión enlazada.',
  'Local conditions': 'Condiciones locales',
  MODULES: 'MÓDULOS',
  MUTED: 'SILENCIADO',
  Magnet: 'Imán',
  Main: 'Principal',
  'Map what fills the drive, read its health as a pulse, then clear caches and temp files behind a typed confirmation.':
    'Mapea lo que llena la unidad, lee su estado como un pulso y borra cachés y archivos temporales tras una confirmación escrita.',
  'Mark “{text}” done': 'Marcar «{text}» como hecha',
  'Mark “{text}” open': 'Marcar «{text}» como pendiente',
  Memory: 'Memoria',
  Microphone: 'Micrófono',
  'More settings': 'Más ajustes',
  'Move {name} down': 'Mover {name} hacia abajo',
  'Move {name} to the main column': 'Mover {name} a la columna principal',
  'Move {name} to the side column': 'Mover {name} a la columna lateral',
  'Move {name} up': 'Mover {name} hacia arriba',
  'Mute sound': 'Silenciar sonido',
  'Mute {name}': 'Silenciar {name}',
  'NEEDS ELEVATION': 'REQUIERE ELEVACIÓN',
  'NES · SNES · GB/GBC · GBA · Sega · Atari · PC Engine · WonderSwan · Neo Geo Pocket · Virtual Boy · PlayStation':
    'NES · SNES · GB/GBC · GBA · Sega · Atari · PC Engine · WonderSwan · Neo Geo Pocket · Virtual Boy · PlayStation',
  'NOT FOUND': 'NO ENCONTRADO',
  Name: 'Nombre',
  Network: 'Red',
  'New task': 'Nueva tarea',
  'No ROM loaded': 'Ninguna ROM cargada',
  'No answer from the server. Start it, check the address, and allow localhost requests if a browser blocks the connection. An HTTPS page cannot call a plain http:// server on your network, so use https:// or run the client locally.':
    'El servidor no responde. Inícialo, comprueba la dirección y permite las peticiones a localhost si el navegador bloquea la conexión. Una página HTTPS no puede llamar a un servidor http:// de tu red, así que usa https:// o ejecuta el cliente en local.',
  'No downloads · no catalogue · everything stays on this machine':
    'Sin descargas · sin catálogo · todo permanece en este equipo',
  'No launch switches: every Chromium default is in effect.':
    'Sin indicadores de arranque: se aplican todos los valores por defecto de Chromium.',
  'No room is open. Rooms is the link between the two machines.':
    'No hay ninguna sala abierta. Salas es el enlace entre las dos máquinas.',
  'No scan yet. Nothing is selected, and nothing can be cleaned before a scan.':
    'Aún no hay análisis. No hay nada seleccionado y nada puede limpiarse antes de un análisis.',
  'No service pages are open. Open a module to see its processes here.':
    'No hay páginas de servicio abiertas. Abre un módulo para ver sus procesos aquí.',
  'No tunnel is running.': 'No hay ningún túnel en marcha.',
  'Not chosen': 'Sin elegir',
  'Nothing is scanned, uploaded or cleaned until you press a button.':
    'No se analiza, sube ni limpia nada hasta que pulsas un botón.',
  'Nothing was removed.': 'No se eliminó nada.',
  Notifications: 'Notificaciones',
  'Notifications are hidden for this service.':
    'Las notificaciones están ocultas para este servicio.',
  'Notifications for {name}': 'Notificaciones de {name}',
  OFFLINE: 'DESCONECTADO',
  ONLINE: 'EN LÍNEA',
  OPTIONAL: 'OPCIONAL',
  'Only caches, temp files and diagnostics from the list below can be touched.':
    'Solo se pueden tocar las cachés, los archivos temporales y los diagnósticos de la lista.',
  'Only processes that belong to Kryvex are counted. GPU is Chromium’s GPU process; Windows does not expose total GPU utilisation to Electron.':
    'Solo se cuentan los procesos que pertenecen a Kryvex. GPU es el proceso de GPU de Chromium; Windows no expone a Electron el uso total de la GPU.',
  'Open Rooms': 'Abrir Salas',
  'Open the resource manager': 'Abrir el gestor de recursos',
  'OpenVPN executable': 'Ejecutable de OpenVPN',
  'OpenVPN is connecting…': 'OpenVPN está conectando…',
  'OpenVPN profile': 'Perfil de OpenVPN',
  'OpenVPN project': 'Proyecto OpenVPN',
  'Optional http, https or socks5 proxy used by OpenVPN.':
    'Proxy http, https o socks5 opcional usado por OpenVPN.',
  'Options for {name}': 'Opciones de {name}',
  'PARTITION {partition}': 'PARTICIÓN {partition}',
  'PAUSE WHEN HIDDEN': 'PAUSAR AL OCULTARSE',
  PROCESSES: 'PROCESOS',
  'Passed to OpenVPN as --dhcp-option DNS entries.':
    'Se pasa a OpenVPN como entradas --dhcp-option DNS.',
  Pause: 'Pausa',
  Peers: 'Pares',
  'Permanently remove these files?': '¿Eliminar estos archivos definitivamente?',
  'Pin a reminder for today. It stays on this machine.':
    'Fija un recordatorio para hoy. Se queda en este equipo.',
  'Player 1 · host': 'Jugador 1 · anfitrión',
  'Player 2': 'Jugador 2',
  'Player 2 · guest': 'Jugador 2 · invitado',
  'Playing in {name}': 'Reproduciendo en {name}',
  Playlist: 'Lista de reproducción',
  'Point Kryvex at your own OpenVPN executable and .ovpn profile, then start and stop the tunnel here. Kryvex bundles no VPN binary or driver and never reroutes traffic silently.':
    'Indica a Kryvex tu propio ejecutable de OpenVPN y perfil .ovpn, y luego inicia y detén el túnel aquí. Kryvex no incluye binarios ni controladores de VPN y nunca redirige el tráfico en silencio.',
  'Pop-up': 'Ventana emergente',
  'Press again to force-close this service': 'Pulsa otra vez para cerrar este servicio a la fuerza',
  Proc: 'Proc',
  'Process metrics are available in the desktop app.':
    'Las métricas de procesos están disponibles en la app de escritorio.',
  Proxy: 'Proxy',
  'READING THE DRIVE…': 'LEYENDO LA UNIDAD…',
  RESOURCES: 'RECURSOS',
  'RUN ANALYZE TO MAP THE DRIVE': 'EJECUTA ANALIZAR PARA MAPEAR LA UNIDAD',
  'RUNNING · {system}': 'EN MARCHA · {system}',
  Ratio: 'Ratio',
  'Reading process metrics…': 'Leyendo métricas de procesos…',
  Reconnect: 'Reconectar',
  'Refresh conditions': 'Actualizar condiciones',
  'Refresh weather': 'Actualizar el tiempo',
  'Reload the core': 'Recargar el núcleo',
  'Remove “{text}”': 'Eliminar «{text}»',
  'Removed {files} files ({size}). {skipped} were in use or protected.':
    'Se eliminaron {files} archivos ({size}). {skipped} estaban en uso o protegidos.',
  'Repeat is on': 'La repetición está activa',
  'Repeat this clip': 'Repetir este clip',
  'Resize this window': 'Redimensionar esta ventana',
  'Resource manager': 'Gestor de recursos',
  'Resource settings': 'Ajustes de recursos',
  'Resource usage': 'Uso de recursos',
  'Restart core': 'Reiniciar núcleo',
  Revision: 'Revisión',
  'Room chat': 'Chat de la sala',
  SAFE: 'SEGURO',
  'SECRET SERVICE / 8-BIT MODE': 'SERVICIO SECRETO / MODO 8 BITS',
  'SECRET SERVICE / IN-HOUSE · x530': 'SERVICIO SECRETO / PROPIO · x530',
  'SECRET SERVICE / IN-HOUSE · x531': 'SERVICIO SECRETO / PROPIO · x531',
  'SECRET SERVICE / x533': 'SERVICIO SECRETO / x533',
  'SHA-256': 'SHA-256',
  'SHARED CARTRIDGE FORMAT': 'FORMATO DE CARTUCHO COMPARTIDO',
  SHARING: 'COMPARTIENDO',
  STANDBY: 'EN ESPERA',
  START: 'INICIO',
  'STICKY NOTES': 'NOTAS',
  STREAM: 'TRANSMISIÓN',
  'STUN / TURN': 'STUN / TURN',
  Scan: 'Analizar',
  'Scan finished.': 'Análisis terminado.',
  'Scan stopped early.': 'El análisis se detuvo antes de terminar.',
  Scanning: 'Analizando',
  Screen: 'Pantalla',
  'Screen size': 'Tamaño de pantalla',
  'Screenshots, photos of signs, chat captures. Read on this device.':
    'Capturas, fotos de carteles, imágenes de chats. Se leen en este dispositivo.',
  'Search region': 'Región de búsqueda',
  'Search the web for “{query}”': 'Buscar en la web «{query}»',
  'Secret emulator': 'Emulador secreto',
  'Secret storage tool': 'Herramienta de almacenamiento secreta',
  Service: 'Servicio',
  Services: 'Servicios',
  'Session stays warm, like a desktop chat app.':
    'La sesión se mantiene caliente, como en una app de chat de escritorio.',
  'Set a city for local conditions': 'Elige una ciudad para las condiciones locales',
  'Show desktop notifications from this service.':
    'Mostrar notificaciones de escritorio de este servicio.',
  'Show sticky notes': 'Mostrar notas',
  'Show the Home board': 'Mostrar el panel de inicio',
  'Shows which service pages are using CPU and memory, plus the whole-app totals. Values come from Electron’s own process metrics, sampled only while the monitor is visible.':
    'Muestra qué páginas de servicio usan CPU y memoria, además de los totales de toda la app. Los valores vienen de las métricas de proceso de Electron, muestreadas solo mientras el monitor está visible.',
  Side: 'Lateral',
  'Silences this service without changing the site’s own setting.':
    'Silencia este servicio sin cambiar el ajuste del propio sitio.',
  'Sits over the theme with a translucent pane instead of replacing it.':
    'Se coloca sobre el tema con un panel translúcido en lugar de sustituirlo.',
  Software: 'Software',
  'PlayStation needs its own BIOS to start; some Game Boy Advance, Lynx and PC Engine titles need a firmware dump of their own.':
    'PlayStation necesita su propia BIOS para arrancar; algunos títulos de Game Boy Advance, Lynx y PC Engine necesitan su propio volcado de firmware.',
  'One disc image per slot: pack a .cue and .bin set into a .chd or a .pbp. Most titles need a PlayStation BIOS.':
    'Una imagen de disco por ranura: empaqueta un conjunto .cue y .bin en un .chd o un .pbp. La mayoría de los títulos necesitan una BIOS de PlayStation.',
  'That disc image is larger than 768 MB.': 'Esa imagen de disco supera los 768 MB.',
  'The N64 core takes a few seconds longer to start and needs more memory than the 8-bit cores.':
    'El núcleo de N64 tarda unos segundos más en arrancar y necesita más memoria que los núcleos de 8 bits.',
  'NES · SNES · N64 · GB/GBC · GBA · Sega · Atari · PC Engine · WonderSwan · Neo Geo Pocket · Virtual Boy · PlayStation':
    'NES · SNES · N64 · GB/GBC · GBA · Sega · Atari · PC Engine · WonderSwan · Neo Geo Pocket · Virtual Boy · PlayStation',
  'Sound, notifications and background behavior':
    'Sonido, notificaciones y comportamiento en segundo plano',
  Source: 'Fuente',
  'Special Donkey Edition': 'Edición especial Donkey',
  'Special XiØN Edition': 'Edición especial XiØN',
  'Sticky notes are local state, written to the same JSON file as everything else.':
    'Las notas son estado local, escrito en el mismo archivo JSON que todo lo demás.',
  'Stop scan': 'Detener análisis',
  Surface: 'Superficie',
  'Switch media source': 'Cambiar fuente multimedia',
  THEMES: 'TEMAS',
  'THIS APP ONLY': 'SOLO ESTA APP',
  TORRENTS: 'TORRENTS',
  TOTAL: 'TOTAL',
  'Temperature unit': 'Unidad de temperatura',
  Text: 'Texto',
  'Text found in the image appears here. You can edit it before translating.':
    'El texto encontrado en la imagen aparece aquí. Puedes editarlo antes de traducirlo.',
  'That BIOS file is larger than 8 MB.': 'Ese archivo BIOS supera los 8 MB.',
  'That city could not be found.': 'No se encontró esa ciudad.',
  'That download is larger than the updater allows.':
    'Esa descarga supera lo que permite el actualizador.',
  'The VPN action could not be completed.': 'No se pudo completar la acción de VPN.',
  'The VPN profile could not start automatically.':
    'El perfil de VPN no pudo iniciarse automáticamente.',
  'The VPN tunnel is up.': 'El túnel VPN está activo.',
  'The cartridge did not arrive complete. Ask the host to send it again.':
    'El cartucho no llegó completo. Pide al anfitrión que lo envíe de nuevo.',
  'The city itself is set on the weather card, where it can be checked.':
    'La ciudad se define en la tarjeta del tiempo, donde se puede comprobar.',
  'The cleanup stopped before it finished.': 'La limpieza se detuvo antes de terminar.',
  'The clock and greeting follow your system language and time.':
    'El reloj y el saludo siguen el idioma y la hora de tu sistema.',
  'The emulator could not start': 'El emulador no pudo iniciarse',
  'The file was verified. Portable builds cannot replace themselves, so close Kryvex and run the new EXE.':
    'El archivo se verificó. Las versiones portables no pueden sustituirse, así que cierra Kryvex y ejecuta el nuevo EXE.',
  'The first scan is the safest time to look: nothing is deleted by scanning.':
    'El primer análisis es el momento más seguro para mirar: analizar no borra nada.',
  'The global notification switch in Settings is off.':
    'El interruptor global de notificaciones en Ajustes está desactivado.',
  'The installer was verified. Kryvex closes, runs it, and you can reopen when it finishes.':
    'El instalador se verificó. Kryvex se cierra, lo ejecuta y puedes volver a abrirlo al terminar.',
  'The main process did not answer the drive check.':
    'El proceso principal no respondió a la comprobación de la unidad.',
  'The main process did not answer the scan.': 'El proceso principal no respondió al análisis.',
  'The number is the order. Arrows move a card in its column, and Main or Side moves it across.':
    'El número es el orden. Las flechas mueven una tarjeta en su columna, y Principal o Lateral la cambia de columna.',
  'The other player left the link.': 'El otro jugador dejó el enlace.',
  'The release data did not match the expected format.':
    'Los datos de la versión no coincidían con el formato esperado.',
  'The room closed, so the link ended.': 'La sala se cerró, así que el enlace terminó.',
  'The scan failed before it could finish.': 'El análisis falló antes de terminar.',
  'The verified installer is starting. Your services, tabs and settings stay in place.':
    'El instalador verificado está arrancando. Tus servicios, pestañas y ajustes se mantienen.',
  Theme: 'Tema',
  Themes: 'Temas',
  'This cannot be undone and the files do not go to the Recycle Bin. Programs rebuild caches on their next start, but a session that is open right now may need a refresh.':
    'Esto no se puede deshacer y los archivos no van a la Papelera de reciclaje. Los programas reconstruyen las cachés al volver a iniciarse, pero una sesión abierta ahora mismo puede necesitar un refresco.',
  'This checkout is updated with git. Packaged installers are on the release page.':
    'Esta copia se actualiza con git. Los instaladores empaquetados están en la página de versiones.',
  'This release has no installer for this build. Use the release page.':
    'Esta versión no tiene instalador para esta compilación. Usa la página de versiones.',
  'This service is muted.': 'Este servicio está silenciado.',
  'This usually takes a moment. Nothing is downloaded yet.':
    'Esto suele tardar un momento. Todavía no se ha descargado nada.',
  Trackers: 'Rastreadores',
  Transcript: 'Transcripción',
  'Two machines, one cartridge: the host sends the game, both seats play through the same room, and the host’s save state keeps the two cores together. Player 2 needs a controller; the host can use the keyboard.':
    'Dos máquinas, un cartucho: el anfitrión envía el juego, ambos puestos juegan a través de la misma sala y el estado guardado del anfitrión mantiene los dos núcleos sincronizados. El jugador 2 necesita un mando; el anfitrión puede usar el teclado.',
  'Type CLEAN to confirm': 'Escribe LIMPIAR para confirmar',
  URL: 'URL',
  USED: 'USADO',
  'Unknown module': 'Módulo desconocido',
  Update: 'Actualizar',
  'Usage bars in the sidebar': 'Barras de uso en la barra lateral',
  'Usage by service': 'Uso por servicio',
  'Use OpenVPN': 'Usar OpenVPN',
  'Use a connected controller. Remap buttons in the core’s own menu.':
    'Usa un mando conectado. Reasigna los botones en el menú del propio núcleo.',
  'Used when the address bar is not a URL. Choose a region to narrow the list.':
    'Se usa cuando la barra de direcciones no es una URL. Elige una región para acortar la lista.',
  'VEXIUM CORE': 'NÚCLEO VEXIUM',
  VIDEO: 'VÍDEO',
  'VPN OFF': 'VPN DESACTIVADA',
  'Vexium is running in built-in mode.': 'Vexium se ejecuta en modo integrado.',
  Volume: 'Volumen',
  'WHERE THE SPACE GOES': 'ADÓNDE VA EL ESPACIO',
  'Waiting for player 2. Share the room link from Rooms.':
    'Esperando al jugador 2. Comparte el enlace de la sala desde Salas.',
  'Weather is fetched by the main process from Open-Meteo with no key. Only the place you choose is sent: a city name on lookup, then its coordinates when the card refreshes. Tasks never leave this device.':
    'El proceso principal obtiene el tiempo de Open-Meteo sin clave. Solo se envía el lugar que eliges: el nombre de la ciudad al buscarla y luego sus coordenadas cuando la tarjeta se actualiza. Las tareas nunca salen de este dispositivo.',
  'Weather is keyless Open-Meteo data for the place you choose, cached for ten minutes.':
    'El tiempo son datos de Open-Meteo sin clave para el lugar que elijas, en caché durante diez minutos.',
  'Weather is unavailable right now.': 'El tiempo no está disponible ahora mismo.',
  'Weather is unreachable right now.': 'No se puede contactar con el tiempo ahora mismo.',
  Web: 'Web',
  Widgets: 'Widgets',
  'Widgets shows, hides and moves each card; the note button beside the heart opens sticky notes.':
    'Widgets muestra, oculta y mueve cada tarjeta; el botón de nota junto al corazón abre las notas.',
  'Wind {wind}': 'Viento {wind}',
  'Windows does not expose total GPU utilization to Electron, so the GPU figure is the Chromium GPU process’s CPU and memory rather than a device-wide percentage.':
    'Windows no expone a Electron el uso total de la GPU, así que la cifra de GPU es la CPU y la memoria del proceso de GPU de Chromium, no un porcentaje de todo el dispositivo.',
  'Windows, Program Files, ProgramData, your desktop, documents, downloads, pictures, videos, music and roaming app data are refused even if a rule asks for them.':
    'Windows, Program Files, ProgramData, tu escritorio, documentos, descargas, imágenes, vídeos, música y datos de aplicaciones roaming se rechazan aunque una regla los pida.',
  'YOU · SHARING': 'TÚ · COMPARTIENDO',
  YOUTUBE: 'YOUTUBE',
  You: 'Tú',
  'You can keep sourcing GGUF builds yourself: Hugging Face, Ollama’s library, LM Studio’s catalogue. Kryvex never uploads or redistributes them.':
    'Puedes seguir consiguiendo compilaciones GGUF por tu cuenta: Hugging Face, la biblioteca de Ollama, el catálogo de LM Studio. Kryvex nunca las sube ni las redistribuye.',
  Zoom: 'Zoom',
  modules: 'módulos',
  'or click to choose a file': 'o haz clic para elegir un archivo',
  unknown: 'desconocido',
  'x530 / LANGUAGE': 'x530 / IDIOMA',
  'x531 / MEDIA': 'x531 / MEDIOS',
  'x533 / STORAGE': 'x533 / ALMACENAMIENTO',
  '{count} FEEDS': '{count} FUENTES',
  '{count} MODULES': '{count} MÓDULOS',
  '{count} OPEN': '{count} ABIERTOS',
  '{count} SERVICES': '{count} SERVICIOS',
  '{count} SOURCES{errors}': '{count} FUENTES{errors}',
  '{count} TORRENTS': '{count} TORRENTS',
  '{count} threads': '{count} hilos',
  '{count} trackers': '{count} rastreadores',
  '{into} / {span} XP': '{into} / {span} XP',
  '{logged} / {goal} ml': '{logged} / {goal} ml',
  '{name} core': 'núcleo {name}',
  '{name} is a web page, not a media file, so it cannot feed this player. Open it in its own tab: the audio keeps playing there.':
    '{name} es una página web, no un archivo multimedia, así que no puede alimentar este reproductor. Ábrela en su propia pestaña: el audio sigue sonando allí.',
  '{name} is not running.': '{name} no se está ejecutando.',
  '{name} joined as player 2. Sending the cartridge…':
    '{name} se unió como jugador 2. Enviando el cartucho…',
  '{name} joined, but this cartridge is too large to send. Both players can load the same file instead.':
    '{name} se unió, pero este cartucho es demasiado grande para enviarlo. Ambos jugadores pueden cargar el mismo archivo.',
  '{name} loaded. The core starts on the canvas.':
    '{name} cargado. El núcleo se inicia en el lienzo.',
  '{name} options': 'Opciones de {name}',
  '{name} was force-closed.': '{name} se cerró a la fuerza.',
  '{percent}% FULL': '{percent}% LLENO',
  '{received} of {total} · the SHA-256 checksum is verified before install.':
    '{received} de {total} · la suma SHA-256 se verifica antes de instalar.',
  '{share}% of {total} RAM': '{share}% de {total} de RAM',
  '{size} across {count} categories': '{size} en {count} categorías',
  '{total} XP': '{total} XP',
  '{value} kcal': '{value} kcal',

  // Home widgets: quick capture, countdowns and the world clock, plus the
  // tool options panel.
  'A release, a deadline, an appointment: add the date and it counts down here.':
    'Un lanzamiento, una fecha límite, una cita: añade la fecha y la cuenta atrás aparece aquí.',
  'A task, a link, an idea…': 'Una tarea, un enlace, una idea…',
  'Add a time zone': 'Añadir una zona horaria',
  'Add a zone…': 'Añadir una zona…',
  'Add this zone': 'Añadir esta zona',
  'COUNTDOWNS': 'CUENTAS ATRÁS',
  'Capture it': 'Capturar',
  'Capture kind': 'Tipo de captura',
  'Capture something': 'Capturar algo',
  'Countdown date': 'Fecha de la cuenta atrás',
  'Countdown label': 'Nombre de la cuenta atrás',
  'Countdown time': 'Hora de la cuenta atrás',
  'Date': 'Fecha',
  'Draws the scanline treatment over the picture.':
    'Dibuja el efecto de líneas de exploración sobre la imagen.',
  'Forget “{text}”': 'Olvidar «{text}»',
  'Four zones is the limit': 'Cuatro zonas es el límite',
  'Inbox full. Clear a few first.': 'Bandeja llena. Borra algunas primero.',
  'Leave the time empty for a whole-day countdown.':
    'Deja la hora vacía para una cuenta atrás de día completo.',
  'Mute the module while Spotify labels an ad.': 'Silencia el módulo mientras Spotify marca un anuncio.',
  'No room left. Remove one first.': 'No queda espacio. Elimina una primero.',
  'Nothing waiting. Whatever you drop here stays on this machine.':
    'Nada en espera. Lo que dejes aquí se queda en esta máquina.',
  'Now': 'Ahora',
  'Plays the queue out of order instead of top to bottom.':
    'Reproduce la cola en desorden en lugar de principio a fin.',
  'QUICK CAPTURE': 'CAPTURA RÁPIDA',
  'Remove {zone}': 'Quitar {zone}',
  'SYSTEM': 'SISTEMA',
  'Settings for this tool': 'Ajustes de esta herramienta',
  'Settings for this tool live in its own window.':
    'Los ajustes de esta herramienta están en su propia ventana.',
  'Showing this device and UTC. Add up to four zones.':
    'Mostrando este dispositivo y UTC. Añade hasta cuatro zonas.',
  'Spotify ad guard': 'Filtro de anuncios de Spotify',
  'Time': 'Hora',
  'Uses a connected controller for the game that is loaded.':
    'Usa un mando conectado para el juego cargado.',
  'WORLD CLOCK': 'RELOJ MUNDIAL',
  'What is it for?': '¿Para qué es?',
  'in {count} days': 'en {count} días',
  'in {count} h': 'en {count} h',
  'in {count} min': 'en {count} min',
  '{count} OF 4': '{count} DE 4',
  '{count} QUEUED': '{count} EN COLA',
  '{count} TRACKED': '{count} EN SEGUIMIENTO',
  '{count} days ago': 'hace {count} días',
  '{count} h ago': 'hace {count} h',
  '{count} min ago': 'hace {count} min',
  '{name} is already pinned.': '{name} ya está fijado.',
  '{name} settings': 'Ajustes de {name}',
  'Task': 'Tarea',
  'Link': 'Enlace',
  'Idea': 'Idea',
  'Quick capture': 'Captura rápida',
  'Countdowns': 'Cuentas atrás',
  'World clock': 'Reloj mundial',
};
