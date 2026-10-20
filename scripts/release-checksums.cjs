/* eslint-disable no-console */
/**
 * Writes release/SHA256SUMS.txt for the Setup and Portable installers.
 *
 * The in-app updater refuses to run an installer without a matching entry in
 * this file, so a release must publish it alongside the EXEs.
 *
 * Usage: `node scripts/release-checksums.cjs [directory]`.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const directory = path.resolve(process.argv[2] || path.join(__dirname, '..', 'release'));
const pattern = /^Kryvex-(Setup|Portable)-\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?-x64\.exe$/;

if (!fs.existsSync(directory)) {
  console.error(`checksums: ${directory} does not exist. Run package:win first.`);
  process.exit(1);
}

const files = fs
  .readdirSync(directory)
  .filter(name => pattern.test(name))
  .sort();

if (files.length === 0) {
  console.error(`checksums: no Setup or Portable EXE found in ${directory}.`);
  process.exit(1);
}

const lines = files.map(name => {
  const hash = crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(directory, name)))
    .digest('hex');
  console.log(`${hash}  ${name}`);
  return `${hash}  ${name}`;
});

const target = path.join(directory, 'SHA256SUMS.txt');
fs.writeFileSync(target, `${lines.join('\n')}\n`, 'utf8');
console.log(`checksums: wrote ${target}`);
