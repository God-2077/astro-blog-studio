import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const partsDir = path.resolve(root, 'design', 'night-mode.parts');
const outFile = path.resolve(root, 'design', 'night-mode.html');

const parts = [
  '00-head.html',
  '01-board.html',
  '02-workbench.html',
  '03-editor.html',
  '04-settings.html',
  '05-specimens.html',
  '06-mobile.html',
  '07-compare.html',
  '99-tail.html',
];

// Fonts stay local and get inlined as data URIs, so the artifact is one offline file.
const fontFiles = {
  __FONT_BALOO__: path.resolve(root, 'node_modules/@fontsource-variable/baloo-2/files/baloo-2-latin-wght-normal.woff2'),
  __FONT_MONO_400__: path.resolve(root, 'node_modules/@fontsource/sometype-mono/files/sometype-mono-latin-400-normal.woff2'),
  __FONT_MONO_500__: path.resolve(root, 'node_modules/@fontsource/sometype-mono/files/sometype-mono-latin-500-normal.woff2'),
};

const chunks = [];
for (const name of parts) {
  const file = path.join(partsDir, name);
  const text = await readFile(file, 'utf8');
  if (name !== '99-tail.html' && /<\/body>|<\/html>/i.test(text)) {
    throw new Error(`${name} must not close body/html; it is a partial.`);
  }
  chunks.push(text.trimEnd());
  console.log(`  + ${name} (${text.length.toLocaleString()} chars)`);
}

let html = `${chunks.join('\n\n')}\n`;
for (const [token, file] of Object.entries(fontFiles)) {
  if (!html.includes(token)) throw new Error(`Missing font token ${token}`);
  const base64 = (await readFile(file)).toString('base64');
  html = html.split(token).join(`data:font/woff2;base64,${base64}`);
}
if (/__FONT_[A-Z0-9_]+__/.test(html)) throw new Error('Unreplaced font token left in output.');

await writeFile(outFile, html, 'utf8');
console.log(
  `\nBuilt ${path.relative(process.cwd(), outFile)} — ${(html.length / 1024).toFixed(1)} KB, ${html.split('\n').length.toLocaleString()} lines.`,
);
