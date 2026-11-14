import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Check, Plus, Settings, Trash2 } from 'lucide-react';
import { ToolToolbar } from './components/ToolToolbar';
import { Switch } from './components/Switch';
import { Modal } from './components/Modal';
import { ConfirmDelete } from './components/ConfirmDelete';
import { emptyState, type AppState } from './lib/model';
import { createQuickRow, rowsFromState, stateFromRows, type QuickRow } from './lib/quick';
import { HTTP_METHODS, parseImport } from './lib/rules';
import { isExtension, readState, saveModule, subscribeState } from './lib/storage';
import { createAutosaver } from './lib/autosave';
import { registerPendingWrites } from './lib/pendingWrites';
import './quick-popup.css';

const DRAFT_KEY = 'devpocket-tools-quick-rows-draft';
interface Snapshot { rows: QuickRow[]; enabled: boolean }
async function readDraft(): Promise<Snapshot | undefined> {
  try {
    const draft = isExtension ? (await chrome.storage.local.get(DRAFT_KEY))[DRAFT_KEY] : JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (typeof draft?.enabled === 'boolean' && Array.isArray(draft.rows) && draft.rows.length <= 200
      && draft.rows.every((row: QuickRow) => row && typeof row.id === 'string' && typeof row.name === 'string' && typeof row.value === 'string' && Array.isArray(row.patterns) && Array.isArray(row.methods))) return draft;
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

export function QuickPopup() {
  const [rows, setRows] = useState<QuickRow[]>([createQuickRow()]);
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
      try { stateFromRows(stateRef.current, job.snapshot.rows, job.snapshot.enabled); }
      catch (validationError) {
        // The master switch must still work while a row contains unfinished input.
        if (stateRef.current.enabled !== job.snapshot.enabled) stateRef.current = await saveModule(current => ({ ...current, enabled: job.snapshot.enabled }));
        throw validationError;
      }
      const saved = await saveModule(current => stateFromRows(current, job.snapshot.rows, job.snapshot.enabled));
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
      const restored = draft ?? { rows: rowsFromState(saved), enabled: saved.enabled };
      if (!restored.rows.length) restored.rows = [createQuickRow()];
      latest.current = restored; setRows(restored.rows); setEnabled(restored.enabled); setLoaded(true);
      if (draft) apply(restored);
    }).catch(e => { if (!cancelled && live.current) setError((e as Error).message); });
    const stop = subscribeState(() => {
      if (saving.current || dirty.current) return;
      void readState().then(saved => {
        if (cancelled || !live.current || saving.current || dirty.current || saved.revision === stateRef.current.revision) return;
        stateRef.current = saved;
        const restored = { rows: rowsFromState(saved), enabled: saved.enabled };
        if (!restored.rows.length) restored.rows = [createQuickRow()];
        latest.current = restored; setRows(restored.rows); setEnabled(restored.enabled);
      }).catch(e => { if (live.current) setError((e as Error).message); });
    });
    return () => { cancelled = true; live.current = false; stop(); };
  }, []);
  function patch(id: string, changes: Partial<QuickRow>) {
    apply({ ...latest.current, rows: latest.current.rows.map(row => row.id === id ? { ...row, ...changes } : row) });
  }
  const detail = rows.find(row => row.id === detailId);
  const deleting = rows.find(row => row.id === deleteId);
  async function exportConfig() {
    await autosaver.current.flush();
    try {
      const config = stateFromRows(stateRef.current, latest.current.rows, latest.current.enabled);
      const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, revision: config.revision, enabled: config.enabled, rules: config.rules }, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'devpocket-headers.json'; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); setStatus('已导出');
    } catch (e) { setError((e as Error).message); }
  }
  return <main className={`quick-shell ${detail ? 'details-open' : deleting ? 'confirm-open' : ''}`}>
    <ToolToolbar summary={`${rows.filter(row => row.name.trim() || row.value).length} 项配置`} toggle={{ checked: enabled, disabled: !loaded, label: 'Header 开关', onChange: value => apply({ ...latest.current, enabled: value }) }}>
      <button type="button" className="icon-button" aria-label="导入配置" title="导入配置（合并）" disabled={!loaded} onClick={() => fileRef.current?.click()}><ArrowUpFromLine size={16} /></button>
      <button type="button" className="icon-button" aria-label="导出配置" title="导出配置" disabled={!loaded} onClick={() => { void exportConfig(); }}><ArrowDownToLine size={16} /></button>
    </ToolToolbar>
    <div className="quick-fields"><div className="quick-labels"><span>Header Key</span><span>Value</span><span /></div>
      {rows.map((row, index) => <div className={`quick-row ${!enabled || !row.enabled ? 'row-disabled' : ''}`} key={row.id}>
        <input className="mono" aria-label={`Header ${index + 1} Key`} placeholder="x-swimlane" spellCheck={false} autoComplete="off" disabled={!loaded || !enabled || !row.enabled} value={row.name} onChange={e => patch(row.id, { name: e.target.value })} />
        <input className="mono" aria-label={`Header ${index + 1} Value`} placeholder={row.operation === 'remove' ? '删除此 Header' : 'feature-dev'} spellCheck={false} autoComplete="off" disabled={!loaded || !enabled || !row.enabled || row.operation === 'remove'} value={row.value} onChange={e => patch(row.id, { value: e.target.value })} />
        <div className="quick-row-actions"><Switch checked={row.enabled} disabled={!loaded} label={`Header ${index + 1} 开关`} onChange={enabled => patch(row.id, { enabled })} /><button type="button" className="icon-button" aria-label={`Header ${index + 1} 详细设置`} title="详细设置" disabled={!loaded} onClick={() => setDetailId(row.id)}><Settings size={14} /></button><button type="button" className="icon-button danger-hover" aria-label={`删除 Header ${index + 1}`} title="删除" disabled={!loaded} onClick={() => setDeleteId(row.id)}><Trash2 size={14} /></button></div>
      </div>)}
    </div>
    <footer className="quick-footer"><button type="button" className="text-button quick-add" disabled={!loaded || rows.length >= 200} onClick={() => apply({ ...latest.current, rows: [...latest.current.rows, createQuickRow()] })}><Plus size={14} />添加 Header</button><span className="quick-save-state" role="status">{status && <>{status === '已自动保存' && <Check size={12} />}{status}</>}</span></footer>
    {error && <p className="quick-error" role="alert">{error}</p>}
    <input className="file-input" ref={fileRef} type="file" accept="application/json,.json" onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
      try {
        if (file.size > 2_000_000) throw new Error('配置文件不能超过 2 MB。');
        const imported = rowsFromState(parseImport(await file.text())).map(row => ({ ...row, id: crypto.randomUUID() }));
        const current = latest.current.rows.filter(row => row.name.trim() || row.value);
        if (current.length + imported.length > 200) throw new Error('最多支持 200 行 Header。');
        const merged = [...current, ...imported]; apply({ ...latest.current, rows: merged.length ? merged : [createQuickRow()] });
      } catch (e) { setError((e as Error).message); }
    }} />
    {deleting && <ConfirmDelete title="删除 Header" onCancel={() => setDeleteId(undefined)} onConfirm={() => {
      const remaining = latest.current.rows.filter(row => row.id !== deleting.id);
      apply({ ...latest.current, rows: remaining.length ? remaining : [createQuickRow()] });
      setDeleteId(undefined);
    }}><p>确定删除请求头 <code>{deleting.name || '未命名 Header'}</code> 吗？</p></ConfirmDelete>}
    {detail && <Modal title="Header 详细设置" onClose={() => setDetailId(undefined)}>
      <div className="quick-detail-body">
        <div className="quick-detail-key"><code>{detail.name || '未命名 Header'}</code><Switch checked={detail.enabled} label="启用此 Header" onChange={value => patch(detail.id, { enabled: value })} /></div>
        {(!enabled || !detail.enabled) && <p className="field-hint">{!enabled ? "整体已关闭，开启后可编辑。" : "此配置已关闭，开启后可编辑。"}</p>}
        <fieldset className="quick-detail-settings" disabled={!enabled || !detail.enabled}>
        <div className="field"><label htmlFor="header-operation">操作</label><select id="header-operation" value={detail.operation} onChange={e => patch(detail.id, { operation: e.target.value as 'set' | 'remove', ...(e.target.value === 'remove' ? { value: '' } : {}) })}><option value="set">添加 / 覆盖</option><option value="remove">删除请求头</option></select></div>
        <div className="field"><label htmlFor="header-urls">匹配 URL</label><textarea id="header-urls" className="mono" rows={2} value={detail.patterns.join('\n')} onChange={e => patch(detail.id, { patterns: e.target.value.split('\n') })} /><p className="field-hint">每行一个 URL，*://*/* 匹配所有请求。</p></div>
        <div className="field"><label htmlFor="header-scope">请求类型</label><select id="header-scope" value={detail.scope} onChange={e => patch(detail.id, { scope: e.target.value as QuickRow['scope'] })}><option value="all">所有请求</option><option value="xhr">Fetch / XHR</option><option value="navigation">页面导航</option></select></div>
        <div className="field"><label>请求方法 <span className="optional">不选则匹配全部</span></label><div className="method-options">{HTTP_METHODS.map(method => <button type="button" key={method} className={detail.methods.includes(method) ? 'selected' : ''} aria-pressed={detail.methods.includes(method)} onClick={() => patch(detail.id, { methods: detail.methods.includes(method) ? detail.methods.filter(m => m !== method) : [...detail.methods, method] })}>{method}</button>)}</div></div>
        </fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
        <span className="field-hint" role="status">{status || '修改后自动保存'}</span>
      </div>
    </Modal>}
  </main>;
}
