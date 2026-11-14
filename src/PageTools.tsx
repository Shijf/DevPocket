import { useEffect, useRef, useState } from 'react';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { ConfirmDelete } from './components/ConfirmDelete';
import { ToolToolbar } from './components/ToolToolbar';
import { Switch } from './components/Switch';
import { isExtension } from './lib/storage';
import { acquirePageTarget, inspectCaches, clearCaches, pageDebug, cleanDebugState, type CacheInventory, type CacheSelection, type PageDebugState } from './lib/pageTools';
import type { SiteTarget } from './lib/siteStorage';
import { registerPendingWrites } from './lib/pendingWrites';

export function PageTool({ kind }: { kind: 'cache' | 'page' }) {
  const [target, setTarget] = useState<SiteTarget>(), [inventory, setInventory] = useState<CacheInventory>();
  const [selection, setSelection] = useState<CacheSelection>({ caches: [], workers: [] });
  const [debug, setDebug] = useState(cleanDebugState), [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
  const operation = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => registerPendingWrites(() => operation.current), []);
  function perform(job: () => Promise<void>) { operation.current = job(); }
  async function load() {
    const pending = acquirePageTarget(); setBusy(true); setError(''); setStatus('');
    try {
      const current = await pending; setTarget(current);
      if (kind === 'cache') { setInventory(await inspectCaches(current)); setSelection({ caches: [], workers: [] }); }
      else setDebug(await pageDebug(current));
      setStatus('已读取当前站点。');
    } catch (e) { setTarget(undefined); setInventory(undefined); setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function update(next: PageDebugState) {
    if (!target || busy) return; setBusy(true); setError(''); setStatus('');
    try { setDebug(await pageDebug(target, next)); setStatus(Object.values(next).some(Boolean) ? '页面调试状态已更新。' : '已恢复页面调试状态。'); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function clear() {
    if (!target || busy) return; setConfirm(false); setBusy(true); setError(''); setStatus('');
    try { const result = await clearCaches(target, selection); setStatus(`已清理 ${result.deleted} 项${result.failed.length ? '，部分未完成。' : '。'}`); setError(result.failed.join('；')); setInventory(await inspectCaches(target)); setSelection({ caches: [], workers: [] }); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  function select(area: keyof CacheSelection, key: string, checked: boolean) { setSelection(previous => ({ ...previous, [area]: checked ? [...previous[area], key] : previous[area].filter(value => value !== key) })); }
  const count = selection.caches.length + selection.workers.length;
  return <main className="quick-shell utility-shell">
    <ToolToolbar summary={kind === 'cache' ? '当前站点缓存与 Worker' : '临时页面调试'}><button className="icon-button" aria-label="重新读取页面" title="重新读取" disabled={busy} onClick={() => perform(load)}><RefreshCw size={16} /></button>{kind === 'page' && <button className="icon-button" aria-label="恢复页面调试" title="恢复调试状态" disabled={!target || busy || !Object.values(debug).some(Boolean)} onClick={() => perform(() => update(cleanDebugState()))}><RotateCcw size={16} /></button>}</ToolToolbar>
    <div className="utility-body extra-utility-body productivity-body">
      <div className="compact-controls"><button className="button secondary" disabled={busy} onClick={() => perform(load)}>读取当前页面</button><span className="field-hint">{busy ? '处理中…' : target ? new URL(target.url).origin : '先读取，再操作'}</span></div>
      {!isExtension && <p className="field-hint">隔离演示模式，不操作真实站点。</p>}
      {kind === 'cache' && inventory && <>
        <label className="utility-label">Cache Storage（{inventory.caches.length}）</label>
        {inventory.caches.map(name => <label key={name} className="cache-choice"><input aria-label={`清理缓存 ${name}`} type="checkbox" checked={selection.caches.includes(name)} disabled={busy} onChange={e => select('caches', name, e.target.checked)} /><span>{name}</span></label>)}
        {!inventory.caches.length && <p className="field-hint">没有 Cache Storage 缓存。</p>}
        <label className="utility-label">Service Worker（{inventory.workers.length}）</label>
        {inventory.workers.map(worker => <label key={worker.scope} className="cache-choice"><input aria-label={`注销 Worker ${worker.scope}`} type="checkbox" checked={selection.workers.includes(worker.scope)} disabled={busy} onChange={e => select('workers', worker.scope, e.target.checked)} /><span title={worker.script}>{worker.scope}</span></label>)}
        {!inventory.workers.length && <p className="field-hint">没有注册的 Service Worker。</p>}
        <button className="button danger-button" disabled={!count || busy} onClick={() => setConfirm(true)}>清理选中的 {count} 项</button>
        <p className="field-hint">仅清理选中的缓存／Worker，不清除 Cookie、localStorage 或 HTTP 缓存。注销后已打开的页面可能仍受 Worker 控制，请刷新；网站可能重新注册。</p>
      </>}
      {kind === 'page' && <>
        {([['outlines', '显示元素边界', '橙色轮廓，便于定位布局。'], ['animations', '关闭 CSS 动画', '暂停 CSS 动画与过渡，方便截图。'], ['editable', '编辑页面文字', '临时开启文字编辑，方便预览文案。']] as const).map(([key, name, description]) => <div key={key} className="page-debug-row"><div><strong>{name}</strong><p className="field-hint">{description}</p></div><Switch label={name} checked={debug[key]} disabled={!target || busy} onChange={checked => perform(() => update({ ...debug, [key]: checked }))} /></div>)}
        <p className="field-hint">开启文字编辑后，关闭此弹窗，再点击网页文字开始输入。作用于主页面，关闭 popup 后继续生效。恢复按钮移除调试样式并还原编辑开关；已改文字需刷新页面还原。Shadow DOM、iframe 和 JS 动画不在处理范围内。</p>
      </>}
      {status && <p role="status" className="field-hint">{status}</p>}{error && <p role="alert" className="quick-error">{error}</p>}
    </div>
    {confirm && <ConfirmDelete title="确认清理站点缓存" confirmLabel="确认清理" onCancel={() => setConfirm(false)} onConfirm={() => perform(clear)}><p>确定清理 {target && new URL(target.url).origin} 的 {count} 项吗？</p><p>同站点其他标签页也会受到影响，清理后无法撤销。</p></ConfirmDelete>}
  </main>;
}
