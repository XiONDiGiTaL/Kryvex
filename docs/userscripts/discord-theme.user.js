// ==UserScript==
// @name         Discord Theme (Kryvex)
// @namespace    https://xiondigital.net/kryvex/userscripts/discord-theme
// @version      1.0.0
// @description  Recolours Discord's web client through its own CSS variables, with an editable palette at the top.
// @match        *://discord.com/*
// @match        *://*.discord.com/*
// @match        *://*.discordapp.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

/*
 * A theme, not a client mod.
 *
 * BetterDiscord themes are CSS: they recolour Discord's own client through the
 * custom properties it already publishes. That part needs nothing from
 * Discord's internals, so this file does the same job from a userscript without
 * asking Discord to load anybody's plugin system.
 *
 * Where it runs matters. Kryvex runs userscripts in browser tabs; a service
 * module keeps a signed-in profile and is deliberately never touched by a
 * script, so the Discord module keeps its own colours. Open discord.com in a
 * tab to see this.
 *
 * Edit PALETTE and reload. Nothing here loads a remote font, image or
 * stylesheet: a theme that fetches a URL can report the page it was painted on.
 */
var PALETTE = {
  // Backdrops: darkest for the chrome, lighter for raised surfaces.
  backdrop: '#12141a',
  panel: '#181b23',
  panelRaised: '#1f2430',
  floating: '#242a38',
  input: '#1b1f29',
  // Text.
  text: '#e6e8ee',
  textMuted: '#9aa3b5',
  heading: '#f4f6fb',
  // One accent for links, mentions, buttons and the selection swatch.
  accent: '#8b7cf6',
  accentHover: '#a396ff',
  // Scrollbars, so they stop being the browser's default grey.
  scrollbar: '#39415280',
};

var CSS = [
  ':root,',
  'html.theme-dark,',
  'html.theme-darker,',
  'html.theme-midnight,',
  'html.theme-light {',
  '  --background-primary: ' + PALETTE.panel + ';',
  '  --background-secondary: ' + PALETTE.backdrop + ';',
  '  --background-secondary-alt: ' + PALETTE.backdrop + ';',
  '  --background-tertiary: ' + PALETTE.backdrop + ';',
  '  --background-accent: ' + PALETTE.input + ';',
  '  --background-floating: ' + PALETTE.floating + ';',
  '  --background-nested-floating: ' + PALETTE.floating + ';',
  '  --background-mobile-primary: ' + PALETTE.panel + ';',
  '  --background-mobile-secondary: ' + PALETTE.backdrop + ';',
  '  --background-modifier-hover: rgba(255, 255, 255, 0.04);',
  '  --background-modifier-active: rgba(255, 255, 255, 0.07);',
  '  --background-modifier-selected: rgba(139, 124, 246, 0.18);',
  '  --background-modifier-accent: rgba(255, 255, 255, 0.06);',
  '  --channeltextarea-background: ' + PALETTE.input + ';',
  '  --activity-card-background: ' + PALETTE.panelRaised + ';',
  '  --deprecated-card-bg: ' + PALETTE.panelRaised + ';',
  '  --deprecated-card-editable-bg: ' + PALETTE.panelRaised + ';',
  '  --deprecated-store-bg: ' + PALETTE.backdrop + ';',
  '  --deprecated-text-input-bg: ' + PALETTE.input + ';',
  '  --text-normal: ' + PALETTE.text + ';',
  '  --text-primary: ' + PALETTE.text + ';',
  '  --text-secondary: ' + PALETTE.textMuted + ';',
  '  --text-muted: ' + PALETTE.textMuted + ';',
  '  --text-link: ' + PALETTE.accent + ';',
  '  --header-primary: ' + PALETTE.heading + ';',
  '  --header-secondary: ' + PALETTE.textMuted + ';',
  '  --channels-default: ' + PALETTE.textMuted + ';',
  '  --interactive-normal: ' + PALETTE.textMuted + ';',
  '  --interactive-hover: ' + PALETTE.text + ';',
  '  --interactive-active: ' + PALETTE.heading + ';',
  '  --interactive-muted: ' + PALETTE.textMuted + '66;',
  '  --brand-experiment: ' + PALETTE.accent + ';',
  '  --brand-500: ' + PALETTE.accent + ';',
  '  --brand-560: ' + PALETTE.accentHover + ';',
  '  --brand-experiment-560: ' + PALETTE.accentHover + ';',
  '  --scrollbar-thin-thumb: ' + PALETTE.scrollbar + ';',
  '  --scrollbar-auto-thumb: ' + PALETTE.scrollbar + ';',
  '  --scrollbar-auto-scrollbar-color-thumb: ' + PALETTE.scrollbar + ';',
  '  --scrollbar-auto-track: transparent;',
  '  --scrollbar-thin-track: transparent;',
  '}',
  '',
  '/* The app frame draws its own edge; give it the backdrop instead of a seam. */',
  'body {',
  '  background: ' + PALETTE.backdrop + ';',
  '}',
  '',
  '::selection {',
  '  background: ' + PALETTE.accent + '55;',
  '  color: ' + PALETTE.heading + ';',
  '}',
  '',
].join('\n');

var STYLE_ID = 'kryvex-discord-theme';

/**
 * Idempotent: a second call updates the sheet in place instead of stacking
 * copies, which matters because a single-page app keeps the document while it
 * replaces chunks of it.
 */
function applyTheme() {
  if (typeof document === 'undefined' || !document.documentElement) return;
  var host = document.head || document.documentElement;
  var style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    host.appendChild(style);
  }
  if (style.textContent !== CSS) style.textContent = CSS;
}

applyTheme();

// `dom-ready` can arrive before the head exists on a slow first paint; one retry
// is enough, because after that the sheet lives in the document.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyTheme, { once: true });
}
