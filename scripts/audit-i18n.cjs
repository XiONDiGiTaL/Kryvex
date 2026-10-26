#!/usr/bin/env node
/**
 * Finds user-visible English strings in the renderer that never reach `t()`.
 *
 * The app ships four locales (en/es/de/fr), so a hardcoded sentence silently
 * drops the other three. This is a heuristic scan, not a parser: it looks at
 * JSX text nodes and a short list of human-facing attributes, skips anything
 * that already sits inside a `t(...)` call, and ignores technical tokens
 * (brand names, file names, keyboard shortcuts, CSS classes). Treat anything it
 * prints as "worth a look", not "definitely broken".
 *
 *   node scripts/audit-i18n.cjs           human report
 *   node scripts/audit-i18n.cjs --json    machine report
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOTS = ['src'];
const SKIP_FILES = new Set([path.join('src', 'lib', 'i18n.tsx')]);
const EXTENSIONS = new Set(['.tsx']);

const HUMAN_ATTRIBUTES = [
  'title',
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'placeholder',
  'alt',
  'label',
  'description',
  'heading',
  'message',
  'tooltip',
];

/** Words that look human but are identifiers, brands or platform names. */
const TECHNICAL = [
  /^[A-Z_]+$/,
  /^[a-z]+[A-Z]\w*$/,
  /^[\w-]+\.(json|gguf|crdownload|part|torrent|zip|dmg|exe|appimage)$/i,
  /^(Ctrl|Shift|Alt|Meta|Cmd|Super)\b/,
  // OpenVPN/CLI flag examples are syntax, not copy.
  /^--[a-z0-9-]+(\s+\S+)*$/i,
  /^(https?|magnet|file|kryvex|data):/i,
  // Product names are identical in every locale, including the companion app's.
  /^(Kryvex|Kyvex|Vexium|Veyra|Vex|XiONDiGiTaL|GitHub|Google|Discord|YouTube|Wikipedia|DuckDuckGo|Bing|Electron|Chromium|Torrent|WebTorrent|GGUF|Llama|uBlock|Ghostery|AdGuard)\b/,
  /^[#./][\w./-]+$/,
  /^[\w-]+(\.[\w-]+)+(\/[\w./-]*)?$/,
  /^\w+(\/[\w.-]+)+$/,
  /^(Promise|Map|Set|Array|Object|String|Number|Boolean|Date|JSON|React|Element)$/,
  // Edition marks are brand names: identical in every locale.
  /^Special (Donkey|XiØN) Edition$/,
];

/** Anything that reads like source code rather than copy. */
const CODE_SHAPED = [
  /[=;{}]|=>/,
  /\)\s*[,;:]/,
  /\b(const|let|var|return|function|import|export|useState|useRef|useMemo|useEffect|useCallback)\b/,
];

const IGNORE_TEXT = new Set([
  '|', '·', '•', '–', '…', '×', '→', '←', '↑', '↓', '&', '/', ':', ',', '.', '-', '+', '*',
]);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(full, files);
    } else if (EXTENSIONS.has(path.extname(entry.name)) && !SKIP_FILES.has(full)) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Columns where the scanned index sits inside a `t(` call, so JSX text and
 * attributes there are already translated.
 */
function translatedSpans(source) {
  const spans = [];
  const pattern = /\bt\(\s*/g;
  let match;
  while ((match = pattern.exec(source))) {
    const open = match.index + match[0].length - 1;
    const close = matchingParen(source, open);
    if (close > open) spans.push([open, close]);
  }
  return spans;
}

function matchingParen(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const char = source[i];
    if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function inside(spans, index) {
  return spans.some(([start, end]) => index >= start && index <= end);
}

function looksHuman(text) {
  const value = text.replace(/\s+/g, ' ').trim();
  if (value.length < 2 || IGNORE_TEXT.has(value)) return false;
  if (!/[A-Za-z]{2}/.test(value)) return false;
  if (/^[{}()[\];,.<>=+\-*/%!?&|]+$/.test(value)) return false;
  if (/[\u0000-\u001f]/.test(value)) return false;
  if (TECHNICAL.some(pattern => pattern.test(value))) return false;
  if (CODE_SHAPED.some(pattern => pattern.test(value))) return false;
  if (/^[,:;|]/.test(value)) return false;
  // A single short token is usually a glyph, key cap or CSS class.
  if (!/\s/.test(value) && (value.length < 4 || /^[a-z]/.test(value))) return false;
  return true;
}

function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (source[i] === '\n') line += 1;
  return line;
}

function scanFile(file) {
  const source = fs.readFileSync(file, 'utf8');
  const spans = translatedSpans(source);
  const findings = [];

  // JSX text nodes: `>Some words<`, allowing whitespace and newlines.
  const textPattern = />([^<>{}]{2,200})</g;
  let match;
  while ((match = textPattern.exec(source))) {
    const raw = match[1];
    const offset = match.index + 1;
    if (inside(spans, offset)) continue;
    if (!looksHuman(raw)) continue;
    findings.push({ file, line: lineOf(source, offset), kind: 'text', value: raw.replace(/\s+/g, ' ').trim() });
  }

  // Human-facing attributes with a literal string value.
  const attributePattern = new RegExp(
    `\\b(${HUMAN_ATTRIBUTES.join('|')})\\s*=\\s*("([^"]*)"|'([^']*)'|\\{\\s*("([^"]*)"|'([^']*)')\\s*\\})`,
    'g',
  );
  while ((match = attributePattern.exec(source))) {
    const offset = match.index;
    if (inside(spans, offset)) continue;
    const value = match[3] ?? match[4] ?? match[6] ?? match[7] ?? '';
    if (!looksHuman(value)) continue;
    findings.push({
      file,
      line: lineOf(source, offset),
      kind: match[1],
      value: value.replace(/\s+/g, ' ').trim(),
    });
  }

  return findings;
}

const files = ROOTS.flatMap(root => (fs.existsSync(root) ? walk(root) : []));
const findings = files.flatMap(scanFile).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(findings, null, 2)}\n`);
  process.exit(0);
}

if (findings.length === 0) {
  console.log(`No hardcoded UI strings found in ${files.length} renderer files.`);
  process.exit(0);
}

let currentFile = '';
for (const finding of findings) {
  if (finding.file !== currentFile) {
    currentFile = finding.file;
    console.log(`\n${currentFile}`);
  }
  console.log(`  ${finding.line}:${''} [${finding.kind}] ${finding.value}`);
}
console.log(`\n${findings.length} candidate(s) across ${files.length} files.`);
