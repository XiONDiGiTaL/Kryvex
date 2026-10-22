/**
 * Reusable in-service one-time-code relay.
 *
 * Sign-in codes are normally entered into a field rendered by the site, which
 * can be scrolled away, hidden behind a modal or unwilling to take focus inside
 * an embedded webview. Kryvex mirrors the prompt in the service chrome and
 * writes the code straight into the site's own field, then presses the site's
 * own submit control. The code is never stored, logged or sent to Kryvex.
 *
 * Profiles cover providers whose fields have stable selectors. Everything else
 * falls back to the `autocomplete="one-time-code"` convention plus a narrow
 * field heuristic, so a new service works without a code change.
 */

export interface OneTimeCodeProfile {
  id: string;
  /** Translation key for the strip title. Brand names stay untranslated. */
  label: string;
  /** CSS selectors that identify the provider's code field, best first. */
  selectors: string[];
  /** Provider submit controls, when the code field is not inside a form. */
  submitSelectors: string[];
  /** Fixed code length, or null to take it from the page's maxlength. */
  length: number | null;
  /** Fixed character class, or null to follow the field's own hints. */
  numeric: boolean | null;
  /** Allow the generic field heuristic when selectors miss. */
  fallback: boolean;
}

export interface OneTimeCodePrompt {
  profileId: string;
  label: string;
  length: number;
  numeric: boolean;
  /** True when the code is spread across several one-character boxes. */
  split: boolean;
}

const STEAM_PROFILE: OneTimeCodeProfile = {
  id: 'steam',
  label: 'Steam Guard',
  selectors: [
    '#twofactorcode_entry',
    'input[name="authcode"]',
    'input[autocomplete="one-time-code"]',
  ],
  submitSelectors: [
    '#login_twofactorauth_buttonset_entercode .auth_button.leftbtn',
    '.loginTwoFactorCodeModal .auth_button',
  ],
  length: 5,
  numeric: false,
  fallback: false,
};

const GITHUB_PROFILE: OneTimeCodeProfile = {
  id: 'github',
  label: 'Verification code',
  selectors: [
    '#app_totp',
    'input[name="otp"]',
    'input[autocomplete="one-time-code"]',
  ],
  submitSelectors: [],
  length: 6,
  numeric: true,
  fallback: true,
};

const DISCORD_PROFILE: OneTimeCodeProfile = {
  id: 'discord',
  label: 'Verification code',
  selectors: ['input[autocomplete="one-time-code"]', 'input[name="code"]'],
  submitSelectors: [],
  length: 6,
  numeric: true,
  fallback: true,
};

const MICROSOFT_PROFILE: OneTimeCodeProfile = {
  id: 'microsoft',
  label: 'Verification code',
  selectors: [
    '#idTxtBx_SAOTCC_OTC',
    'input[name="otc"]',
    'input[autocomplete="one-time-code"]',
  ],
  submitSelectors: ['#idSubmit_SAOTCC_Continue'],
  length: 6,
  numeric: true,
  fallback: true,
};

/** The standards-based fallback: any field a site marks as a one-time code. */
const GENERIC_PROFILE: OneTimeCodeProfile = {
  id: 'generic',
  label: 'Verification code',
  selectors: ['input[autocomplete="one-time-code"]'],
  submitSelectors: [],
  length: null,
  numeric: null,
  fallback: true,
};

/** Host/path pairs narrow the branded fields to real sign-in surfaces. */
const HOST_PROFILES: ReadonlyArray<{
  profile: OneTimeCodeProfile;
  hosts: string[];
  paths: RegExp;
}> = [
  {
    profile: STEAM_PROFILE,
    hosts: ['steamcommunity.com', 'steampowered.com'],
    paths: /\/(login|openid|jwt)\b/i,
  },
  {
    profile: GITHUB_PROFILE,
    hosts: ['github.com'],
    paths: /\/(login|session|sessions|two-factor)\b/i,
  },
  {
    profile: DISCORD_PROFILE,
    hosts: ['discord.com'],
    paths: /\/(login|register|verify|auth|mfa|2fa)\b/i,
  },
  {
    profile: MICROSOFT_PROFILE,
    hosts: ['login.microsoftonline.com', 'login.live.com'],
    paths: /\/(login|oauth2|common|federation|consumers)\b/i,
  },
];

function hostMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

/**
 * The profile for a service page. Returns the generic profile for any web page,
 * because the field check happens in the page; no prompt appears unless a real
 * code field is visible.
 */
export function matchOneTimeCodeProfile(raw: unknown): OneTimeCodeProfile | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const hostname = url.hostname.toLowerCase();
  for (const entry of HOST_PROFILES) {
    if (!entry.hosts.some(domain => hostMatches(hostname, domain))) continue;
    if (!entry.paths.test(url.pathname)) continue;
    return entry.profile;
  }
  return GENERIC_PROFILE;
}

/** Resolve a profile id reported by the page probe. */
export function oneTimeCodeProfileById(id: string): OneTimeCodeProfile | null {
  return [STEAM_PROFILE, GITHUB_PROFILE, DISCORD_PROFILE, MICROSOFT_PROFILE, GENERIC_PROFILE]
    .find(profile => profile.id === id) ?? null;
}

/** Validates an untrusted probe result before the renderer mirrors it. */
export function parseOneTimeCodePrompt(value: unknown): OneTimeCodePrompt | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.profileId !== 'string') return null;
  const matched = oneTimeCodeProfileById(candidate.profileId);
  if (!matched) return null;
  const length = Number(candidate.length);
  if (!Number.isInteger(length) || length < 1 || length > 12) return null;
  const split = candidate.split === true;
  if (split && (length < 4 || length > 8)) return null;
  return {
    profileId: matched.id,
    // Copy comes from the registry, never from page-controlled text.
    label: matched.label,
    length,
    numeric: candidate.numeric === true,
    split,
  };
}

/** Identity check so the polling probe does not re-render an unchanged prompt. */
export function sameOneTimeCodePrompt(
  left: OneTimeCodePrompt | null,
  right: OneTimeCodePrompt | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.profileId === right.profileId
    && left.label === right.label
    && left.length === right.length
    && left.numeric === right.numeric
    && left.split === right.split;
}

function clean(raw: string, numeric: boolean): string {
  return numeric ? raw.replace(/[^0-9]/g, '') : raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Normalize a typed or pasted code to the prompt's alphabet and length. */
export function normalizeOneTimeCode(raw: string, prompt: OneTimeCodePrompt): string {
  return clean(raw, prompt.numeric).slice(0, Math.max(1, prompt.length));
}

/**
 * Complete means the raw input has exactly the expected number of characters.
 * Truncating a longer paste and calling it valid would submit the wrong code.
 */
export function isValidOneTimeCode(raw: string, prompt: OneTimeCodePrompt): boolean {
  return clean(raw, prompt.numeric).length === prompt.length;
}

/**
 * Shared page-side field finder. It prefers the provider's selectors, then the
 * generic convention, then a narrow heuristic. A target is either one input or
 * a group of one-character boxes. Search, coupon, postal, password and e-mail
 * fields are explicitly excluded so a random input never receives a code.
 */
function fieldFinderSource(): string {
  return `
    const visible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.opacity !== '0'
        && style.pointerEvents !== 'none'
        && rect.width > 4
        && rect.height > 4;
    };
    const editable = (node) =>
      node instanceof HTMLInputElement
      && !node.disabled
      && !node.readOnly
      && visible(node)
      && !/^(password|email|search|checkbox|radio|hidden|file|submit|button|reset)$/i.test(node.type);
    const oneChar = (node) =>
      editable(node)
      && (node.maxLength === 1 || node.getAttribute('maxlength') === '1');
    const groupKey = (input) => {
      const raw = (input.name || input.id || '').trim();
      if (!raw) return '';
      if (raw.endsWith(']')) {
        const open = raw.lastIndexOf('[');
        const index = raw.slice(open + 1, -1);
        if (open > 0 && /^[0-9]+$/.test(index)) return raw.slice(0, open);
      }
      return raw.replace(/[0-9]+$/, '').replace(/[ _-]+$/, '');
    };
    const splitGroup = (seed) => {
      const within = (scope) => Array.from(scope.querySelectorAll('input')).filter(oneChar);
      const parent = seed.parentElement ? within(seed.parentElement) : [];
      if (parent.length >= 4 && parent.length <= 8) return parent;
      const container = seed.closest('fieldset')
        || seed.closest('[role="group"]')
        || seed.form
        || document;
      const candidates = within(container);
      const key = groupKey(seed);
      if (key) {
        const keyed = candidates.filter(input => groupKey(input) === key);
        if (keyed.length >= 4 && keyed.length <= 8) return keyed;
      }
      return candidates.length >= 4 && candidates.length <= 8 ? candidates : null;
    };
    const otpHints = (input) => [
      input.name,
      input.id,
      input.getAttribute('autocomplete'),
      input.getAttribute('aria-label'),
      input.placeholder,
    ].join(' ');
    const excludedHints = /search|promo|coupon|gift|voucher|invite|referral|discount|redeem|activation|postal|zip|country|state|tracking|username|password|email|phone/i;
    const codeTarget = (spec) => {
      for (const selector of spec.selectors) {
        const found = document.querySelector(selector);
        if (!editable(found)) continue;
        if (oneChar(found)) {
          const inputs = splitGroup(found);
          if (inputs) return { inputs };
          continue;
        }
        return { input: found };
      }
      if (!spec.fallback) return null;
      const boxes = Array.from(document.querySelectorAll('input')).filter(oneChar);
      for (const seed of boxes) {
        const inputs = splitGroup(seed);
        if (!inputs) continue;
        const hints = inputs.map(otpHints).join(' ');
        if (!/one.?time|otp|2fa|mfa|verif|auth.?code|security.?code|login.?code|sign.?in.?code|access.?code|code|pin/i.test(hints)) {
          continue;
        }
        if (excludedHints.test(hints)) continue;
        return { inputs };
      }
      return Array.from(document.querySelectorAll('input')).find((input) => {
        if (!editable(input) || oneChar(input)) return false;
        const hints = otpHints(input);
        if (!/one.?time|otp|2fa|mfa|verif|auth.?code|security.?code|login.?code|sign.?in.?code|access.?code/i.test(hints)) {
          return false;
        }
        if (excludedHints.test(hints)) return false;
        const max = Number(input.maxLength);
        return !max || (max >= 4 && max <= 8);
      }) || null;
    };
  `;
}

/**
 * Page-side probe. Returns null unless an enabled code field is actually
 * visible, plus the length and alphabet the field expects.
 */
export function oneTimeCodeProbeScript(profile: OneTimeCodeProfile): string {
  const spec = JSON.stringify({
    id: profile.id,
    label: profile.label,
    selectors: profile.selectors,
    fallback: profile.fallback,
    length: profile.length,
    numeric: profile.numeric,
  });
  return `(() => {
    const spec = ${spec};
    ${fieldFinderSource()}
    const target = codeTarget(spec);
    if (!target) return null;
    const inputs = target.inputs || [target.input];
    if (inputs.length === 0) return null;
    const first = inputs[0];
    const numeric = spec.numeric === null
      ? inputs.every(input =>
          input.inputMode === 'numeric'
          || input.type === 'number'
          || input.type === 'tel'
          || /^[0-9\\s*-]+$/.test(input.getAttribute('pattern') || '')
        )
      : spec.numeric;
    const max = Number(first.maxLength);
    const length = target.inputs
      ? inputs.length
      : (spec.length || (max >= 4 && max <= 8 ? max : 6));
    return {
      profileId: spec.id,
      label: spec.label,
      length,
      numeric,
      split: Boolean(target.inputs),
    };
  })()`;
}

/**
 * Fill the site's field and press its own submit control.
 * Returns 'ok', 'missing' (page moved on) or 'no-submit'.
 */
export function oneTimeCodeSubmitScript(
  profile: OneTimeCodeProfile,
  prompt: OneTimeCodePrompt,
  raw: string,
): string {
  const normalized = normalizeOneTimeCode(raw, prompt);
  const code = JSON.stringify(normalized);
  const spec = JSON.stringify({
    selectors: profile.selectors,
    submitSelectors: profile.submitSelectors,
    fallback: profile.fallback,
  });
  return `(() => {
    const spec = ${spec};
    ${fieldFinderSource()}
    const target = codeTarget(spec);
    if (!target) return 'missing';
    const inputs = target.inputs || [target.input];
    if (inputs.length === 0) return 'missing';
    if (target.inputs && inputs.length !== ${normalized.length}) return 'missing';
    const setValue = (input, value) => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      if (setter) setter.call(input, value);
      else input.value = value;
      const event = typeof InputEvent === 'function'
        ? new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value })
        : new Event('input', { bubbles: true });
      input.dispatchEvent(event);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    if (target.inputs) {
      const characters = ${code}.split('');
      inputs.forEach((input, index) => setValue(input, characters[index] || ''));
      inputs[inputs.length - 1].focus();
    } else {
      setValue(inputs[0], ${code});
      inputs[0].focus();
    }
    const form = inputs[0].form || inputs[0].closest('form');
    const split = Boolean(target.inputs);
    return new Promise(resolve => {
      setTimeout(() => {
        // A split widget often submits itself on the last digit. Give it time
        // and do not submit a second time if it has already moved on.
        if (split && (!inputs[0].isConnected || !visible(inputs[0]))) {
          resolve('ok');
          return;
        }
        const submit = spec.submitSelectors
          .map(selector => document.querySelector(selector))
          .find(node => node && visible(node));
        if (submit) {
          if (submit.disabled) {
            resolve(split ? 'ok' : 'no-submit');
            return;
          }
          submit.click();
          resolve('ok');
          return;
        }
        if (form && !form.isConnected) {
          resolve(split ? 'ok' : 'no-submit');
          return;
        }
        if (form) {
          const button = Array.from(
            form.querySelectorAll('button[type="submit"], input[type="submit"]'),
          ).find(node => visible(node));
          if (button) {
            if (button.disabled) {
              resolve(split ? 'ok' : 'no-submit');
              return;
            }
            button.click();
          } else {
            form.requestSubmit();
          }
          resolve('ok');
          return;
        }
        resolve('no-submit');
      }, split ? 220 : 70);
    });
  })()`;
}

/** Focus and scroll the site's own field for users who prefer its modal. */
export function oneTimeCodeFocusScript(profile: OneTimeCodeProfile): string {
  const spec = JSON.stringify({
    selectors: profile.selectors,
    fallback: profile.fallback,
  });
  return `(() => {
    const spec = ${spec};
    ${fieldFinderSource()}
    const target = codeTarget(spec);
    const input = target ? (target.input || target.inputs[0]) : null;
    if (!input) return false;
    input.scrollIntoView({ block: 'center', inline: 'nearest' });
    input.focus();
    return true;
  })()`;
}
