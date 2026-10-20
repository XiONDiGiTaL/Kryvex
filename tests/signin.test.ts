import { describe, expect, it } from 'vitest';
import { isGoogleHost, isGoogleSignInBlock } from '../src/lib/signin';

describe('isGoogleHost', () => {
  it('matches Google and YouTube origins, including subdomains', () => {
    expect(isGoogleHost('https://accounts.google.com/signin')).toBe(true);
    expect(isGoogleHost('https://www.youtube.com/')).toBe(true);
    expect(isGoogleHost('https://music.youtube.com/watch?v=1')).toBe(true);
    expect(isGoogleHost('https://www.google.co.uk/')).toBe(true);
    expect(isGoogleHost('https://lh3.googleusercontent.com/a')).toBe(true);
  });

  it('does not match lookalikes or non-web URLs', () => {
    expect(isGoogleHost('https://notgoogle.com/')).toBe(false);
    expect(isGoogleHost('https://google.com.evil.test/')).toBe(false);
    expect(isGoogleHost('file:///C:/google.com')).toBe(false);
    expect(isGoogleHost('')).toBe(false);
    expect(isGoogleHost('nonsense')).toBe(false);
  });
});

describe('isGoogleSignInBlock', () => {
  it('recognises the refusal card and the OAuth error code', () => {
    expect(
      isGoogleSignInBlock("Couldn't sign you in\nThis browser or app may not be secure."),
    ).toBe(true);
    expect(isGoogleSignInBlock('Error: disallowed_useragent')).toBe(true);
    expect(
      isGoogleSignInBlock(
        "Couldn't sign you in\nTry using a different browser. If you're already using a supported browser, try again.",
      ),
    ).toBe(true);
  });

  it('ignores ordinary pages that mention a browser', () => {
    expect(isGoogleSignInBlock('Your browser is up to date.')).toBe(false);
    expect(isGoogleSignInBlock('')).toBe(false);
  });
});
