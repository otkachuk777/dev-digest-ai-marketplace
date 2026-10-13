import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createFixtureRepo } from '../dev/make-fixture-repo.mjs';
import { scanPlugin, splitList } from '../build/scan.mjs';

test('splitList splits on commas outside parentheses and accepts arrays', () => {
  assert.deepEqual(splitList('Read, Grep, Bash(git diff:*, git log:*)'), ['Read', 'Grep', 'Bash(git diff:*, git log:*)']);
  assert.deepEqual(splitList(['a', ' b ']), ['a', 'b']);
  assert.deepEqual(splitList(undefined), []);
});

test('scanPlugin finds every artifact type in demo-plugin 1.1.0', () => {
  const { root, cleanup } = createFixtureRepo();
  try {
    const scan = scanPlugin({ dir: join(root, 'plugins/demo-plugin'), pluginPath: 'plugins/demo-plugin', entryName: 'demo-plugin' });
    assert.equal(scan.name, 'demo-plugin');
    assert.equal(scan.version, '1.1.0');
    assert.deepEqual(scan.problems, []);
    assert.deepEqual(scan.artifacts.map((a) => `${a.type}/${a.slug}`), [
      'plugin/demo-plugin', 'skill/code-review', 'agent/code-reviewer', 'command/review-pr', 'hook/pretooluse-1', 'mcp/github',
    ]);
    const skill = scan.artifacts.find((a) => a.type === 'skill');
    assert.deepEqual(skill.tags, ['review', 'git']);
    assert.deepEqual(skill.tools, ['Read', 'Grep', 'Bash(git diff:*)']);
    assert.equal(skill.path, 'plugins/demo-plugin/skills/code-review/SKILL.md');
    assert.equal(skill.tokens.always, Math.ceil(`${skill.name} ${skill.description}`.length / 4));
    assert.equal(skill.tokens.onInvoke, Math.ceil(skill.body.length / 4));
    const hook = scan.artifacts.find((a) => a.type === 'hook');
    assert.equal(hook.name, 'PreToolUse:Bash');
    assert.equal(hook.tokens, null);
    assert.deepEqual(scan.hooks, [{ event: 'PreToolUse', matcher: 'Bash', command: '${CLAUDE_PLUGIN_ROOT}/hooks/guard-diff.sh' }]);
    assert.deepEqual(scan.mcp, [{ name: 'github', command: 'npx -y @example/github-mcp' }]);
    assert.equal(scan.artifacts[0].type, 'plugin');
    assert.equal(scan.artifacts[0].tokens, null);
    assert.match(scan.readme, /Demo bundle/);
  } finally {
    cleanup();
  }
});
