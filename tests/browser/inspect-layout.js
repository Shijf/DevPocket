(() => {
  const shell = [...document.querySelectorAll('.quick-shell, .app-shell')].find(node => node.getBoundingClientRect().width > 0);
  const root = document.querySelector('#root');
  const popupTools = document.querySelector('.popup-tools');
  const nav = document.querySelector('.quick-tool-tabs');
  const heading = document.querySelector('.popup-brand-heading');
  const cards = [...document.querySelectorAll('.rule-card')];
  const shellWidth = shell.getBoundingClientRect().width;
  const overflow = [...document.querySelectorAll('.rule-card, .rule-title, .header-preview, .rules-toolbar, .page-heading, .quick-row, .quick-footer, .quick-tool-tabs, .tool-toolbar, .quick-heading-actions, .utility-body, .url-param-row, .json-parse-layout, .json-sources-split, .json-tree-split, .network-debug-row, .storage-row, .compact-controls, .more-tool-grid')]
    .filter(element => element.getBoundingClientRect().width > 0 && element.scrollWidth > element.clientWidth + 2)
    .map(element => element.className);
  const colors = ['--text-body', '--muted', '--brand-ink'].map(name => [name, getComputedStyle(shell).getPropertyValue(name).trim()]);
  return { rootMounted: Boolean(root?.children.length), shellWidth, shellHeight: shell.getBoundingClientRect().height, viewport: { width: innerWidth, height: innerHeight }, cardCount: cards.length, overflow, colors, popupHeight: popupTools?.getBoundingClientRect().height, topGap: popupTools && nav ? nav.getBoundingClientRect().top - popupTools.getBoundingClientRect().top : undefined, transparentGap: popupTools && heading ? heading.getBoundingClientRect().top - popupTools.getBoundingClientRect().top : undefined, headingBackground: heading ? getComputedStyle(heading).backgroundColor : undefined, popup: document.body.classList.contains('popup') };
})()
