import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, GripVertical, RotateCcw } from 'lucide-react';
import { Modal } from './components/Modal';
import { tools, type ToolId } from './tools/registry';
import type { useToolOrder } from './lib/useToolOrder';

export function MoreToolsMenu({ current, ordering, select, close }: {
  current: ToolId; ordering: ReturnType<typeof useToolOrder>; select: (id: ToolId) => void; close: () => void;
}) {
  const [search, setSearch] = useState(''), [sorting, setSorting] = useState(false), [dragging, setDragging] = useState<ToolId>(), [over, setOver] = useState<ToolId>();
  const dragged = useRef<ToolId | undefined>(undefined);
  const visible = ordering.order.map(id => tools.find(item => item.id === id)!).filter(item => `${item.name} ${item.id} ${item.description}`.toLowerCase().includes(search.trim().toLowerCase()));
  function clearDrag() { dragged.current = undefined; setDragging(undefined); setOver(undefined); }
  return <Modal title="更多工具" onClose={close}>
    <div className="more-tool-search"><input aria-label="搜索工具" placeholder="搜索工具…" disabled={sorting} value={search} onChange={e => setSearch(e.target.value)} /><button className={`icon-button ${sorting ? 'selected' : ''}`} title={sorting ? '完成排序' : '调整工具顺序'} aria-label={sorting ? '完成排序' : '调整工具顺序'} aria-pressed={sorting} disabled={!ordering.loaded} onClick={() => { setSorting(!sorting); setSearch(''); clearDrag(); }}>{sorting ? <Check size={16} /> : <ArrowUpDown size={16} />}</button></div>
    {sorting && <div className="more-sort-hint"><span>全部工具可排序，前 4 个显示在顶部；自动保存。</span><button className="icon-button" title="恢复默认顺序" aria-label="恢复默认工具顺序" onClick={ordering.reset}><RotateCcw size={14} /></button></div>}
    <div className={`more-tool-grid ${sorting ? 'sorting' : ''}`}>{visible.map(item => {
      const index = ordering.order.indexOf(item.id);
      return <div key={item.id} data-tool-id={item.id} className={`more-tool-item ${dragging === item.id ? 'dragging' : ''} ${over === item.id && dragging !== item.id ? 'drop-target' : ''}`}
        onDragOver={event => { if (sorting && dragged.current) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOver(item.id); const grid = event.currentTarget.parentElement!; const bounds = grid.getBoundingClientRect(); if (event.clientY < bounds.top + 30) grid.scrollTop -= 12; else if (event.clientY > bounds.bottom - 30) grid.scrollTop += 12; } }}
        onDrop={event => { if (sorting && dragged.current) { event.preventDefault(); ordering.move(dragged.current, index); clearDrag(); } }}>
        {sorting ? <div className={`more-tool-option more-sort-option ${current === item.id ? 'selected' : ''}`}>
          <button className="more-drag-handle" draggable title="拖动排序；Alt + ↑／↓ 移动" aria-label={`排序 ${item.name}`} onDragStart={event => { dragged.current = item.id; setDragging(item.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', item.id); }} onDragEnd={clearDrag}
            onKeyDown={event => { if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); ordering.move(item.id, index + (event.key === 'ArrowUp' ? -1 : 1)); } }}><GripVertical size={14} /></button>
          <item.icon size={15} /><span title={item.description}>{item.name}</span>
          {index < 4 && <small className="more-shortcut-rank" title="顶部快捷入口">{index + 1}</small>}
          <div className="more-sort-arrows"><button className="icon-button" title="前移" aria-label={`前移 ${item.name}`} disabled={index === 0} onClick={() => ordering.move(item.id, index - 1)}><ArrowUp size={12} /></button><button className="icon-button" title="后移" aria-label={`后移 ${item.name}`} disabled={index === ordering.order.length - 1} onClick={() => ordering.move(item.id, index + 1)}><ArrowDown size={12} /></button></div>
        </div> : <button aria-label={item.name} aria-pressed={current === item.id} title={item.description} className={`more-tool-option ${current === item.id ? 'selected' : ''}`} onClick={() => select(item.id)}><item.icon size={16} /><span>{item.name}</span></button>}
      </div>;
    })}</div>
    {!visible.length && <p className="more-tool-empty" role="status">没有找到工具，试试其他关键词。</p>}
    {ordering.error && <div className="more-sort-error" role="alert"><span>{ordering.error}</span><button className="text-button" onClick={ordering.retry}>重试排序存储</button></div>}
  </Modal>;
}
