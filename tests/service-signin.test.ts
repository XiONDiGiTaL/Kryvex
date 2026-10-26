import { describe, expect, it } from 'vitest';
import {
  cookieBelongsToModule,
  leftModuleSite,
  moduleHome,
  popupBelongsToModule,
  popupOutcome,
  returnsToOpener,
  signInReturnTarget,
  signsInWithin,
} from '../electron/service-signin';

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

describe('moduleHome', () => {
  it('keeps a product page and unwraps an account page', () => {
    expect(moduleHome('https://mail.google.com/mail/u/0/')).toBe('https://mail.google.com/mail/u/0/');
    expect(
      moduleHome(
        'https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Fmail.google.com%2Fmail%2Fu%2F0%2F&service=mail',
      ),
    ).toBe('https://mail.google.com/mail/u/0/');
    expect(
      moduleHome('https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F'),
    ).toBe('https://www.youtube.com/');
  });

  it('falls back to the account page when it names no return target', () => {
    expect(moduleHome('https://accounts.google.com/v3/signin/identifier')).toBe(
      'https://accounts.google.com/v3/signin/identifier',
    );
  });
});

describe('signInReturnTarget', () => {
  it('reads the return target off an account page', () => {
    expect(
      signInReturnTarget('https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fmail.google.com%2F'),
    ).toBe('https://mail.google.com/');
  });

  it('refuses a target that is not a page, or a page that is not an account host', () => {
    expect(
      signInReturnTarget('https://accounts.google.com/ServiceLogin?continue=javascript%3Aalert(1)'),
    ).toBeNull();
    expect(signInReturnTarget('https://accounts.google.com/ServiceLogin')).toBeNull();
    expect(signInReturnTarget('https://evil.test/?continue=https%3A%2F%2Fmail.google.com%2F')).toBeNull();
    expect(signInReturnTarget('not a url')).toBeNull();
  });
});

describe('popupBelongsToModule', () => {
  it('folds the product page a sign-in returns to', () => {
    const accountPage =
      'https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Fmail.google.com%2Fmail%2Fu%2F0%2F';
    expect(popupBelongsToModule(accountPage, 'https://mail.google.com/mail/u/0/#inbox')).toBe(true);
    expect(popupBelongsToModule('https://www.youtube.com/', 'https://www.youtube.com/feed/you')).toBe(true);
  });

  it('folds a sign-in that finishes on another Google host', () => {
    expect(
      popupBelongsToModule(
        'https://mail.google.com/mail/u/0/',
        'https://www.google.com/accounts/CheckCookie?continue=1',
        true,
      ),
    ).toBe(true);
    expect(
      popupBelongsToModule('https://www.youtube.com/', 'https://accounts.google.com/v3/signin/challenge', true),
    ).toBe(false);
  });

  it('leaves an ordinary Google link and a third-party sign-in in their own window', () => {
    expect(
      popupBelongsToModule('https://mail.google.com/', 'https://www.google.com/accounts/CheckCookie'),
    ).toBe(false);
    expect(
      popupBelongsToModule('https://www.notion.so/', 'https://accounts.google.com/v3/signin?a=1', true),
    ).toBe(false);
  });
});

describe('popupOutcome', () => {
  it('folds a popup whose last page belongs in the module', () => {
    expect(
      popupOutcome('https://mail.google.com/', [
        'https://accounts.google.com/v3/signin/identifier',
        'https://mail.google.com/mail/u/0/',
      ]),
    ).toEqual({ kind: 'fold', url: 'https://mail.google.com/mail/u/0/' });
  });

  it('reloads after a popup that only reached an account page', () => {
    expect(
      popupOutcome('https://mail.google.com/', [
        'https://accounts.google.com/v3/signin/identifier',
        'https://accounts.google.com/signin/v2/challenge/totp',
      ]),
    ).toEqual({ kind: 'reload' });
  });

  it('reloads a module left on an account page once its popup closes', () => {
    expect(popupOutcome('https://accounts.google.com/v3/signin/identifier', [])).toEqual({
      kind: 'reload',
    });
  });

  it('reloads when the popup changed a cookie the module reads', () => {
    expect(
      popupOutcome('https://www.notion.so/', ['https://login.microsoftonline.com/common/oauth2'], true),
    ).toEqual({ kind: 'reload' });
  });

  it('leaves an unrelated popup alone', () => {
    expect(popupOutcome('https://www.notion.so/', ['https://www.example.com/help'])).toEqual({
      kind: 'none',
    });
    expect(popupOutcome('https://mail.google.com/', ['about:blank'])).toEqual({ kind: 'none' });
  });

  it('leaves a popup that never left the module in its own window', () => {
    expect(
      popupOutcome('https://mail.google.com/mail/u/0/', ['https://mail.google.com/mail/u/0/#compose']),
    ).toEqual({ kind: 'none' });
  });
});

describe('leftModuleSite', () => {
  it('reports a popup that went to another site and one that stayed', () => {
    expect(
      leftModuleSite('https://mail.google.com/', [
        'https://accounts.google.com/v3/signin/identifier',
        'https://mail.google.com/mail/u/0/',
      ]),
    ).toBe(true);
    expect(leftModuleSite('https://mail.google.com/', ['https://mail.google.com/mail/u/0/'])).toBe(false);
  });
});

describe('cookieBelongsToModule', () => {
  it('accepts the module host, its parent domain and nothing else', () => {
    expect(cookieBelongsToModule('.google.com', 'https://mail.google.com/')).toBe(true);
    expect(cookieBelongsToModule('mail.google.com', 'https://mail.google.com/')).toBe(true);
    expect(cookieBelongsToModule('.google.com', 'https://accounts.google.com/v3/signin')).toBe(true);
    expect(cookieBelongsToModule('.notgoogle.com', 'https://mail.google.com/')).toBe(false);
    expect(cookieBelongsToModule('', 'https://mail.google.com/')).toBe(false);
    expect(cookieBelongsToModule('.google.com', 'not a url')).toBe(false);
  });
});
