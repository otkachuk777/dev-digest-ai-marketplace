const base = (repo, template, params) => {
  const p = new URLSearchParams({ template, ...params });
  return `https://github.com/${repo}/issues/new?${p.toString()}`;
};

export function requestSkillUrl(repo, query) {
  const q = String(query ?? '').trim();
  const params = { title: `Request: ${q}` };
  if (q) params.query = q;
  return base(repo, 'request-skill.yml', params);
}

export function reportProblemUrl(repo, { id, version, channel }) {
  return base(repo, 'report-problem.yml', { title: `Problem: ${id}`, artifact: `${id} ${version ?? 'n/a'} (${channel})` });
}
