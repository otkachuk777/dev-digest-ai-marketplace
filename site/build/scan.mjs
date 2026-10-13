import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from './lib/frontmatter.mjs';
import { estimateTokens } from './lib/tokens.mjs';

const read = (p) => readFileSync(p, 'utf8');
const uniq = (list) => [...new Set(list.map((s) => String(s).trim().toLowerCase()).filter(Boolean))];

export function splitList(value) {
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
  if (typeof value !== 'string') return [];
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

function readJson(file, shownPath, problems) {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(read(file));
  } catch (e) {
    problems.push({ rule: 'json', file: shownPath, message: `invalid JSON: ${e.message}` });
    return null;
  }
}

function readHooks(dir, pluginPath, problems) {
  const json = readJson(join(dir, 'hooks', 'hooks.json'), `${pluginPath}/hooks/hooks.json`, problems);
  const out = [];
  for (const [event, groups] of Object.entries(json?.hooks ?? {})) {
    for (const g of Array.isArray(groups) ? groups : []) {
      for (const h of Array.isArray(g?.hooks) ? g.hooks : []) {
        if (h?.command) out.push({ event, matcher: g.matcher ?? '', command: String(h.command) });
      }
    }
  }
  return out;
}

function readMcp(dir, pluginPath, problems) {
  const json = readJson(join(dir, '.mcp.json'), `${pluginPath}/.mcp.json`, problems);
  if (!json) return [];
  const servers = json.mcpServers ?? json;
  return Object.entries(servers)
    .filter(([, v]) => v && typeof v === 'object')
    .map(([name, v]) => ({ name, command: v.command ? [v.command, ...(Array.isArray(v.args) ? v.args : [])].join(' ') : String(v.url ?? '') }));
}

function make({ type, slug, name, description, tags, body, path, tools = [], tokens }) {
  return { type, slug, name, description: String(description ?? '').trim(), tags, body: body ?? '', path, tools, tokens };
}

const fullTokens = (name, description, body) => ({
  always: estimateTokens(`${name} ${description}`),
  onInvoke: estimateTokens(body),
});

export function scanPlugin({ dir, pluginPath, entryName }) {
  const problems = [];
  const manifestPath = `${pluginPath}/.claude-plugin/plugin.json`;
  let manifest = null;
  const manifestFile = join(dir, '.claude-plugin', 'plugin.json');
  if (!existsSync(manifestFile)) {
    problems.push({ rule: 'manifest', file: manifestPath, message: 'plugin.json is missing' });
  } else {
    try {
      manifest = JSON.parse(read(manifestFile));
    } catch (e) {
      problems.push({ rule: 'manifest', file: manifestPath, message: `plugin.json is not valid JSON: ${e.message}` });
    }
  }
  const name = manifest?.name ?? entryName;
  const version = manifest?.version ?? null;
  if (manifest) {
    if (!manifest.name || !/^\d+\.\d+\.\d+/.test(String(version))) {
      problems.push({ rule: 'manifest', file: manifestPath, message: 'plugin.json needs "name" and a SemVer "version"' });
    }
    if (manifest.name && manifest.name !== entryName) {
      problems.push({ rule: 'entry-name', file: manifestPath, message: `marketplace entry "${entryName}" differs from plugin.json name "${manifest.name}"` });
    }
  }
  const rawKeywords = manifest?.keywords;
  const keywords = uniq(Array.isArray(rawKeywords) ? rawKeywords : typeof rawKeywords === 'string' ? splitList(rawKeywords) : []);
  const readmeFile = join(dir, 'README.md');
  const changelogFile = join(dir, 'CHANGELOG.md');
  const readme = existsSync(readmeFile) ? read(readmeFile) : '';
  const changelog = existsSync(changelogFile) ? read(changelogFile) : null;

  const artifacts = [
    make({ type: 'plugin', slug: name, name, description: manifest?.description ?? '', tags: keywords, body: readme, path: manifestPath, tokens: null }),
  ];

  const skillsDir = join(dir, 'skills');
  if (existsSync(skillsDir)) {
    for (const d of readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = join(skillsDir, d.name, 'SKILL.md');
      if (!existsSync(file)) continue;
      const shown = `${pluginPath}/skills/${d.name}/SKILL.md`;
      const { data, body } = parseFrontmatter(read(file));
      if (data.name && data.name !== d.name) {
        problems.push({ rule: 'name', file: shown, message: `skill name "${data.name}" differs from directory "${d.name}"` });
      }
      if (!String(data.description ?? '').trim()) problems.push({ rule: 'description', file: shown, message: 'description is missing' });
      const skillName = String(data.name || d.name);
      const description = String(data.description ?? '');
      artifacts.push(make({
        type: 'skill', slug: d.name, name: skillName, description,
        tags: uniq([...keywords, ...splitList(data.tags)]), body, path: shown,
        tools: splitList(data['allowed-tools']), tokens: fullTokens(skillName, description.trim(), body),
      }));
    }
  }

  for (const [type, folder, toolKey] of [['agent', 'agents', 'tools'], ['command', 'commands', 'allowed-tools']]) {
    const folderPath = join(dir, folder);
    if (!existsSync(folderPath)) continue;
    for (const f of readdirSync(folderPath).filter((n) => n.endsWith('.md')).sort()) {
      const slug = f.slice(0, -3);
      const shown = `${pluginPath}/${folder}/${f}`;
      const { data, body } = parseFrontmatter(read(join(folderPath, f)));
      if (!String(data.description ?? '').trim()) problems.push({ rule: 'description', file: shown, message: 'description is missing' });
      const name = String(data.name || slug);
      const description = String(data.description ?? '');
      artifacts.push(make({
        type, slug, name, description, tags: uniq([...keywords, ...splitList(data.tags)]), body, path: shown,
        tools: splitList(data[toolKey]), tokens: fullTokens(name, description.trim(), body),
      }));
    }
  }

  const hooks = readHooks(dir, pluginPath, problems);
  hooks.forEach((h, i) => {
    artifacts.push(make({
      type: 'hook', slug: `${h.event.toLowerCase()}-${i + 1}`, name: h.matcher ? `${h.event}:${h.matcher}` : h.event,
      description: `Runs on ${h.event}${h.matcher ? ` when the tool matches ${h.matcher}` : ''}: ${h.command}`,
      tags: keywords, body: '', path: `${pluginPath}/hooks/hooks.json`, tokens: null,
    }));
  });

  const mcp = readMcp(dir, pluginPath, problems);
  for (const s of mcp) {
    artifacts.push(make({
      type: 'mcp', slug: s.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-'), name: s.name,
      description: `MCP server started with: ${s.command}`, tags: keywords, body: '', path: `${pluginPath}/.mcp.json`, tokens: null,
    }));
  }

  return { name, version, description: manifest?.description ?? '', keywords, readme, changelog, path: pluginPath, artifacts, hooks, mcp, problems };
}
