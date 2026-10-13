#!/usr/bin/env node
// Consistency checks for the marketplace and, optionally, a release of one plugin.
//
//   node scripts/check-release.mjs                    structural checks for every plugin (used by CI)
//   node scripts/check-release.mjs --plugin <name>    also check that <name> is ready to be tagged
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  git, loadMarketplace, normalizeDependency, parseArgs, parseVersion, releasedVersions, satisfies,
} from './lib/common.mjs';

export function checkRepo(root, { plugin: releasePlugin } = {}) {
  const errors = [];
  const warnings = [];
  const { marketplace, plugins } = loadMarketplace(root);
  const byName = new Map(plugins.map((p) => [p.name, p]));

  if (releasePlugin && !byName.has(releasePlugin)) {
    errors.push(`Plugin "${releasePlugin}" is not listed in marketplace.json`);
  }

  const seen = new Set();
  for (const p of plugins) {
    const where = `plugin "${p.name}"`;
    if (seen.has(p.name)) errors.push(`${where}: duplicate marketplace entry`);
    seen.add(p.name);

    if (!p.dir) {
      warnings.push(`${where}: non-relative source, skipped local checks`);
      continue;
    }
    if (!p.manifest) {
      errors.push(`${where}: missing .claude-plugin/plugin.json`);
      continue;
    }
    if (p.manifest.name !== p.name) {
      errors.push(`${where}: manifest name "${p.manifest.name}" differs from the marketplace entry name`);
    }
    if ('version' in p.entry) {
      errors.push(`${where}: remove "version" from the marketplace entry; plugin.json is the source of truth`);
    }
    const version = p.manifest.version;
    if (!parseVersion(version)) {
      errors.push(`${where}: plugin.json "version" must be SemVer, got ${JSON.stringify(version)}`);
    }

    for (const file of ['README.md', 'CHANGELOG.md']) {
      if (!existsSync(join(p.dir, file))) errors.push(`${where}: missing ${file}`);
    }
    if (!existsSync(join(p.dir, 'COMPATIBILITY.md'))) warnings.push(`${where}: missing COMPATIBILITY.md`);

    const changelog = join(p.dir, 'CHANGELOG.md');
    if (version && existsSync(changelog)) {
      const heading = new RegExp(`^##\\s*\\[?v?${version.replace(/\./g, '\\.')}\\]?(\\s|$)`, 'm');
      if (!heading.test(readFileSync(changelog, 'utf8'))) {
        errors.push(`${where}: CHANGELOG.md has no "## ${version}" section`);
      }
    }

    for (const raw of p.manifest.dependencies ?? []) {
      const dep = normalizeDependency(raw, marketplace.name);
      if (!dep) continue;
      const target = byName.get(dep.name);
      if (!target?.manifest) {
        errors.push(`${where}: depends on "${dep.name}", which is not in this marketplace`);
      } else if (!satisfies(target.manifest.version, dep.range)) {
        errors.push(`${where}: "${dep.name}" is at ${target.manifest.version}, which does not satisfy ${dep.range}`);
      }
    }
  }

  // Dependency cycles.
  const deps = (p) => (p?.manifest?.dependencies ?? [])
    .map((d) => normalizeDependency(d, marketplace.name)?.name).filter(Boolean);
  const visit = (name, path) => {
    if (path.includes(name)) {
      errors.push(`dependency cycle: ${[...path, name].join(' -> ')}`);
      return;
    }
    for (const next of deps(byName.get(name))) visit(next, [...path, name]);
  };
  for (const p of plugins) visit(p.name, []);

  if (releasePlugin && byName.get(releasePlugin)?.manifest) {
    checkReleaseReadiness(root, byName.get(releasePlugin), marketplace, errors, warnings);
  }
  return { errors, warnings };
}

function checkReleaseReadiness(root, p, marketplace, errors, warnings) {
  const version = p.manifest.version;
  const tag = `${p.name}--v${version}`;
  const where = `release ${tag}`;

  if (git(root, 'status', '--porcelain').stdout) errors.push(`${where}: working tree is not clean`);
  if (git(root, 'tag', '-l', tag).stdout) errors.push(`${where}: tag already exists; bump the version instead`);

  const branch = git(root, 'rev-parse', '--abbrev-ref', 'HEAD').stdout;
  if (branch !== 'main') errors.push(`${where}: tag from "main", currently on "${branch}"`);

  const head = git(root, 'rev-parse', 'HEAD').stdout;
  const upstream = git(root, 'rev-parse', '--verify', '--quiet', 'origin/main');
  if (!upstream.ok) warnings.push(`${where}: origin/main not found, could not verify HEAD passed CI`);
  else if (upstream.stdout !== head) {
    errors.push(`${where}: HEAD is not origin/main; run "git pull" so the tag points at a commit that passed CI`);
  }

  for (const raw of p.manifest.dependencies ?? []) {
    const dep = normalizeDependency(raw, marketplace.name);
    if (!dep) continue;
    const released = releasedVersions(root, dep.name);
    if (!released.some((v) => satisfies(v, dep.range))) {
      errors.push(`${where}: no released tag of "${dep.name}" satisfies ${dep.range}; release it first`);
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2), { options: ['plugin', 'root'] });
  const root = args.root ?? process.cwd();
  const { errors, warnings } = checkRepo(root, { plugin: args.plugin });
  for (const w of warnings) console.warn(`warning: ${w}`);
  for (const e of errors) console.error(`error: ${e}`);
  if (errors.length) {
    console.error(`\n${errors.length} problem(s) found.`);
    process.exit(1);
  }
  console.log(args.plugin ? `Ready to release ${args.plugin}.` : 'Marketplace is consistent.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
