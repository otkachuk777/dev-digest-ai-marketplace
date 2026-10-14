import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { git } from './lib/git.mjs';
import { loadLatest, loadStable, collectReleases } from './sources.mjs';
import { buildCatalog } from './catalog.mjs';
import { assertValidCatalog } from './schema.mjs';
import { buildSearchIndex } from './searchindex.mjs';
import { buildAtom } from './feed.mjs';
import { copyVendor } from './vendor.mjs';

const SRC_DIR = fileURLToPath(new URL('../src/', import.meta.url));

export function parseRepoUrl(url) {
  const m = /github\.com[:/]+([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(String(url).trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

export function detectRepo(repoRoot) {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const r = git(repoRoot, 'remote', 'get-url', 'origin');
  const repo = r.ok ? parseRepoUrl(r.stdout) : null;
  if (!repo) throw new Error('Cannot detect the GitHub repo. Pass --repo owner/name.');
  return repo;
}

function write(out, file, text) {
  const p = join(out, file);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
}

function isInside(child, parent) {
  const r = relative(parent, child);
  return r === '' || (r !== '..' && !r.startsWith(`..${sep}`) && !isAbsolute(r));
}

function assertSafeOut(out, repoRoot) {
  const target = resolve(out);
  const src = resolve(SRC_DIR);
  const reason =
    target === parse(target).root ? 'it is the filesystem root'
    : isInside(process.cwd(), target) ? 'it is the current directory or an ancestor of it'
    : isInside(resolve(repoRoot), target) ? 'it is the repo root or an ancestor of it'
    : isInside(src, target) ? 'it is the site source directory or an ancestor of it'
    : isInside(target, src) ? 'it is inside the site source directory'
    : null;
  if (reason) throw new Error(`Refusing to use --out ${target}: ${reason}.`);
}

export function build({ repoRoot, stableRef = 'origin/stable', repo, out, builtAt = new Date().toISOString() }) {
  assertSafeOut(out, repoRoot);
  const work = mkdtempSync(join(tmpdir(), 'catalog-build-'));
  try {
    const latest = loadLatest({ repoRoot });
    const failed = latest.plugins.filter((p) => p.validation && p.validation.failures.length > 0);
    if (failed.length > 0) {
      const lines = failed.flatMap((p) => p.validation.failures.map((f) => `  ${p.name}: ${f}`));
      throw new Error(`Latest channel failed validation:\n${lines.join('\n')}`);
    }
    const stable = stableRef && stableRef !== 'none' ? loadStable({ repoRoot, ref: stableRef, workDir: work }) : null;
    const releases = collectReleases(repoRoot, latest.plugins);
    const { catalog, bodies, searchDocs } = buildCatalog({ repo, latest, stable, releases });
    assertValidCatalog(catalog);

    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    cpSync(SRC_DIR, out, { recursive: true, filter: (p) => !p.endsWith('.gitkeep') });
    copyVendor(out);

    const [owner, name] = repo.split('/');
    const siteUrl = `https://${owner.toLowerCase()}.github.io/${name}/`;
    const commit = git(repoRoot, 'rev-parse', '--short', 'HEAD').stdout || 'unknown';
    write(out, 'catalog.json', JSON.stringify(catalog));
    write(out, 'search-latest.json', buildSearchIndex(searchDocs.latest));
    if (stable) write(out, 'search-stable.json', buildSearchIndex(searchDocs.stable));
    for (const [file, text] of bodies) write(out, file, text);
    write(out, 'feed.xml', buildAtom({ siteUrl, repo, releases, updated: releases[0]?.date ?? builtAt }));
    write(out, 'meta.json', JSON.stringify({ builtAt, commit, repo, siteUrl }));
    return { artifacts: catalog.artifacts.length, stable: Boolean(stable) };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values } = parseArgs({
      options: { 'repo-root': { type: 'string' }, 'stable-ref': { type: 'string' }, out: { type: 'string' }, repo: { type: 'string' } },
    });
    const repoRoot = resolve(values['repo-root'] ?? '..');
    const result = build({
      repoRoot,
      stableRef: values['stable-ref'] ?? 'origin/stable',
      repo: values.repo ?? detectRepo(repoRoot),
      out: resolve(values.out ?? 'dist'),
    });
    console.log(`Built ${result.artifacts} artifact(s); stable channel: ${result.stable ? 'yes' : 'no'}`);
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(1);
  }
}
