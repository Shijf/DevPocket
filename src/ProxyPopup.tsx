import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Check, Plus, Settings, Trash2 } from 'lucide-react';
import { ToolToolbar } from './components/ToolToolbar';
import { Switch } from './components/Switch';
import { Modal } from './components/Modal';
import { ConfirmDelete } from './components/ConfirmDelete';
import { emptyState, type AppState } from './lib/model';
import { createProxy, stateFromProxies, PROXY_TYPES, type ProxyRule } from './lib/proxy';
import { HTTP_METHODS, parseImport } from './lib/rules';
import { isExtension, readState, saveModule, subscribeState } from './lib/storage';
import { createAutosaver } from './lib/autosave';
import { registerPendingWrites } from './lib/pendingWrites';
import './quick-popup.css';

const rowsFromState = (state: AppState) => state.proxies ?? [];
const DRAFT_KEY = 'devpocket-tools-proxies-draft';
interface Snapshot { rows: ProxyRule[]; enabled: boolean }
async function readDraft(): Promise<Snapshot | undefined> {
  try {
    const draft = isExtension ? (await chrome.storage.local.get(DRAFT_KEY))[DRAFT_KEY] : JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (typeof draft?.enabled === 'boolean' && Array.isArray(draft.rows) && draft.rows.length <= 200
      && draft.rows.every((row: ProxyRule) => row && typeof row.id === 'string' && typeof row.source === 'string' && typeof row.target === 'string' && Array.isArray(row.resourceTypes) && Array.isArray(row.methods))) return draft;
  } catch { /* Load committed settings when a draft is unreadable. */ }
}
async function persistDraft(snapshot?: Snapshot) {
  if (isExtension) { if (snapshot) await chrome.storage.local.set({ [DRAFT_KEY]: snapshot }); else await chrome.storage.local.remove(DRAFT_KEY); }
  else if (snapshot) localStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot)); else localStorage.removeItem(DRAFT_KEY);
}

let draftQueue: Promise<unknown> = Promise.resolve();
function writeDraft(snapshot?: Snapshot) {
  const next = draftQueue.then(() => persistDraft(snapshot));
  draftQueue = next.catch(() => undefined);
  return next;
}

export function ProxyPopup() {
  const [rows, setRows] = useState<ProxyRule[]>([createProxy()]);
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [detailId, setDetailId] = useState<string>();
  const [deleteId, setDeleteId] = useState<string>();
  const stateRef = useRef<AppState>(emptyState());
  const latest = useRef<Snapshot>({ rows, enabled });
  const generation = useRef(0);
  const saving = useRef(false);
  const dirty = useRef(false);
  const live = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const autosaver = useRef(createAutosaver<{ snapshot: Snapshot; generation: number }>(async job => {
    saving.current = true;
    try {
      try { stateFromProxies(stateRef.current, job.snapshot.rows, job.snapshot.enabled); }
      catch (validationError) {
        // The master switch must still work while a row contains unfinished input.
        if ((stateRef.current.proxyEnabled !== false) !== job.snapshot.enabled) stateRef.current = await saveModule(current => ({ ...current, proxyEnabled: job.snapshot.enabled }));
        throw validationError;
      }
      const saved = await saveModule(current => stateFromProxies(current, job.snapshot.rows, job.snapshot.enabled));
      stateRef.current = saved;
      if (job.generation === generation.current) {
        await writeDraft();
        if (job.generation === generation.current) dirty.current = false;
        if (live.current && job.generation === generation.current) { setStatus('已自动保存'); setError(''); }
      }
    } catch (e) {
      if (live.current && job.generation === generation.current) { setError((e as Error).message); setStatus('未应用，草稿已保留'); }
      try { stateRef.current = await readState(); } catch { /* Preserve the original failure. */ }
    } finally { saving.current = false; }
  }));
  useEffect(() => registerPendingWrites(async () => {
    await autosaver.current.flush();
    await draftQueue;
  }), []);
  function apply(snapshot: Snapshot) {
    dirty.current = true;
    latest.current = snapshot; setRows(snapshot.rows); setEnabled(snapshot.enabled);
    setError(''); setStatus('自动保存中…');
    const edit = ++generation.current;
    // Persist the latest input immediately, independently of the network-rule save queue.
    void writeDraft(snapshot).catch(() => { if (live.current) setError('草稿保存失败，请重新打开插件重试。'); });
    void autosaver.current.enqueue({ snapshot, generation: edit });
  }
  useEffect(() => {
    let cancelled = false;
    live.current = true;
    void Promise.all([readState(), readDraft()]).then(([saved, draft]) => {
      if (cancelled || !live.current) return;
      stateRef.current = saved;
      const restored = draft ?? { rows: rowsFromState(saved), enabled: saved.proxyEnabled !== false };
      if (!restored.rows.length) restored.rows = [createProxy()];
      latest.current = restored; setRows(restored.rows); setEnabled(restored.enabled); setLoaded(true);
      if (draft) apply(restored);
    }).catch(e => { if (!cancelled && live.current) setError((e as Error).message); });
    const stop = subscribeState(() => {
      if (saving.current || dirty.current) return;
      void readState().then(saved => {
        if (cancelled || !live.current || saving.current || dirty.current || saved.revision === stateRef.current.revision) return;
        stateRef.current = saved;
        const restored = { rows: rowsFromState(saved), enabled: saved.proxyEnabled !== false };
        if (!restored.rows.length) restored.rows = [createProxy()];
        latest.current = restored; setRows(restored.rows); setEnabled(restored.enabled);
      }).catch(e => { if (live.current) setError((e as Error).message); });
    });
    return () => { cancelled = true; live.current = false; stop(); };
  }, []);
  function patch(id: string, changes: Partial<ProxyRule>) {
    apply({ ...latest.current, rows: latest.current.rows.map(row => row.id === id ? { ...row, ...changes } : row) });
  }
  const detail = rows.find(row => row.id === detailId);
  const deleting = rows.find(row => row.id === deleteId);
  async function exportConfig() {
    await autosaver.current.flush();
    try {
      const config = stateFromProxies(stateRef.current, latest.current.rows, latest.current.enabled);
      const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, revision: config.revision, enabled: true, rules: [], proxyEnabled: config.proxyEnabled, proxies: config.proxies }, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'devpocket-proxies.json'; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); setStatus('已导出');
    } catch (e) { setError((e as Error).message); }
  }
  return <main className={`quick-shell ${detail ? 'details-open' : deleting ? 'confirm-open' : ''}`}>
    <ToolToolbar summary={`${rows.filter(row => row.source.trim() || row.target.trim()).length} 项配置`} toggle={{ checked: enabled, disabled: !loaded, label: '资源代理开关', onChange: value => apply({ ...latest.current, enabled: value }) }}>
      <button type="button" className="icon-button" aria-label="导入代理配置" title="导入代理配置（合并）" disabled={!loaded} onClick={() => fileRef.current?.click()}><ArrowUpFromLine size={16} /></button>
      <button type="button" className="icon-button" aria-label="导出代理配置" title="导出代理配置" disabled={!loaded} onClick={() => { void exportConfig(); }}><ArrowDownToLine size={16} /></button>
    </ToolToolbar>
    <div className="quick-fields"><div className="quick-labels"><span>来源 URL</span><span>目标 URL</span><span /></div>
      {rows.map((row, index) => <div className={`quick-row ${!enabled || !row.enabled ? 'row-disabled' : ''}`} key={row.id}>
        <input className="mono" aria-label={`代理 ${index + 1} 来源`} title={row.source} placeholder="https://site/app.js" spellCheck={false} autoComplete="off" disabled={!loaded || !enabled || !row.enabled} value={row.source} onChange={e => patch(row.id, { source: e.target.value })} />
        <input className="mono" aria-label={`代理 ${index + 1} 目标`} title={row.target} placeholder="http://localhost:3000/app.js" spellCheck={false} autoComplete="off" disabled={!loaded || !enabled || !row.enabled} value={row.target} onChange={e => patch(row.id, { target: e.target.value })} />
        <div className="quick-row-actions"><Switch checked={row.enabled} disabled={!loaded} label={`代理 ${index + 1} 开关`} onChange={enabled => patch(row.id, { enabled })} /><button type="button" className="icon-button" aria-label={`代理 ${index + 1} 详细设置`} title="详细设置" disabled={!loaded} onClick={() => setDetailId(row.id)}><Settings size={14} /></button><button type="button" className="icon-button danger-hover" aria-label={`删除代理 ${index + 1}`} title="删除" disabled={!loaded} onClick={() => setDeleteId(row.id)}><Trash2 size={14} /></button></div>
      </div>)}
    </div>
    <footer className="quick-footer"><button type="button" className="text-button quick-add" disabled={!loaded || rows.length >= 200} onClick={() => apply({ ...latest.current, rows: [...latest.current.rows, createProxy()] })}><Plus size={14} />添加代理</button><span className="quick-save-state" role="status">{status && <>{status === '已自动保存' && <Check size={12} />}{status}</>}</span></footer>
    {error && <p className="quick-error" role="alert">{error}</p>}
    <input className="file-input" ref={fileRef} type="file" accept="application/json,.json" onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
      try {
        if (file.size > 2_000_000) throw new Error('配置文件不能超过 2 MB。');
        const imported = rowsFromState(parseImport(await file.text())).map(row => ({ ...row, id: crypto.randomUUID() }));
        if (!imported.length) throw new Error('文件中没有资源代理规则。');
        const current = latest.current.rows.filter(row => row.source.trim() || row.target.trim());
        if (current.length + imported.length > 200) throw new Error('最多支持 200 条资源代理。');
        apply({ ...latest.current, rows: [...current, ...imported] });
      } catch (e) { setError((e as Error).message); }
    }} />
    {deleting && <ConfirmDelete title="删除代理" onCancel={() => setDeleteId(undefined)} onConfirm={() => {
      const remaining = latest.current.rows.filter(row => row.id !== deleting.id);
      apply({ ...latest.current, rows: remaining.length ? remaining : [createProxy()] });
      setDeleteId(undefined);
    }}><p>确定删除此资源代理吗？</p><p className="mono">{deleting.source || '未填写来源'} → {deleting.target || '未填写目标'}</p></ConfirmDelete>}
    {detail && <Modal title="代理详细设置" onClose={() => setDetailId(undefined)}>
      <div className="quick-detail-body">
        <div className="quick-detail-key"><strong>资源 / 接口重定向</strong><Switch checked={detail.enabled} label="启用此代理" onChange={value => patch(detail.id, { enabled: value })} /></div>
        {(!enabled || !detail.enabled) && <p className="field-hint">{!enabled ? "整体已关闭，开启后可编辑。" : "此配置已关闭，开启后可编辑。"}</p>}
        <fieldset className="quick-detail-settings" disabled={!enabled || !detail.enabled}>
        <div className="field"><label htmlFor="proxy-source">来源 URL</label><textarea id="proxy-source" className="mono" rows={2} value={detail.source} onChange={e => patch(detail.id, { source: e.target.value })} /></div>
        <div className="field"><label htmlFor="proxy-target">目标 URL</label><textarea id="proxy-target" className="mono" rows={2} value={detail.target} onChange={e => patch(detail.id, { target: e.target.value })} /><p className="field-hint">例如 https://site.example/api/* → http://localhost:3000/api/*。目标 * 保留来源路径中匹配的内容（含查询参数）。</p></div>
        <div className="field"><label>资源类型</label><div className="method-options">{PROXY_TYPES.map(type => <button type="button" key={type} className={detail.resourceTypes.includes(type) ? 'selected' : ''} aria-pressed={detail.resourceTypes.includes(type)} onClick={() => patch(detail.id, { resourceTypes: detail.resourceTypes.includes(type) ? detail.resourceTypes.filter(t => t !== type) : [...detail.resourceTypes, type] })}>{({ main_frame: '页面', sub_frame: '子页面', stylesheet: 'CSS', script: 'JS', image: '图片', font: '字体', xmlhttprequest: '接口', media: '音视频', websocket: 'WebSocket', ping: 'Ping', object: 'Object', other: '其他' })[type]}</button>)}</div></div>
        <div className="field"><label>请求方法 <span className="optional">不选则匹配全部</span></label><div className="method-options">{HTTP_METHODS.map(method => <button type="button" key={method} className={detail.methods.includes(method) ? 'selected' : ''} aria-pressed={detail.methods.includes(method)} onClick={() => patch(detail.id, { methods: detail.methods.includes(method) ? detail.methods.filter(m => m !== method) : [...detail.methods, method] })}>{method}</button>)}</div></div>
        </fieldset>
        <p className="field-hint">本地文件需要 HTTP 服务。接口目标需允许站点跨域访问；此功能遵循浏览器的 CORS、CSP 与资源完整性校验。</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <span className="field-hint" role="status">{status || '修改后自动保存'}</span>
      </div>
    </Modal>}
  </main>;
}
