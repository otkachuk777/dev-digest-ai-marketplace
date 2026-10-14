import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULES = fileURLToPath(new URL('../node_modules/', import.meta.url));

const VENDOR = [
  ['minisearch/dist/es/index.js', 'vendor/minisearch.js'],
  ['marked/lib/marked.esm.js', 'vendor/marked.js'],
  ['dompurify/dist/purify.es.mjs', 'vendor/purify.js'],
];

const FONTS = [
  '@fontsource/geist/files/geist-latin-400-normal.woff2',
  '@fontsource/geist/files/geist-latin-500-normal.woff2',
  '@fontsource/geist/files/geist-latin-600-normal.woff2',
  '@fontsource/geist-mono/files/geist-mono-latin-400-normal.woff2',
  '@fontsource/geist-mono/files/geist-mono-latin-500-normal.woff2',
];

function need(rel) {
  const p = join(MODULES, rel);
  if (!existsSync(p)) throw new Error(`Missing ${p}. Run "npm ci" in site/.`);
  return p;
}

export function copyVendor(out) {
  for (const [from, to] of VENDOR) {
    const dest = join(out, to);
    mkdirSync(dirname(dest), { recursive: true });
    const text = readFileSync(need(from), 'utf8').replace(/^\/\/# sourceMappingURL=.*$/gm, '');
    writeFileSync(dest, text);
  }
  for (const from of FONTS) {
    const dest = join(out, 'fonts', from.split('/').at(-1));
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(need(from), dest);
  }
}
