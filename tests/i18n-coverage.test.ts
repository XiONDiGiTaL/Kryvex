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
