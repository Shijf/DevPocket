import { ChevronDown, ChevronRight } from 'lucide-react';
import { isContainer, type JsonDiff } from '../lib/jsonTree';

export interface VisibleJsonRow { diff: JsonDiff; depth: number; expanded: boolean; closing?: boolean }
export function visibleJsonRows(root: JsonDiff, expanded: (id: string, depth: number) => boolean) {
  const rows: VisibleJsonRow[] = [];
  let clipped = false;
  function visit(diff: JsonDiff, depth: number) {
    if (rows.length >= 1000) { clipped = true; return; }
    const open = expanded(diff.id, depth);
    rows.push({ diff, depth, expanded: open });
    if (open && diff.children.length) {
      diff.children.forEach(child => visit(child, depth + 1));
      if (rows.length < 1000) rows.push({ diff, depth, expanded: open, closing: true });
      else clipped = true;
    }
  }
  visit(root, 0);
  return { rows, clipped };
}
export function JsonTreeView({ rows, side, comparing, toggle, lineNumbers = false }: { rows: VisibleJsonRow[]; side: 'left' | 'right'; comparing: boolean; toggle: (id: string, depth: number) => void; lineNumbers?: boolean }) {
  const sideName = side === 'left' ? '左侧' : '右侧';
  return <div className="json-tree" role="region" aria-label={`${sideName} JSON 节点`}>
    {rows.map(({ diff, depth, expanded, closing }, index) => {
      const node = diff[side], container = isContainer(node), foldable = diff.children.length > 0;
      const value = !node ? '—' : closing ? container ? node.kind === 'object' ? '}' : ']' : '—'
        : container ? expanded && foldable ? node.kind === 'object' ? '{' : '[' : `${node.kind === 'object' ? '{' : '['} ${node.children.length} 项 ${node.kind === 'object' ? '}' : ']'}` : node.raw;
      const status = comparing ? diff.status : 'same';
      const statusText = { same: '', added: '新增', removed: '删除', modified: '修改' }[status];
      return <div className={`json-node json-diff-${status} ${!node ? 'json-node-missing' : ''}`} key={`${diff.id}${closing ? ':close' : ''}`} title={`${diff.label}: ${value}${statusText ? ` · ${statusText}` : ''}\n${diff.id}`}>
        {lineNumbers && <span className="json-line-number" aria-hidden="true">{index + 1}</span>}
        <span className="json-node-indent" style={{ width: Math.min(depth, 8) * 9 }} />
        {foldable && !closing ? <button type="button" className="json-node-fold" aria-label={`${sideName}${expanded ? '折叠' : '展开'}节点 ${diff.label}`} aria-expanded={expanded} onClick={() => toggle(diff.id, depth)}>{expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</button> : <span className="json-node-fold-space" />}
        {!closing && depth > 0 && <span className="json-node-key">{JSON.stringify(diff.label)}:</span>}
        <span className={`json-node-value json-value-${node?.kind ?? 'missing'}`}>{value}</span>
        {statusText && <span className="json-diff-mark" aria-label={statusText}>{status === 'added' ? '+' : status === 'removed' ? '−' : '~'}</span>}
      </div>;
    })}
  </div>;
}
