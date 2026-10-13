import test from 'node:test';
import assert from 'node:assert/strict';
import { installHtml, tokensHtml, securityHtml, sourceUrl } from '../src/ui.js';

const record = {
  version: '1.1.0', description: 'd', tags: [], tokens: { always: 42, onInvoke: 1180 }, path: 'plugins/p/skills/x/SKILL.md', ref: 'main', body: null,
  declared: {
    tools: ['Read', 'Bash(git diff:*)'],
    hooks: [{ event: 'PreToolUse', matcher: 'Bash', command: '<script>alert(1)</script> "quoted"' }],
    mcp: [{ name: 'gh<b>', command: "npx -y 'x'" }],
  },
  validation: { passed: 6, total: 6, failures: [] }, lastChange: '2026-10-14', indexed: true,
};

test('securityHtml escapes hostile hook and mcp text', () => {
  const html = securityHtml(record);
  assert.doesNotMatch(html, /<script|<b>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &quot;quoted&quot;/);
  assert.match(html, /gh&lt;b&gt;/);
  assert.match(html, /Declared in the plugin files, not independently audited\./);
  assert.match(html, /Runs commands on your machine/);
  assert.match(html, /Passed[\s\S]*6 of 6 rules/);
  assert.match(html, /2026-10-14/);
});

test('securityHtml shows failures and unchecked remote plugins', () => {
  const failed = securityHtml({ ...record, validation: { passed: 5, total: 6, failures: ['[changelog] p/CHANGELOG.md: missing'] } });
  assert.match(failed, /Failed[\s\S]*5 of 6 rules/);
  assert.match(failed, /\[changelog\] p\/CHANGELOG.md: missing/);
  assert.match(securityHtml({ ...record, validation: null, indexed: false }), /Not checked \(remote source\)/);
  assert.match(securityHtml({ ...record, declared: { tools: [], hooks: [], mcp: [] } }), /None declared/);
});

test('tokensHtml shows both numbers and a not-available state', () => {
  assert.match(tokensHtml({ always: 42, onInvoke: 1180 }), /≈42[\s\S]*≈1,180/);
  assert.match(tokensHtml(null), /not available/i);
});

test('installHtml renders comment spans and a copy button', () => {
  const html = installHtml({ steps: [{ comment: '# add', command: '/plugin marketplace add o/r' }, { comment: '# install', command: '/plugin install p@m' }], plugin: 'p', ownerNote: true });
  assert.match(html, /<span class="c"># add<\/span>/);
  assert.match(html, /id="copy"/);
  assert.match(html, /owning plugin[\s\S]*p/);
});

test('sourceUrl points at the pinned ref', () => {
  assert.equal(sourceUrl('o/r', record), 'https://github.com/o/r/blob/main/plugins/p/skills/x/SKILL.md');
  assert.equal(sourceUrl('o/r', { ...record, ref: 'p--v1.0.0' }), 'https://github.com/o/r/blob/p--v1.0.0/plugins/p/skills/x/SKILL.md');
});
