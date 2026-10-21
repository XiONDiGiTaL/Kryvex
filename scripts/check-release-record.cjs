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
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
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
    .filter(name => /^RELEASE_\d+\.\d+\.\d+\.md$/.test(name))
    .map(name => name.replace(/^RELEASE_|\.md$/g, ''))
    .sort((a, b) => {
      const left = a.split('.').map(Number);
      const right = b.split('.').map(Number);
      return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
    });
  for (const version of docs) checkVersion(version);
} else {
  checkVersion(versionFromArgs());
}

console.log(failures === 0 ? 'release record: PASS' : `release record: FAIL (${failures})`);
if (failures > 0) process.exitCode = 1;
