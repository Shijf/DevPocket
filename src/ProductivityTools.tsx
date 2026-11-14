import { useEffect, useRef, useState } from 'react';
import { Copy, Eraser } from 'lucide-react';
import { ConfirmDelete } from './components/ConfirmDelete';
import { ToolToolbar } from './components/ToolToolbar';
import { useToolDraft } from './lib/useToolDraft';
import { contrastRatio, hashBytes, parseColor, textDiff, type DiffLine, type matchRegex } from './lib/productivity';

export type ProductivityKind = 'regex' | 'diff' | 'color' | 'hash';
const names = { regex: '正则测试', diff: '文本 Diff', color: '颜色工具', hash: '哈希计算' };
export function ProductivityTool({ kind }: { kind: ProductivityKind }) {
  const draft = useToolDraft(kind), secondary = useToolDraft(`${kind}-secondary`), flags = useToolDraft(`${kind}-flags`), replacement = useToolDraft(`${kind}-replacement`);
  const [result, setResult] = useState(''), [error, setError] = useState(''), [clearing, setClearing] = useState(false);
  const [algorithm, setAlgorithm] = useState<'SHA-256' | 'SHA-512'>('SHA-256');
  const [file, setFile] = useState<File>(), [busy, setBusy] = useState(false), [rows, setRows] = useState<DiffLine[]>();
  const [regex, setRegex] = useState<ReturnType<typeof matchRegex>>();
  const sequence = useRef(0), fileInput = useRef<HTMLInputElement>(null);
  const ready = draft.loaded && secondary.loaded && flags.loaded && replacement.loaded;
  const regexFlags = (flags.text || 'g').trim();
  useEffect(() => {
    if (kind !== 'regex' || !ready) return;
    setRegex(undefined); setError('');
    if (!draft.text) { setBusy(false); return; }
    setBusy(true);
    let worker: Worker | undefined, deadline: ReturnType<typeof setTimeout> | undefined;
    const delay = setTimeout(() => {
      try {
        worker = new Worker(new URL('./regex-worker.ts', import.meta.url), { type: 'module' });
        deadline = setTimeout(() => { worker?.terminate(); setBusy(false); setError('正则执行超时，请简化表达式。'); }, 800);
        worker.onmessage = event => { clearTimeout(deadline); worker?.terminate(); setBusy(false); setError(event.data.error || ''); setRegex(event.data.result); };
        worker.onerror = () => { clearTimeout(deadline); worker?.terminate(); setBusy(false); setError('正则执行失败。'); };
        worker.postMessage({ pattern: draft.text, flags: regexFlags, text: secondary.text, replacement: replacement.text });
      } catch { setBusy(false); setError('无法启动本地正则 Worker。'); }
    }, 180);
    return () => { clearTimeout(delay); clearTimeout(deadline); worker?.terminate(); };
  }, [kind, ready, draft.text, secondary.text, regexFlags, replacement.text]);
  let foreground: ReturnType<typeof parseColor> | undefined, background: ReturnType<typeof parseColor> | undefined, colorError = '';
  if (kind === 'color') {
    try { foreground = parseColor(draft.text || '#ff6600'); background = parseColor(secondary.text || '#ffffff'); }
    catch (e) { colorError = (e as Error).message; }
  }
  const ratio = foreground && background ? contrastRatio(foreground, background) : 0;
  const copyText = kind === 'regex' ? regex?.replaced ?? '' : kind === 'color' && foreground ? `${foreground.hex}\n${foreground.rgb}\n${foreground.hsl}` : kind === 'diff' && rows ? rows.map(row => row.kind === 'same' ? `  ${row.left}` : `${row.left !== undefined ? '- ' + row.left + '\n' : ''}${row.right !== undefined ? '+ ' + row.right : ''}`).join('\n') : result;
  async function hash() {
    const id = ++sequence.current; setBusy(true); setError(''); setResult('');
    try {
      if (file && file.size > 20 * 1024 * 1024) throw new Error('文件最多 20 MB。');
      const bytes = file ? new Uint8Array(await file.arrayBuffer()) : new TextEncoder().encode(draft.text);
      const value = await hashBytes(bytes, algorithm); if (id === sequence.current) setResult(value);
    } catch (e) { if (id === sequence.current) setError((e as Error).message); }
    finally { if (id === sequence.current) setBusy(false); }
  }
  const invalidate = () => { sequence.current++; setBusy(false); setResult(''); setRows(undefined); setError(''); };
  const textField = (label: string, value: string, update: (text: string) => void, count = 3) => <label className="utility-label">{label}<textarea className="mono utility-text" aria-label={label} rows={count} maxLength={100000} disabled={!ready || (kind === 'hash' && !!file)} value={value} onChange={e => { update(e.target.value); if (kind !== 'regex') invalidate(); }} /></label>;
  let end = 0;
  const highlighted = regex?.matches.flatMap((match, index) => { const parts = [<span key={`gap-${index}`}>{secondary.text.slice(end, match.index)}</span>, <mark key={`match-${index}`}>{match.value || '▏'}</mark>]; end = match.index + match.value.length; return parts; });
  return <main className={`quick-shell utility-shell ${clearing ? 'confirm-open' : ''}`}>
    <ToolToolbar summary={{ regex: '匹配、捕获组与替换', diff: '左右逐行比较', color: '颜色转换与对比度', hash: '本地文本／文件摘要' }[kind]}>
      <button className="icon-button" aria-label={`复制${names[kind]}结果`} title="复制结果" disabled={!copyText} onClick={() => void navigator.clipboard.writeText(copyText).catch(() => setError('复制失败。'))}><Copy size={16} /></button>
      <button className="icon-button" aria-label={`清空${names[kind]}`} title="清空" onClick={() => setClearing(true)} disabled={!ready}><Eraser size={16} /></button>
    </ToolToolbar>
    <div className="utility-body extra-utility-body productivity-body">
      {kind === 'regex' && <>
        <div className="compact-controls"><label>表达式<input aria-label="正则表达式" className="mono" maxLength={2048} disabled={!ready} placeholder="例如 (\w+)@(\w+)" value={draft.text} onChange={e => draft.update(e.target.value)} /></label><label className="regex-flags">标志<input aria-label="正则标志" maxLength={10} disabled={!ready} value={regexFlags} onChange={e => flags.update(e.target.value || ' ')} /></label></div>
        {textField('匹配文本', secondary.text, secondary.update)}
        <label className="utility-label">替换为<input aria-label="正则替换内容" disabled={!ready} maxLength={2048} placeholder="$1、$& 等" value={replacement.text} onChange={e => replacement.update(e.target.value)} /></label>
        <p className="field-hint" role="status">{busy ? '正在匹配…' : regex ? `${regex.matches.length} 个匹配${regex.clipped ? '（已截断，缩小范围后再替换）' : ''}` : '输入表达式后实时匹配；清空标志可仅匹配一次。'}</p>
        {regex && <><pre className="regex-preview mono" aria-label="匹配高亮">{highlighted}{secondary.text.slice(end)}</pre>{regex.matches.some(match => match.groups.length) && <details><summary>捕获组</summary><pre className="tool-output mono">{regex.matches.map((match, i) => `${i + 1} @${match.index}：${JSON.stringify(match.groups)}${match.named ? ' ' + JSON.stringify(match.named) : ''}`).join('\n')}</pre></details>}{regex.replaced !== null && <details><summary>替换结果</summary><pre className="tool-output mono" aria-label="正则替换结果">{regex.replaced}</pre></details>}</>}
      </>}
      {kind === 'diff' && <>
        <div className="tool-two-columns">{textField('左侧文本', draft.text, draft.update, 5)}{textField('右侧文本', secondary.text, secondary.update, 5)}</div>
        <div className="compact-controls"><button className="button primary" disabled={!ready} onClick={() => { try { setRows(textDiff(draft.text, secondary.text)); setError(''); } catch (e) { setError((e as Error).message); } }}>比较文本</button><span className="field-hint">每侧最多 1000 行</span></div>
        {rows && <><p className="field-hint" role="status">{rows.every(row => row.kind === 'same') ? '内容一致' : `新增 ${rows.filter(row => row.kind === 'added').length} · 删除 ${rows.filter(row => row.kind === 'removed').length} · 修改 ${rows.filter(row => row.kind === 'changed').length}`}</p><div className="text-diff-scroll" aria-label="文本对比结果"><div className="text-diff-header"><span>原文本</span><span>新文本</span></div>{rows.map((row, i) => <div key={i} className={`text-diff-row diff-${row.kind}`}><pre>{row.left === undefined ? '' : `${row.kind === 'same' ? ' ' : '−'} ${row.left}`}</pre><pre>{row.right === undefined ? '' : `${row.kind === 'same' ? ' ' : '+'} ${row.right}`}</pre></div>)}</div></>}
      </>}
      {kind === 'color' && <>
        <div className="tool-two-columns"><label className="utility-label">文字颜色<input aria-label="文字颜色" disabled={!ready} value={draft.text || '#ff6600'} onChange={e => draft.update(e.target.value || ' ')} /></label><label className="utility-label">背景颜色<input aria-label="背景颜色" disabled={!ready} value={secondary.text || '#ffffff'} onChange={e => secondary.update(e.target.value || ' ')} /></label></div>
        {foreground && background && <><div className="color-preview" style={{ color: foreground.hex, background: background.hex }}>DevPocket · 让调试更顺手</div><div className="tool-two-columns">{[foreground, background].map((color, i) => <div className="color-values mono" key={i}>{[color.hex, color.rgb, color.hsl].map(value => <button key={value} title="点击复制" onClick={() => void navigator.clipboard.writeText(value).catch(() => setError('复制失败。'))}>{value}</button>)}</div>)}</div><p role="status" className="field-hint">对比度 {ratio.toFixed(2)} : 1 · 普通文字 AA {ratio >= 4.5 ? '通过' : '未通过'} · AAA {ratio >= 7 ? '通过' : '未通过'} · 大字 AA {ratio >= 3 ? '通过' : '未通过'}</p></>}
        <p className="field-hint">支持 HEX／RGB／HSL 不透明颜色；点击转换值复制。</p>
      </>}
      {kind === 'hash' && <>
        <label className="utility-label">算法<select aria-label="哈希算法" value={algorithm} onChange={e => { setAlgorithm(e.target.value as typeof algorithm); invalidate(); }}><option>SHA-256</option><option>SHA-512</option></select></label>
        {textField('哈希文本', draft.text, draft.update)}
        <label className="utility-label">或选择本地文件（最多 20 MB）<input ref={fileInput} aria-label="哈希文件" type="file" onChange={e => { setFile(e.target.files?.[0]); invalidate(); }} /></label>
        {file && <div className="compact-controls"><span className="field-hint">{file.name} · {file.size} 字节</span><button className="text-button" onClick={() => { setFile(undefined); if (fileInput.current) fileInput.current.value = ''; invalidate(); }}>使用文本</button></div>}
        <button className="button primary" disabled={!ready || busy} onClick={() => void hash()}>{busy ? '计算中…' : '计算哈希'}</button>
        {result && <pre className="tool-output mono" aria-label="哈希结果">{result}</pre>}
        <p className="field-hint">文件仅在本地计算，不上传、不保存文件内容。</p>
      </>}
      {(error || colorError || draft.draftError || secondary.draftError || flags.draftError || replacement.draftError) && <p role="alert" className="quick-error">{error || colorError || draft.draftError || secondary.draftError || flags.draftError || replacement.draftError}</p>}
    </div>
    {clearing && <ConfirmDelete title={`清空${names[kind]}`} confirmLabel="确认清空" onCancel={() => setClearing(false)} onConfirm={() => { draft.update(''); secondary.update(''); flags.update(''); replacement.update(''); invalidate(); setFile(undefined); setRegex(undefined); if (fileInput.current) fileInput.current.value = ''; setClearing(false); }}><p>确定清空当前工具的输入和结果吗？</p></ConfirmDelete>}
  </main>;
}
