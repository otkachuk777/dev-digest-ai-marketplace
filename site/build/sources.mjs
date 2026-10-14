import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { git, extractTree } from './lib/git.mjs';
import { scanPlugin } from './scan.mjs';
import { evaluate } from './validate.mjs';
import { listReleases } from './releases.mjs';

export function lastChangeDate(repoRoot, ref, path) {
  const r = git(repoRoot, 'log', '-1', '--format=%cs', ref, '--', path);
  return r.ok && r.stdout ? r.stdout : null;
}

function indexed(scan, extra) {
  return {
    name: scan.name, version: scan.version, description: scan.description, keywords: scan.keywords, readme: scan.readme,
    path: scan.path, artifacts: scan.artifacts, hooks: scan.hooks, mcp: scan.mcp, dependencies: scan.dependencies, indexed: true,
    validation: evaluate(scan), ...extra,
  };
}

/** A plugin the build cannot read (remote source): one card, no deep indexing. */
function unindexed(entry) {
  const keywords = [...new Set((entry.keywords ?? []).map((k) => String(k).trim().toLowerCase()).filter(Boolean))];
  return {
    name: entry.name, version: entry.version ?? null, description: entry.description ?? '', keywords, readme: '', path: '',
    artifacts: [{ type: 'plugin', slug: entry.name, name: entry.name, description: entry.description ?? '', tags: keywords, body: '', path: '.claude-plugin/marketplace.json', tools: [], tokens: null }],
    hooks: [], mcp: [], dependencies: [], indexed: false, validation: null, lastChange: null, tag: null,
  };
}

export function loadLatest({ repoRoot }) {
  const mp = JSON.parse(readFileSync(join(repoRoot, '.claude-plugin', 'marketplace.json'), 'utf8'));
  const plugins = (mp.plugins ?? []).map((entry) => {
    if (typeof entry.source !== 'string') return unindexed(entry);
    const pluginPath = entry.source.replace(/^\.\//, '').replace(/\/$/, '');
    const scan = scanPlugin({ dir: join(repoRoot, pluginPath), pluginPath, entryName: entry.name });
    return indexed(scan, { lastChange: lastChangeDate(repoRoot, 'HEAD', pluginPath), tag: null });
  });
  return { channel: 'latest', marketplace: mp.name, ref: 'main', plugins };
}

export function loadStable({ repoRoot, ref, workDir }) {
  const r = git(repoRoot, 'show', `${ref}:.claude-plugin/marketplace.json`);
  if (!r.ok) return null;
  let mp;
  try {
    mp = JSON.parse(r.stdout);
  } catch (e) {
    throw new Error(`${ref}:.claude-plugin/marketplace.json is not valid JSON: ${e.message}`);
  }
  const plugins = (mp.plugins ?? []).map((entry) => {
    const s = entry.source;
    if (!s || typeof s !== 'object' || s.source !== 'git-subdir' || !s.sha || !s.path) return unindexed(entry);
    const dest = join(workDir, entry.name);
    extractTree(repoRoot, s.sha, s.path, dest);
    const scan = scanPlugin({ dir: join(dest, s.path), pluginPath: s.path, entryName: entry.name });
    return indexed(scan, { lastChange: lastChangeDate(repoRoot, s.sha, s.path), tag: s.ref ?? null });
  });
  return { channel: 'stable', marketplace: mp.name, ref: 'stable', plugins };
}

export function collectReleases(repoRoot, plugins) {
  return plugins
    .filter((p) => p.indexed)
    .flatMap((p) => listReleases(repoRoot, { name: p.name, path: p.path }))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, 50);
}
