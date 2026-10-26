/**
 * Turning a question into a search the user can actually press.
 *
 * Vexium Core runs on the machine and never browses, so "the assistant could
 * not retrieve an answer" is the normal case for anything current. The app owns
 * two decisions the model must not be trusted with:
 *
 * - whether a question depends on information that changes (a model that is
 *   unsure often still answers confidently);
 * - what to put in the search box, which is the user's question with the
 *   conversational scaffolding removed, not the raw sentence.
 *
 * This module is deliberately conservative. It never invents an entity, a
 * version or a date; it only drops words that carry no search value and adds
 * an intent hint when the question already states one.
 */

export type ResearchReason = 'current' | 'troubleshooting' | 'software';

/**
 * Questions whose answers move. The list is a decision aid, not a filter: a
 * false positive costs one extra search button, a false negative leaves a user
 * with a stale answer they cannot check.
 */
const CURRENT =
  /\b(latest|newest|current|currently|today|tonight|yesterday|tomorrow|this (week|month|year|season)|right now|these days|recent|recently|news|who won|winner|score|scores|standings|price|prices|pricing|cost|costs|royalt(y|ies)|rate|rates|weather|forecast|stock|stocks|release date|just released|new version|update(d|s)?|championship|election|box office|trending)\b/i;

/**
 * Questions that are answered by a manual before they are answered by a
 * person. They are not time-sensitive on their own, but the useful query is
 * documentation-shaped.
 */
const SOFTWARE =
  /\b(version|api|sdk|plugin|plugins|compatib(le|ility)|support(s|ed)?|documentation|docs|install(ing|ation)?|setup|configure|error|bug|crash(es)?|failing|fails?|not working)\b/i;

/**
 * A question that describes a fault is one a small model is most likely to
 * answer confidently and wrongly, so it earns a search even though it has no
 * deadline. Windows and browser behaviour changes between builds.
 */
const TROUBLE =
  /\b(why (?:does|do|is|are|did|won'?t|doesn'?t|isn'?t)|not working|doesn'?t work|keeps? (?:showing|asking|closing|crashing|logging)|error|fail(s|ed|ing)?|crash(es|ed)?|stuck|broken|fix|troubleshoot|bug|glitch)\b/i;

export function researchReason(question: string): ResearchReason | null {
  if (!question.trim()) return null;
  if (CURRENT.test(question)) return 'current';
  if (TROUBLE.test(question)) return 'troubleshooting';
  if (SOFTWARE.test(question)) return 'software';
  return null;
}

/** Leading pleasantries and "can you tell me" wrappers carry no search value. */
const OPENERS = [
  /^(?:hey|hi|hello|ok|okay|so|well|right|please|kindly)[\s,]+/i,
  /^(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:tell\s+me|explain|help\s+me(?:\s+with)?|show\s+me|let\s+me\s+know)\s+(?:about\s+)?/i,
  /^(?:please\s+)?(?:tell|show|explain|describe)\s+me\s+(?:about\s+)?/i,
  /^i(?:'m| am)?\s+(?:just\s+)?(?:wondering|curious)\s+(?:about\s+|if\s+|whether\s+)?/i,
  /^i\s+(?:want|need|would like)\s+to\s+know\s+(?:about\s+|if\s+|whether\s+)?/i,
  /^(?:quick|simple|small)\s+question[\s,:]+/i,
  /^do\s+you\s+know\s+(?:anything\s+about\s+|if\s+|whether\s+)?/i,
  /^search\s+(?:the\s+(?:web|internet)\s+)?(?:for|about)\s+/i,
  /^look\s+(?:it\s+|this\s+|that\s+)?up\s+/i,
  /^what\s+(?:is|are|was|were|does|do|did)\s+/i,
  /^how\s+(?:do|does|can|should|would)\s+(?:i|you|we)\s+/i,
];

/** Yes/no questions open with an auxiliary that the search engine reads as noise. */
const AUXILIARY =
  /^(?:does|do|did|is|are|was|were|can|could|will|would|should|shall|has|have|had|am)\s+/i;

/** Words that qualify a sentence but never narrow a search. */
const WEAK = /\b(?:this|that|these|those|particular|specific|actually|exactly|really|very|just|simply|basically|literally|please|kindly)\b/gi;

const INTENT = {
  troubleshooting: /\b(why|not working|doesn'?t work|keeps?|error|fail(s|ed|ing)?|crash(es|ed)?|issue|problem|broken|stuck|fix|troubleshoot)\b/i,
  documentation: /\b(support(s|ed)?|compatib(le|ility)|plugin|api|sdk|integration|how (do|can|to)|can i|documentation|docs)\b/i,
  version: /\b(latest|newest|current|version|update|release)\b/i,
  pricing: /\b(price|pricing|cost|costs|royalt(y|ies)|fee|fees|subscription|plan|plans)\b/i,
};

/**
 * A search box query built from the user's own words.
 *
 * Examples of what it does, not of a fixed table: "Does Godot support
 * multiplayer networking?" becomes "Godot official documentation multiplayer
 * networking", and "Why does Windows 11 keep showing me the passkey popup?"
 * gains "troubleshooting". It keeps every proper noun and version number it was
 * given, and never adds a name the user did not write.
 */
export function buildResearchQuery(question: string, now: Date = new Date()): string {
  const original = question.replace(/\s+/g, ' ').trim();
  if (!original) return '';

  let query = original.replace(/[?!.]+$/g, '').trim();
  for (const opener of OPENERS) query = query.replace(opener, '');
  query = query.replace(AUXILIARY, '');
  query = query.replace(/^(?:i|we)\s+/i, '');
  query = query.replace(/^(?:about|the)\s+/i, '');
  query = query.replace(WEAK, ' ');
  query = query.replace(/\s+/g, ' ').replace(/^[\s,;:–-]+/, '').trim();
  if (!query) return original;

  const hints: string[] = [];
  if (INTENT.troubleshooting.test(original)) hints.push('troubleshooting');
  else if (INTENT.documentation.test(original)) hints.push('official documentation');
  if (
    INTENT.version.test(original) &&
    !/\b(latest|newest|current|release|version|changelog|notes)\b/i.test(query)
  ) {
    hints.push('latest version');
  }
  if (INTENT.pricing.test(original)) hints.push('official');
  // A bare "latest championship" has no season to search for; the year is the
  // one fact the app legitimately knows about the question.
  if (INTENT.version.test(original) && /\b(latest|current|newest)\b/i.test(original)) {
    hints.push(String(now.getFullYear()));
  }

  // A hint whose last word is already in the query would only repeat it.
  const kept = hints.filter(hint => {
    const tail = hint.split(' ').pop() ?? hint;
    return !query.toLowerCase().includes(tail);
  });
  const withHints = [query, ...kept].join(' ').replace(/\s+/g, ' ').trim();

  // Search engines ignore very long strings; cut at a word, never mid-token.
  if (withHints.length <= 160) return withHints;
  const cut = withHints.slice(0, 160);
  const space = cut.lastIndexOf(' ');
  return (space > 40 ? cut.slice(0, space) : cut).trim();
}
