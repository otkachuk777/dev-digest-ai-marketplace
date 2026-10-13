// Shared helpers for release tooling. Node >= 18, no dependencies.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseVersion(v) {
  const m = SEMVER.exec(String(v));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

/** Supports exact, ^, ~, >= and * ranges, which is what the plugins use. */
export function satisfies(version, range) {
  const v = parseVersion(version);
  if (!v) return false;
  const r = String(range ?? '*').trim();
  if (r === '' || r === '*') return true;
  const op = /^(\^|~|>=)?\s*(\d+\.\d+\.\d+)/.exec(r);
  if (!op) return false;
  const base = parseVersion(op[2]);
  const ge = compareVersions(version, op[2]) >= 0;
  switch (op[1]) {
    case '>=':
      return ge;
    case '~':
      return ge && v[0] === base[0] && v[1] === base[1];
    case '^':
      if (base[0] > 0) return ge && v[0] === base[0];
      if (base[1] > 0) return ge && v[0] === 0 && v[1] === base[1];
      return ge && v[0] === 0 && v[1] === 0 && v[2] === base[2];
    default:
      return compareVersions(version, op[2]) === 0;
  }
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function git(root, ...args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return { ok: r.status === 0, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? '').trim() };
}

/** Released versions of a plugin, from tags named `<plugin>--v<version>`, ascending. */
export function releasedVersions(root, plugin) {
  const out = git(root, 'tag', '-l', `${plugin}--v*`);
  if (!out.ok || !out.stdout) return [];
  return out.stdout
    .split('\n')
    .map((t) => t.slice(`${plugin}--v`.length))
    .filter((v) => parseVersion(v))
    .sort(compareVersions);
}

/** Normalises a plugin dependency entry to `{ name, range }`; null for other marketplaces. */
export function normalizeDependency(dep, marketplaceName) {
  if (typeof dep === 'string') {
    const [name, marketplace] = dep.split('@');
    if (marketplace && marketplace !== marketplaceName) return null;
    return { name, range: '*' };
  }
  if (dep && typeof dep === 'object' && dep.name) {
    if (dep.marketplace && dep.marketplace !== marketplaceName) return null;
    return { name: dep.name, range: dep.version ?? '*' };
  }
  return null;
}

/** Reads the marketplace and every plugin whose entry uses a relative-path source. */
export function loadMarketplace(root) {
  const file = join(root, '.claude-plugin', 'marketplace.json');
  if (!existsSync(file)) throw new Error(`Missing ${file}`);
  const marketplace = readJson(file);
  const plugins = [];
  for (const entry of marketplace.plugins ?? []) {
    if (typeof entry.source !== 'string') {
      plugins.push({ entry, name: entry.name, dir: null, manifest: null });
      continue;
    }
    const dir = join(root, entry.source);
    const manifestPath = join(dir, '.claude-plugin', 'plugin.json');
    const manifest = existsSync(manifestPath) ? readJson(manifestPath) : null;
    plugins.push({ entry, name: entry.name, dir, manifest });
  }
  return { marketplace, plugins };
}

export function parseArgs(argv, { flags = [], options = [], repeatable = [] } = {}) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    if (flags.includes(key)) out[key] = true;
    else if (options.includes(key) || repeatable.includes(key)) {
      const value = argv[++i];
      if (value === undefined) throw new Error(`--${key} needs a value`);
      if (repeatable.includes(key)) (out[key] ??= []).push(value);
      else out[key] = value;
    } else throw new Error(`Unknown option --${key}`);
  }
  return out;
}
