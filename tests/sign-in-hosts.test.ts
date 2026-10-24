import { describe, expect, it } from 'vitest';
import { isGoogleSite, isSignInHost } from '../electron/sign-in-hosts';

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

describe('isGoogleSite', () => {
  it('covers the account hosts and the products they return to', () => {
    for (const host of [
      'accounts.google.com',
      'myaccount.google.com',
      'accounts.youtube.com',
      'mail.google.com',
      'drive.google.com',
      'www.youtube.com',
      'music.youtube.com',
      'youtu.be',
      'google.com',
      'www.google.co.uk',
      'www.google.com.au',
      'ssl.gstatic.com',
      'lh3.googleusercontent.com',
    ]) {
      expect(isGoogleSite(host), host).toBe(true);
    }
  });

  it('normalises the host forms a probe can hand over', () => {
    expect(isGoogleSite('Mail.Google.COM')).toBe(true);
    expect(isGoogleSite('www.youtube.com:443')).toBe(true);
  });

  it('does not claim lookalikes or unrelated services', () => {
    for (const host of [
      'accounts.google.com.evil.test',
      'notgoogle.com',
      'google.com.evil.test',
      'youtube.com.evil.test',
      'example.com',
      'github.com',
      '',
    ]) {
      expect(isGoogleSite(host), host).toBe(false);
    }
  });
});
