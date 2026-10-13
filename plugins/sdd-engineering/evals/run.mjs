#!/usr/bin/env node
// Behaviour eval runner for sdd-engineering. No dependencies.
//
//   node evals/run.mjs --validate              check cases.json only (no model calls); used in CI
//   node evals/run.mjs                         run every case with `claude -p`
//   node evals/run.mjs --case <id> [--model sonnet]   (EVAL_SHOW_OUTPUT=1 prints the model's final text)
//
// Each case gets a fresh git repository built from its `fixture`; the five marketplace plugins are
// loaded with --plugin-dir. Results are graded on deterministic signals only: files, tool calls and
// tool results (agent reports and hook messages are English; the main session's reply follows the
// user's language, so prefer tool results over free text).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGINS = resolve(HERE, '..', '..');
const PLUGIN_NAMES = ['engineering-paved-path', 'research-tools', 'architecture-review', 'quality-review', 'sdd-engineering'];
const CHECKS = ['outputMatches', 'outputNotMatches', 'toolResultMatches', 'toolResultNotMatches', 'fileExists', 'fileAbsent', 'noNewFilesUnder', 'noNewCommits', 'toolUsed', 'toolNotUsed'];

const cases = JSON.parse(readFileSync(join(HERE, 'cases.json'), 'utf8')).cases;

// ---- validation ----------------------------------------------------------------------------
export function validate(list) {
  const errors = [];
  const ids = new Set();
  for (const c of list) {
    if (!c.id || ids.has(c.id)) errors.push(`case "${c.id}": missing or duplicate id`);
    ids.add(c.id);
    if (!['positive', 'negative'].includes(c.kind)) errors.push(`${c.id}: kind must be positive or negative`);
    if (!c.prompt) errors.push(`${c.id}: missing prompt`);
    if (!c.fixture || typeof c.fixture !== 'object') errors.push(`${c.id}: missing fixture`);
    if (!Array.isArray(c.expect) || c.expect.length === 0) errors.push(`${c.id}: needs at least one expectation`);
    for (const e of c.expect ?? []) {
      const keys = Object.keys(e).filter((k) => CHECKS.includes(k));
      if (keys.length !== 1) errors.push(`${c.id}: each expectation needs exactly one of ${CHECKS.join(', ')}`);
    }
    if (c.kind === 'negative' && !(c.expect ?? []).some((e) => e.toolNotUsed)) {
      errors.push(`${c.id}: a negative case must assert toolNotUsed`);
    }
  }
  if (!list.some((c) => c.kind === 'negative')) errors.push('no negative case defined');
  if (!list.some((c) => c.kind === 'positive')) errors.push('no positive case defined');
  return errors;
}

// ---- running -------------------------------------------------------------------------------
function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim() };
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === '.git') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

function parseStream(stdout) {
  const tools = [];
  const results = [];
  let text = '';
  for (const line of stdout.split('\n')) {
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type === 'assistant') {
      for (const part of ev.message?.content ?? []) {
        if (part.type === 'tool_use') tools.push({ name: part.name, input: JSON.stringify(part.input ?? {}) });
      }
    } else if (ev.type === 'user') {
      for (const part of ev.message?.content ?? []) {
        if (part.type !== 'tool_result') continue;
        const body = typeof part.content === 'string' ? part.content : (part.content ?? []).map((x) => x.text ?? '').join('\n');
        results.push(body);
      }
    } else if (ev.type === 'result' && typeof ev.result === 'string') text = ev.result;
  }
  return { tools, results: results.join('\n---\n'), text };
}

function regex(src) {
  const flags = src.startsWith('(?i)') ? 'i' : '';
  return new RegExp(src.replace(/^\(\?i\)/, ''), flags);
}

function grade(c, repo, base, run) {
  const results = [];
  const created = [...walk(repo)].map((f) => f.slice(repo.length + 1));
  for (const e of c.expect) {
    let pass; let label;
    if ('outputMatches' in e) { label = `output matches /${e.outputMatches}/`; pass = regex(e.outputMatches).test(run.text); }
    else if ('outputNotMatches' in e) { label = `output does not match /${e.outputNotMatches}/`; pass = !regex(e.outputNotMatches).test(run.text); }
    else if ('toolResultMatches' in e) { label = `a tool result matches /${e.toolResultMatches}/`; pass = regex(e.toolResultMatches).test(run.results); }
    else if ('toolResultNotMatches' in e) { label = `no tool result matches /${e.toolResultNotMatches}/`; pass = !regex(e.toolResultNotMatches).test(run.results); }
    else if ('fileExists' in e) { label = `file exists: ${e.fileExists}`; pass = existsSync(join(repo, e.fileExists)); }
    else if ('fileAbsent' in e) { label = `file absent: ${e.fileAbsent}`; pass = !existsSync(join(repo, e.fileAbsent)); }
    else if ('noNewFilesUnder' in e) {
      label = `no new files under ${e.noNewFilesUnder.join(', ')}`;
      pass = !created.some((f) => !c.fixture[f] && e.noNewFilesUnder.some((d) => f.startsWith(`${d}/`)));
    } else if ('noNewCommits' in e) { label = 'no new commits'; pass = git(repo, 'rev-parse', 'HEAD').out === base; }
    else if ('toolUsed' in e || 'toolNotUsed' in e) {
      const spec = e.toolUsed ?? e.toolNotUsed;
      const hit = run.tools.some((t) => t.name === spec.name && (!spec.inputMatches || regex(spec.inputMatches).test(t.input)));
      label = `${'toolUsed' in e ? 'tool used' : 'tool not used'}: ${spec.name}${spec.inputMatches ? ` /${spec.inputMatches}/` : ''}`;
      pass = 'toolUsed' in e ? hit : !hit;
    }
    results.push({ label, pass });
  }
  return results;
}

function runCase(c, model) {
  const repo = mkdtempSync(join(tmpdir(), `sdd-eval-${c.id}-`));
  try {
    git(repo, 'init', '-q', '-b', 'main');
    git(repo, 'config', 'user.email', 'eval@example.com');
    git(repo, 'config', 'user.name', 'Eval');
    for (const [rel, body] of Object.entries(c.fixture)) {
      mkdirSync(dirname(join(repo, rel)), { recursive: true });
      writeFileSync(join(repo, rel), body);
    }
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'fixture');
    const base = git(repo, 'rev-parse', 'HEAD').out;

    const args = ['-p', c.prompt, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'bypassPermissions',
      '--max-turns', String(c.maxTurns ?? 10), ...PLUGIN_NAMES.flatMap((n) => ['--plugin-dir', join(PLUGINS, n)])];
    if (model) args.push('--model', model);
    const proc = spawnSync('claude', args, { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const run = parseStream(proc.stdout ?? '');
    if (proc.status !== 0 && !run.text) run.text = (proc.stderr ?? '').slice(0, 2000);
    if (process.env.EVAL_SHOW_OUTPUT) console.log(`  --- output ---\n${run.text}\n  --- tool results ---\n${run.results}\n  --------------`);
    return grade(c, repo, base, run);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  const errors = validate(cases);
  if (errors.length) { for (const e of errors) console.error(`error: ${e}`); process.exit(1); }
  if (argv.includes('--validate')) { console.log(`${cases.length} cases valid.`); return; }

  const only = arg('--case');
  const selected = only ? cases.filter((c) => c.id === only) : cases;
  if (!selected.length) { console.error(`no case "${only}"`); process.exit(2); }
  let failed = 0;
  for (const c of selected) {
    console.log(`\n[${c.kind}] ${c.id} — ${c.intent}`);
    for (const r of runCase(c, arg('--model'))) {
      console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.label}`);
      if (!r.pass) failed++;
    }
  }
  console.log(failed ? `\n${failed} expectation(s) failed.` : '\nAll expectations passed.');
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) main();
