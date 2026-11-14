import { useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Plus, Settings, Trash2 } from 'lucide-react';
import { ToolToolbar } from './components/ToolToolbar';
import { Switch } from './components/Switch';
import { Modal } from './components/Modal';
import { ConfirmDelete } from './components/ConfirmDelete';
import { useNetworkDraft } from './lib/useNetworkDraft';
import { mockPageOrigins, validateNetworkRows, type BlockRule, type MockRule } from './lib/networkDebug';
import { HTTP_METHODS } from './lib/rules';
import { PROXY_TYPES } from './lib/proxy';

export function NetworkDebugPopup({ kind }: { kind: 'blocks' | 'mocks' }) {
  const config = useNetworkDraft(kind);
  const [detailId, setDetailId] = useState<string>(), [deleteId, setDeleteId] = useState<string>();
  const [transferError, setTransferError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const name = kind === 'blocks' ? '请求阻断' : '接口 Mock';
  const detail = config.rows.find(row => row.id === detailId), deleting = config.rows.find(row => row.id === deleteId);
  const patch = (id: string, changes: Partial<BlockRule & MockRule>) => config.apply({ ...config.latest.current, rows: config.latest.current.rows.map(row => row.id === id ? { ...row, ...changes } : row) });
  async function exportConfig() {
    await config.flush();
    try {
      const rows = config.latest.current.rows.filter(row => row.source.trim()); validateNetworkRows(rows, kind);
      const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, kind, ...config.latest.current, rows }, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `devpocket-${kind}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setTransferError('');
    } catch (e) { setTransferError((e as Error).message); }
  }
  const methods = detail?.methods ?? [];
  function addRow() {
    const row = config.create();
    config.apply({ ...config.latest.current, rows: [...config.latest.current.rows, row] });
    if (kind === 'mocks') setDetailId(row.id);
  }
  return <main className={`quick-shell ${detail ? 'details-open' : deleting ? 'confirm-open' : ''}`}>
    <ToolToolbar summary={`${config.rows.filter(row => row.source.trim()).length} 项配置`} toggle={{ checked: config.enabled, disabled: !config.loaded, label: `${name}开关`, onChange: enabled => config.apply({ ...config.latest.current, enabled }) }}>
      <button className="icon-button" title="导入配置" aria-label={`导入${name}配置`} disabled={!config.loaded} onClick={() => fileRef.current?.click()}><ArrowUpFromLine size={16} /></button><button className="icon-button" title="导出配置" aria-label={`导出${name}配置`} disabled={!config.loaded} onClick={() => { void exportConfig(); }}><ArrowDownToLine size={16} /></button>
    </ToolToolbar>
    <div className="quick-fields"><p className="field-hint">{kind === 'mocks' ? '按 URL 模拟页面 fetch／XHR 响应；仅向生效页面提供模拟响应，跨域接口请设置页面 origin。' : '匹配的请求将被阻止，可在详细设置中限制资源类型。'}</p>
      {config.rows.map((row, index) => <div className="network-debug-row" key={row.id}><input className="mono" aria-label={`${name} ${index + 1} URL`} title={row.source} placeholder="*://example.com/api/*" disabled={!config.loaded || !config.enabled || !row.enabled} value={row.source} onChange={e => patch(row.id, { source: e.target.value })} />{kind === 'mocks' && <span className="network-rule-status">{(row as MockRule).status}</span>}<div className="quick-row-actions"><Switch label={`${name} ${index + 1} 开关`} checked={row.enabled} disabled={!config.loaded} onChange={enabled => patch(row.id, { enabled })} /><button className="icon-button" title="详细设置" aria-label={`${name} ${index + 1} 详细设置`} onClick={() => setDetailId(row.id)}><Settings size={14} /></button><button className="icon-button danger-hover" title="删除" aria-label={`删除${name} ${index + 1}`} onClick={() => setDeleteId(row.id)}><Trash2 size={14} /></button></div></div>)}
      {!config.rows.length && <p className="empty-tool-note">添加一条 URL 规则，开始调试。</p>}
    </div>
    <footer className="quick-footer"><button className="text-button quick-add" disabled={!config.loaded || config.rows.length >= 100} onClick={addRow}><Plus size={14} />添加{name}</button><span className="quick-save-state" role="status">{config.status}</span></footer>
    {(config.error || transferError) && <p className="quick-error" role="alert">{transferError || config.error}</p>}
    <input className="file-input" ref={fileRef} type="file" accept="application/json,.json" onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; try { if (file.size > 2000000) throw new Error('文件最多 2 MB。'); const data = JSON.parse(await file.text()); if (data.version !== 1 || data.kind !== kind) throw new Error('文件工具类型或版本不匹配。'); validateNetworkRows(data.rows, kind); const rows = [...config.latest.current.rows.filter(row => row.source.trim()), ...data.rows.map((row: BlockRule | MockRule) => ({ ...row, id: crypto.randomUUID() }))]; validateNetworkRows(rows, kind); config.apply({ ...config.latest.current, rows }); setTransferError(''); } catch (error) { setTransferError((error as Error).message); } }} />
    {deleting && <ConfirmDelete title={`删除${name}`} onCancel={() => setDeleteId(undefined)} onConfirm={() => { config.apply({ ...config.latest.current, rows: config.latest.current.rows.filter(row => row.id !== deleting.id) }); setDeleteId(undefined); }}><p>确定删除此规则吗？</p><p className="mono">{deleting.source || '未填写 URL'}</p></ConfirmDelete>}
    {detail && <Modal title={`${name}详细设置`} onClose={() => setDetailId(undefined)}><div className="quick-detail-body"><div className="quick-detail-key"><strong>{name}</strong><Switch label="启用此规则" checked={detail.enabled} onChange={enabled => patch(detail.id, { enabled })} /></div><fieldset className="quick-detail-settings" disabled={!config.enabled || !detail.enabled}>
      <label className="field">URL 匹配<input className="mono" aria-label={`${name}匹配 URL`} value={detail.source} onChange={e => patch(detail.id, { source: e.target.value })} /></label>
      {kind === 'mocks' && <label className="field">生效页面（origin）<input className="mono" aria-label="Mock 生效页面" placeholder="https://app.example.com" value={(detail as MockRule).pageOrigin ?? ''} onChange={e => patch(detail.id, { pageOrigin: e.target.value })} /><span className="field-hint">{(detail as MockRule).pageOrigin ? '仅此协议、域名和端口的页面可获取此规则；页面脚本可以读取模拟正文。' : mockPageOrigins(detail as MockRule).length ? `默认仅 ${mockPageOrigins(detail as MockRule).join(' / ')} 页面；跨域接口请填写页面 origin。` : '请填写生效页面；通配域名规则未指定页面时不会生效。'}</span></label>}
      <div className="field"><label>请求方法（不选则全部）</label><div className="method-options">{HTTP_METHODS.map(method => <button key={method} aria-pressed={methods.includes(method)} className={methods.includes(method) ? 'selected' : ''} onClick={() => patch(detail.id, { methods: methods.includes(method) ? methods.filter(value => value !== method) : [...methods, method] })}>{method}</button>)}</div></div>
      {kind === 'blocks' ? <div className="field"><label>资源类型</label><div className="method-options">{PROXY_TYPES.map(type => <button key={type} aria-pressed={(detail as BlockRule).resourceTypes.includes(type)} className={(detail as BlockRule).resourceTypes.includes(type) ? 'selected' : ''} onClick={() => patch(detail.id, { resourceTypes: (detail as BlockRule).resourceTypes.includes(type) ? (detail as BlockRule).resourceTypes.filter(value => value !== type) : [...(detail as BlockRule).resourceTypes, type] })}>{type}</button>)}</div></div> : <><div className="compact-controls"><label>状态码<input type="number" aria-label="Mock 状态码" min={200} max={599} value={(detail as MockRule).status} onChange={e => patch(detail.id, { status: Number(e.target.value) })} /></label><label>延迟（毫秒）<input type="number" aria-label="Mock 延迟" min={0} max={30000} value={(detail as MockRule).delay} onChange={e => patch(detail.id, { delay: Number(e.target.value) })} /></label></div><label className="field">Content-Type<input aria-label="Mock Content-Type" value={(detail as MockRule).contentType} onChange={e => patch(detail.id, { contentType: e.target.value })} /></label><label className="field">响应正文<textarea className="mono" rows={6} aria-label="Mock 响应正文" maxLength={100000} value={(detail as MockRule).body} onChange={e => patch(detail.id, { body: e.target.value })} /></label></>}
    </fieldset>{kind === 'mocks' && <p className="field-hint">适用于配置加载后的页面 fetch 和异步 XHR；同步 XHR、Worker、原生资源请求继续走真实网络。范围重叠时列表靠前的 Mock 优先。</p>}{config.error && <p className="form-error" role="alert">{config.error}</p>}<p className="field-hint" role="status">{config.status}</p></div></Modal>}
  </main>;
}
