import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

export const FIXTURE_REPO = 'otkachuk777/dev-digest-ai-marketplace';
const D1 = '2026-10-09T10:00:00+00:00';
const D2 = '2026-10-14T10:00:00+00:00';
const json = (v) => `${JSON.stringify(v, null, 2)}\n`;

function put(root, file, text) {
  const p = join(root, file);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
}

function sh(root, date, ...args) {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date,
      GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

const marketplace = (empty) => ({
  name: 'dev-digest-ai-marketplace',
  description: 'Fixture marketplace',
  owner: { name: 'AI Engineering' },
  plugins: empty ? [] : [{ name: 'demo-plugin', source: './plugins/demo-plugin', description: 'Demo bundle for code quality.' }],
});

function writeDemoPlugin(root, version) {
  const base = 'plugins/demo-plugin';
  put(root, `${base}/.claude-plugin/plugin.json`, json({ name: 'demo-plugin', version, description: 'Demo bundle for code quality.', keywords: ['review', 'git'] }));
  put(root, `${base}/README.md`, '# demo-plugin\n\nDemo bundle used by the catalog tests.\n');
  put(root, `${base}/CHANGELOG.md`, version === '1.0.0'
    ? '# Changelog\n\n## 1.0.0\n- First release.\n'
    : '# Changelog\n\n## 1.1.0\n- Add code-reviewer agent.\n\n## 1.0.0\n- First release.\n');
  put(root, `${base}/skills/code-review/SKILL.md`, [
    '---',
    'name: code-review',
    'description: "Run a structured review of a diff: bugs, risky changes, missing tests."',
    'allowed-tools: Read, Grep, Bash(git diff:*)',
    '---',
    '# Code review',
    '',
    '## When to use',
    'Use before opening a pull request, or when asked to review a branch.',
    '',
    '## Steps',
    '- Read the diff against the base branch.',
    '- List bugs first, then risky changes, then missing tests.',
    '',
  ].join('\n'));
  if (version === '1.0.0') return;
  put(root, `${base}/agents/code-reviewer.md`, '---\nname: code-reviewer\ndescription: Read-only agent that does a review pass in its own context and returns findings.\ntools: Read, Grep\n---\nYou review code and report findings only.\n');
  put(root, `${base}/commands/review-pr.md`, '---\ndescription: Fetch a pull request and start a review with the skill above.\nallowed-tools: Bash(gh pr view:*)\n---\nReview the pull request $ARGUMENTS.\n');
  put(root, `${base}/hooks/hooks.json`, json({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '${CLAUDE_PLUGIN_ROOT}/hooks/guard-diff.sh' }] }] } }));
  put(root, `${base}/.mcp.json`, json({ mcpServers: { github: { command: 'npx', args: ['-y', '@example/github-mcp'] } } }));
}

export function createFixtureRepo({ empty = false, stable = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'catalog-fixture-'));
  sh(root, D1, 'init', '-q', '-b', 'main');
  put(root, '.claude-plugin/marketplace.json', json(marketplace(empty)));
  if (empty) {
    sh(root, D1, 'add', '-A');
    sh(root, D1, 'commit', '-q', '-m', 'chore: empty marketplace');
  } else {
    writeDemoPlugin(root, '1.0.0');
    sh(root, D1, 'add', '-A');
    sh(root, D1, 'commit', '-q', '-m', 'feat: demo-plugin 1.0.0');
    sh(root, D1, 'tag', 'demo-plugin--v1.0.0');
    const sha1 = sh(root, D1, 'rev-parse', 'HEAD');
    writeDemoPlugin(root, '1.1.0');
    sh(root, D2, 'add', '-A');
    sh(root, D2, 'commit', '-q', '-m', 'feat: demo-plugin 1.1.0');
    sh(root, D2, 'tag', 'demo-plugin--v1.1.0');
    if (stable) {
      sh(root, D2, 'checkout', '-q', '--orphan', 'stable');
      sh(root, D2, 'rm', '-rf', '-q', '.');
      put(root, '.claude-plugin/marketplace.json', json({
        name: 'dev-digest-ai-marketplace-stable',
        description: 'Pinned, verified releases of dev-digest-ai-marketplace. Used for rollback.',
        owner: { name: 'AI Engineering' },
        plugins: [{
          name: 'demo-plugin',
          description: 'Demo bundle for code quality.',
          source: { source: 'git-subdir', url: `https://github.com/${FIXTURE_REPO}.git`, path: 'plugins/demo-plugin', ref: 'demo-plugin--v1.0.0', sha: sha1 },
        }],
      }));
      sh(root, D2, 'add', '-A');
      sh(root, D2, 'commit', '-q', '-m', 'chore(stable): pin demo-plugin@1.0.0');
      sh(root, D2, 'checkout', '-q', 'main');
    }
  }
  sh(root, D2, 'remote', 'add', 'origin', `https://github.com/${FIXTURE_REPO}.git`);
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
