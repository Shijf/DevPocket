import { useEffect, useState } from 'react';
import { Plus, Trash2, Globe2, Info } from 'lucide-react';
import { Modal } from './Modal';
import { Switch } from './Switch';
import { createHeader, type HeaderRule } from '../lib/model';
import { HTTP_METHODS, validateRule } from '../lib/rules';
import { writeDraft } from '../lib/storage';

export function RuleEditor({ initial, existing, busy, onSave, onClose }: { initial: HeaderRule; existing: boolean; busy: boolean; onSave: (rule: HeaderRule) => Promise<boolean>; onClose: () => void }) {
  const [rule, setRule] = useState(initial);
  const [patterns, setPatterns] = useState(initial.patterns.join('\n'));
  const [error, setError] = useState('');
  const update = (patch: Partial<HeaderRule>) => { setRule(old => ({ ...old, ...patch })); setError(''); };
  // Persist synchronously on each edit through the storage bridge: popup dismissal loses no debounce window.
  useEffect(() => { void writeDraft({ ...rule, patterns: patterns.split('\n') }).catch(() => setError('草稿暂时无法保存，请保持此窗口打开。')); }, [rule, patterns]);
  const close = () => { if (busy) return; void writeDraft().then(onClose).catch(() => setError('草稿无法清除，请重试。')); };
  return <Modal title={existing ? '编辑规则' : '新建规则'} onClose={close} wide>
    <form onSubmit={async event => {
      event.preventDefault();
      const next = { ...rule, name: rule.name.trim(), description: rule.description.trim(), patterns: [...new Set(patterns.split('\n').map(p => p.trim()).filter(Boolean))], headers: rule.headers.map(h => ({ ...h, name: h.name.trim(), value: h.operation === 'remove' ? '' : h.value })), updatedAt: Date.now() };
      const invalid = validateRule(next); if (invalid) { setError(invalid); return; }
      if (await onSave(next)) {
        try { await writeDraft(); onClose(); }
        catch { setError('规则已保存，但草稿未能清除，请重试关闭。'); }
      }
    }}>
      <div className="editor-body">
        <div className="field"><label htmlFor="rule-name">规则名称 <span className="required">*</span></label><input id="rule-name" autoFocus required maxLength={80} placeholder="例如：泳道环境" value={rule.name} onChange={e => update({ name: e.target.value })} /></div>
        <div className="field"><label htmlFor="rule-description">描述 <span className="optional">选填</span></label><input id="rule-description" maxLength={200} placeholder="写一句话，方便下次找到它" value={rule.description} onChange={e => update({ description: e.target.value })} /></div>
        <div className="field"><div className="field-label"><label htmlFor="rule-patterns">匹配 URL <span className="required">*</span></label><span><Globe2 size={13} /> 通配符匹配</span></div><textarea id="rule-patterns" className="mono" rows={2} required value={patterns} onChange={e => { setPatterns(e.target.value); setError(''); }} placeholder="*://*.example.com/*" /><p className="field-hint">每行一条；* 代表任意内容，*.example.com 包含主域名和子域名。</p></div>
        <div className="field"><div className="field-label"><label>Headers <span className="required">*</span></label><button type="button" className="text-button" disabled={rule.headers.length >= 30} onClick={() => update({ headers: [...rule.headers, createHeader()] })}><Plus size={14} /> 添加 Header</button></div>
          <div className="header-editor-labels"><span>操作</span><span>名称</span><span>值</span><span /></div>
          {rule.headers.map((header, index) => <div className="header-editor-row" key={header.id}>
            <select aria-label={`Header ${index + 1} 操作`} value={header.operation} onChange={e => update({ headers: rule.headers.map(h => h.id === header.id ? { ...h, operation: e.target.value as 'set' | 'remove', value: e.target.value === 'remove' ? '' : h.value } : h) })}><option value="set">设置</option><option value="remove">删除</option></select>
            <input className="mono" required aria-label={`Header ${index + 1} 名称`} placeholder="x-swimlane" value={header.name} onChange={e => update({ headers: rule.headers.map(h => h.id === header.id ? { ...h, name: e.target.value } : h) })} />
            <input className="mono" aria-label={`Header ${index + 1} 值`} placeholder={header.operation === 'remove' ? '无需填写' : 'feature-dev'} disabled={header.operation === 'remove'} value={header.value} onChange={e => update({ headers: rule.headers.map(h => h.id === header.id ? { ...h, value: e.target.value } : h) })} />
            <button type="button" className="icon-button danger-hover" aria-label={`移除 Header ${index + 1}`} disabled={rule.headers.length === 1} onClick={() => update({ headers: rule.headers.filter(h => h.id !== header.id) })}><Trash2 size={15} /></button>
          </div>)}
        </div>
        <div className="field"><label htmlFor="request-scope">请求类型</label><select id="request-scope" value={rule.scope} onChange={e => update({ scope: e.target.value as HeaderRule['scope'] })}><option value="all">所有请求</option><option value="xhr">Fetch / XHR</option><option value="navigation">页面导航</option></select></div>
        <div className="field"><label>请求方法 <span className="optional">不选则匹配全部</span></label><div className="method-options">{HTTP_METHODS.map(method => <button key={method} type="button" className={rule.methods.includes(method) ? 'selected' : ''} aria-pressed={rule.methods.includes(method)} onClick={() => update({ methods: rule.methods.includes(method) ? rule.methods.filter(m => m !== method) : [...rule.methods, method] })}>{method}</button>)}</div></div>
        <div className="editor-enable"><div><strong>启用这条规则</strong><p>保存后，对后续匹配的请求生效</p></div><Switch checked={rule.enabled} onChange={enabled => update({ enabled })} label="启用这条规则" /></div>
        {error && <p className="form-error" role="alert"><Info size={15} />{error}</p>}
      </div>
      <div className="modal-footer"><span className="field-hint">关闭浏览器弹窗后，编辑草稿会保留</span><button type="button" className="button secondary" disabled={busy} onClick={close}>取消</button><button type="submit" className="button primary" disabled={busy}>{busy ? '保存中…' : '保存规则'}</button></div>
    </form>
  </Modal>;
}
