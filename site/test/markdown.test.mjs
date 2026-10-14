import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import { marked } from 'marked';
import { createRenderer } from '../src/markdown.js';

const render = createRenderer({ marked, purify: createDOMPurify(new JSDOM('').window) });

test('renders markdown', () => {
  assert.match(render('## When to use\n\n- one\n- two'), /<h2>When to use<\/h2>[\s\S]*<li>one<\/li>/);
});

test('strips scripts, event handlers, styles and javascript: links', () => {
  const html = render('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<div style="x:y">t</div>\n\n[bad](javascript:alert(1))');
  assert.doesNotMatch(html, /<script|onerror|style=|javascript:/i);
});

test('external links get rel="noopener noreferrer"', () => {
  assert.match(render('[x](https://example.com)'), /<a href="https:\/\/example.com" rel="noopener noreferrer">x<\/a>/);
});

const payloads = [
  ['data: href', '<a href="data:text/html,<script>alert(1)</script>">x</a>', /data:text|<script/i],
  ['svg onload', '<svg onload=alert(1)></svg>', /onload|<script/i],
  ['math xlink', '<math><mi xlink:href="javascript:alert(1)">x</mi></math>', /javascript:/i],
  ['img srcset', '<img srcset="javascript:alert(1) 1x" src=x>', /javascript:|onerror/i],
  ['html javascript link', '<a href="javascript:alert(1)">x</a>', /javascript:/i],
  ['mixed case javascript', '<a href="JaScRiPt:alert(1)">x</a>', /javascript:/i],
  ['entity obfuscated', '<a href="java&#9;script:alert(1)">x</a>', /java\s*script:/i],
];
for (const [name, md, bad] of payloads) {
  test(`sanitizer removes dangerous payload: ${name}`, () => {
    assert.doesNotMatch(render(md), bad);
  });
}

test('benign https link and tables still render', () => {
  assert.match(render('[ok](https://example.com/a)'), /<a href="https:\/\/example.com\/a"/);
  assert.match(render('| a | b |\n|---|---|\n| 1 | 2 |'), /<table>[\s\S]*<th>a<\/th>[\s\S]*<td>2<\/td>/);
});

test('forms and iframes are removed', () => {
  assert.doesNotMatch(render('<form action="x"><input name="p"></form><iframe src="x"></iframe>'), /<form|<input|<iframe/i);
});
