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

test('forms and iframes are removed', () => {
  assert.doesNotMatch(render('<form action="x"><input name="p"></form><iframe src="x"></iframe>'), /<form|<input|<iframe/i);
});
