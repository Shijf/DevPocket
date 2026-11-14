(async () => {
  const grid = document.querySelector('dialog[open] .more-tool-grid.sorting');
  if (!grid) throw new Error('Open sorting mode before dispatching drag events');
  const rows = [...grid.querySelectorAll('[data-tool-id]')], before = rows.map(row => row.dataset.toolId);
  const source = rows[0].querySelector('.more-drag-handle'), target = rows[2];
  const transfer = new DataTransfer();
  source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer, clientY: target.getBoundingClientRect().top + 15 }));
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  source.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: transfer }));
  await new Promise(resolve => requestAnimationFrame(resolve));
  const expected = [...before.slice(1, 3), before[0], ...before.slice(3)];
  const after = [...grid.querySelectorAll('[data-tool-id]')].map(row => row.dataset.toolId);
  return { before, after, expected, passed: JSON.stringify(after) === JSON.stringify(expected) };
})()
