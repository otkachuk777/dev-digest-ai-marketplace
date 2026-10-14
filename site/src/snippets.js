function alsoInstalls(dependencies) {
  const names = dependencies.filter((d) => !d.marketplace).map((d) => d.name);
  return names.length ? `# install the plugin (also installs: ${names.join(', ')})` : '# install the plugin';
}

export function installSteps({ repo, plugin, channel, marketplace, dependencies = [] }) {
  const stable = channel === 'stable';
  return [
    { comment: `# add the marketplace (${channel})`, command: `/plugin marketplace add ${repo}${stable ? '#stable' : ''}` },
    { comment: alsoInstalls(dependencies), command: `/plugin install ${plugin}@${marketplace}` },
  ];
}
