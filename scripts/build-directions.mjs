import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const partsDir = path.resolve(here, '..', 'design', 'parts');
const outFile = path.resolve(here, '..', 'design', 'directions.html');

const parts = ['00-head.html', '01-a.html', '02-b.html', '03-c.html', '04-d.html', '05-compare.html', '99-tail.html'];

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

const html = `${chunks.join('\n\n')}\n`;
await writeFile(outFile, html, 'utf8');
console.log(
  `\nBuilt ${path.relative(process.cwd(), outFile)} — ${(html.length / 1024).toFixed(1)} KB, ${html.split('\n').length.toLocaleString()} lines.`,
);
