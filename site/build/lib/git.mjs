import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

export function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, stdout: (r.stdout ?? '').replace(/\n+$/, ''), stderr: (r.stderr ?? '').trim() };
}

/** Exports `path` from `ref` into destDir (keeps the repo-relative path under destDir). */
export function extractTree(cwd, ref, path, destDir) {
  mkdirSync(destDir, { recursive: true });
  const a = spawnSync('git', ['archive', '--format=tar', ref, path], { cwd, maxBuffer: 256 * 1024 * 1024 });
  if (a.status !== 0) {
    throw new Error(`git archive ${ref} ${path} failed: ${String(a.stderr).trim()}. Fetch full history and tags first (git fetch --tags --unshallow).`);
  }
  const t = spawnSync('tar', ['-x', '-C', destDir], { input: a.stdout });
  if (t.status !== 0) throw new Error(`tar failed: ${String(t.stderr).trim()}`);
}
