import { describe, expect, it } from 'vitest';
import {
  isValidOneTimeCode,
  matchOneTimeCodeProfile,
  normalizeOneTimeCode,
  oneTimeCodeFocusScript,
  oneTimeCodeProfileById,
  oneTimeCodeProbeScript,
  oneTimeCodeSubmitScript,
  parseOneTimeCodePrompt,
  sameOneTimeCodePrompt,
  type OneTimeCodeProfile,
  type OneTimeCodePrompt,
} from '../src/lib/one-time-code';

function profile(id: string): OneTimeCodeProfile {
  const found = oneTimeCodeProfileById(id);
  if (!found) throw new Error(`missing profile ${id}`);
  return found;
}

const STEAM_PROMPT: OneTimeCodePrompt = {
  profileId: 'steam',
  label: 'Steam Guard',
  length: 5,
  numeric: false,
  split: false,
};

const GENERIC_PROMPT: OneTimeCodePrompt = {
  profileId: 'generic',
  label: 'Verification code',
  length: 6,
  numeric: true,
  split: false,
};

const SPLIT_PROMPT: OneTimeCodePrompt = {
  profileId: 'generic',
  label: 'Verification code',
  length: 6,
  numeric: true,
  split: true,
};

describe('matchOneTimeCodeProfile', () => {
  it('uses the Steam profile only on Steam sign-in pages', () => {
    expect(
      matchOneTimeCodeProfile('https://steamcommunity.com/login/home/?goto=%2Fchat%2F')?.id,
    ).toBe('steam');
    expect(matchOneTimeCodeProfile('https://store.steampowered.com/login/')?.id).toBe('steam');
    expect(matchOneTimeCodeProfile('https://login.steampowered.com/jwt/checktoken')?.id).toBe(
      'steam',
    );
    expect(matchOneTimeCodeProfile('https://steamcommunity.com/chat/')?.id).toBe('generic');
  });

  it('selects known profiles only on their sign-in paths', () => {
    expect(matchOneTimeCodeProfile('https://github.com/login')?.id).toBe('github');
    expect(matchOneTimeCodeProfile('https://github.com/settings/profile')?.id).toBe('generic');
    expect(matchOneTimeCodeProfile('https://discord.com/login')?.id).toBe('discord');
    expect(matchOneTimeCodeProfile('https://discord.com/channels/1/2')?.id).toBe('generic');
    expect(matchOneTimeCodeProfile('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')?.id).toBe(
      'microsoft',
    );
  });

  it('falls back generically and rejects non-web URLs', () => {
    expect(matchOneTimeCodeProfile('https://example.com/login')?.id).toBe('generic');
    expect(matchOneTimeCodeProfile('http://localhost:3000/signin')?.id).toBe('generic');
    expect(matchOneTimeCodeProfile('ftp://example.com/login')).toBeNull();
    expect(matchOneTimeCodeProfile('not a url')).toBeNull();
    expect(matchOneTimeCodeProfile(undefined)).toBeNull();
  });
});

describe('one-time codes', () => {
  it('normalizes Steam codes to five uppercase characters', () => {
    expect(normalizeOneTimeCode(' ab-c1 2 ', STEAM_PROMPT)).toBe('ABC12');
    expect(normalizeOneTimeCode('abcdef', STEAM_PROMPT)).toBe('ABCDE');
    expect(normalizeOneTimeCode('!!!', STEAM_PROMPT)).toBe('');
    expect(normalizeOneTimeCode('abc12', STEAM_PROMPT).length).toBe(5);
  });

  it('strips non-digits for numeric codes', () => {
    expect(normalizeOneTimeCode(' 123-456 ', GENERIC_PROMPT)).toBe('123456');
    expect(normalizeOneTimeCode('abc123', GENERIC_PROMPT)).toBe('123');
    expect(normalizeOneTimeCode('12 34 56 78', { ...GENERIC_PROMPT, length: 8 })).toBe(
      '12345678',
    );
  });

  it('accepts only complete codes', () => {
    expect(isValidOneTimeCode('abc12', STEAM_PROMPT)).toBe(true);
    expect(isValidOneTimeCode('A B C 1 2', STEAM_PROMPT)).toBe(true);
    expect(isValidOneTimeCode('abcd', STEAM_PROMPT)).toBe(false);
    expect(isValidOneTimeCode('abc123', STEAM_PROMPT)).toBe(false);
    expect(isValidOneTimeCode('123456', GENERIC_PROMPT)).toBe(true);
    expect(isValidOneTimeCode('12345', GENERIC_PROMPT)).toBe(false);
  });
});

describe('probe results', () => {
  it('accepts a well-formed prompt and keeps registry copy', () => {
    expect(parseOneTimeCodePrompt(STEAM_PROMPT)).toEqual(STEAM_PROMPT);
    expect(parseOneTimeCodePrompt({ ...GENERIC_PROMPT, extra: 'ignored' })).toEqual(
      GENERIC_PROMPT,
    );
    expect(
      parseOneTimeCodePrompt({ ...STEAM_PROMPT, label: 'Page-controlled text' })?.label,
    ).toBe('Steam Guard');
  });

  it('rejects unknown profiles and impossible lengths', () => {
    expect(parseOneTimeCodePrompt(null)).toBeNull();
    expect(parseOneTimeCodePrompt('steam')).toBeNull();
    expect(parseOneTimeCodePrompt({ ...STEAM_PROMPT, profileId: 'unknown' })).toBeNull();
    expect(parseOneTimeCodePrompt({ ...STEAM_PROMPT, profileId: undefined })).toBeNull();
    expect(parseOneTimeCodePrompt({ ...STEAM_PROMPT, length: 0 })).toBeNull();
    expect(parseOneTimeCodePrompt({ ...STEAM_PROMPT, length: 13 })).toBeNull();
    expect(parseOneTimeCodePrompt({ ...STEAM_PROMPT, length: 5.5 })).toBeNull();
    expect(parseOneTimeCodePrompt({ ...SPLIT_PROMPT, length: 3 })).toBeNull();
    expect(parseOneTimeCodePrompt({ ...SPLIT_PROMPT, length: 9 })).toBeNull();
    expect(parseOneTimeCodePrompt(SPLIT_PROMPT)).toEqual(SPLIT_PROMPT);
  });

  it('compares prompts without replacing unchanged state', () => {
    expect(sameOneTimeCodePrompt(null, null)).toBe(true);
    expect(sameOneTimeCodePrompt(STEAM_PROMPT, { ...STEAM_PROMPT })).toBe(true);
    expect(sameOneTimeCodePrompt(STEAM_PROMPT, GENERIC_PROMPT)).toBe(false);
    expect(sameOneTimeCodePrompt(GENERIC_PROMPT, SPLIT_PROMPT)).toBe(false);
    expect(sameOneTimeCodePrompt(null, GENERIC_PROMPT)).toBe(false);
  });
});

describe('page scripts', () => {
  it('probes the provider selectors and the generic fallback', () => {
    const script = oneTimeCodeProbeScript(profile('steam'));
    expect(script).toContain('#twofactorcode_entry');
    expect(script).toContain('getBoundingClientRect');
    expect(script).toContain('"numeric":false');
    expect(oneTimeCodeProbeScript(profile('generic'))).toContain('"fallback":true');
  });

  it('never embeds an unnormalized code in the submit script', () => {
    const script = oneTimeCodeSubmitScript(profile('steam'), STEAM_PROMPT, ' ab-c1 2 ');
    expect(script).toContain('"ABC12"');
    expect(script).not.toContain('ab-c1');
    expect(script).toContain('requestSubmit');
    expect(script).toContain('login_twofactorauth_buttonset_entercode');
  });

  it('detects split groups and fills every box', () => {
    const probe = oneTimeCodeProbeScript(profile('generic'));
    expect(probe).toContain('splitGroup');
    expect(probe).toContain('split: Boolean(target.inputs)');

    const submit = oneTimeCodeSubmitScript(profile('generic'), SPLIT_PROMPT, '123456');
    expect(submit).toContain('characters[index]');
    expect(submit).toContain('inputs[inputs.length - 1].focus()');
    expect(submit).toContain('inputs.length !== 6');
  });

  it('can focus the page field without touching its value', () => {
    const script = oneTimeCodeFocusScript(profile('generic'));
    expect(script).toContain('scrollIntoView');
    expect(script).toContain('.focus()');
    expect(script).not.toContain('value =');
  });
});
