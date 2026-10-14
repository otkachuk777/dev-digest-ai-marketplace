import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter } from '../build/lib/frontmatter.mjs';

test('parses scalars, quoted strings and booleans', () => {
  const { data, body, hasFrontmatter } = parseFrontmatter('---\nname: code-review\ndescription: "Review: bugs, tests."\nflag: true\n---\n# Body\n');
  assert.equal(hasFrontmatter, true);
  assert.deepEqual(data, { name: 'code-review', description: 'Review: bugs, tests.', flag: true });
  assert.equal(body, '# Body\n');
});

test('keeps colons inside unquoted values', () => {
  assert.equal(parseFrontmatter('---\ndescription: Use when: reviewing\n---\n').data.description, 'Use when: reviewing');
});

test('parses inline and block lists', () => {
  const { data } = parseFrontmatter('---\ntags: [a, "b c", d]\nitems:\n  - one\n  - two\n---\n');
  assert.deepEqual(data.tags, ['a', 'b c', 'd']);
  assert.deepEqual(data.items, ['one', 'two']);
});

test('folds > and keeps | blocks', () => {
  const { data } = parseFrontmatter('---\nfolded: >\n  line one\n  line two\nkept: |\n  a\n  b\nnext: x\n---\n');
  assert.equal(data.folded, 'line one line two');
  assert.equal(data.kept, 'a\nb');
  assert.equal(data.next, 'x');
});

test('handles CRLF, BOM and empty frontmatter', () => {
  assert.equal(parseFrontmatter('﻿---\r\nname: x\r\n---\r\nbody').data.name, 'x');
  assert.deepEqual(parseFrontmatter('---\n---\nbody').data, {});
});

test('text without frontmatter is all body', () => {
  const r = parseFrontmatter('# Title\n');
  assert.equal(r.hasFrontmatter, false);
  assert.equal(r.body, '# Title\n');
  assert.deepEqual(r.data, {});
});
