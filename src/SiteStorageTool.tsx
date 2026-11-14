import { useEffect, useRef, useState } from 'react';
import { Plus, RefreshCw, Settings, Trash2 } from 'lucide-react';
import { ToolToolbar } from './components/ToolToolbar';
import { Modal } from './components/Modal';
import { ConfirmDelete } from './components/ConfirmDelete';
import { isExtension } from './lib/storage';
import { registerPendingWrites } from './lib/pendingWrites';
import { readSiteStorage, writeSiteStorage, deleteSiteStorage, requestStoragePermission, siteTarget, type SiteTarget, type StorageArea, type StorageEntry } from './lib/siteStorage';

export function SiteStorageTool() {
  const [area, setArea] = useState<StorageArea>('localStorage');
  const [target, setTarget] = useState<SiteTarget>();
  const [rows, setRows] = useState<StorageEntry[]>([]);
  const [error, setError] = useState(''), [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false), [query, setQuery] = useState('');
  const [editing, setEditing] = useState<StorageEntry>(), [adding, setAdding] = useState(false), [deleting, setDeleting] = useState<StorageEntry>();
  const queue = useRef<Promise<unknown>>(Promise.resolve()), changed = useRef(false);
  useEffect(() => registerPendingWrites(() => queue.current), []);
  function enqueue(job: () => Promise<void>) {
    setBusy(true); setError('');
    const pending = queue.current.catch(() => undefined).then(job);
    queue.current = pending;
    void pending.catch(e => setError((e as Error).message)).finally(() => setBusy(false));
  }
  async function load() {
    // Permission request stays directly in the click handler to preserve the browser's user gesture.
    try { if (!await requestStoragePermission(area)) throw new Error('未授予权限，可再次点击读取。'); }
    catch (e) { setError((e as Error).message); return; }
    enqueue(async () => { const next = await siteTarget(); const values = await readSiteStorage(next, area); setTarget(next); setRows(values); setStatus('已读取'); });
  }
  function persist() {
    if (!editing || !target || adding || !changed.current) return;
    changed.current = false; const value = editing;
    enqueue(async () => { setRows(await writeSiteStorage(target, area, value)); setStatus('已自动写入'); });
  }
  return <main className={`quick-shell ${editing ? 'details-open' : deleting ? 'confirm-open' : ''}`}>
    <ToolToolbar summary={target ? new URL(target.url).hostname : '当前站点存储'}><button className="icon-button" title="读取／刷新当前站点" aria-label="读取站点存储" disabled={busy} onClick={() => { void load(); }}><RefreshCw size={16} /></button><button className="icon-button" title="添加存储项" aria-label="添加存储项" disabled={!target || busy} onClick={() => { changed.current = false; setAdding(true); setEditing({ id: '', name: '', value: '' }); }}><Plus size={16} /></button></ToolToolbar>
    <div className="utility-body"><div className="json-view-tabs">{(['localStorage', 'sessionStorage', 'cookies'] as const).map(value => <button key={value} disabled={busy} className={area === value ? 'selected' : ''} aria-pressed={area === value} onClick={() => { setArea(value); setTarget(undefined); setRows([]); setStatus(''); setError(''); }}>{value === 'cookies' ? 'Cookie' : value}</button>)}</div>
      {!isExtension && <p className="field-hint">网页预览使用独立演示存储；真实站点数据需在 Chrome／Edge 扩展中读取。</p>}
      {!target ? <button className="button secondary" disabled={busy} onClick={() => { void load(); }}>读取当前站点</button> : <><input aria-label="搜索存储项" placeholder="搜索名称或值" value={query} onChange={e => setQuery(e.target.value)} /><div className="storage-list">{rows.filter(row => `${row.name} ${row.value}`.includes(query)).map(row => <div className="storage-row" key={row.id}><div><strong title={row.name}>{row.name}</strong><code title={row.value}>{row.value}</code>{row.cookie && <small>{row.cookie.domain}{row.cookie.path}{row.cookie.httpOnly ? ' · HttpOnly' : ''}{row.cookie.secure ? ' · Secure' : ''}</small>}</div><button className="icon-button" title="编辑" aria-label={`编辑存储 ${row.name}`} disabled={busy} onClick={() => { changed.current = false; setAdding(false); setEditing(row); }}><Settings size={14} /></button><button className="icon-button danger-hover" title="删除" aria-label={`删除存储 ${row.name}`} disabled={busy} onClick={() => setDeleting(row)}><Trash2 size={14} /></button></div>)}{!rows.length && <p className="empty-tool-note">当前没有存储项。</p>}</div></>}
      {error && <p className="quick-error" role="alert">{error}</p>}
    </div><footer className="quick-footer"><span className="quick-save-state" role="status">{busy ? '处理中…' : status || '读取后编辑；删除前会确认。'}</span></footer>
    {editing && <Modal title={adding ? '添加存储项' : '编辑存储项'} onClose={() => { persist(); setEditing(undefined); }}><div className="quick-detail-body"><label className="field">名称<input aria-label="存储名称" disabled={!adding || busy} value={editing.name} onChange={e => setEditing({ ...editing, id: e.target.value, name: e.target.value })} /></label><label className="field">值<textarea aria-label="存储值" className="mono" rows={8} maxLength={100000} value={editing.value} disabled={busy} onChange={e => { changed.current = true; setEditing({ ...editing, value: e.target.value }); }} onBlur={persist} /></label>{editing.cookie && <p className="field-hint">保留原 Cookie 的域名、路径、过期时间、Secure、HttpOnly 和 SameSite 属性。</p>}<p className="field-hint">{adding ? '填写后点击创建。' : '修改值后失焦自动写入当前站点。'}</p>{error && <p className="form-error" role="alert">{error}</p>}{adding && <button className="button primary" disabled={busy || !editing.name} onClick={() => { const entry = editing; enqueue(async () => { if (rows.some(row => row.name === entry.name && (!row.cookie || row.cookie.path === '/'))) throw new Error('名称已存在，请编辑现有项。'); setRows(await writeSiteStorage(target!, area, entry)); setEditing(undefined); setStatus('已创建'); }); }}>创建存储项</button>}</div></Modal>}
    {deleting && <ConfirmDelete title="删除存储项" onCancel={() => setDeleting(undefined)} onConfirm={() => { const entry = deleting; setDeleting(undefined); enqueue(async () => { setRows(await deleteSiteStorage(target!, area, entry)); setStatus('已删除'); }); }}><p>确定删除当前站点的 {deleting.name} 吗？</p></ConfirmDelete>}
  </main>;
}
