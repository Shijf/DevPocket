(() => {
  const dialog = document.querySelector('dialog[open]');
  const grid = dialog?.querySelector('.more-tool-grid');
  const rows = grid ? [...grid.querySelectorAll('[data-tool-id]')] : [];
  const nav = document.querySelector('.quick-tool-tabs');
  return {
    order: rows.map(row => row.dataset.toolId),
    saved: JSON.parse(localStorage.getItem('preview-devpocket-tools-more-tool-order') || 'null'),
    popupWidth: document.querySelector('.popup-tools')?.getBoundingClientRect().width,
    popupHeight: document.querySelector('.popup-tools')?.getBoundingClientRect().height,
    overflow: [...rows, ...(nav ? [nav] : [])].filter(row => row.scrollWidth > row.clientWidth + 2).map(row => row.dataset.toolId || 'tool-navigation'),
    sorting: grid?.classList.contains('sorting'),
    toolSelected: document.querySelector('.quick-tool-tabs button.selected')?.textContent,
    shortcuts: [...document.querySelectorAll('.quick-tool-tabs button[data-tool-id]')].map(button => button.dataset.toolId),
  };
})()
