import { useEffect, useRef, useState } from 'react';
import { Copy, Eraser } from 'lucide-react';
import { useToolDraft } from './lib/useToolDraft';
import { sendRequest, type RequestResult } from './lib/requestTool';
import { ToolToolbar } from './components/ToolToolbar';
import { ConfirmDelete } from './components/ConfirmDelete';
import { isExtension } from './lib/storage';

export function RequestTool() {
  const url = useToolDraft('request-url'), body = useToolDraft('request-body');
  const [method, setMethod] = useState('GET'), [headers, setHeaders] = useState(''), [tab, setTab] = useState<'body' | 'headers'>('body');
  const [result, setResult] = useState<RequestResult>(), [error, setError] = useState(''), [busy, setBusy] = useState(false), [clear, setClear] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => controller.current?.abort(), []);
  async function send() {
    const current = new AbortController(); controller.current = current; setBusy(true); setError(''); setResult(undefined);
    const timeout = setTimeout(() => current.abort(new Error('请求超过 30 秒，已停止。')), 30000);
    try { setResult(await sendRequest({ url: url.text, method, headers, body: ['GET', 'HEAD'].includes(method) ? '' : body.text }, current.signal)); }
    catch (e) { setError(current.signal.aborted ? current.signal.reason?.message || '请求已取消。' : `${(e as Error).message}。请检查 URL、网络及浏览器限制。`); }
    finally { clearTimeout(timeout); setBusy(false); controller.current = undefined; }
  }
  const ready = url.loaded && body.loaded;
  return <main className="quick-shell utility-shell">
    <ToolToolbar summary="发送请求与查看响应"><button className="icon-button" aria-label="复制接口响应" title="复制响应" disabled={!result} onClick={() => void navigator.clipboard.writeText(tab === 'body' ? result!.body : result!.headers).catch(() => setError('复制失败。'))}><Copy size={16} /></button><button className="icon-button" aria-label="清空接口请求" title="清空" disabled={busy || !ready} onClick={() => setClear(true)}><Eraser size={16} /></button></ToolToolbar>
    <div className="utility-body extra-utility-body productivity-body">
      <div className="request-url-row"><select aria-label="请求方法" disabled={busy} value={method} onChange={e => setMethod(e.target.value)}>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map(value => <option key={value}>{value}</option>)}</select><input aria-label="请求 URL" className="mono" placeholder="https://example.com/api" disabled={!ready || busy} value={url.text} maxLength={10000} onChange={e => url.update(e.target.value)} /></div>
      <details><summary>请求 Header</summary><textarea aria-label="请求 Header" className="utility-text mono" rows={3} maxLength={20000} placeholder={'Content-Type: application/json\nAuthorization: Bearer …'} disabled={busy} value={headers} onChange={e => setHeaders(e.target.value)} /><p className="field-hint">每行 Key: Value；Header 仅保留本次会话。</p></details>
      {!['GET', 'HEAD'].includes(method) && <label className="utility-label">请求正文<textarea aria-label="请求正文" className="utility-text mono" rows={3} maxLength={500000} disabled={!ready || busy} value={body.text} onChange={e => body.update(e.target.value)} /></label>}
      {['GET', 'HEAD'].includes(method) && body.text && <p className="field-hint">GET／HEAD 不发送正文，正文草稿保留供切换方法后使用。</p>}
      <div className="compact-controls"><button className="button primary" disabled={!ready || busy || !url.text} onClick={() => void send()}>发送请求</button>{busy && <button className="button secondary" onClick={() => controller.current?.abort(new Error('请求已取消。'))}>取消请求</button>}</div>
      <p className="field-hint">{isExtension ? '从扩展发起，不附带浏览器 Cookie；网站自身的 Mock 不拦截此请求。' : '网页预览受 CORS 限制；安装扩展后可请求已授权的 HTTP／HTTPS 地址。'}仅点击发送才执行，不自动跟随重定向，响应最多展示 1 MB。</p>
      {result && <><p role="status" className="request-status">{result.status} {result.statusText} · {result.elapsed} ms · {result.bytes} 字节{result.truncated ? ' · 响应已截断' : ''}</p><p className="field-hint request-final-url">{result.url}</p><div className="compact-controls"><button className={`text-button ${tab === 'body' ? 'selected' : ''}`} aria-pressed={tab === 'body'} onClick={() => setTab('body')}>响应正文</button><button className={`text-button ${tab === 'headers' ? 'selected' : ''}`} aria-pressed={tab === 'headers'} onClick={() => setTab('headers')}>响应 Header</button></div><pre className="tool-output mono" aria-label="接口响应">{tab === 'body' ? result.body : result.headers}</pre></>}
      {(error || url.draftError || body.draftError) && <p className="quick-error" role="alert">{error || url.draftError || body.draftError}</p>}
    </div>
    {clear && <ConfirmDelete title="清空接口请求" confirmLabel="确认清空" onCancel={() => setClear(false)} onConfirm={() => { url.update(''); body.update(''); setHeaders(''); setResult(undefined); setError(''); setClear(false); }}><p>确定清空 URL、Header、正文和响应吗？</p></ConfirmDelete>}
  </main>;
}
