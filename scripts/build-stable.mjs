#!/usr/bin/env node
// Build the "stable" marketplace used for rollback.
//
// Claude Code has no `plugin rollback`. Instead, users install from a second marketplace whose
// name differs from the main one and whose entries are pinned to released tags. Every plugin is
// listed, so dependencies resolve inside the stable marketplace too.
//
//   node scripts/build-stable.mjs                           latest released version of every plugin, JSON to stdout
//   node scripts/build-stable.mjs --pin sdd-engineering@1.0.0   pin a plugin to an older release
//   node scripts/build-stable.mjs --publish                 commit the result to the "stable" branch and push it
//
// Users then run: claude plugin marketplace add <owner>/<repo>#stable
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { git, loadMarketplace, parseArgs, parseVersion, releasedVersions } from './lib/common.mjs';

export function toHttpsUrl(remote) {
  const ssh = /^git@([^:]+):(.+?)(?:\.git)?$/.exec(remote);
  if (ssh) return `https://${ssh[1]}/${ssh[2]}.git`;
  if (/^https?:\/\//.test(remote) && !remote.endsWith('.git')) return `${remote}.git`;
  return remote;
}

export function buildStable(root, { pins = [], remote = 'origin' } = {}) {
  const { marketplace, plugins } = loadMarketplace(root);
  const remoteUrl = git(root, 'remote', 'get-url', remote).stdout;
  if (!remoteUrl) throw new Error(`Cannot read the URL of remote "${remote}"`);
  const url = toHttpsUrl(remoteUrl);

  const pinned = new Map();
  for (const pin of pins) {
    const [name, version] = pin.split('@');
    if (!name || !parseVersion(version)) throw new Error(`Bad --pin "${pin}", expected <plugin>@<x.y.z>`);
    if (!plugins.some((p) => p.name === name)) throw new Error(`--pin: unknown plugin "${name}"`);
    pinned.set(name, version);
  }

  const entries = plugins.map((p) => {
    if (!p.dir) throw new Error(`Plugin "${p.name}" has a non-relative source; cannot pin it`);
    const released = releasedVersions(root, p.name);
    const version = pinned.get(p.name) ?? released.at(-1);
    if (!version || !released.includes(version)) {
      throw new Error(`Plugin "${p.name}" has no released tag ${p.name}--v${version ?? '*'}; release it first`);
    }
    const tag = `${p.name}--v${version}`;
    const sha = git(root, 'rev-list', '-n', '1', tag).stdout;
    const path = relative(root, p.dir).split('\\').join('/');
    const manifest = git(root, 'show', `${tag}:${path}/.claude-plugin/plugin.json`);
    const description = manifest.ok ? JSON.parse(manifest.stdout).description : p.entry.description;
    return {
      name: p.name,
      ...(description ? { description } : {}),
      source: { source: 'git-subdir', url, path, ref: tag, sha },
    };
  });

  return {
    ...(marketplace.$schema ? { $schema: marketplace.$schema } : {}),
    name: `${marketplace.name}-stable`,
    description: `Pinned, verified releases of ${marketplace.name}. Used for rollback.`,
    owner: marketplace.owner,
    plugins: entries,
  };
}

function publish(root, json, remote) {
  const dir = mkdtempSync(join(tmpdir(), 'stable-'));
  const sh = (cwd, ...a) => {
    const r = git(cwd, ...a);
    if (!r.ok) throw new Error(`git ${a.join(' ')} failed: ${r.stderr}`);
    return r.stdout;
  };
  try {
    git(root, 'fetch', remote, 'stable');
    const exists = git(root, 'rev-parse', '--verify', '--quiet', `${remote}/stable`).ok;
    sh(root, 'worktree', 'add', '--detach', dir);
    if (exists) sh(dir, 'checkout', '-B', 'stable', `${remote}/stable`);
    else {
      sh(dir, 'checkout', '--orphan', 'stable');
      git(dir, 'rm', '-rf', '--quiet', '.');
    }
    mkdirSync(join(dir, '.claude-plugin'), { recursive: true });
    writeFileSync(join(dir, '.claude-plugin', 'marketplace.json'), `${JSON.stringify(json, null, 2)}\n`);
    sh(dir, 'add', '.claude-plugin/marketplace.json');
    if (!git(dir, 'status', '--porcelain').stdout) return console.log('stable branch is already up to date');
    const summary = json.plugins.map((p) => `${p.name}@${p.source.ref.split('--v')[1]}`).join(', ');
    sh(dir, 'commit', '--quiet', '-m', `chore(stable): pin ${summary}`);
    sh(dir, 'push', remote, 'stable');
    console.log(`Pushed branch "stable" to ${remote}: ${summary}`);
  } finally {
    git(root, 'worktree', 'remove', '--force', dir);
    rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2), { flags: ['publish'], options: ['root', 'remote'], repeatable: ['pin'] });
  const root = args.root ?? process.cwd();
  const remote = args.remote ?? 'origin';
  const json = buildStable(root, { pins: args.pin, remote });
  if (args.publish) publish(root, json, remote);
  else console.log(JSON.stringify(json, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(1);
  }
}
