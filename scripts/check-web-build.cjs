/* eslint-disable no-console */
/**
 * Fails a web build that cannot be installed or opened offline.
 *
 * `pnpm build:web` writes `dist-web/`; this checks the files an installed PWA
 * needs before the directory is handed to a static host or zipped for a phone.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(root, 'dist-web'));
let failures = 0;

function check(name, ok, detail) {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function read(file) {
  return fs.readFileSync(path.join(out, file), 'utf8');
}

console.log(`web build: ${out}`);
check('the web build exists', fs.existsSync(path.join(out, 'index.html')));

if (fs.existsSync(path.join(out, 'index.html'))) {
  const index = read('index.html');
  check('the document links the manifest', /rel="manifest"/.test(index));
  check('the document has a theme colour', /name="theme-color"/.test(index));
  check('the document points at the touch icon', /apple-touch-icon/.test(index));
}

let manifest = null;
try {
  manifest = JSON.parse(read('manifest.webmanifest'));
  check('the manifest parses', true);
} catch (error) {
  check('the manifest parses', false, String(error.message));
}

if (manifest) {
  check('the app has a name', typeof manifest.name === 'string' && manifest.name.length > 0);
  check('the app starts at its own scope', manifest.start_url === './' && manifest.scope === './');
  check('the app opens standalone', manifest.display === 'standalone');
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  const sizes = new Set(icons.map(icon => icon.sizes));
  check('the manifest carries 192px and 512px icons', sizes.has('192x192') && sizes.has('512x512'));
  const present = icons
    .map(icon => icon.src.replace(/^\.\//, ''))
    .filter(src => fs.existsSync(path.join(out, src)));
  check('every manifest icon is in the build', present.length === icons.length, `${present.length}/${icons.length}`);
}

check('the service worker is published', fs.existsSync(path.join(out, 'sw.js')));
if (fs.existsSync(path.join(out, 'sw.js'))) {
  const sw = read('sw.js');
  check('the worker names its cache', /const CACHE = 'kryvex-web-/.test(sw));
  check('the worker precaches the shell', /SHELL = \[/.test(sw) && /caches\.open\(CACHE\)/.test(sw));
}

const scripts = fs.existsSync(path.join(out, 'assets'))
  ? fs.readdirSync(path.join(out, 'assets')).filter(name => name.endsWith('.js'))
  : [];
check('the JavaScript bundle is published', scripts.length > 0, scripts.join(', '));

if (failures === 0) {
  const bytes = (function size(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).reduce((total, entry) => {
      const file = path.join(dir, entry.name);
      return total + (entry.isDirectory() ? size(file) : fs.statSync(file).size);
    }, 0);
  })(out);
  console.log(`web build: PASS (${(bytes / 1024 / 1024).toFixed(1)} MiB)`);
} else {
  console.log(`web build: FAIL (${failures})`);
  process.exitCode = 1;
}
