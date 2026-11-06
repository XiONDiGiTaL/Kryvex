/* eslint-disable no-console */
/**
 * Fails a release that does not carry its installer wizard capture.
 *
 * The release note is written before the tag, and the wizard is the one part of
 * a cut that no screenshot of the app can show, so the capture is committed with
 * the record under `docs/media/releases/<version>-wizard/`. The workflow runs
 * this before it builds anything, which makes a tag without a capture fail
 * instead of publishing a record that omits what the installer showed.
 *
 * The paperwork for a version is written after it publishes, and nothing else
 * reads it, so this also closes the loop on the release before the one being
 * cut: that record must have no `recorded after the cut` rows, its Artifacts
 * table must carry both sizes and digests, its PROJECT_STATUS section must be
 * `## Released`, and the README must still name its installers. Those are the
 * four edits `pnpm release:sync` makes, so a cut cannot ship on top of the
 * previous release's stale front page.
 *
 * Usage: `node scripts/check-release-record.cjs [version]` (defaults to
 * package.json), or `--all` to check every `docs/RELEASE_*.md` with a capture.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const all = args.includes('--all');

function versionFromArgs() {
  const explicit = args.find(argument => !argument.startsWith('--'));
  if (explicit) return explicit.replace(/^v/, '');
  return require(path.join(root, 'package.json')).version;
}

let failures = 0;

function check(name, ok, detail) {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `, ${detail}` : ''}`);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function packageVersion() {
  return require(path.join(root, 'package.json')).version;
}

function compareVersions(a, b) {
  const [leftCore, leftPre] = a.split('-');
  const [rightCore, rightPre] = b.split('-');
  const left = leftCore.split('.').map(Number);
  const right = rightCore.split('.').map(Number);
  const core = left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
  if (core !== 0) return core;
  // The plain release comes before the hotfixes that patch it, and hotfixes
  // order by their own suffix (`hotfix.2` after `hotfix.1`).
  if (!leftPre || !rightPre) return (leftPre ? 1 : 0) - (rightPre ? 1 : 0);
  const one = leftPre.split('.');
  const two = rightPre.split('.');
  for (let index = 0; index < Math.max(one.length, two.length); index += 1) {
    const first = one[index];
    const second = two[index];
    if (first === undefined) return -1;
    if (second === undefined) return 1;
    const numericFirst = Number(first);
    const numericSecond = Number(second);
    const diff =
      Number.isFinite(numericFirst) && Number.isFinite(numericSecond)
        ? numericFirst - numericSecond
        : first.localeCompare(second);
    if (diff !== 0) return diff;
  }
  return 0;
}

// The newest earlier record that has a capture: a record prepared but never cut
// is not a release whose paperwork has to be closed.
function previousRelease(version) {
  const earlier = fs
    .readdirSync(path.join(root, 'docs'))
    .filter(name => /^RELEASE_\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\.md$/.test(name))
    .map(name => name.replace(/^RELEASE_/, '').replace(/\.md$/, ''))
    .filter(other => compareVersions(other, version) < 0)
    .filter(other =>
      fs.existsSync(path.join(root, 'docs', 'media', 'releases', `${other}-wizard`, 'wizard.json')),
    )
    .sort((a, b) => compareVersions(b, a));
  return earlier.length > 0 ? earlier[0] : null;
}

/**
 * The four edits `pnpm release:sync` makes after a publish, checked against the
 * release before the one being cut. The version being cut is exempt by
 * construction: its own record says `recorded after the cut` and the README
 * still names the previous build until the release it is cutting goes live.
 */
function checkDocs(version) {
  const previous = previousRelease(version);
  if (!previous) {
    check('docs: there is no earlier release to close', true);
    return;
  }

  const status = fs.readFileSync(path.join(root, 'PROJECT_STATUS.md'), 'utf8');
  const released = new RegExp(`^## Released \\([^)]*, ${escapeRegExp(previous)}\\)$`, 'm').test(status);
  const prepared = new RegExp(`^## Prepared \\([^)]*, ${escapeRegExp(previous)}\\)$`, 'm').test(status);
  const closed = released && !prepared;
  check(
    `docs: ${previous} has a ## Released section`,
    closed,
    closed ? undefined : prepared ? 'still ## Prepared' : 'no status section',
  );

  const record = path.join(root, 'docs', `RELEASE_${previous}.md`);
  const markdown = fs.existsSync(record) ? fs.readFileSync(record, 'utf8') : '';
  const noPlaceholder = !/^\|.*recorded after the cut.*\|$/m.test(markdown);
  check(
    `docs: ${previous}'s record has no placeholder sizes`,
    noPlaceholder,
    noPlaceholder ? undefined : 'a table row still says the sizes arrive after the cut',
  );

  const filled = ['Setup', 'Portable'].filter(kind =>
    new RegExp(
      `^\\| \`Kryvex-${kind}-${escapeRegExp(previous)}-x64\\.exe\` \\| [\\d,]+ B \\| \`[0-9a-f]{64}\` \\|$`,
      'm',
    ).test(markdown),
  );
  check(`docs: ${previous}'s Artifacts carry both sizes and digests`, filled.length === 2, `${filled.length}/2`);

  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  check(
    `docs: README's release history lists ${previous}`,
    readme.includes(`| ${previous} | [RELEASE_${previous}.md](docs/RELEASE_${previous}.md) |`),
  );
  const named = ['Setup', 'Portable'].filter(kind => readme.includes(`Kryvex-${kind}-${previous}-x64.exe`));
  check(
    `docs: README's install table names ${previous}'s installers`,
    named.length === 2,
    `${named.length}/2`,
  );
}

function checkVersion(version) {
  const doc = path.join(root, 'docs', `RELEASE_${version}.md`);
  const archive = path.join(root, 'docs', 'media', 'releases', `${version}-wizard`);
  const manifestPath = path.join(archive, 'wizard.json');

  if (!fs.existsSync(doc)) {
    check(`${version}: the release record exists`, false, `docs/RELEASE_${version}.md`);
    return;
  }
  check(`${version}: the release record exists`, true);

  const markdown = fs.readFileSync(doc, 'utf8');
  const hasSection = /^## Wizard capture/m.test(markdown);
  check(`${version}: the record has a Wizard capture section`, hasSection);
  check(
    `${version}: the record links the capture`,
    markdown.includes(`${version}-wizard`),
    `docs/media/releases/${version}-wizard`,
  );

  if (!fs.existsSync(manifestPath)) {
    check(`${version}: the capture is committed`, false, `docs/media/releases/${version}-wizard/wizard.json`);
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    check(`${version}: the capture manifest parses`, false, String(error.message));
    return;
  }
  check(`${version}: the capture manifest parses`, true);
  check(`${version}: the capture fits the record`, manifest.version === version, manifest.version);
  check(`${version}: the installer exited 0`, manifest.exitCode === 0, `exit code ${manifest.exitCode}`);
  check(`${version}: more than one page was captured`, manifest.pageCount >= 2, `${manifest.pageCount} pages`);

  const pages = Array.isArray(manifest.pages) ? manifest.pages : [];
  check(`${version}: the manifest lists its pages`, pages.length === manifest.pageCount, `${pages.length}/${manifest.pageCount}`);
  const images = pages.filter(page => page.image).map(page => path.join(archive, page.image));
  const present = images.filter(file => fs.existsSync(file));
  check(`${version}: every page has a screenshot`, images.length === pages.length && present.length === images.length, `${present.length}/${pages.length}`);
  check(
    `${version}: the screenshots are not empty`,
    present.every(file => fs.statSync(file).size > 1024),
    `${present.length} files`,
  );
  const titled = pages.filter(page => page.title).length;
  check(`${version}: every page has text`, titled === pages.length, `${titled}/${pages.length}`);
}

if (all) {
  const docs = fs
    .readdirSync(path.join(root, 'docs'))
    // A hotfix keeps the version line and adds `-hotfix.N`, so its record is
    // `RELEASE_0.9.3-hotfix.1.md` and still has to be found and ordered.
    .filter(name => /^RELEASE_\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\.md$/.test(name))
    .map(name => name.replace(/^RELEASE_|\.md$/g, ''))
    .sort(compareVersions);
  for (const version of docs) checkVersion(version);
  // The gate that runs before a tag is the one about the release being cut, so
  // it is checked whatever --all was pointed at.
  checkDocs(packageVersion());
} else {
  const requested = versionFromArgs();
  checkVersion(requested);
  if (requested === packageVersion()) checkDocs(requested);
}

console.log(failures === 0 ? 'release record: PASS' : `release record: FAIL (${failures})`);
if (failures > 0) process.exitCode = 1;
