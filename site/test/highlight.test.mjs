import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, highlight } from '../src/highlight.js';

test('esc escapes HTML', () => assert.equal(esc(`<a href="x">&'</a>`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;'));

test('highlight wraps matches case-insensitively and escapes the rest', () => {
  assert.equal(highlight('Code <Review>', ['review']), 'Code &lt;<mark>Review</mark>&gt;');
});

test('highlight prefers the longest overlapping term', () => {
  assert.equal(highlight('review', ['rev', 'review']), '<mark>review</mark>');
});

test('highlight survives regex metacharacters and empty terms', () => {
  assert.equal(highlight('a+b (c)', ['+', '(']), 'a<mark>+</mark>b <mark>(</mark>c)');
  assert.equal(highlight('plain', []), 'plain');
  assert.equal(highlight('plain', ['']), 'plain');
  assert.equal(highlight('x', ['[']), 'x');
});
