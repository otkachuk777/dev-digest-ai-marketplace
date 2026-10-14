import test from 'node:test';
import assert from 'node:assert/strict';
import { hasSection, changelogSummary } from '../build/lib/changelog.mjs';

const text = '# Changelog\n\n## 1.1.0\n- Add code-reviewer agent.\n- Other.\n\n## 1.0.0\n- First release.\n';

test('hasSection matches the exact version heading', () => {
  assert.equal(hasSection(text, '1.1.0'), true);
  assert.equal(hasSection(text, '1.1'), false);
  assert.equal(hasSection(text, '1.0.0'), true);
  assert.equal(hasSection(null, '1.0.0'), false);
  assert.equal(hasSection('## 1x0y0\n', '1.0.0'), false);
});

test('changelogSummary returns the first bullet of the section', () => {
  assert.equal(changelogSummary(text, '1.1.0'), 'Add code-reviewer agent.');
  assert.equal(changelogSummary(text, '1.0.0'), 'First release.');
  assert.equal(changelogSummary(text, '9.9.9'), null);
});
