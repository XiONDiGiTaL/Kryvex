import { describe, expect, it } from 'vitest';
import {
  CREATOR_GITHUB,
  CREATOR_LINKS,
  CREATOR_SITE,
  CREATOR_SPOTIFY,
  CREATOR_YOUTUBE,
  creatorReply,
} from '../src/lib/creator';
import { CREATOR_PROFILE, CREATOR_RULES, buildMessages } from '../electron/assistant-rules';
import { offlineReply } from '../src/lib/vexel';

describe('what Vexium knows about its creator', () => {
  it('answers who made it with the supplied facts, not an invented founder', () => {
    for (const question of ['Who made you?', 'Who is XiØN?', 'who created Kryvex', 'tell me about your creator']) {
      const reply = creatorReply(question);
      expect(reply, question).not.toBeNull();
      expect(reply?.text, question).toContain('XiØN');
      expect(reply?.text, question).toContain('independent musician');
      expect(reply?.text, question).toContain(CREATOR_SITE);
    }
  });

  it('describes Player529 as a collaborator, not an employer or a role', () => {
    const reply = creatorReply('Who is Player529?');
    expect(reply?.text).toBe(
      "Player529 is a collaborative partner of XiØN's on various projects.",
    );
  });

  it('states the Grease & Gold Records relationship exactly, with no roster claim', () => {
    const reply = creatorReply('What is Grease & Gold Records?');
    expect(reply?.text).toContain('has collaborated with various artists');
    expect(reply?.text).toContain('no affiliation to anyone outside its current roster');
    expect(reply?.text).not.toMatch(/signed|roster of|owns/i);
  });

  it('answers the language question without guessing', () => {
    const reply = creatorReply('Does XiØN speak Turkish?');
    expect(reply?.text).toContain('native English speaker');
    expect(reply?.text).toContain('Puerto Rican Spanish');
    expect(reply?.text).toContain('Jamaican Patois');
    expect(reply?.text).toContain('beginner level');
  });

  it('sends other personal questions to the site instead of answering them', () => {
    for (const question of ['How old is XiØN?', "What is XiØN's net worth?", 'Who is XiØN married to?']) {
      const reply = creatorReply(question);
      expect(reply?.text, question).toContain(CREATOR_SITE);
      expect(reply?.text, question).toMatch(/personal questions/i);
    }
  });

  it('offers the public pages for projects and songs instead of inventing titles', () => {
    const reply = creatorReply('What songs has XiØN released?');
    expect(reply?.text).toMatch(/can't open/i);
    expect(reply?.links?.map(link => link.url)).toEqual([
      CREATOR_GITHUB,
      CREATOR_SPOTIFY,
      CREATOR_YOUTUBE,
    ]);
  });

  it('leaves ordinary questions alone', () => {
    expect(creatorReply('What is the weather in Berlin?')).toBeNull();
    expect(creatorReply('How do I load a local model?')).toBeNull();
    expect(creatorReply('')).toBeNull();
  });
});

describe('the creator in the assistant', () => {
  it('carries the same facts in the model prompt, without scheme-qualified links', () => {
    const system = buildMessages([{ role: 'user', content: 'Hi' }])[0]?.content ?? '';
    expect(system).toContain('About your creator:');
    expect(system).toContain(CREATOR_PROFILE);
    expect(system).toContain(CREATOR_RULES);
    expect(system).toContain('XiØN');
    expect(system).toContain('Player529');
    expect(system).toContain('xiondigital.net');
    expect(system).not.toMatch(/https?:\/\//);
  });

  it('answers with no model loaded, and links the site rather than a bare sentence', () => {
    const reply = offlineReply('Who is your creator?');
    expect(reply.kind).toBe('answer');
    expect(reply.text).toContain(CREATOR_SITE);
    expect(reply.links).toEqual([CREATOR_LINKS.site]);
  });

  it('uses the same canonical links the UI opens', () => {
    expect(CREATOR_LINKS.site.url).toBe(`https://${CREATOR_SITE}`);
    expect(CREATOR_LINKS.github.url).toContain('github.com/XiONDiGiTaL');
    expect(CREATOR_LINKS.spotify.url).toContain('open.spotify.com/artist/4YkGZAtMD5tFAq859q7Bit');
    expect(CREATOR_LINKS.youtube.url).toContain('youtube.com/@XiONDiGiTaL');
  });
});
