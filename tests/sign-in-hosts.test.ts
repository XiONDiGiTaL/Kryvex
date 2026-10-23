import { describe, expect, it } from 'vitest';
import { isSignInHost } from '../electron/sign-in-hosts';

describe('isSignInHost', () => {
  it('matches Google and YouTube account surfaces', () => {
    expect(isSignInHost('accounts.google.com')).toBe(true);
    expect(isSignInHost('accounts.google.co.uk')).toBe(true);
    expect(isSignInHost('myaccount.google.com')).toBe(true);
    expect(isSignInHost('accounts.youtube.com')).toBe(true);
  });

  it('handles the host forms a probe can hand over', () => {
    expect(isSignInHost('Accounts.Google.COM')).toBe(true);
    expect(isSignInHost('accounts.google.com:443')).toBe(true);
    expect(isSignInHost('accounts.google.com.')).toBe(false);
  });

  it('leaves Google products and lookalikes on the normal path', () => {
    expect(isSignInHost('mail.google.com')).toBe(false);
    expect(isSignInHost('www.youtube.com')).toBe(false);
    expect(isSignInHost('google.com')).toBe(false);
    expect(isSignInHost('accounts.google.com.evil.test')).toBe(false);
    expect(isSignInHost('accounts.notgoogle.com')).toBe(false);
    expect(isSignInHost('')).toBe(false);
  });
});
