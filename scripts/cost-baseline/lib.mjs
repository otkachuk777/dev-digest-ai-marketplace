// Pure helpers for the cost-baseline scenario: parsing `claude -p --output-format stream-json`
// output, aggregating stages and runs, and rendering the report. No model calls here.

/** Reads one stage's stream: the final `result` event plus tool calls and tool results. */
export function parseStream(stdout) {
  const tools = [];
  const results = [];
  let result = null;
  for (const line of String(stdout).split('\n')) {
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type === 'assistant') {
      for (const part of ev.message?.content ?? []) {
        if (part.type === 'tool_use') tools.push({ name: part.name, input: JSON.stringify(part.input ?? {}) });
      }
    } else if (ev.type === 'user') {
      for (const part of ev.message?.content ?? []) {
        if (part.type !== 'tool_result') continue;
        results.push(typeof part.content === 'string' ? part.content : (part.content ?? []).map((x) => x.text ?? '').join('\n'));
      }
    } else if (ev.type === 'result') result = ev;
  }
  const u = result?.usage ?? {};
  return {
    ok: Boolean(result) && result.is_error !== true && result.subtype === 'success',
    subtype: result?.subtype ?? 'no-result',
    text: typeof result?.result === 'string' ? result.result : '',
    // The reason a stage failed (for example an expired login), kept so a failure is diagnosable.
    error: result && (result.is_error === true || result.subtype !== 'success') ? String(result.result ?? result.subtype ?? 'unknown error').slice(0, 300) : '',
    costUsd: result?.total_cost_usd ?? 0,
    durationMs: result?.duration_ms ?? 0,
    turns: result?.num_turns ?? 0,
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    toolCalls: tools.length,
    toolResults: results.join('\n---\n'),
    hookDenials: results.filter((r) => /hook error|readonly-bash-guard|path-guard|agent-type-guard|browser-url-guard/.test(r)).length,
  };
}

const SUM_KEYS = ['costUsd', 'durationMs', 'turns', 'inputTokens', 'outputTokens', 'cacheWriteTokens', 'cacheReadTokens', 'toolCalls', 'hookDenials'];

/** Adds up the numeric fields of several stages. */
export function sumStages(stages) {
  const out = Object.fromEntries(SUM_KEYS.map((k) => [k, 0]));
  for (const s of stages) for (const k of SUM_KEYS) out[k] += s[k] ?? 0;
  return out;
}

export function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** Median of each numeric field over runs, pass rate, and the number of critical failures. */
export function summarize(runs) {
  const totals = runs.map((r) => r.total);
  const med = Object.fromEntries(SUM_KEYS.map((k) => [k, median(totals.map((t) => t[k]))]));
  const passed = runs.filter((r) => r.gate.passed).length;
  const successfulCosts = runs.filter((r) => r.gate.passed).map((r) => r.total.costUsd);
  return {
    runs: runs.length,
    passed,
    passRate: runs.length ? passed / runs.length : 0,
    criticalFailures: runs.reduce((n, r) => n + r.gate.critical.length, 0),
    median: med,
    // Spend divided by successful workflows: failed runs still cost money.
    costPerSuccessfulWorkflow: passed ? totals.reduce((n, t) => n + t.costUsd, 0) / passed : null,
    medianCostOfSuccessful: successfulCosts.length ? median(successfulCosts) : null,
    spreadCostUsd: runs.length ? Math.max(...totals.map((t) => t.costUsd)) - Math.min(...totals.map((t) => t.costUsd)) : 0,
  };
}

/** Is the difference between two summaries larger than the run-to-run noise? */
export function compare(before, after) {
  const delta = (k) => after.median[k] - before.median[k];
  const noise = Math.max(before.spreadCostUsd, after.spreadCostUsd);
  const costDelta = delta('costUsd');
  return {
    costDeltaUsd: costDelta,
    costDeltaPct: before.median.costUsd ? (costDelta / before.median.costUsd) * 100 : 0,
    latencyDeltaMs: delta('durationMs'),
    noiseUsd: noise,
    beyondNoise: Math.abs(costDelta) > noise,
  };
}

const usd = (n) => (n == null ? 'n/a' : `$${n.toFixed(2)}`);
const k = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));
const sec = (ms) => `${(ms / 1000).toFixed(0)} s`;

export function summaryTable(s) {
  const m = s.median;
  return [
    '| Metric | Value |',
    '|---|---|',
    `| Runs / passed | ${s.runs} / ${s.passed} (pass rate ${(s.passRate * 100).toFixed(0)}%) |`,
    `| Critical failures | ${s.criticalFailures} |`,
    `| Median cost per run | ${usd(m.costUsd)} (spread ${usd(s.spreadCostUsd)}) |`,
    `| Cost per successful workflow | ${usd(s.costPerSuccessfulWorkflow)} |`,
    `| Median latency | ${sec(m.durationMs)} |`,
    `| Median input / output tokens | ${k(m.inputTokens)} / ${k(m.outputTokens)} |`,
    `| Median cache read / write tokens | ${k(m.cacheReadTokens)} / ${k(m.cacheWriteTokens)} |`,
    `| Median API turns / tool calls | ${Math.round(m.turns)} / ${Math.round(m.toolCalls)} |`,
  ].join('\n');
}

export function stageTable(runs) {
  const names = [...new Set(runs.flatMap((r) => r.stages.map((s) => s.name)))];
  const rows = names.map((n) => {
    const per = runs.map((r) => r.stages.find((s) => s.name === n)).filter(Boolean);
    return `| ${n} | ${usd(median(per.map((s) => s.costUsd)))} | ${sec(median(per.map((s) => s.durationMs)))} | ${k(median(per.map((s) => s.inputTokens + s.cacheReadTokens + s.cacheWriteTokens)))} | ${k(median(per.map((s) => s.outputTokens)))} | ${Math.round(median(per.map((s) => s.turns)))} |`;
  });
  return ['| Stage | Median cost | Median latency | Context tokens in | Tokens out | Turns |', '|---|---|---|---|---|---|', ...rows].join('\n');
}
