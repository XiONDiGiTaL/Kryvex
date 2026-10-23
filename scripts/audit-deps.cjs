#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Fails when a high or critical advisory sits in the dependency tree.
 *
 * Dependabot alerts are off for this repository, so the lockfile is checked
 * here on every CI run instead. Unlike `pnpm audit --prod` this reads every
 * scope: Electron is declared as a dev dependency but ships as the shell, so
 * restricting the audit to production dependencies would miss the component
 * most likely to need a security bump.
 *
 * Advisories that cannot be fixed and cannot be reached are listed in
 * ALLOWED with the reason they are safe to carry and the date the reason must
 * be re-checked by. Keep each entry tied to one GHSA id, re-check it when the
 * dependency moves, and delete it once the upgrade lands: the run warns about
 * entries it no longer sees. An entry whose review date has passed stops the
 * gate, so a carve-out cannot outlive the reasoning that justified it.
 *
 * Run it with `pnpm audit:deps`. It fails closed when the audit cannot run,
 * because a green check that never executed is worse than a red one.
 */
const { spawnSync } = require('node:child_process');

const GATED = new Set(['high', 'critical']);

/**
 * Advisories this repository knowingly carries.
 *
 * `reviewBy` is a UTC date (YYYY-MM-DD). The exception is valid through that
 * day; from the next day the gate fails until someone re-checks it and moves
 * the date. Six months is the intended cadence, so an unpatched advisory gets
 * revisited twice a year rather than whenever someone remembers.
 */
const ALLOWED = [
  {
    id: 'GHSA-2p57-rm9w-gvfp',
    module: 'ip',
    reviewBy: '2027-04-22',
    reason:
      "no patched release; reached only by bittorrent-tracker's tracker-server parser, which calls ip.toString, while the advisory covers isPublic. Kryvex runs tracker clients and never a server.",
  },
];

const REVIEW_DATE = /^\d{4}-\d{2}-\d{2}$/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** Today in UTC, so a local run and CI agree on when an exception lapses. */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * A calendared YYYY-MM-DD. Date.parse alone is not enough: it quietly rolls
 * 2027-02-31 forward to March, so the parse has to round-trip to be accepted.
 */
function isReviewDate(value) {
  if (!REVIEW_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Refuses to run with an exception that is stale, undated or unreadable.
 * Checked before the audit itself so a policy problem fails in a second and
 * never depends on what the registry happens to return.
 */
function checkExceptions() {
  const now = today();
  const problems = [];
  for (const entry of ALLOWED) {
    const id = entry.id || '(entry with no id)';
    const reviewBy = String(entry.reviewBy || '');
    if (!isReviewDate(reviewBy)) {
      problems.push(`${id} needs a review date: set reviewBy to a real YYYY-MM-DD.`);
    } else if (reviewBy < now) {
      problems.push(
        `${id} (${entry.module}) was due for review on ${reviewBy} and is now ${now}.`,
      );
    }
  }
  if (problems.length === 0) return;
  for (const problem of problems) console.error(`  STALE        ${problem}`);
  console.error(
    'dependency audit: FAIL — re-check each exception in scripts/audit-deps.cjs: confirm the advisory is still unreachable or land the upgrade, then move reviewBy. Delete the entry if it is no longer needed.',
  );
  process.exit(1);
}

checkExceptions();

// A fixed command string: `pnpm` is a .cmd shim on Windows, which Node only
// starts through a shell, and the arguments must never be interpolated.
const audit = spawnSync('pnpm audit --json', {
  encoding: 'utf8',
  shell: true,
  maxBuffer: 32 * 1024 * 1024,
});

if (audit.error) fail(`dependency audit: FAIL — pnpm audit could not start: ${audit.error.message}`);

const stdout = audit.stdout || '';
const start = stdout.indexOf('{');
if (start < 0) {
  const detail = (audit.stderr || stdout || '').trim().split('\n').slice(-3).join(' ');
  fail(`dependency audit: FAIL — pnpm audit returned no JSON${detail ? `: ${detail}` : ''}`);
}
// Exit 1 means advisories were found, which is the only non-zero code with JSON.
if (audit.status !== 0 && audit.status !== 1) {
  const detail = (audit.stderr || '').trim().split('\n').slice(-3).join(' ');
  fail(`dependency audit: FAIL — pnpm audit exited ${audit.status}${detail ? `: ${detail}` : ''}`);
}

let report;
try {
  report = JSON.parse(stdout.slice(start));
} catch {
  fail('dependency audit: FAIL — pnpm audit returned unreadable JSON.');
}

const advisories = Object.values(report.advisories || {});
const allowlist = new Map(ALLOWED.map(entry => [entry.id, entry]));
const seen = new Set();
const blocking = [];

for (const advisory of advisories) {
  const id = advisory.github_advisory_id || String(advisory.id);
  const severity = String(advisory.severity || '').toLowerCase();
  const name = advisory.module_name || 'unknown package';
  const allowed = allowlist.get(id);
  if (allowed) {
    seen.add(id);
    console.log(`  allowlisted  ${severity.padEnd(8)} ${name} — ${id} (review by ${allowed.reviewBy})`);
    console.log(`               ${allowed.reason}`);
    continue;
  }
  if (!GATED.has(severity)) {
    console.log(`  below gate   ${severity.padEnd(8)} ${name} — ${id}`);
    continue;
  }
  blocking.push({ id, severity, name, title: advisory.title || '' });
}

for (const advisory of blocking) {
  console.error(`  BLOCKING     ${advisory.severity.padEnd(8)} ${advisory.name} — ${advisory.id}`);
  if (advisory.title) console.error(`               ${advisory.title}`);
  console.error('               no exception on file; see scripts/audit-deps.cjs');
}

for (const entry of ALLOWED) {
  if (seen.has(entry.id)) continue;
  console.warn(
    `dependency audit: note — the exception for ${entry.module} (${entry.id}) no longer matches anything; remove it from scripts/audit-deps.cjs.`,
  );
}

if (blocking.length > 0) {
  fail(`dependency audit: FAIL — ${blocking.length} high or critical advisory${blocking.length === 1 ? '' : 'ies'}.`);
}

const total = advisories.length;
console.log(
  `dependency audit: PASS — ${total} advisor${total === 1 ? 'y' : 'ies'}, ${seen.size} allowlisted.`,
);
