import { useEffect, useRef, useState } from 'react';
import { Wrench, Sparkle, X, MoreHorizontal } from 'lucide-react';
import { QuickPopup } from './QuickPopup';
import { ProxyPopup } from './ProxyPopup';
import { JsonTool } from './JsonTool';
import { UrlTool } from './UrlTool';
import { ExtraUtilityTool } from './ExtraUtilityTools';
import { NetworkDebugPopup } from './NetworkDebugPopup';
import { SiteStorageTool } from './SiteStorageTool';
import { ProductivityTool } from './ProductivityTools';
import { RequestTool } from './RequestTool';
import { PageTool } from './PageTools';
import { MoreToolsMenu } from './MoreToolsMenu';
import { useToolOrder } from './lib/useToolOrder';
import { tools, type ToolId } from './tools/registry';
import { isExtension } from './lib/storage';
import { flushPendingWrites } from './lib/pendingWrites';
import manifest from '../public/manifest.json';
import './quick-popup.css';

export function PopupTools() {
  const [tool, setTool] = useState<ToolId>('headers');
  const [more, setMore] = useState(false);
  const ordering = useToolOrder();
  const selectionStarted = useRef(false);
  useEffect(() => {
    if (ordering.loaded && !selectionStarted.current) { selectionStarted.current = true; setTool(ordering.order[0] ?? 'headers'); }
  }, [ordering.loaded, ordering.order]);
  const shortcuts = ordering.order.slice(0, 4);
  const quickLabels: Partial<Record<ToolId, string>> = { headers: '请求头', json: 'JSON', url: 'URL' };
  function selectTool(id: ToolId) { selectionStarted.current = true; setTool(id); }
  const [closing, setClosing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [closeError, setCloseError] = useState('');
  const version = isExtension ? chrome.runtime.getManifest().version : manifest.version;
  async function close() {
    if (closing) return;
    setClosing(true); setCloseError('');
    try {
      await flushPendingWrites();
      if (isExtension) window.close();
      else setDismissed(true);
    } catch { setCloseError('保存尚未完成，请重试关闭。'); }
    finally { setClosing(false); }
  }
  // Keep save queues alive when switching tools; only the selected UI is visible.
  return <div className={`popup-tools ${dismissed ? 'preview-dismissed' : ''}`} inert={closing}>
    {dismissed && <div className="popup-closed"><p>Popup 预览已关闭</p><button type="button" className="button secondary" onClick={() => setDismissed(false)}>重新打开</button></div>}
    <div className="popup-content" hidden={dismissed}>
    <header className="popup-brand-heading">
      <div className="popup-brand-title">
        <span className="popup-brand-icon" aria-hidden="true"><Wrench size={19} /></span>
        <div className="popup-brand-copy"><strong>DevPocket</strong><span className="popup-version">v{version}</span></div>
        <Sparkle className="popup-brand-sparkle" size={12} aria-hidden="true" />
      </div>
      <Sparkle className="popup-heading-star" size={9} aria-hidden="true" />
      <button type="button" className="icon-button" aria-label="关闭工具箱" title="关闭工具箱" disabled={closing} onClick={() => { void close(); }}><X size={17} /></button>
    </header>
    {closeError && <p className="quick-error" role="alert">{closeError}</p>}
    <nav className="quick-tool-tabs" aria-label="工具切换">
      {shortcuts.map(id => { const item = tools.find(item => item.id === id)!; const label = quickLabels[id] ?? item.name;
        return <button key={id} type="button" data-tool-id={id} aria-label={label} title={item.name} aria-pressed={tool === id} className={tool === id ? 'selected' : ''} onClick={() => selectTool(id)}><item.icon size={13} /><span>{label}</span></button>;
      })}
      <button type="button" aria-label="更多工具" title="选择工具或调整全部工具顺序" aria-pressed={!shortcuts.includes(tool)} className={!shortcuts.includes(tool) ? 'selected' : ''} onClick={() => setMore(true)}><MoreHorizontal size={13} /><span>{shortcuts.includes(tool) ? '更多' : tools.find(item => item.id === tool)?.name}</span></button>
    </nav>
    <div hidden={tool !== 'headers'}><QuickPopup /></div>
    <div hidden={tool !== 'proxy'}><ProxyPopup /></div>
    <div hidden={tool !== 'json'}><JsonTool /></div>
    <div hidden={tool !== 'url'}><UrlTool /></div>
    {(['timestamp', 'jwt', 'codec'] as const).map(kind => <div key={kind} hidden={tool !== kind}><ExtraUtilityTool kind={kind} /></div>)}
    {(['blocks', 'mocks'] as const).map(kind => <div key={kind} hidden={tool !== kind}><NetworkDebugPopup kind={kind} /></div>)}
    <div hidden={tool !== 'storage'}><SiteStorageTool /></div>
    {(['regex', 'diff', 'color', 'hash'] as const).map(kind => <div key={kind} hidden={tool !== kind}><ProductivityTool kind={kind} /></div>)}
    <div hidden={tool !== 'request'}><RequestTool /></div>
    {(['cache', 'page'] as const).map(kind => <div key={kind} hidden={tool !== kind}><PageTool kind={kind} /></div>)}
    {more && <MoreToolsMenu current={tool} ordering={ordering} close={() => setMore(false)} select={id => { selectTool(id); setMore(false); }} />}
    </div>
  </div>;
}
