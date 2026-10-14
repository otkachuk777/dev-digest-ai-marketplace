import { hasSection } from './lib/changelog.mjs';

export const RULES = [
  { id: 'manifest', title: 'plugin.json is valid' },
  { id: 'entry-name', title: 'Marketplace entry name matches plugin.json' },
  { id: 'description', title: 'Every skill, agent and command has a description' },
  { id: 'name', title: 'Skill names match their directories' },
  { id: 'changelog', title: 'CHANGELOG.md has a section for the version' },
  { id: 'json', title: 'hooks.json and .mcp.json parse' },
];

export function evaluate(scan) {
  const problems = [...scan.problems];
  if (scan.version && !hasSection(scan.changelog, scan.version)) {
    problems.push({
      rule: 'changelog',
      file: `${scan.path}/CHANGELOG.md`,
      message: scan.changelog == null ? 'CHANGELOG.md is missing' : `CHANGELOG.md has no "## ${scan.version}" section`,
    });
  }
  const failures = [];
  let passed = 0;
  for (const rule of RULES) {
    const mine = problems.filter((p) => p.rule === rule.id);
    if (mine.length === 0) passed++;
    for (const p of mine) failures.push(`[${rule.id}] ${p.file}: ${p.message}`);
  }
  return { passed, total: RULES.length, failures };
}
