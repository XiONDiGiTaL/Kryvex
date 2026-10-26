import {
  CREATOR_PROFILE,
  CREATOR_RULES,
} from '../../electron/assistant-rules';

/**
 * The creator, in the words the app itself can show.
 *
 * The prose lives in `electron/assistant-rules.ts` so the model prompt and the
 * built-in responder cannot drift apart about who made Kryvex. Links stay out
 * of that module because they are UI: they are built here, and the assistant
 * opens them with the same external-browser handoff as the rest of the app.
 */
export const CREATOR_NAME = 'XiØN';
export const CREATOR_ALIAS = 'XiONDiGiTaL';
export const CREATOR_SITE = 'xiondigital.net';
export const CREATOR_GITHUB = 'https://github.com/XiONDiGiTaL';
export const CREATOR_SPOTIFY = 'https://open.spotify.com/artist/4YkGZAtMD5tFAq859q7Bit';
export const CREATOR_YOUTUBE = 'https://www.youtube.com/@XiONDiGiTaL';

export { CREATOR_PROFILE, CREATOR_RULES };

export interface AssistantLink {
  label: string;
  url: string;
}

export const CREATOR_LINKS: Record<'site' | 'github' | 'spotify' | 'youtube', AssistantLink> = {
  site: { label: CREATOR_SITE, url: `https://${CREATOR_SITE}` },
  github: { label: 'GitHub', url: CREATOR_GITHUB },
  spotify: { label: 'Spotify', url: CREATOR_SPOTIFY },
  youtube: { label: 'YouTube', url: CREATOR_YOUTUBE },
};

export interface CreatorReply {
  text: string;
  links?: AssistantLink[];
}

/** A question that only his public pages can answer truthfully. */
const PUBLIC_PAGES =
  /\b(his|xi[oø]n'?s) (music|songs?|albums?|eps?|discography|projects?|games?|apps?|portfolio|work)\b|\b(discography|track ?list|latest (song|album|release))\b|\b(spotify|youtube|github) (page|profile|channel|account|link)\b|\bwhat (songs?|music|games?|projects?) (has|did|does)\b|\blist (his|the) (songs?|albums?|projects?)\b/i;

const PLAYER529 = /\bplayer ?529\b/i;

const GREASE_GOLD = /\bgrease ?(&|and) ?gold( records)?\b/i;

const LANGUAGE =
  /\bturkish\b|\bpuerto rican\b|\bjamaican\b|\bpatois\b|\bwhat languages? (does|do) (he|xi[oø]n) speak\b|\bdoes (he|xi[oø]n) speak\b/i;

const PERSONAL =
  /\bhow old\b|\b(age|birthday|born|real name|full name|address|phone|email|e-mail|wife|husband|girlfriend|boyfriend|partner|kids?|children|family|parents|religion|politics|net worth|salary|income|where (does|do) (he|xi[oø]n) live|where is (he|xi[oø]n) from|what (is|does) (he|xi[oø]n) (do|work)|is (he|xi[oø]n) (married|single|gay|straight))\b/i;

// "Who is Kryvex" asks about the app, not its author; only the creator-shaped
// questions belong here.
const IDENTITY =
  /\bwho (made|created|built|designed|developed|wrote|programmed) (you|vexium|kryvex)\b|\b(your|its) (creator|maker|developer|author|founder|owner)\b|\bwho('s| is) xi[oø]n\b|\btell me about (xi[oø]n|xiondigital|your creator|your developer)\b|\babout (the|your) (creator|developer|founder)\b|\bxiondigital\b/i;

/**
 * Deterministic answers about the creator, for the case the assistant runs in
 * without a model and for the model's own gaps. Each branch is a fact from the
 * same block the system prompt carries; nothing here is inferred.
 */
export function creatorReply(input: string): CreatorReply | null {
  const question = input.trim();
  if (!question) return null;

  if (GREASE_GOLD.test(question)) {
    return {
      text: 'Grease & Gold Records is an entity that has collaborated with various artists, with no affiliation to anyone outside its current roster.',
    };
  }
  if (PLAYER529.test(question)) {
    return {
      text: `Player529 is a collaborative partner of ${CREATOR_NAME}'s on various projects.`,
    };
  }
  if (LANGUAGE.test(question)) {
    return {
      text: `${CREATOR_NAME} is a native English speaker who understands Puerto Rican Spanish and Jamaican Patois, and is learning Turkish at a beginner level.`,
    };
  }
  if (PUBLIC_PAGES.test(question)) {
    return {
      text: `I can't open ${CREATOR_NAME}'s GitHub, Spotify or YouTube from this machine, so I won't quote titles, dates or track lists I can't see. His public work is on GitHub, Spotify and YouTube.`,
      links: [CREATOR_LINKS.github, CREATOR_LINKS.spotify, CREATOR_LINKS.youtube],
    };
  }
  // Personal before identity: "who is XiØN married to" opens like the identity
  // question but is not one he answers here.
  if (PERSONAL.test(question)) {
    return {
      text: `Personal questions about ${CREATOR_NAME} are answered at ${CREATOR_SITE} for more information.`,
      links: [CREATOR_LINKS.site],
    };
  }
  if (IDENTITY.test(question)) {
    return {
      text: `${CREATOR_NAME}, also known as ${CREATOR_ALIAS}, is my creator. He is an independent musician, songwriter, producer and software developer whose work spans music production, browser-based games, digital utilities and AI-assisted development. His broader goal is to build an independent creative and technology business through original music, software projects and digital products. More is at ${CREATOR_SITE}.`,
      links: [CREATOR_LINKS.site],
    };
  }
  return null;
}
