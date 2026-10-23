#!/usr/bin/env node
/**
 * Flags reads of a window or its contents inside `closed`/`destroyed` handlers.
 *
 * Electron destroys the object before those events fire, so `win.webContents`,
 * `contents.getURL()` and friends throw `Object has been destroyed` there. The
 * exception escapes the listener and Electron shows its "A JavaScript error
 * occurred in the main process" dialog, which is exactly the crash 0.8.1 fixed
 * in `electron/party.ts`.
 *
 * This is a heuristic scan, not a parser: it looks at the lines that follow a
 * `once('closed')`/`on('destroyed')` registration, skips comments and lines that
 * already ask `isDestroyed()`, and treats the rest as "worth a look".
 *
 *   node scripts/audit-lifecycle.cjs              scan electron/
 *   node scripts/audit-lifecycle.cjs FILE...      scan specific files
 */
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_ROOT = path.join(__dirname, '..', 'electron');
const LOOKAHEAD = 14;
const HANDLER = /\.(?:once|on)\(\s*['"](closed|destroyed)['"]/;

const RISKY = [
  { re: /\.webContents\b/, label: 'reads .webContents on a window that may be destroyed' },
  { re: /\.mainFrame\b/, label: 'reads .mainFrame on contents that may be destroyed' },
  { re: /\.getURL\(/, label: 'calls getURL() on an object that may be destroyed' },
  { re: /\.getTitle\(/, label: 'calls getTitle() on an object that may be destroyed' },
  { re: /\.isLoading\(|\.isVisible\(|\.capturePage\(/, label: 'calls a window method that throws once destroyed' },
];

function collect(target) {
  const stat = fs.statSync(target, { throwIfNoEntry: false });
  if (!stat) return [];
  if (stat.isFile()) return [target];
  return fs
    .readdirSync(target)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => path.join(target, name));
}

function isComment(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

/**
 * The handler body, found by brace balance from the registration line. Braces
 * inside strings or comments are counted too: good enough for this codebase,
 * and a mis-measured block only widens or narrows a heuristic report.
 */
function handlerBody(lines, start) {
  const body = [];
  let depth = 0;
  let seen = false;
  for (let index = start; index < lines.length && body.length < LOOKAHEAD; index += 1) {
    const line = lines[index];
    body.push({ number: index + 1, text: line });
    for (const character of line) {
      if (character === '{') {
        depth += 1;
        seen = true;
      } else if (character === '}') {
        depth -= 1;
      }
    }
    if (seen && depth <= 0) break;
  }
  return body;
}

function scanFile(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const findings = [];
  for (let index = 0; index < lines.length; index += 1) {
    const handler = HANDLER.exec(lines[index]);
    if (!handler) continue;
    for (const { number, text } of handlerBody(lines, index)) {
      if (isComment(text)) continue;
      if (text.includes('isDestroyed()')) continue;
      for (const rule of RISKY) {
        if (!rule.re.test(text)) continue;
        findings.push({
          file,
          line: number,
          event: handler[1],
          label: rule.label,
          text: text.trim(),
        });
        break;
      }
    }
  }
  return findings;
}

function main() {
  const args = process.argv.slice(2);
  const targets = args.length > 0 ? args : [DEFAULT_ROOT];
  const findings = targets.flatMap((target) => collect(target).flatMap(scanFile));

  if (findings.length === 0) {
    const scanned = targets.flatMap(collect).length;
    console.log(`No window reads inside close/destroy handlers (${scanned} files).`);
    return 0;
  }

  for (const finding of findings) {
    const where = path.relative(process.cwd(), finding.file);
    console.error(
      `${where}:${finding.line}  ${finding.label} inside '${finding.event}'\n    ${finding.text}`,
    );
  }
  console.error(
    '\nCapture the reference while the window is alive and ask isDestroyed() instead, ' +
      'or wrap the read in try/catch. See electron/lifecycle.ts.',
  );
  return 1;
}

process.exit(main());
