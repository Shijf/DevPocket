import { useMemo, useState } from 'react';
import { Copy, Eraser, Plus, X } from 'lucide-react';
import { ToolToolbar } from './components/ToolToolbar';
import { codec, MAX_TOOL_TEXT, parseUrl, updateUrlParams } from './lib/devtools';
import { useToolDraft } from './lib/useToolDraft';
import { ConfirmDelete } from './components/ConfirmDelete';
import './quick-popup.css';
export function UrlTool() {
  const { text, update, loaded, draftError } = useToolDraft('url');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [deletion, setDeletion] = useState<{ index: number; text: string } | 'clear'>();
  const parsed = useMemo(() => { try { return { url: parseUrl(text), error: '' }; } catch (e) { return { url: undefined, error: text.trim() ? (e as Error).message : '' }; } }, [text]);
  const entries = parsed.url ? [...parsed.url.searchParams].map(([key, value]) => ({ key, value })) : [];
  function edit(value: string) { update(value); setError(''); setStatus(''); }
  function transform(decode: boolean) {
    try { edit(codec(text, decode)); setStatus(decode ? '已解码' : '已编码'); }
    catch (e) { setError((e as Error).message); }
  }
  function setParams(next: typeof entries) {
    try { edit(updateUrlParams(text, next)); } catch (e) { setError((e as Error).message); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(text); setStatus('已复制'); setError(''); }
    catch { setError('复制失败，请选中文本后复制。'); }
  }
  return <main className={`quick-shell utility-shell ${deletion !== undefined ? 'confirm-open' : ''}`}>
    <ToolToolbar summary="参数与编解码">
      <button type="button" className="icon-button" aria-label="复制 URL" title="复制 URL" disabled={!loaded || !text} onClick={() => { void copy(); }}><Copy size={16} /></button>
      <button type="button" className="icon-button" aria-label="清空 URL" title="清空 URL" disabled={!loaded || !text} onClick={() => setDeletion('clear')}><Eraser size={16} /></button>
    </ToolToolbar>
    <div className="utility-body"><label className="utility-label" htmlFor="url-text">URL / 待编解码文本</label><textarea id="url-text" className="mono utility-text" rows={3} placeholder="https://example.com/path?env=dev" spellCheck={false} disabled={!loaded} maxLength={MAX_TOOL_TEXT} value={text} onChange={e => edit(e.target.value)} />
      <div className="utility-codec"><button type="button" className="button ghost" disabled={!loaded || !text} onClick={() => transform(false)}>编码</button><button type="button" className="button ghost" disabled={!loaded || !text} onClick={() => transform(true)}>解码</button><span className="field-hint">encodeURIComponent</span></div>
      {parsed.url && <><dl className="url-summary"><div><dt>域名</dt><dd className="mono">{parsed.url.host}</dd></div><div><dt>路径</dt><dd className="mono">{parsed.url.pathname}</dd></div>{parsed.url.hash && <div><dt>片段</dt><dd className="mono">{parsed.url.hash}</dd></div>}</dl>
        <div className="utility-label">查询参数 <span className="optional">修改即更新 URL</span></div>
        {entries.map((entry, index) => <div className="url-param-row" key={index}>
          <input className="mono" aria-label={`参数 ${index + 1} Key`} value={entry.key} onChange={e => setParams(entries.map((p, i) => i === index ? { ...p, key: e.target.value } : p))} />
          <input className="mono" aria-label={`参数 ${index + 1} Value`} value={entry.value} onChange={e => setParams(entries.map((p, i) => i === index ? { ...p, value: e.target.value } : p))} />
          <button type="button" className="icon-button danger-hover" aria-label={`删除参数 ${index + 1}`} title="删除参数" onClick={() => setDeletion({ index, text })}><X size={14} /></button>
        </div>)}
        <button type="button" className="text-button utility-add" onClick={() => setParams([...entries, { key: '', value: '' }])}><Plus size={14} />添加参数</button>
      </>}
      {!parsed.url && <p className="field-hint">{parsed.error || '粘贴完整 URL 自动解析，也可以直接输入文本编解码。'}</p>}
    </div>
    <footer className="quick-footer"><span className="field-hint">草稿自动保留</span><span className="quick-save-state" role="status">{status}</span></footer>
    {deletion !== undefined && <ConfirmDelete title={deletion === 'clear' ? '清空 URL' : '删除参数'} confirmLabel={deletion === 'clear' ? '确认清空' : '确认删除'} onCancel={() => setDeletion(undefined)} onConfirm={() => {
      if (deletion === 'clear') { edit(''); setStatus('已清空'); }
      else if (deletion.text === text) setParams(entries.filter((_, index) => index !== deletion.index));
      setDeletion(undefined);
    }}><p>{deletion === 'clear' ? '确定清空当前 URL / 文本吗？' : `确定删除参数「${entries[deletion.index]?.key || '未命名参数'}」吗？`}</p></ConfirmDelete>}
    {(error || draftError) && <p className="quick-error" role="alert">{error || draftError}</p>}
  </main>;
}
