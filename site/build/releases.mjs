import { git } from './lib/git.mjs';
import { parseVersion, compareVersions } from './lib/semver.mjs';
import { changelogSummary } from './lib/changelog.mjs';

/** Releases of one plugin from tags named `<plugin>--v<version>`, newest first. */
export function listReleases(repoRoot, { name, path }) {
  const r = git(repoRoot, 'for-each-ref', '--format=%(refname:short)%09%(creatordate:iso-strict)%09%(contents:subject)', `refs/tags/${name}--v*`);
  if (!r.ok || !r.stdout) return [];
  return r.stdout
    .split('\n')
    .map((line) => {
      const [tag, date, subject] = line.split('\t');
      const version = tag.slice(`${name}--v`.length);
      if (!parseVersion(version)) return null;
      const changelog = git(repoRoot, 'show', `${tag}:${path}/CHANGELOG.md`);
      const summary = changelogSummary(changelog.ok ? changelog.stdout : '', version) ?? subject ?? `${name} ${version}`;
      return { plugin: name, version, tag, date, summary };
    })
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || compareVersions(b.version, a.version));
}
