import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('../src/', import.meta.url).pathname;
const pages = readdirSync(SRC).filter((f) => f.endsWith('.html'));

test('there are two pages', () => assert.deepEqual(pages.sort(), ['artifact.html', 'index.html']));

for (const page of pages) {
  const html = readFileSync(join(SRC, page), 'utf8');
  test(`${page} carries the strict CSP`, () => {
    assert.match(html, /http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'"/);
  });
  test(`${page} has no inline styles, inline scripts, handlers or absolute local paths`, () => {
    assert.doesNotMatch(html, /\sstyle=/i);
    assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/i);
    assert.doesNotMatch(html, /\son[a-z]+=/i);
    assert.doesNotMatch(html, /(?:href|src)="\/(?!\/)/);
    assert.doesNotMatch(html, /googleapis|gstatic|cdn\./);
  });
  test(`${page} is responsive and accessible`, () => {
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
    assert.match(html, /<html lang="en">/);
  });
}

test('style.css uses only relative font urls and no inline-only tricks', () => {
  const css = readFileSync(join(SRC, 'style.css'), 'utf8');
  assert.doesNotMatch(css, /url\((?!\.\/fonts\/)/);
  assert.doesNotMatch(css, /@import/);
  assert.match(css, /prefers-color-scheme:\s*dark/);
});
