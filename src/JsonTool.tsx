import { useDeferredValue, useMemo, useState } from 'react';
import { ChevronsDownUp, ChevronsUpDown, Copy, Eraser, ListOrdered, Minimize2 } from 'lucide-react';
import { ToolToolbar } from './components/ToolToolbar';
import { JsonTreeView, visibleJsonRows } from './components/JsonTreeView';
import { formatJson, MAX_TOOL_TEXT } from './lib/devtools';
import { compareJson, diffCounts, parseJsonTree } from './lib/jsonTree';
import { useToolDraft } from './lib/useToolDraft';
import { ConfirmDelete } from './components/ConfirmDelete';
import './quick-popup.css';

type Mode = 'text' | 'tree' | 'compare';
export function JsonTool() {
  const left = useToolDraft('json');
  const right = useToolDraft('json-right');
  const [mode, setMode] = useState<Mode>('tree');
  const [lineNumbers, setLineNumbers] = useState(false);
  const [active, setActive] = useState<'left' | 'right'>('left');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [clearing, setClearing] = useState<'left' | 'right'>();
  const [folds, setFolds] = useState<Record<string, boolean>>({});
  const [expansion, setExpansion] = useState<'default' | 'all' | 'none'>('default');
  const deferredLeft = useDeferredValue(left.text), deferredRight = useDeferredValue(right.text);
  const draft = active === 'right' && mode === 'compare' ? right : left;
  const parse = (text: string) => {
    try { return { node: text.trim() ? parseJsonTree(text) : undefined, error: '' }; }
    catch (e) { return { node: undefined, error: (e as Error).message }; }
  };
  const parsedLeft = useMemo(() => mode === 'text' ? { node: undefined, error: '' } : parse(deferredLeft), [deferredLeft, mode]);
  const parsedRight = useMemo(() => mode === 'compare' ? parse(deferredRight) : { node: undefined, error: '' }, [deferredRight, mode]);
  const tree = useMemo(() => {
    if (!parsedLeft.node || (mode === 'compare' && !parsedRight.node)) return undefined;
    return compareJson(parsedLeft.node, mode === 'compare' ? parsedRight.node : parsedLeft.node);
  }, [parsedLeft.node, parsedRight.node, mode]);
  const counts = useMemo(() => tree ? diffCounts(tree) : undefined, [tree]);
  const expanded = (id: string, depth: number) => folds[id] ?? (expansion === 'all' || (expansion === 'default' && depth < 2));
  const visible = tree ? visibleJsonRows(tree, expanded) : undefined;
  const updating = deferredLeft !== left.text || (mode === 'compare' && deferredRight !== right.text);
  function toggle(id: string, depth: number) { setFolds(previous => ({ ...previous, [id]: !(previous[id] ?? (expansion === 'all' || (expansion === 'default' && depth < 2))) })); }
  function edit(side: 'left' | 'right', value: string) {
    (side === 'left' ? left : right).update(value); setError(''); setStatus('');
  }
  function transform(compact: boolean) {
    try { draft.update(formatJson(draft.text, compact)); setError(''); setStatus(compact ? '已压缩，JSON 校验通过' : '已格式化，JSON 校验通过'); }
    catch (e) { setError((e as Error).message); setStatus(''); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(draft.text); setStatus('已复制'); setError(''); }
    catch { setError('复制失败，请选中文本后复制。'); }
  }
  function changeMode(next: Mode) { setMode(next); setActive('left'); setError(''); setStatus(''); }
  return <main className={`quick-shell utility-shell ${clearing ? 'confirm-open' : ''}`}>
    <ToolToolbar summary={mode === 'compare' ? `操作${active === 'left' ? '左' : '右'}侧` : '格式化与校验'}>
      {mode !== 'text' && <><button type="button" className={`icon-button ${lineNumbers ? 'selected' : ''}`} title="显示行号" aria-label="显示行号" aria-pressed={lineNumbers} onClick={() => setLineNumbers(value => !value)}><ListOrdered size={16} /></button><button type="button" className="icon-button" title="展开全部节点" aria-label="展开全部节点" disabled={!tree} onClick={() => { setExpansion('all'); setFolds({}); }}><ChevronsUpDown size={16} /></button><button type="button" className="icon-button" title="折叠全部节点" aria-label="折叠全部节点" disabled={!tree} onClick={() => { setExpansion('none'); setFolds({}); }}><ChevronsDownUp size={16} /></button></>}
      <button type="button" className="icon-button" title="压缩 JSON" aria-label="压缩 JSON" disabled={!draft.loaded || !draft.text} onClick={() => transform(true)}><Minimize2 size={16} /></button>
      <button type="button" className="icon-button" title="复制 JSON" aria-label="复制 JSON" disabled={!draft.loaded || !draft.text} onClick={() => { void copy(); }}><Copy size={16} /></button>
      <button type="button" className="icon-button" title="清空 JSON" aria-label="清空 JSON" disabled={!draft.loaded || !draft.text} onClick={() => setClearing(active)}><Eraser size={16} /></button>
    </ToolToolbar>
    <div className="utility-body json-tool-body">
      <div className="json-view-tabs" aria-label="JSON 视图">{([['text', '文本'], ['tree', '节点'], ['compare', '对比']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={mode === value} className={mode === value ? 'selected' : ''} onClick={() => changeMode(value)}>{label}</button>)}</div>
      <div className={mode === 'tree' ? 'json-parse-layout' : 'json-mode-content'}>
      <div className={mode === 'compare' ? 'json-sources json-sources-split' : 'json-sources'}>
        {(['left', ...(mode === 'compare' ? ['right'] : [])] as ('left' | 'right')[]).map(side => {
          const source = side === 'left' ? left : right;
          const sourceError = side === 'left' ? parsedLeft.error : parsedRight.error;
          return <div className="json-source" key={side}>
            {mode === 'compare' ? <button type="button" className={`json-side-label ${active === side ? 'selected' : ''}`} aria-pressed={active === side} onClick={() => setActive(side)}>{side === 'left' ? '左侧' : '右侧'}</button> : <label className="utility-label" htmlFor="json-text">JSON 内容</label>}
            <textarea id={side === 'left' ? 'json-text' : 'json-right-text'} aria-label={side === 'left' ? 'JSON 内容' : '右侧 JSON 内容'} className="mono utility-text" rows={mode === 'text' ? 12 : 3} placeholder={'{\n  "message": "hello"\n}'} spellCheck={false} disabled={!source.loaded} maxLength={MAX_TOOL_TEXT} value={source.text} onFocus={() => setActive(side)} onChange={e => edit(side, e.target.value)} />
            {sourceError && <p className="json-parse-error" role="alert">{sourceError}</p>}
          </div>;
        })}
      </div>
      {mode === 'tree' && <div className="json-parsed-output"><span className="utility-label">解析结果</span><div className="json-tree-scroll">{visible ? <JsonTreeView rows={visible.rows} side="left" comparing={false} toggle={toggle} lineNumbers={lineNumbers} /> : <p className="json-tree-placeholder">{parsedLeft.error ? '请修正左侧 JSON 后查看解析结果。' : '粘贴左侧 JSON，即时查看可折叠节点。'}</p>}</div></div>}
      {mode === 'compare' && <>
        {tree && counts && <p className="json-diff-summary" role="status">{updating ? '正在更新对比…' : counts.added + counts.removed + counts.modified === 0 ? '两侧 JSON 一致' : `新增 ${counts.added} · 删除 ${counts.removed} · 修改 ${counts.modified}`}</p>}
        {visible ? <div className="json-tree-scroll json-tree-split"><JsonTreeView rows={visible.rows} side="left" comparing toggle={toggle} lineNumbers={lineNumbers} /><JsonTreeView rows={visible.rows} side="right" comparing toggle={toggle} lineNumbers={lineNumbers} /></div> : !parsedLeft.error && !parsedRight.error && <p className="field-hint">分别粘贴两份 JSON，自动对比字段；两侧节点同步折叠。</p>}
      </>}
      {visible?.clipped && <p className="field-hint">当前显示前 1000 行，可折叠无关分支，或切换文本模式查看全部。</p>}
      <p className="field-hint">{mode === 'text' ? '粘贴接口数据即可校验，保留大整数原值。草稿自动保留。' : mode === 'compare' ? '点击左侧或右侧选择格式化、复制、清空的对象；橙色标记修改，＋新增，−删除。' : '左侧编辑，右侧即时解析。点击箭头折叠对象或数组，草稿自动保留。'}</p>
      </div>
    </div>
    <footer className="quick-footer"><button type="button" className="button primary" disabled={!draft.loaded || !draft.text.trim()} onClick={() => transform(false)}>格式化 / 校验</button><span className="quick-save-state" role="status">{status}</span></footer>
    {clearing && <ConfirmDelete title="清空 JSON" confirmLabel="确认清空" onCancel={() => setClearing(undefined)} onConfirm={() => { (clearing === 'left' ? left : right).update(''); setError(''); setStatus('已清空'); setClearing(undefined); }}><p>确定清空{mode === 'compare' ? clearing === 'left' ? '左侧' : '右侧' : '当前'} JSON 内容吗？</p></ConfirmDelete>}
    {(error || left.draftError || right.draftError) && <p className="quick-error" role="alert">{error || left.draftError || right.draftError}</p>}
  </main>;
}
