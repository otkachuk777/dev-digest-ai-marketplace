#!/usr/bin/env node
// Cost baseline for the SDD workflow. Runs a fixed, human-free scenario against the sandbox project:
//   plan (implementation-planner) -> implement (implementer) -> verify (plan-verifier) -> review (code + security)
// and records cost, latency, tokens and a quality gate per run.
//
//   node scripts/cost-baseline/run.mjs --label baseline --runs 3 [--model sonnet] [--stages plan,implement,verify,review]
//   node scripts/cost-baseline/run.mjs --dry                       print the stages and prompts, no model calls
//   node scripts/cost-baseline/run.mjs --report docs/cost-baseline/baseline.json [docs/cost-baseline/after.json]
//
// Running it calls the model and spends real money. One model for every agent (CLAUDE_CODE_SUBAGENT_MODEL),
// the same fixture, the same prompts and the same tool allowlist for every run.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compare, parseStream, stageTable, sumStages, summarize, summaryTable } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const PLUGINS = ['engineering-paved-path', 'research-tools', 'architecture-review', 'quality-review', 'sdd-engineering'];
const SANDBOX_URL = process.env.SANDBOX_URL ?? 'https://github.com/otkachuk777/sdd-sandbox.git';
const SANDBOX_SHA = '1334018';
const SPEC_NAME = 'SPEC-01-clear-completed.md';

const BASE_TOOLS = ['Read', 'Grep', 'Glob', 'Skill', 'Bash(git:*)', 'Bash(ls:*)', 'Bash(cat:*)', 'Bash(grep:*)', 'Bash(find:*)', 'Bash(wc:*)',
  'Bash(head:*)', 'Bash(tail:*)', 'Bash(diff:*)', 'Bash(node:*)', 'Bash(npm:*)', 'Bash(python3:*)', 'Bash(bash:*)'];

const git = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8' });

function childEnv(model) {
  const keep = /^(PATH|HOME|USER|LOGNAME|SHELL|TERM|LANG|LC_.*|TMPDIR|TZ|ANTHROPIC_.*|CLAUDE_.*|XDG_.*|SSL_CERT_.*|NODE_EXTRA_CA_CERTS|HTTPS?_PROXY|NO_PROXY|https?_proxy|no_proxy)$/;
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => keep.test(k)));
  env.CLAUDE_CODE_SUBAGENT_MODEL = model;
  return env;
}

export function stagesFor(planPath) {
  return [
    {
      // Claude Code treats ~/.claude/ as sensitive: a plan file can only be saved after a human clicks "allow",
      // and no allow rule or acceptEdits mode changes that. In a headless run that click is simulated with
      // bypassPermissions for this one stage. Residual risk, accepted: the stage's main session can use Bash (the planner
      // needs it to read code and run spec-lint) and the read-only guard covers only the planner subagent. It runs a fixed
      // prompt on a first-party fixture, in a throwaway clone, with a scrubbed environment (no tokens), and cannot edit files
      // or reach the web.
      name: 'plan', tools: ['Write', 'Agent'], maxTurns: 40, permissionMode: 'bypassPermissions', deny: ['Edit', 'NotebookEdit'],
      prompt: `Use the sdd-engineering:implementation-planner agent to plan specs/${SPEC_NAME}. Execution mode: single implementer. Test mode: inline. Write the plan to ${planPath}. Reply with the plan path and the agent's summary only.`,
    },
    {
      name: 'implement', tools: ['Write', 'Edit', 'Agent'], maxTurns: 60,
      prompt: `The plan is at ${planPath}. Execute it: start one sdd-engineering:implementer agent per chunk of the plan, one after another, giving it the plan path and the chunk number. Nobody commits. Reply with each implementer's status line only.`,
    },
    {
      name: 'verify', tools: ['Agent'], maxTurns: 30,
      prompt: `Use the sdd-engineering:plan-verifier agent with pass: 1 on the plan ${planPath} and the spec specs/${SPEC_NAME}. Reply with its Summary line and its Spec status line only.`,
    },
    {
      name: 'review', tools: ['Agent'], maxTurns: 40,
      prompt: 'Start quality-review:code-reviewer and quality-review:security-reviewer in parallel, in one message, on the uncommitted changes in the working tree. Reply with each agent\'s Verdict line only.',
    },
  ];
}

function runClaude(cwd, stage, model, plugins) {
  const args = ['-p', stage.prompt, '--output-format', 'stream-json', '--verbose', '--permission-mode', stage.permissionMode ?? 'default',
    '--allowedTools', [...BASE_TOOLS, ...stage.tools].join(','), '--disallowedTools', ['WebFetch', 'WebSearch', ...(stage.deny ?? [])].join(','),
    '--max-turns', String(stage.maxTurns), '--model', model, ...plugins.flatMap((n) => ['--plugin-dir', join(ROOT, 'plugins', n)])];
  const t0 = Date.now();
  const proc = spawnSync('claude', args, { cwd, env: childEnv(model), encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const s = parseStream(proc.stdout ?? '');
  if (!s.durationMs) s.durationMs = Date.now() - t0;
  return { name: stage.name, ...s };
}

/** One trivial call before spending anything: an expired login or a dead API fails here, with its reason. */
function preflight(model) {
  const proc = spawnSync('claude', ['-p', 'Reply with the single word OK.', '--output-format', 'stream-json', '--verbose', '--max-turns', '1', '--model', model],
    { env: childEnv(model), encoding: 'utf8', timeout: 120000 });
  const s = parseStream(proc.stdout ?? '');
  return s.ok ? null : (s.error || String(proc.stderr ?? '').trim().slice(0, 300) || 'claude produced no result');
}

function gate(repo, base, stages) {
  const critical = [];
  const checks = {};
  for (const s of stages) if (!s.ok) critical.push(`stage "${s.name}" did not finish: ${s.error || s.subtype}`);
  checks.tests = spawnSync('npm', ['test'], { cwd: repo, encoding: 'utf8' }).status === 0;
  copyFileSync(join(HERE, 'fixture', 'acceptance.test.js'), join(repo, 'test', 'acceptance.test.js'));
  checks.acceptance = spawnSync('node', ['--test', 'test/acceptance.test.js'], { cwd: repo, encoding: 'utf8' }).status === 0;
  const verifier = stages.find((s) => s.name === 'verify');
  checks.verifierSatisfied = Boolean(verifier && /satisfied/i.test(verifier.text) && !/gaps/i.test(verifier.text.replace(/satisfied\s*\|\s*gaps/i, '')));
  checks.noCommit = git(repo, 'rev-parse', 'HEAD').stdout.trim() === base;
  if (!checks.tests) critical.push('npm test fails');
  if (!checks.acceptance) critical.push('hidden acceptance tests fail');
  if (!checks.noCommit) critical.push('an agent committed');
  if (!checks.acceptance && checks.verifierSatisfied) critical.push('false negative: plan-verifier says satisfied but acceptance fails');
  return { passed: checks.tests && checks.acceptance && checks.verifierSatisfied && checks.noCommit && critical.length === 0, checks, critical };
}

function oneRun(i, { label, model, only }) {
  const repo = mkdtempSync(join(tmpdir(), 'cost-baseline-'));
  const planPath = join(homedir(), '.claude', 'plans', `cost-${label}-r${i}-${Date.now()}.md`);
  try {
    git(repo, 'clone', '-q', SANDBOX_URL, '.');
    git(repo, 'checkout', '-q', SANDBOX_SHA);
    git(repo, 'config', 'user.email', 'cost@example.com');
    git(repo, 'config', 'user.name', 'Cost baseline');
    mkdirSync(join(repo, 'specs'), { recursive: true });
    copyFileSync(join(HERE, 'fixture', SPEC_NAME), join(repo, 'specs', SPEC_NAME));
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'spec');
    const base = git(repo, 'rev-parse', 'HEAD').stdout.trim();
    const stages = [];
    for (const st of stagesFor(planPath).filter((s) => !only || only.includes(s.name))) {
      console.log(`  run ${i}: ${st.name} ...`);
      const r = runClaude(repo, st, model, PLUGINS);
      stages.push(r);
      console.log(`    ${r.ok ? 'ok' : `FAILED (${r.error || r.subtype})`} $${r.costUsd.toFixed(2)} ${(r.durationMs / 1000).toFixed(0)}s ${r.turns} turns`);
      if (!r.ok) break;
    }
    const g = gate(repo, base, stages);
    console.log(`  run ${i}: gate ${g.passed ? 'PASSED' : 'FAILED'} ${JSON.stringify(g.checks)}${g.critical.length ? ` critical: ${g.critical.join('; ')}` : ''}`);
    return { stages: stages.map(({ toolResults, text, ...rest }) => rest), total: sumStages(stages), gate: g };
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(planPath, { force: true });
  }
}

function report(files) {
  const data = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
  for (const d of data) {
    console.log(`\n### ${d.label}\n\nPlugins at \`${d.pluginsSha}\`, sandbox at \`${d.sandboxSha}\`, model \`${d.model}\`, ${d.runs.length} runs, ${d.createdAt.slice(0, 10)}.\n`);
    console.log(summaryTable(d.summary));
    console.log(`\n${stageTable(d.runs)}`);
  }
  if (data.length === 2) {
    const c = compare(data[0].summary, data[1].summary);
    console.log(`\n### Change: ${data[0].label} -> ${data[1].label}\n`);
    console.log(`- Cost per run: ${c.costDeltaUsd >= 0 ? '+' : ''}$${c.costDeltaUsd.toFixed(2)} (${c.costDeltaPct.toFixed(1)}%), run-to-run spread $${c.noiseUsd.toFixed(2)}`);
    console.log(`- Latency: ${c.latencyDeltaMs >= 0 ? '+' : ''}${(c.latencyDeltaMs / 1000).toFixed(0)} s`);
    console.log(`- ${c.beyondNoise ? 'The cost difference is larger than the run-to-run spread.' : 'The cost difference is within the run-to-run spread: not distinguishable from noise.'}`);
  }
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
  if (argv.includes('--report')) { report(argv.slice(argv.indexOf('--report') + 1).filter((a) => !a.startsWith('--'))); return; }
  const label = arg('--label', 'baseline');
  const runs = Number(arg('--runs', '3'));
  const model = arg('--model', 'sonnet');
  const only = arg('--stages')?.split(',');
  if (argv.includes('--dry')) {
    for (const s of stagesFor('<plan path>')) console.log(`[${s.name}] maxTurns=${s.maxTurns} extra tools=${s.tools.join(',')}\n  ${s.prompt}\n`);
    console.log(`model=${model} runs=${runs} sandbox=${SANDBOX_URL}@${SANDBOX_SHA} plugins=${PLUGINS.join(', ')}`);
    return;
  }
  const pluginsSha = git(ROOT, 'rev-parse', '--short', 'HEAD').stdout.trim();
  console.log(`cost baseline "${label}": ${runs} run(s), model ${model}, plugins at ${pluginsSha}`);
  const problem = preflight(model);
  if (problem) {
    console.error(`\npreflight failed, nothing was run and nothing was spent:\n  ${problem}\n\nFix it (for an expired login, run \`claude\` and \`/login\` in a terminal) and start again.`);
    process.exit(3);
  }
  const results = [];
  for (let i = 1; i <= runs; i++) results.push(oneRun(i, { label, model, only }));
  const out = resolve(arg('--out', join(ROOT, 'docs', 'cost-baseline', `${label}.json`)));
  mkdirSync(dirname(out), { recursive: true });
  const data = { label, pluginsSha, sandboxSha: SANDBOX_SHA, model, createdAt: new Date().toISOString(), runs: results, summary: summarize(results) };
  writeFileSync(out, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`\nwritten ${out}\n\n${summaryTable(data.summary)}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) main();
