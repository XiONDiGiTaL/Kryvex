import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { languageLabel, makeI18n, normalizeLanguage } from '../src/lib/i18n';

/**
 * Translation coverage.
 *
 * English is the catalogue key, so a missing translation silently renders the
 * English string. This walks the renderer sources, collects every literal passed
 * to `t(...)`, and counts the ones a language does not translate.
 *
 * Kryvex has a historical backlog here (the app predates this audit), so the
 * assertion is a ratchet: the count may fall but never rise. Adding an English
 * string without its translations fails this test, which keeps the backlog from
 * growing while it is worked off. Current numbers live in docs/I18N.md.
 */

const ROOT = new URL('../src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === 'plugins') continue;
      out.push(...files(path));
      continue;
    }
    if (/\.(tsx?|jsx?)$/.test(name)) out.push(path);
  }
  return out;
}

/** Every `t('literal')` / `t("literal")` in the renderer, unescaped. */
export function translatedKeys(source: string): string[] {
  const keys = new Set<string>();
  // `[^]` matches any character, so a quote inside the string does not end the
  // match early; the backreference keeps the closing quote of the same kind.
  const pattern = /\bt\(\s*(['"])((?:\\.|(?!\1)[^])*)\1/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const key = (match[2] ?? '')
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
    if (key.length > 0) keys.add(key);
  }
  return [...keys];
}

const sources = files(ROOT).map(path => readFileSync(path, 'utf8'));
const keys = [...new Set(sources.flatMap(translatedKeys))].sort();

/**
 * Measured after the 0.9.x sweep. Only lower these numbers.
 *
 * What remains is deliberately not translated: product and protocol tokens
 * (`SHA-256`, `STUN / TURN`, `VEXIUM CORE`), units (`250 ml`, `kcal`), names
 * (`YOUTUBE`, `Lexium`), and words that are already correct in the target
 * language (`Color` in Spanish, `Browser` in German). `docs/I18N.md` keeps the
 * list and the reasoning.
 */
const BACKLOG: Record<'es' | 'de' | 'fr', number> = { es: 41, de: 68, fr: 56 };

const ADDED = [
  'VISUALIZER',
  'Visualizer',
  'Visualizer level',
  'Loading the video…',
  'Open it there',
  'That video is private or no longer available.',
  'Live streams are not supported in this player.',
  'Spotify does not publish a preview for this track. Open the full track in Spotify.',
  'Could not reach the playlist. Check the link and your connection.',
  'SPOTIFY PREVIEW',
  'SPOTIFY · NO PREVIEW',
  'Typography',
  'Text size',
  'Text style',
  'Share stopped.',
  'Mute shared audio',
  'Unmute shared audio',
  'Play it here',
  'Shared stream volume',
  'Stream size',
  'Fullscreen',
  'Pop out',
  'CHAT OVERLAY',
  'Overlay opacity',
  'Show chat',
  'TODAY',
  'YESTERDAY',
  'Waiting for a share…',
  'REMOTE CONTROL',
  'Ask to control',
  'Give control back',
  'Allow',
  'Take control back',
  '{name} is asking to control this share.',
  '{name} can control this share.',
  'You have control. Click the stream, then use the mouse and keyboard.',
  'Waiting for the host to allow control…',
  'Viewing is not controlling. Ask the host before your input is sent.',
  'A viewer can ask to control this app. Nothing is granted until you allow it.',
  'Nothing answered at {url}. Start the transcription server, check its port, and make sure it is listening on 127.0.0.1 rather than only inside a container.',
  '{count} BUILT IN',
  'Enable secret services',
  'Secret services enabled.',
  'Not now',
  'Secret services are the tools built into Kryvex that run on this machine: Lexium, the media player, the emulator, Disk pulse and Kyvex Link. They need no account and no server, and their files stay local.',
  'Kyvex Link is listening. Open its page on the phone.',
  'Kyvex Link stopped listening.',
  'x534 / LINK',
  'The phone companion is served by the desktop app. Open Kryvex on this computer to pair a phone.',
  'Pair a phone with this computer over your own network: clipboard both ways, files both ways, and a remote for the player. Nothing is uploaded to a service.',
  'Stop the link',
  'Start the link',
  'PAIRING CODE',
  'Type this on the phone when the page asks. It lasts {seconds} seconds.',
  'Start the link to get a code.',
  'New code issued.',
  'New code',
  'Listening on port {port}',
  'Off',
  'OPEN THIS ON THE PHONE',
  'Copy {value}',
  'Start the link to see this machine’s addresses.',
  'Open the address above in the phone’s browser.',
  'Type the pairing code.',
  'Add the page to the home screen for an icon.',
  'PAIRED PHONES',
  'No phone is paired yet.',
  'seen {ago} ago',
  'Unpair',
  '{name} was unpaired.',
  'Unpair all',
  'Every phone was unpaired.',
  'Kyvex Link is live',
  'The phone relay works.',
  'Test the phone relay',
  'FILES FROM THE PHONE',
  'Received files land in {folder}.',
  'Nothing has arrived yet.',
  'Show in folder',
  'Show {name} in its folder',
  '{name} was removed.',
  'The received list was cleared.',
  'Clear the list',
  'FILES FOR THE PHONE',
  'Offer a file here, then download it from the phone’s Files tab. It is served on this network only.',
  'Nothing is offered yet.',
  'Offer a file',
  'The page is only served on this machine’s private addresses and every request from outside them is refused. A phone gets access by entering the six-digit code once; you can unpair it here at any time.',
  'Pair a phone over your own network for clipboard, files and a remote; nothing leaves the two devices.',
  'Check speech engine',
  'No setup: {name}',
  'Use this PC',
  'In use',
  'Windows already has a speech engine. It needs no download and no server, and it is best on clear speech: for accents, music or several speakers a Whisper server below is far more accurate.',
  'Vexium Core is a text model, so it cannot hear audio. Transcription needs a speech model: use the one this PC has, or start a server of your own.',
  'The speech engine on this PC is ready.',
  'This PC is listening ({languages}).',
  'The words are read on this PC by the speech engine Windows already has. Nothing is uploaded and Vexium Core is not involved: it answers text, it cannot hear audio.',
  'This build cannot run the PC speech engine. Use the desktop app, or start a server below.',
  'This PC has no speech recogniser installed. Add a language with speech in Windows settings, or start a server below.',
  'The speech engine on this PC could not be started. Start a server below instead.',
  'The speech engine did not hear any words in that file.',
  'Transcribing on this PC from now on.',
  'The server answered {status}: {detail}',
  'The health check could not run.',
  'Search a currency',
  'The reference source does not quote {code}.',
  'Keep running, muted',
  'Save states',
  'Quick save',
  'Quick load',
  'Host this cartridge',
  'Join as player 2',
  'End link play',
  'Link play ended.',
  'Float this module',
  'Dock this module',
  'Drag this window',
  'Drag to resize',
  'Player 1 · host',
  'Player 2 · guest',
  'No room is open. Rooms is the link between the two machines.',
  'Vexium Core is not installed.',
  'Kryvex downloads its own model once ({size}, checksum verified) from the Vexium Core release page, then runs it on this machine. Nothing is uploaded and no account is needed.',
  // 0.9.5: a world clock of cities, and the screen capture tool that replaced
  // the quick-capture text inbox.
  'That city could not be found.',
  'WORLD CLOCK',
  'That place has no time zone on record.',
  'The lookup is unreachable right now.',
  'Four places is the limit. Remove one first.',
  'Four places is the limit. Remove one to add another.',
  '{city} is on the clock.',
  'Use 24-hour time',
  'Use 12-hour time',
  'Remove {city}',
  'Showing this device and UTC. Add a city to list it by name.',
  'City, like Izmir',
  'Search a city for the clock',
  'Looking…',
  'Find',
  'Add city',
  'Screen capture',
  'SCREEN CAPTURE',
  'REC {time}',
  'UP TO 3:00',
  'Capture a service or this window, then choose where to save it. Recordings stop themselves after three minutes.',
  'What to capture',
  'Choose a target…',
  'Windows',
  'Screens',
  'The browser asks which screen or window to share, then downloads the file.',
  'Refresh the targets',
  'Capture still',
  'Stop recording',
  'Record',
  'Capture preview',
  'Recording preview',
  'Saving…',
  'Save as…',
  'Download',
  'Discard',
  'RECENT',
  'Forget {name}',
  'Forget this capture',
  'That target could not be captured. Choose another and try again.',
  'That target could not be recorded. Choose another and try again.',
  'The recording was empty. Try a longer clip.',
  'The capture could not be saved.',
  'The capture was empty or too large to write.',
  'Saved to {path}',
  'Downloaded {name}.',
  'Copied to the clipboard.',
  'The clipboard refused the image.',
  'screen',
  'capture',
  'window',
  'Likely your network',
  'Virtual adapter: a phone usually cannot reach this one',
  'Can’t connect from the phone?',
  'Both devices must be on the same Wi-Fi or Ethernet network, and Kryvex must be allowed through the firewall on private networks. VPN and virtual adapters cannot reach the phone, so use the address marked as your network.',
  'Capture the screen, a service or a window',
  'Clock style',
  'Time format',
  'Rooms is open in a window.',
  'The room keeps running there while you use the rest of Kryvex.',
  'Bring it back',
  'Kryvex view',
  'Home sections',
  'Show the clock',
  'Bare',
  'Card',
  'Clock radio',
  'Colour',
  'Font',
  'Clock font',
  'Muted',
  // The clock's size, placement and two more looks.
  'Add a city to the world clock',
  'Please enter a city',
  'Close the city search',
  'Size',
  'Clock size',
  'Fit',
  'Alignment',
  'Left',
  'Centre',
  'Right',
  'Outline',
  'Classic',
  'Window animation',
  'Subtle',
  'Bouncy',
  'None',
  'Animation speed',
  // Placing a service on the canvas: installed services are framed without
  // being added again, and a second copy of a site is a deliberate switch.
  'INSTALLED SERVICES',
  '{count} READY',
  'Open one of these in a window, or add something new below.',
  'Allow more than one instance of this site',
  'A second instance keeps its own session, so two copies can be signed in to different accounts.',
  '{name} is already installed. Saving opens the one you have instead of adding a second.',
  '{name} is already installed. Opened the one you have.',
  // Virtual LAN: the network belongs to an engine the user installed, so the
  // wording has to keep Kryvex out of claims it cannot back.
  'Virtual LAN',
  'Sharing {ip}',
  '{count} devices',
  'Hide',
  'Expand',
  'MY VIRTUAL IP',
  'DEVICES ON THIS NETWORK',
  'Detected network',
  'Stop sharing my address',
  'Share this address with the room',
  'Virtual LAN needs the desktop app. The desktop reads the tunnel an engine on your machine has already created.',
  'No tunnel adapter is running. Start your own ZeroTier, EasyTier, Tailscale, WireGuard, Hamachi or OpenVPN network, then reopen this panel.',
  'Nothing is shared yet. Members appear here when they publish an address.',
  'This device',
  'The address is no longer shared.',
  'The address was shared with the room.',
  'The address could not be shared. Rejoin the room and try again.',
  'The clipboard refused the address.',
  'Use a member’s virtual IP in a compatible game or service’s direct-connect field. The host must have that game or service running. Kryvex shows the address; it does not create the network, route it or admit anyone.',
  // The in-box dictation engine is language-specific, so it refuses a foreign
  // language instead of answering in the one it knows.
  'This PC has a dictation engine for {installed} only, so it cannot hear {language}. Add that language with speech in Windows settings, or use a Whisper server, which handles it far better.',
  'no language',
  'this language',
  'The engine was not confident about these words. For accents, music, singing or several speakers a Whisper server is far more accurate.',
  'Dictated on this PC by the speech engine Windows ships. Clear speech only: a Whisper server is far more accurate for accents, music and several speakers.',
  // One-click Whisper: the card that downloads and starts a speech model, with
  // its progress steps, its failures and its attributions.
  'Whisper on this machine',
  'Kryvex downloads the whisper.cpp server and one speech model once, runs it on this machine and stops it when you ask. Nothing is uploaded. This is the engine to use for accents, music and singing, where the PC dictation engine cannot follow.',
  'One-click Whisper needs the desktop app on 64-bit Windows. The three servers below work from any build.',
  'One-click Whisper needs the desktop app on 64-bit Windows.',
  'Speech model',
  'downloaded',
  'Download and start',
  'Start the engine',
  'Stop the engine',
  'Use this engine',
  'Remove',
  'Working…',
  'Checking the download…',
  'Unpacking the server…',
  'Downloading the whisper.cpp server…',
  'Downloading the speech model…',
  'The download failed.',
  'The engine failed.',
  'Running on {url}. Lexium uses it as soon as it is up.',
  '{name} is downloaded and ready to start.',
  'Nothing is installed yet. The download is a one-time {size} for the model you pick.',
  'The server is whisper.cpp (MIT). The models are OpenAI’s Whisper weights, converted by the same project and also MIT. Kryvex fetches them from their own release pages and checks the SHA-256 before unpacking.',
  'What the server said',
  'Transcribing with the model on this machine.',
  'The pinned speech build failed its own review, so Kryvex will not install it.',
  'The download could not be reached. Check the connection and try again.',
  'Not enough free space for that model. Free some space, or pick a smaller one.',
  'The download did not match its checksum, so it was discarded. Try again.',
  'The download was incomplete, so it was discarded. Try again.',
  'The download was cancelled.',
  'The files could not be written. Check that the folder is writable and try again.',
  'The server archive could not be unpacked, so it was discarded.',
  'The server could not be started.',
  'The server did not answer in time. A larger model takes longer to load; try again.',
  'The server stopped on its own. The lines below say why.',
  'Download the server before starting it.',
  'A download is already running.',
  // Starting with Windows, and the speech engine starting with Kryvex.
  'Start with Kryvex',
  'The engine starts with Kryvex and stops when Kryvex quits.',
  'Start the engine with Kryvex and stop it on quit.',
  'Start with Windows',
  'Windows only.',
  'Available in the installed app.',
  'Checking Windows startup…',
  'Kryvex opens when you sign in to Windows.',
  'Kryvex does not start with Windows.',
  'Kryvex will open when you sign in to Windows.',
  'Kryvex will not open with Windows.',
  'The Windows startup entry could not be changed.',
  // 0.9.5: Arcade (x535), File Forge (x536) and Canvas (x537), plus the
  // built-in tools that can now be placed as Workspace windows.
  'x535 / ARCADE',
  'The xiondigital.net arcade, embedded here with its own saved session so scores and saves survive a restart.',
  'Direct access to the xiondigital.net arcade, showcasing games made by Kryvex’s developer.',
  'The arcade did not load.',
  'Check the connection, then try again.',
  'The arcade runs in the desktop app, which embeds it with its own saved session. The web build opens it in a browser tab instead.',
  'x536 / FILES',
  'Resize and convert images, merge, split or reorder PDFs, turn JSON into CSV and rename in batches. Copies are exported; your originals stay where they are.',
  'Resize and convert images, merge, split or reorder PDFs, turn JSON into CSV and rename in batches. Everything runs on this machine and originals are left alone.',
  'Add files',
  'Clear the list',
  'Output format',
  'Longest edge',
  'Quality {percent}%',
  'BMP keeps no quality setting: it is written without compression.',
  'What to do',
  'Images into a PDF',
  'Merge',
  'Split',
  'Reorder',
  'A PDF per image',
  'One PDF with all of them',
  'A PDF per page',
  'Choose ranges',
  'Page ranges',
  'Page order',
  'Turn every page 90°',
  'A PDF cannot be turned back into images here: that needs a page renderer Kryvex does not ship.',
  'JSON to CSV',
  'CSV to JSON',
  'A list of records becomes a table with one column per field. Numbers and true/false are read back as such; everything else stays text.',
  'New name',
  'Use {name}, {n}, {ext}, {date} and {count}.',
  'Start counting at',
  'Renaming touches the originals. Nothing is overwritten, and the list below is exactly what will happen.',
  'NOTHING READY',
  '{count} FILES READY',
  'Add files to begin.',
  'would collide',
  'FIRST LINES',
  'Apply the batch',
  'Convert and export a copy',
  'Show in folder',
  'Copy the preview',
  'Kryvex tool',
  'One file is larger than the 48 MB this tool opens at once: {name}',
  'That selection is more than 96 MB in total. Pick fewer files at once.',
  'That file could not be read: {name}',
  'No readable file was chosen.',
  'An export had no usable extension: {name}',
  'That export was empty or too large to write: {name}',
  'That export did not contain the format it claimed: {name}',
  'Nothing was ready to export.',
  'The file could not be written.',
  'That file was not chosen in this session.',
  'That is not a usable file name: {name}',
  'Two files would both become {name}.',
  '{name} already exists.',
  'The work could not be finished.',
  'Waiting for a choice…',
  'Converting images…',
  'Working on the PDF…',
  'Converting data…',
  'Renaming…',
  'Encoding…',
  'Exported {count} file(s).',
  'Renamed {count} file(s).',
  'Add at least one image first.',
  'Add a JSON or CSV file first.',
  'Nothing in that list converts with the options above.',
  'Merging needs two or more PDFs.',
  'Splitting works on one PDF at a time.',
  'Reordering works on one PDF at a time.',
  'That page range could not be read. Try a form like 1-3,5.',
  'That order needs every page exactly once, from 1 to {count}.',
  'That PDF could not be read.',
  'That PDF is encrypted, so it has to be unlocked before Kryvex can read it.',
  'That file could not be written.',
  '{name} could not be converted.',
  '{name} could not be read as a table.',
  '{name} could not be read.',
  '{name} is too large to read as text.',
  '{name} is not a list of records that can become a table.',
  'Fix the highlighted names before applying the batch.',
  'File Forge needs the desktop app: the web build cannot open files on this machine.',
  'Renaming needs the desktop app.',
  'Saving needs the desktop app.',
  'x537 / CANVAS',
  'Sketch, draw and type on a sheet that stays on this machine, then save it as an image or send its words to the sticky notes.',
  'Draw, sketch and type on a sheet that stays on this machine. Save it as an image, send its words to a sticky note, or keep the sheet itself to carry on later.',
  'Brush',
  'Eraser',
  'Line',
  'Colour {value}',
  'Stroke size',
  'Undo',
  'Redo',
  'Clear the sheet',
  'Drawing sheet',
  'Text to place',
  'Text size {size}px',
  'Export',
  'Save a copy',
  'Words',
  'Text file',
  'Rich text',
  'Send to sticky notes',
  'Sent {count} note(s) to the Home board.',
  'There is no typed text on the sheet yet.',
  'Type the words below, then click the sheet to place them.',
  'Sheet',
  'Open a sheet',
  'Keep the sheet',
  'Ground',
  'Ground {value}',
  'Saved {name}.',
  'The sheet could not be encoded.',
  'No sheet was chosen.',
  '{name} is not a Kryvex sheet.',
  '{name} is open.',
  'Opening a sheet needs the desktop app.',
  'The sheet is drawn in this tab and kept for the session: saving it needs the desktop app.',
  'The board already holds forty notes. Clear one to make room.',
  'BUILT IN',
  'BUILT-IN SERVICES',
  'NO ACCOUNT',
  'Arcade, File Forge and Canvas run on this machine. They go straight into a window, with no sign-in and nothing added to your service list.',
  'Built-in tool windows',
  'Minimized windows',
  'Resize this window',
  'Drag to resize',
  'Data',
  'Rename',
  'Direction',
  'Original',
  'Options',
  'Tools',
  'Undo',
  'How much to capture',
  'Whole target',
  'An area',
  'The next capture asks you to drag the area.',
  'Area {size} — every capture takes this part.',
  'Choose another area',
  'That area no longer fits the target, so the whole target was captured.',
  'Choose the area to capture',
  'The target, frozen for selection',
  'Drag across the part you want to capture, then confirm.',
  'The area is too small. Drag a larger box.',
  '{size} selected.',
  'Capture this area',
  'Record this area',
];

describe('translation coverage', () => {
  it('collects the strings the renderer asks for', () => {
    expect(keys.length).toBeGreaterThan(300);
    expect(keys).toContain('Rooms');
  });

  it.each(['es', 'de', 'fr'] as const)('never grows the untranslated set in %s', language => {
    const { t } = makeI18n(language);
    const missing = keys.filter(key => t(key) === key);
    expect(
      missing.length,
      `${language} backlog ${missing.length} (limit ${BACKLOG[language]})`,
    ).toBeLessThanOrEqual(BACKLOG[language]);
  });

  it('translates every string this release added', () => {
    for (const language of ['es', 'de', 'fr'] as const) {
      const { t } = makeI18n(language);
      const missing = ADDED.filter(key => t(key) === key);
      expect(missing, `${language} is missing ${missing.join(' | ')}`).toEqual([]);
    }
  });
});

/**
 * Turkish is the fifth UI language and the first that ships knowingly partial:
 * the shell, board, workspace, service controls and clock are translated and
 * everything else falls back to English. The ratchet keeps the untranslated
 * remainder from growing while it is worked off.
 */
// Measured after the first Turkish pass: the shell, Home board, Workspace,
// browser, player, rooms, capture and the clock are translated, and the long
// explanatory copy is still English. Only lower this number.
const TURKISH_BACKLOG = 1291;

describe('Turkish', () => {
  it('resolves a Turkish system locale to Turkish', () => {
    expect(normalizeLanguage('tr-TR')).toBe('tr');
    expect(languageLabel('tr')).toBe('Türkçe');
  });

  it('translates the furniture a reader meets first', () => {
    const { t } = makeI18n('tr');
    const required = [
      'Home',
      'Services',
      'Browser',
      'Workspace',
      'Settings',
      'Add',
      'Close',
      'Cancel',
      'Save',
      'Search',
      'Weather',
      'World clock',
      'Widgets',
      'Add service',
      'Window animation',
      'Please enter a city',
      'Clock size',
      'Alignment',
      'Secret services',
      'Minimize',
      'Restore',
      'INSTALLED SERVICES',
      'Allow more than one instance of this site',
      'Virtual LAN',
      'Share this address with the room',
    ];
    expect(required.filter(key => t(key) === key)).toEqual([]);
  });

  it('never grows the untranslated set', () => {
    const { t } = makeI18n('tr');
    const missing = keys.filter(key => t(key) === key);
    expect(missing.length).toBeLessThanOrEqual(TURKISH_BACKLOG);
  });
});

/**
 * A translation that drops or renames an interpolation token renders `{city}`
 * literally or loses the value entirely. This is the cheapest way to catch a
 * catalogue written by hand, and it covers every non-English language.
 */
describe('interpolation tokens', () => {
  const tokens = (text: string) => new Set(text.match(/\{[a-zA-Z]+\}/g) ?? []);

  it.each(['es', 'de', 'fr', 'tr'] as const)('are preserved in %s', language => {
    const { t } = makeI18n(language);
    const broken: string[] = [];
    for (const key of keys) {
      const value = t(key);
      if (value === key) continue;
      const wanted = tokens(key);
      const found = tokens(value);
      if (wanted.size !== found.size || [...wanted].some(token => !found.has(token))) {
        broken.push(key);
      }
    }
    expect(broken, `${language} drops a token in: ${broken.slice(0, 12).join(' | ')}`).toEqual([]);
  });
});
