import test from 'node:test';
import assert from 'node:assert/strict';
import { installSteps } from '../src/snippets.js';
import { requestSkillUrl, reportProblemUrl } from '../src/issues.js';

test('latest install uses the main marketplace', () => {
  const steps = installSteps({ repo: 'o/r', plugin: 'p', channel: 'latest', marketplace: 'm' });
  assert.deepEqual(steps.map((s) => s.command), ['/plugin marketplace add o/r', '/plugin install p@m']);
});

test('stable install pins the stable branch and the stable marketplace name', () => {
  const steps = installSteps({ repo: 'o/r', plugin: 'p', channel: 'stable', marketplace: 'm-stable' });
  assert.deepEqual(steps.map((s) => s.command), ['/plugin marketplace add o/r#stable', '/plugin install p@m-stable']);
});

test('issue links are prefilled and encoded', () => {
  assert.equal(requestSkillUrl('o/r', 'pdf converter'),
    'https://github.com/o/r/issues/new?template=request-skill.yml&title=Request%3A+pdf+converter&query=pdf+converter');
  assert.match(requestSkillUrl('o/r', ''), /title=Request%3A\+$/);
  assert.equal(reportProblemUrl('o/r', { id: 'p/skill/x', version: '1.1.0', channel: 'latest' }),
    'https://github.com/o/r/issues/new?template=report-problem.yml&title=Problem%3A+p%2Fskill%2Fx&artifact=p%2Fskill%2Fx+1.1.0+%28latest%29');
});
