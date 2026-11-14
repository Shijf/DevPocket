import { useState } from 'react';
import { Copy, Eraser } from 'lucide-react';
import { ToolToolbar } from './components/ToolToolbar';
import { ConfirmDelete } from './components/ConfirmDelete';
import { JsonTreeView, visibleJsonRows } from './components/JsonTreeView';
import { compareJson } from './lib/jsonTree';
import { useToolDraft } from './lib/useToolDraft';
import { dateTimestamp, timestampDate, decodeJwt, encodeText, decodeText, type Codec } from './lib/extraTools';

export function ExtraUtilityTool({ kind }: { kind: 'timestamp' | 'jwt' | 'codec' }) {
  const draft = useToolDraft(kind);
  const [unit, setUnit] = useState<'seconds' | 'milliseconds'>('milliseconds');
  const [codec, setCodec] = useState<Codec>('base64');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [clearing, setClearing] = useState(false);
  const [folds, setFolds] = useState<Record<string, boolean>>({});
  const [allExpanded, setAllExpanded] = useState(true);
  const name = { timestamp: '时间戳', jwt: 'JWT', codec: '文本编解码' }[kind];
  function run(job: () => string) { try { setResult(job()); setError(''); } catch (e) { setError((e as Error).message); setResult(''); } }
  let jwt: ReturnType<typeof decodeJwt> | undefined, jwtError = '';
  if (kind === 'jwt' && draft.text.trim()) { try { jwt = decodeJwt(draft.text); } catch (e) { jwtError = (e as Error).message; } }
  function jwtTree(part: 'header' | 'payload') {
    if (!jwt) return null;
    const root = compareJson(jwt[part], jwt[part], part);
    const visible = visibleJsonRows(root, id => folds[id] ?? allExpanded);
    return <div><label className="utility-label">{part === 'header' ? 'Header' : 'Payload'}</label><div className="json-tree-scroll"><JsonTreeView rows={visible.rows} side="left" comparing={false} toggle={id => setFolds(previous => ({ ...previous, [id]: !(previous[id] ?? allExpanded) }))} /></div>{visible.clipped && <p className="field-hint">显示前 1000 行，可折叠无关分支。</p>}</div>;
  }
  const claimDate = (seconds: number) => { const date = new Date(seconds * 1000); return Number.isNaN(date.getTime()) ? '日期超出范围' : date.toISOString(); };
  return <main className={`quick-shell utility-shell ${clearing ? 'confirm-open' : ''}`}>
    <ToolToolbar summary={{ timestamp: '秒／毫秒与时区转换', jwt: '本地解码与过期提示', codec: '文本转换与 UUID' }[kind]}>
      <button className="icon-button" title="复制结果" aria-label={`复制${name}结果`} disabled={!(result || draft.text)} onClick={() => { void navigator.clipboard.writeText(result || draft.text).then(() => setError(''), () => setError('复制失败。')); }}><Copy size={16} /></button>
      <button className="icon-button" title="清空" aria-label={`清空${name}`} disabled={!draft.text && !result} onClick={() => setClearing(true)}><Eraser size={16} /></button>
    </ToolToolbar>
    <div className="utility-body extra-utility-body">
      {kind === 'timestamp' && <div className="compact-controls"><label>单位<select aria-label="时间戳单位" value={unit} onChange={e => { setUnit(e.target.value as typeof unit); setResult(''); }}><option value="milliseconds">毫秒</option><option value="seconds">秒</option></select></label><button className="button secondary" onClick={() => { draft.update(String(unit === 'seconds' ? Math.floor(Date.now() / 1000) : Date.now())); setResult(''); }}>当前时间</button></div>}
      {kind === 'codec' && <label className="utility-label">转换类型<select aria-label="编解码类型" value={codec} onChange={e => { setCodec(e.target.value as Codec); setResult(''); }}><option value="base64">Base64（UTF-8）</option><option value="unicode">Unicode 转义</option><option value="html">HTML 实体</option></select></label>}
      <label className="utility-label" htmlFor={`${kind}-text`}>{name}内容</label><textarea id={`${kind}-text`} className="mono utility-text" rows={kind === 'jwt' ? 3 : 4} aria-label={`${name}内容`} maxLength={500000} disabled={!draft.loaded} placeholder={kind === 'timestamp' ? '1794052800000 或 2026-11-07T20:00:00+08:00' : kind === 'jwt' ? 'eyJ… . eyJ… . signature' : '输入需要转换的文本'} value={draft.text} onChange={e => { draft.update(e.target.value); setResult(''); setError(''); }} />
      {kind === 'jwt' && <><p className="field-hint">仅解码，不验证签名；解码成功不代表 Token 可信。</p>{jwt && <><div className="compact-controls"><button className="text-button" onClick={() => { setAllExpanded(true); setFolds({}); }}>全部展开</button><button className="text-button" onClick={() => { setAllExpanded(false); setFolds({}); }}>全部折叠</button></div><p className="jwt-status" role="status">算法：{jwt.algorithm || '未声明'} · {jwt.expires === undefined ? '未声明过期时间' : jwt.expires <= Date.now() / 1000 ? '已过期' : '尚未过期'}{jwt.notBefore !== undefined && jwt.notBefore > Date.now() / 1000 ? ' · 尚未生效' : ''}</p>{jwt.expires !== undefined && <p className="field-hint">到期（UTC）：{claimDate(jwt.expires)}</p>}{jwtTree('header')}{jwtTree('payload')}</>}</>}
      {result && <><label className="utility-label" htmlFor={`${kind}-result`}>转换结果</label><textarea id={`${kind}-result`} className="mono utility-text" aria-label={`${name}结果`} readOnly rows={4} value={result} /></>}
      {(error || jwtError || draft.draftError) && <p className="quick-error" role="alert">{error || jwtError || draft.draftError}</p>}
    </div>
    <footer className="quick-footer">
      {kind === 'timestamp' && <><button className="button primary" disabled={!draft.loaded} onClick={() => run(() => { const date = timestampDate(draft.text, unit); return `UTC：${date.toISOString()}\n本地（${Intl.DateTimeFormat().resolvedOptions().timeZone}）：${date.toLocaleString()}\n秒：${date.getTime() / 1000}\n毫秒：${date.getTime()}`; })}>转为日期</button><button className="button secondary" disabled={!draft.loaded} onClick={() => run(() => { const ms = dateTimestamp(draft.text); return `秒：${ms / 1000}\n毫秒：${ms}`; })}>转为时间戳</button></>}
      {kind === 'codec' && <><button className="button primary" disabled={!draft.loaded} onClick={() => run(() => encodeText(draft.text, codec))}>编码</button><button className="button secondary" disabled={!draft.loaded} onClick={() => run(() => decodeText(draft.text, codec))}>解码</button><button className="button secondary" onClick={() => run(() => crypto.randomUUID())}>生成 UUID</button></>}
      {kind === 'jwt' && <span className="field-hint">Header／Payload 节点可折叠，草稿自动保留。</span>}
    </footer>
    {clearing && <ConfirmDelete title={`清空${name}`} confirmLabel="确认清空" onCancel={() => setClearing(false)} onConfirm={() => { draft.update(''); setResult(''); setError(''); setClearing(false); }}><p>确定清空当前内容和结果吗？</p></ConfirmDelete>}
  </main>;
}
