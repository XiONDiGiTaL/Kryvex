import { creatorReply, type AssistantLink } from './creator';
import { buildResearchQuery } from './research';

export interface VexelReply {
  text: string;
  /** A search query the shell can hand to the browser's search engine. */
  search?: string;
  /** Public pages that answer the question better than prose can. */
  links?: AssistantLink[];
  kind: 'greeting' | 'answer' | 'fallback';
}

export const VEXEL_GREETING =
  'I am Vexium, the assistant built into Kryvex. No model is loaded yet, so I can help with the app and the details of setting one up, but I cannot reason about arbitrary questions until you connect a local model. Open Settings → Vexium to point me at Ollama, LM Studio or a GGUF file on this machine. That keeps every prompt local. If you would rather search the web, ask me and I will give you a search link.';

const CAPABILITIES =
  'Without a model I can explain Kryvex itself: services and sessions, the Shield, Rooms, the resource monitor, VPN settings, the secret emulator, and how to load a local model. For anything outside the app I will offer a web search instead of pretending to know.';

function normalize(input: string): string {
  return input.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * A deterministic, offline first responder.
 *
 * This is intentionally not a fake language model: the replies are a small
 * set of true statements about Kryvex, and everything else becomes an honest
 * "search this" answer. That is the failsafe the shell needs before a model is
 * loaded, and when a loaded model says it does not know.
 */
export function offlineReply(input: string): VexelReply {
  const value = normalize(input);
  if (!value) return { text: 'Ask me a question, or type a topic to search for.', kind: 'greeting' };

  if (/^(hi|hello|hey|yo|good (morning|evening|afternoon))\b/.test(value)) {
    return { text: VEXEL_GREETING, kind: 'greeting' };
  }
  if (/(what|who) (can|are) you|what do you do|capabilit|help me/.test(value)) {
    return { text: CAPABILITIES, kind: 'answer' };
  }
  // The creator, in app-supplied words rather than a guess. This is answered
  // even without a model, because it is the one identity question Kryvex can
  // answer about itself without one.
  const creator = creatorReply(input);
  if (creator) {
    return {
      text: creator.text,
      kind: 'answer',
      ...(creator.links ? { links: creator.links } : {}),
    };
  }
  if (/model|ollama|lm studio|lmstudio|gguf|llama/.test(value)) {
    return {
      text: 'Open Settings → Vexium. Ollama serves on http://127.0.0.1:11434 and LM Studio on http://127.0.0.1:1234; both stay on loopback. You can also choose a .gguf file and Kryvex starts llama.cpp for you. Nothing is downloaded or uploaded by Kryvex itself.',
      kind: 'answer',
    };
  }
  if (/privacy|telemetry|track|account|cloud/.test(value)) {
    return {
      text: 'Kryvex keeps its state in one local JSON file. There is no account, no telemetry and no cloud sync. Services keep their own Chromium partitions, and the assistant only talks to a loopback runtime. The Home weather card is the one opt-in network call: it sends the place you choose, as a city name or its coordinates, to Open-Meteo.',
      kind: 'answer',
    };
  }
  if (/weather|forecast|temperature/.test(value)) {
    return {
      text: 'The Home board shows current conditions once you enter a city and press Update. It uses Open-Meteo, needs no key, and remembers the last reading for ten minutes. Switch between °C and °F on the card.',
      kind: 'answer',
    };
  }
  if (/vpn|openvpn|tunnel/.test(value)) {
    return {
      text: 'Settings → Network lets you point Kryvex at your own openvpn executable and .ovpn profile, then start and stop the tunnel. Kryvex does not bundle a VPN or its drivers, and it does not silently reroute traffic: DNS and proxy options are passed to OpenVPN as profile flags.',
      kind: 'answer',
    };
  }
  if (/emulator|rom|retro|game ?boy|snes|nes/.test(value)) {
    return {
      text: 'The 8-bit emulator is under Services → Secret emulator. It loads Nintendo, Sega Master System/Game Gear/Genesis/32X, Atari 2600/7800/Lynx, PC Engine, WonderSwan, Neo Geo Pocket and Virtual Boy files you already own and runs them locally. Kryvex does not provide ROMs or link to them. Gamepads and control remapping are in the emulator’s own menu.',
      kind: 'answer',
    };
  }
  if (/search|browse|internet|look (it|this) up/.test(value)) {
    return {
      text: 'I can hand the question to the Browser instead. Use the search button below and Kryvex will open your chosen engine with the query already filled in.',
      search: buildResearchQuery(input) || input.trim(),
      kind: 'answer',
    };
  }

  return {
    text: 'I do not know that without a model, and I cannot check the web from here. Load one in Settings → Vexium for a real answer, or use the search below: it opens the Browser with the useful part of your question.',
    search: buildResearchQuery(input) || input.trim(),
    kind: 'fallback',
  };
}

const UNSURE = [
  /i (do not|don't) know/i,
  /i(?:'m| am) not sure/i,
  /i (cannot|can't) (help|answer|find)/i,
  /i (do not|don't) have (access|information|enough)/i,
  /as an ai/i,
  /no information/i,
];

/** A model's own admission of uncertainty earns a search affordance. */
export function looksUnsure(text: string): boolean {
  return UNSURE.some(pattern => pattern.test(text));
}
