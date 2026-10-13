#!/usr/bin/env node
// Tag and push a plugin release after all checks pass.
//
//   node scripts/release.mjs <plugin>            check, dry-run, ask, then tag and push
//   node scripts/release.mjs <plugin> --dry-run  check and print what would be tagged
//   node scripts/release.mjs <plugin> --yes      skip the confirmation prompt
//
// Release dependencies first: the check refuses a plugin whose dependency has no matching tag yet.
import { createInterface } from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { loadMarketplace, parseArgs } from './lib/common.mjs';
import { checkRepo } from './check-release.mjs';

const args = parseArgs(process.argv.slice(2), { flags: ['dry-run', 'yes'], options: ['root'] });
const name = args._[0];
const root = args.root ?? process.cwd();
if (!name) {
  console.error('usage: node scripts/release.mjs <plugin> [--dry-run] [--yes]');
  process.exit(2);
}

const { errors, warnings } = checkRepo(root, { plugin: name });
for (const w of warnings) console.warn(`warning: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  process.exit(1);
}

const { plugins } = loadMarketplace(root);
const plugin = plugins.find((p) => p.name === name);
const tag = `${name}--v${plugin.manifest.version}`;
const run = (extra) => spawnSync('claude', ['plugin', 'tag', ...extra, plugin.dir], { stdio: 'inherit' }).status;

console.log(`\nDry run for ${tag}:`);
if (run(['--dry-run']) !== 0) process.exit(1);
if (args['dry-run']) process.exit(0);

if (!args.yes) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\nCreate and push ${tag}? [y/N] `);
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) {
    console.log('Aborted.');
    process.exit(1);
  }
}
process.exit(run(['--push']));
