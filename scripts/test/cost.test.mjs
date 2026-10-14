import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStream, sumStages, median, summarize, compare, summaryTable, stageTable } from '../cost-baseline/lib.mjs';

const ev = (o) => `${JSON.stringify(o)}\n`;

test('parseStream reads usage, cost, tool calls and hook denials', () => {
  const out = ev({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }, { type: 'text', text: 'x' }] } })
    + ev({ type: 'user', message: { content: [{ type: 'tool_result', content: 'PreToolUse:Bash hook error: readonly-bash-guard: no' }] } })
    + ev({ type: 'user', message: { content: [{ type: 'tool_result', content: [{ text: 'fine' }] }] } })
    + 'not json\n'
    + ev({ type: 'result', subtype: 'success', is_error: false, result: 'done', total_cost_usd: 1.25, duration_ms: 4000, num_turns: 7,
      usage: { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 30, cache_read_input_tokens: 40 } });
  const s = parseStream(out);
  assert.deepEqual([s.ok, s.text, s.costUsd, s.durationMs, s.turns], [true, 'done', 1.25, 4000, 7]);
  assert.deepEqual([s.inputTokens, s.outputTokens, s.cacheWriteTokens, s.cacheReadTokens], [10, 20, 30, 40]);
  assert.equal(s.toolCalls, 1);
  assert.equal(s.hookDenials, 1);
  assert.match(s.toolResults, /fine/);
});

test('parseStream marks a run without a result or with an error as not ok', () => {
  assert.equal(parseStream('').ok, false);
  assert.equal(parseStream('').subtype, 'no-result');
  assert.equal(parseStream(ev({ type: 'result', subtype: 'error_max_turns', is_error: true })).ok, false);
});

test('parseStream keeps the reason a stage failed', () => {
  const failed = parseStream(ev({ type: 'result', subtype: 'success', is_error: true, result: 'Failed to authenticate: OAuth session expired' }));
  assert.equal(failed.ok, false);
  assert.match(failed.error, /OAuth session expired/);
  assert.equal(parseStream(ev({ type: 'result', subtype: 'error_max_turns', is_error: true })).error, 'error_max_turns');
  assert.equal(parseStream(ev({ type: 'result', subtype: 'success', is_error: false, result: 'ok' })).error, '');
});

test('median handles odd, even and empty input', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), 0);
});

const run = (cost, ms, passed, critical = []) => ({
  stages: [{ name: 'plan', costUsd: cost / 2, durationMs: ms / 2, inputTokens: 1, outputTokens: 1, cacheReadTokens: 1, cacheWriteTokens: 1, turns: 1 }],
  total: { ...sumStages([{ costUsd: cost, durationMs: ms, turns: 4, toolCalls: 6 }]) },
  gate: { passed, critical },
});

test('summarize: medians, pass rate and cost per successful workflow (failures still cost)', () => {
  const s = summarize([run(2, 1000, true), run(4, 3000, true), run(6, 2000, false, ['npm test failed'])]);
  assert.equal(s.runs, 3);
  assert.equal(s.passed, 2);
  assert.ok(Math.abs(s.passRate - 2 / 3) < 1e-9);
  assert.equal(s.criticalFailures, 1);
  assert.equal(s.median.costUsd, 4);
  assert.equal(s.median.durationMs, 2000);
  assert.equal(s.costPerSuccessfulWorkflow, 6);
  assert.equal(s.spreadCostUsd, 4);
  assert.equal(summarize([run(1, 1, false)]).costPerSuccessfulWorkflow, null);
});

test('compare reports whether a change is beyond run-to-run noise', () => {
  const before = summarize([run(4, 1000, true), run(5, 1000, true), run(6, 1000, true)]);
  const small = compare(before, summarize([run(4.5, 1000, true), run(5.2, 1000, true), run(6, 1000, true)]));
  assert.equal(small.beyondNoise, false);
  const big = compare(before, summarize([run(1, 500, true), run(1.5, 500, true), run(2, 500, true)]));
  assert.equal(big.beyondNoise, true);
  assert.ok(big.costDeltaPct < -60);
});

test('tables render the numbers', () => {
  const runs = [run(2, 1000, true), run(4, 3000, true)];
  assert.match(summaryTable(summarize(runs)), /Cost per successful workflow \| \$3\.00/);
  assert.match(stageTable(runs), /\| plan \| \$1\.50 \|/);
});
