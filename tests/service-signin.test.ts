import { describe, expect, it } from 'vitest';
import { returnsToOpener, signsInWithin } from '../electron/service-signin';

describe('signsInWithin', () => {
  it('keeps a Google product signing itself in inside the module', () => {
    expect(
      signsInWithin(
        'https://mail.google.com/mail/u/0/',
        'https://accounts.google.com/ServiceLogin?service=mail',
      ),
    ).toBe(true);
    expect(
      signsInWithin('https://www.youtube.com/', 'https://accounts.google.com/v3/signin/identifier'),
    ).toBe(true);
  });

  it('leaves a third-party sign-in popup alone', () => {
    // The flow hands its result back through `window.opener`, so it needs the
    // real popup.
    expect(signsInWithin('https://www.notion.so/login', 'https://accounts.google.com/o/oauth2')).toBe(
      false,
    );
    expect(signsInWithin('https://discord.com/channels/1', 'https://accounts.google.com/')).toBe(false);
  });

  it('is not fooled by a lookalike or an unreadable URL', () => {
    expect(signsInWithin('https://mail.google.com.evil.test/', 'https://accounts.google.com/')).toBe(
      false,
    );
    expect(signsInWithin('', 'https://accounts.google.com/')).toBe(false);
    expect(signsInWithin('https://mail.google.com/', 'not a url')).toBe(false);
    expect(signsInWithin('https://mail.google.com/', 'https://mail.google.com/')).toBe(false);
  });
});

describe('returnsToOpener', () => {
  it('matches the opener and its parent or child hosts', () => {
    expect(returnsToOpener('https://mail.google.com/mail/u/0/', 'https://mail.google.com/mail/u/0/#inbox')).toBe(
      true,
    );
    expect(returnsToOpener('https://mail.google.com/', 'https://workspace.google.com/intl/en/gmail/')).toBe(
      false,
    );
    expect(returnsToOpener('https://www.youtube.com/', 'https://music.youtube.com/')).toBe(false);
    expect(returnsToOpener('https://example.com/', 'https://www.example.com/')).toBe(true);
  });

  it('does not match a different site or an unreadable URL', () => {
    expect(returnsToOpener('https://mail.google.com/', 'https://accounts.google.com/')).toBe(false);
    expect(returnsToOpener('https://mail.google.com/', 'about:blank')).toBe(false);
    expect(returnsToOpener('', 'https://mail.google.com/')).toBe(false);
  });
});
