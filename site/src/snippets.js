export function installSteps({ repo, plugin, channel, marketplace }) {
  const stable = channel === 'stable';
  return [
    { comment: `# add the marketplace (${channel})`, command: `/plugin marketplace add ${repo}${stable ? '#stable' : ''}` },
    { comment: '# install the plugin', command: `/plugin install ${plugin}@${marketplace}` },
  ];
}
