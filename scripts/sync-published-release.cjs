/* eslint-disable no-console */
/**
 * Fills the post-publish paperwork from the published release's own assets.
 *
 * Four places change when a tag goes live, and all four are facts the release
 * already carries: the README's install table names the two EXEs, the README's
 * release history gains a row, the record's Artifacts table gets each file's
 * size and SHA-256, and `PROJECT_STATUS.md` moves its `## Prepared` section to
 * `## Released`. Doing that by hand is how hotfix.9's Artifacts table said
 * `recorded after the cut` for four days after the release went live: nothing
 * reads it, so nothing failed.
 *
 * Nothing here is invented. Every size and digest comes from the release's own
 * assets (or its published `SHA256SUMS.txt` when the API reports no digest), the
 * date is `published_at`, and the `releases/latest` sentence is read from the
 * API instead of assumed. A missing asset or an unreported digest stops the
 * script rather than writing a guess.
 *
 * Usage: `node scripts/sync-published-release.cjs [version] [--dry-run]
 * [--release-json <file>] [--notes-file <file>]`. The version defaults to
 * `package.json`; `--dry-run` prints the edits without writing them;
 * `--release-json` reads a saved payload (`{ "release": …, "latest": …,
 * "sums": "…" }`, or a bare release) instead of the API, which is how the
 * transform is exercised offline.
 *
 * The prose beside those four facts was also written before the tag, and the
 * script can see it going stale ("nothing is published", "the gate fails for
 * this version") without being able to decide what it should say instead. Those
 * come out as notes: printed, written to `--notes-file` for the Release workflow
 * to turn into an issue, appended to `GITHUB_STEP_SUMMARY` and, in Actions,
 * raised as warnings on the run. A log is read once; an open issue is not.
 *
 * `GITHUB_TOKEN` (or `GH_TOKEN`) is optional and only raises the rate limit.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const jsonIndex = argv.indexOf('--release-json');
const jsonPath = jsonIndex >= 0 ? argv[jsonIndex + 1] : null;
const notesIndex = argv.indexOf('--notes-file');
const notesFile = notesIndex >= 0 ? argv[notesIndex + 1] : null;
if (notesIndex >= 0 && !notesFile) fail('--notes-file needs a path.');
const explicit = argv.find(
  argument => !argument.startsWith('--') && argument !== jsonPath && argument !== notesFile,
);
const packageJson = require(path.join(root, 'package.json'));
const version = (explicit || packageJson.version).replace(/^v/, '');
const tag = `v${version}`;
const recordName = `docs/RELEASE_${version}.md`;

const changes = [];
const notes = [];

function fail(message) {
  console.error(`sync: ${message}`);
  process.exit(1);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function change(file, message) {
  changes.push({ file, message });
}

function note(message) {
  notes.push(message);
}

// ------------------------------------------------------------------- the notes

function workflowEscape(text) {
  return String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function notesMarkdown() {
  const lines = [
    `\`${tag}\` is published and the four record facts were filled from the release itself.`,
    'These sentences were written before the tag, and this run could not tell whether they are still true:',
    '',
    ...notes.map(message => `- ${message}`),
    '',
    `Fix the prose where it is wrong, then re-run \`pnpm release:sync ${version}\`: the list shrinks as the tree catches up.`,
  ];
  return `${lines.join('\n')}\n`;
}

function reportNotes() {
  if (notes.length === 0) {
    // A file left by an earlier run would make the workflow post a list that has
    // since been answered.
    if (notesFile) fs.rmSync(path.resolve(notesFile), { force: true });
    return;
  }

  console.log('\nneeds a human:');
  for (const message of notes) console.log(`  ${message}`);

  const markdown = notesMarkdown();
  if (notesFile) fs.writeFileSync(path.resolve(notesFile), markdown, 'utf8');
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Needs a human\n\n${markdown}`, 'utf8');
  }
  if (process.env.GITHUB_ACTIONS === 'true') {
    for (const message of notes) {
      console.log(`::warning title=Release paperwork::${workflowEscape(message)}`);
    }
  }
}

// ------------------------------------------------------------------ the source

const repository = (() => {
  const url = (packageJson.repository && packageJson.repository.url) || packageJson.homepage || '';
  const match = /github\.com[/:]([^/]+)\/([^/#.]+)/.exec(url);
  return match ? `${match[1]}/${match[2]}` : 'XiONDiGiTaL/Kryvex';
})();

const apiHeaders = {
  accept: 'application/vnd.github+json',
  'user-agent': 'kryvex-release-sync',
  'x-github-api-version': '2022-11-28',
};
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (token) apiHeaders.authorization = `Bearer ${token}`;

async function getJson(url) {
  const response = await fetch(url, { headers: apiHeaders });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

async function getRelease() {
  if (jsonPath) {
    const payload = JSON.parse(fs.readFileSync(path.resolve(jsonPath), 'utf8'));
    return {
      release: payload.release || payload,
      latest: payload.latest || null,
      sums: typeof payload.sums === 'string' ? payload.sums : null,
    };
  }
  const release = await getJson(`https://api.github.com/repos/${repository}/releases/tags/${tag}`);
  let latest = null;
  try {
    latest = await getJson(`https://api.github.com/repos/${repository}/releases/latest`);
  } catch (error) {
    note(`releases/latest could not be read (${error.message}); the status section says so instead of claiming it.`);
  }
  return { release, latest, sums: null };
}

function parseSums(text) {
  const digests = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = /^([0-9a-f]{64})\s+\*?(.+)$/i.exec(line.trim());
    if (match) digests.set(match[2].trim(), match[1].toLowerCase());
  }
  return digests;
}

async function readSums(release, inline) {
  const asset = release.assets.find(entry => entry.name === 'SHA256SUMS.txt') || null;
  if (inline) return { digests: parseSums(inline), size: asset ? asset.size : null };
  if (!asset) return null;
  // A sums file that cannot be read is not fatal: the API usually reports each
  // asset's digest itself, and this only fills the gaps and confirms the pair.
  try {
    const response = await fetch(asset.browser_download_url, {
      headers: { ...apiHeaders, accept: 'application/octet-stream' },
    });
    if (!response.ok) {
      note(`SHA256SUMS.txt answered ${response.status}; only the API's own digests were used.`);
      return null;
    }
    return { digests: parseSums(await response.text()), size: asset.size };
  } catch (error) {
    note(`SHA256SUMS.txt could not be downloaded (${error.message}); only the API's own digests were used.`);
    return null;
  }
}

function digestOf(asset) {
  if (typeof asset.digest === 'string' && /^sha256:[0-9a-f]{64}$/i.test(asset.digest)) {
    return asset.digest.slice('sha256:'.length).toLowerCase();
  }
  return null;
}

function formatSize(bytes) {
  return `${bytes.toLocaleString('en-US')} B`;
}

// ------------------------------------------------------------------ the edits

function updateReadme(text, meta) {
  let out = text;

  // The install table names the build people are told to download, so it moves
  // only for the release `releases/latest` actually answers. Filling an older
  // release's paperwork later must not send readers back to a superseded EXE.
  if (meta.latestTag !== meta.tag) {
    note(
      `README.md's install table was left alone: \`releases/latest\` answers ${meta.latestTag || 'something this script could not read'},` +
        ' and that table names the build people download.',
    );
  } else {
    for (const artifact of meta.artifacts) {
      const row = new RegExp(`^(\\| )\`Kryvex-${artifact.kind}-[^\`]*-x64\\.exe\`( \\|.*)$`, 'm');
      const found = row.exec(out);
      if (!found) {
        fail(`README.md has no install-table row for Kryvex-${artifact.kind}-…-x64.exe; the table changed shape.`);
      }
      if (found[0].includes(`\`${artifact.name}\``)) continue;
      out = out.replace(row, (_line, start, rest) => `| \`${artifact.name}\`${rest}`);
      change('README.md', `install table: ${found[0].slice(found[1].length).split('`')[1]} -> ${artifact.name}`);
    }

    const megabytes = Math.round(meta.installer.size / 1e6);
    const sizeNote = /\bAbout \d+ MB each\b/;
    const sizeFound = sizeNote.exec(out);
    if (sizeFound && sizeFound[0] !== `About ${megabytes} MB each`) {
      out = out.replace(sizeNote, `About ${megabytes} MB each`);
      change('README.md', `install size note: ${sizeFound[0]} -> About ${megabytes} MB each`);
    }
  }

  const historyRow = `| ${meta.version} | [RELEASE_${meta.version}.md](${recordName}) |`;
  if (!out.includes(historyRow)) {
    const header = /^(\| Release \| Record \|\n\| --- \| --- \|\n)/m;
    if (!header.test(out)) {
      fail('README.md has no release-history table ("| Release | Record |"); the table changed shape.');
    }
    out = out.replace(header, (_table, head) => `${head}${historyRow}\n`);
    change('README.md', `release history: ${historyRow}`);
  }

  return out;
}

function updateRecord(text, meta) {
  const start = text.indexOf('\n## Artifacts\n');
  if (start < 0) fail(`${recordName} has no "## Artifacts" section.`);
  const next = text.indexOf('\n## ', start + 1);
  const end = next < 0 ? text.length : next;
  let section = text.slice(start, end);
  let filled = false;

  for (const artifact of meta.artifacts) {
    const row = new RegExp(`^\\| \`Kryvex-${artifact.kind}-[^\`]*-x64\\.exe\` \\|.*\\|$`, 'm');
    const found = row.exec(section);
    if (!found) {
      fail(`${recordName} has no Artifacts row for Kryvex-${artifact.kind}-…-x64.exe.`);
    }
    const wanted = `| \`${artifact.name}\` | ${artifact.sizeText} | \`${artifact.digest}\` |`;
    if (found[0] === wanted) continue;
    section = section.replace(row, () => wanted);
    filled = true;
    change(recordName, `Artifacts: ${artifact.name} ${artifact.sizeText} ${artifact.digest.slice(0, 12)}…`);
  }

  if (filled) {
    // The paragraph under the table was written before the cut too, so say so
    // instead of leaving a reader to notice it still talks about the future.
    for (const phrase of ['recorded after the cut', 'written before the tag', 'once the workflow publishes']) {
      if (section.includes(phrase)) {
        note(`${recordName} still reads "${phrase}" beside the Artifacts table; that sentence was written before publication.`);
      }
    }
  }

  return text.slice(0, start) + section + text.slice(end);
}

function publishedBlock(meta) {
  // Kept to the house wrapping: the tag, the kind of release, then the facts.
  const opening = meta.prerelease
    ? [`The \`${meta.tag}\` tag ran the Release workflow and published a prerelease at`, `${meta.publishedAt}.`]
    : [
        `The \`${meta.tag}\` tag ran the Release workflow and published a stable`,
        `release, not a draft or a prerelease, at ${meta.publishedAt}.`,
      ];
  if (meta.latestTag) opening.push(`\`releases/latest\` answers \`${meta.latestTag}\`.`);
  else opening.push('`releases/latest` could not be read when this was written.');
  const lines = [
    ...opening,
    '',
    '| File | Size | SHA-256 |',
    '| --- | --- | --- |',
  ];
  for (const artifact of meta.artifacts) {
    lines.push(`| \`${artifact.name}\` | ${artifact.sizeText} | \`${artifact.digest}\` |`);
  }
  if (meta.sumsMatches) {
    lines.push('');
    lines.push(
      `\`SHA256SUMS.txt\` (${meta.sumsSizeText}) travels with them and matches both digests, so`,
      'the in-app updater accepts this release.',
    );
  }
  return lines.join('\n');
}

function updateStatus(text, meta) {
  const heading = new RegExp(`^## (Prepared|Released) \\(([^)]*), ${escapeRegExp(meta.version)}\\)$`, 'm');
  const found = heading.exec(text);
  if (!found) {
    fail(`PROJECT_STATUS.md has no "## Prepared" or "## Released" section for ${meta.version}.`);
  }

  const bodyStart = found.index + found[0].length;
  const nextHeading = text.indexOf('\n## ', bodyStart);
  const sectionEnd = nextHeading < 0 ? text.length : nextHeading + 1;
  let body = text.slice(bodyStart, sectionEnd);

  const wantedHeading = `## Released (${meta.date}, ${meta.version})`;
  const headingChange = found[0] === wantedHeading ? null : wantedHeading;

  const block = publishedBlock(meta);
  const blocks = body.split('\n\n');
  const stale = /nothing is published|no tag has been pushed|no installer has been built/i;
  let mutated = false;
  // The first paragraph of a `## Prepared` section says the tag is not out yet.
  // Once it is, that paragraph is the one line the flip must not leave behind.
  const staleIndex = blocks.findIndex((entry, index) => index > 0 && entry.trim() && stale.test(entry));
  if (staleIndex >= 0) {
    blocks[staleIndex] = block;
    mutated = true;
    change('PROJECT_STATUS.md', 'first paragraph: replaced the not-published sentence with the release facts');
  } else if (!body.includes(`\`${meta.artifacts[0].name}\``)) {
    blocks.splice(1, 0, block);
    mutated = true;
    change('PROJECT_STATUS.md', 'added the release facts and artifact table');
  } else if (body.includes('recorded after the cut')) {
    for (let index = 0; index < blocks.length; index += 1) {
      blocks[index] = blocks[index].replace(/recorded after the cut/g, 'see the artifact table above');
    }
    mutated = true;
    change('PROJECT_STATUS.md', 'removed a leftover "recorded after the cut"');
  }

  const updatedBody = mutated ? blocks.join('\n\n') : body;
  const next = text.slice(0, found.index) + (headingChange || found[0]) + updatedBody + text.slice(sectionEnd);

  if (headingChange) {
    change('PROJECT_STATUS.md', `heading: ${found[0]} -> ${headingChange}`);
  }

  // Everything else in the section was written before the tag. Say which
  // sentences now need an author to confirm them instead of rewriting prose the
  // script cannot know is still true.
  const sectionStart = found.index;
  const sectionText = next.slice(sectionStart, sectionStart + (headingChange || found[0]).length + updatedBody.length);
  const offset = next.slice(0, sectionStart).split('\n').length - 1;
  for (const phrase of [
    'nothing is published',
    'no tag has been pushed',
    'no installer has been built',
    'still answers',
    'no capture is committed',
    'fails for this version',
    'therefore **fails**',
    'be pushed',
  ]) {
    let index = sectionText.toLowerCase().indexOf(phrase.toLowerCase());
    while (index >= 0) {
      const line = offset + sectionText.slice(0, index).split('\n').length;
      note(`PROJECT_STATUS.md:${line} still reads "${phrase}"; confirm it is still true after publication.`);
      index = sectionText.toLowerCase().indexOf(phrase.toLowerCase(), index + phrase.length);
    }
  }

  return next;
}

// -------------------------------------------------------------------- the run

function apply(relativePath, transform) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) fail(`${relativePath} does not exist.`);
  const before = fs.readFileSync(file, 'utf8');
  const after = transform(before);
  if (after === before) return false;
  if (!dryRun) fs.writeFileSync(file, after, 'utf8');
  return true;
}

async function main() {
  const { release, latest, sums } = await getRelease();
  if (release.tag_name && release.tag_name !== tag) {
    fail(`the payload is for ${release.tag_name}, not ${tag}.`);
  }
  if (release.draft) fail(`${tag} is still a draft; nothing is published yet.`);
  if (!release.published_at) fail(`${tag} has no published_at; nothing is published yet.`);

  const sumsFile = await readSums(release, sums);
  const artifacts = ['Setup', 'Portable'].map(kind => {
    const pattern = new RegExp(`^Kryvex-${kind}-${escapeRegExp(version)}-x64\\.exe$`);
    const asset = release.assets.find(entry => pattern.test(entry.name));
    if (!asset) {
      const seen = release.assets.map(entry => entry.name).join(', ');
      fail(`the release has no Kryvex-${kind}-${version}-x64.exe; it published ${seen}.`);
    }
    const digest = digestOf(asset) || (sumsFile ? sumsFile.digests.get(asset.name) : null);
    if (!digest) {
      fail(`${asset.name} has no SHA-256 in the release metadata; refusing to record one it did not report.`);
    }
    return { kind, name: asset.name, size: asset.size, sizeText: formatSize(asset.size), digest };
  });

  const installer = artifacts[0];
  const sumsMatches =
    Boolean(sumsFile) && artifacts.every(artifact => sumsFile.digests.get(artifact.name) === artifact.digest);

  const meta = {
    tag,
    version,
    date: release.published_at.slice(0, 10),
    publishedAt: release.published_at,
    latestTag: latest && latest.tag_name ? latest.tag_name : null,
    prerelease: Boolean(release.prerelease),
    artifacts,
    installer,
    sumsMatches,
    sumsSizeText: sumsFile && sumsFile.size ? formatSize(sumsFile.size) : 'size not reported',
  };

  const touched = [];
  if (apply('README.md', text => updateReadme(text, meta))) touched.push('README.md');
  if (apply(recordName, text => updateRecord(text, meta))) touched.push(recordName);
  if (apply('PROJECT_STATUS.md', text => updateStatus(text, meta))) touched.push('PROJECT_STATUS.md');

  if (touched.length === 0) {
    console.log(`sync: ${tag} is published and README.md, ${recordName} and PROJECT_STATUS.md already match it.`);
  } else {
    console.log(`sync: ${tag}, published ${meta.publishedAt}`);
    let current = null;
    for (const entry of changes) {
      if (entry.file !== current) {
        current = entry.file;
        console.log(`  ${current}`);
      }
      console.log(`    ${entry.message}`);
    }
    console.log(dryRun ? '\nsync: dry run, nothing written' : `\nsync: wrote ${touched.length} file(s)`);
  }

  reportNotes();
}

main().catch(error => {
  fail(error && error.message ? error.message : String(error));
});
