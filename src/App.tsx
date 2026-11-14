import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, ArrowUpRight, BookOpen, Check, CheckCheck, ChevronRight, CircleHelp, Code2, Copy, ExternalLink, Globe2, GripVertical, Info, Layers3, LayoutGrid, MoreHorizontal, Pencil, Plus, Search, Settings2, ShieldCheck, SlidersHorizontal, Trash2, X, Zap } from 'lucide-react';
import { createRule, emptyState, type AppState, type HeaderRule } from './lib/model';
import { currentSite, isExtension, openManager, readDraft, readState, saveState, subscribeState, writeDraft } from './lib/storage';
import { matchesSite, parseImport } from './lib/rules';
import { JsonTool } from './JsonTool';
import { UrlTool } from './UrlTool';
import { ProxyPopup } from './ProxyPopup';
import { tools, type ToolId } from './tools/registry';
import { ExtraUtilityTool } from './ExtraUtilityTools';
import { NetworkDebugPopup } from './NetworkDebugPopup';
import { SiteStorageTool } from './SiteStorageTool';
import { ProductivityTool } from './ProductivityTools';
import { RequestTool } from './RequestTool';
import { PageTool } from './PageTools';
import { Modal } from './components/Modal';
import { RuleEditor } from './components/RuleEditor';
import { Switch } from './components/Switch';
import { FeedbackContext } from './components/FeedbackContext';

type View = ToolId | 'tools';
type Status = 'all' | 'enabled' | 'disabled';
type Notice = { text: string; error?: boolean };

export function App() {
  const [state, setState] = useState<AppState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [view, setView] = useState<View>('headers');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [site, setSite] = useState<string>();
  const [siteOnly, setSiteOnly] = useState(false);
  const [editor, setEditor] = useState<HeaderRule>();
  const [draft, setDraft] = useState<HeaderRule>();
  const [menu, setMenu] = useState<string>();
  const [modal, setModal] = useState<'help' | 'settings' | 'import'>();
  const [deleting, setDeleting] = useState<HeaderRule>();
  const [importState, setImportState] = useState<AppState>();
  const [notice, setNotice] = useState<Notice>();
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = useCallback(async () => { try { setState(await readState()); setLoadError(''); } catch (e) { setLoadError((e as Error).message); } finally { setLoading(false); } }, []);
  useEffect(() => {
    void refresh(); void currentSite().then(setSite); void readDraft().then(setDraft);
    return subscribeState(() => { void refresh(); });
  }, [refresh]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(undefined), notice.error ? 6500 : 3200); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    if (!menu) return;
    const handler = (event: MouseEvent) => { if (!(event.target as Element).closest('.rule-menu-wrap')) setMenu(undefined); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(undefined); };
    document.addEventListener('click', handler); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('click', handler); document.removeEventListener('keydown', escape); };
  }, [menu]);
  async function commit(next: AppState, success: string): Promise<boolean> {
    if (saving.current || loading || loadError) return false;
    saving.current = true; setBusy(true);
    try { setState(await saveState(next)); setNotice({ text: success }); return true; }
    catch (e) { setNotice({ text: (e as Error).message, error: true }); await refresh(); return false; }
    finally { saving.current = false; setBusy(false); }
  }
  const enabledCount = state.rules.filter(rule => rule.enabled).length;
  const visibleRules = state.rules.filter(rule => {
    const haystack = [rule.name, rule.description, ...rule.patterns, ...rule.headers.map(h => h.name)].join(' ').toLowerCase();
    return haystack.includes(query.toLowerCase()) && (status === 'all' || rule.enabled === (status === 'enabled'))
      && (!siteOnly || !site || matchesSite(rule, site));
  });
  const ready = !loading && !loadError;
  const saveRule = async (rule: HeaderRule) => {
    const exists = state.rules.some(r => r.id === rule.id);
    return commit({ ...state, rules: exists ? state.rules.map(r => r.id === rule.id ? rule : r) : [rule, ...state.rules] }, exists ? '规则已更新' : '规则已创建');
  };
  function exportRules() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `devpocket-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice({ text: '配置已导出' });
  }
  const newRule = () => { setDraft(undefined); setNotice(undefined); setEditor(createRule(site ? new URL(site).host : undefined)); };
  return <FeedbackContext.Provider value={notice}><div className="app-shell">
    <header className="app-header">
      <button className="brand" onClick={() => setView('headers')} aria-label="DevPocket 首页"><span className="brand-mark"><SlidersHorizontal size={23} strokeWidth={2.6} /></span><span><strong>DevPocket<span className="brand-dot">.</span></strong><small>开发工具箱</small></span></button>
      <div className="header-right"><span className="local-indicator"><span className="status-dot" />{isExtension ? '本地运行' : '界面预览'}</span><span className="header-divider" /><button className="icon-button" title="使用指南" aria-label="使用指南" onClick={() => setModal('help')}><CircleHelp size={19} /></button><button className="icon-button" title="在独立页面中管理" aria-label="在独立页面中管理" onClick={() => { void openManager().catch(e => setNotice({ text: (e as Error).message, error: true })); }}><ExternalLink size={18} /></button></div>
    </header>
    <div className="app-layout">
      <aside className="sidebar">
        <nav aria-label="工具导航"><button className={`nav-item ${view === 'tools' ? 'active' : ''}`} onClick={() => setView('tools')}><LayoutGrid size={18} />全部工具<ChevronRight size={14} className="nav-chevron" /></button><div className="nav-label">开发调试</div><button className={`nav-item ${view === 'headers' ? 'active' : ''}`} onClick={() => setView('headers')}><SlidersHorizontal size={18} />请求头管理<span className="nav-count">{state.rules.length}</span></button><button className={`nav-item ${view === 'proxy' ? 'active' : ''}`} onClick={() => setView('proxy')}><Settings2 size={18} />资源代理</button></nav>
        <div className="sidebar-bottom"><div className="sidebar-note"><Layers3 size={19} /><strong>让开发，更顺手</strong><p>常用工具，一个入口。<br />更多能力，陆续加入。</p></div><button className="nav-item subtle" onClick={() => setModal('settings')}><Settings2 size={17} />工具箱设置</button><button className="nav-item subtle" onClick={() => setModal('help')}><BookOpen size={17} />使用指南<ArrowUpRight size={14} className="nav-chevron" /></button><div className="sidebar-version"><span>DEVPOCKET TOOLS</span><span>v0.1.0</span></div></div>
      </aside>
      <main className="main-content">
        <div className="page-content">
          <div className="breadcrumb"><span>工作空间</span><ChevronRight size={12} /><span>{view === 'headers' ? '请求头管理' : view === 'proxy' ? '资源代理' : view === 'json' ? 'JSON 工具' : view === 'url' ? 'URL 工具' : tools.find(tool => tool.id === view)?.name ?? '全部工具'}</span></div>
          {view === 'regex' || view === 'diff' || view === 'color' || view === 'hash' ? <div className="manager-proxy"><ProductivityTool kind={view} /></div> : view === 'request' ? <div className="manager-proxy"><RequestTool /></div> : view === 'cache' || view === 'page' ? <div className="manager-proxy"><PageTool kind={view} /></div> : view === 'timestamp' || view === 'jwt' || view === 'codec' ? <div className="manager-proxy"><ExtraUtilityTool kind={view} /></div> : view === 'blocks' || view === 'mocks' ? <div className="manager-proxy"><NetworkDebugPopup kind={view} /></div> : view === 'storage' ? <div className="manager-proxy"><SiteStorageTool /></div> : view === 'json' ? <div className="manager-proxy"><JsonTool /></div> : view === 'url' ? <div className="manager-proxy"><UrlTool /></div> : view === 'proxy' ? <div className="manager-proxy"><ProxyPopup /></div> : view === 'headers' ? <>
            <div className="page-heading"><div><div className="title-line"><h1>请求头管理</h1><span className="label-tag">HEADERS</span></div><p>为请求添加自定义 Header，让联调更简单。</p></div><div className="global-enable"><span><span className={`status-dot ${!state.enabled ? 'muted' : ''}`} />{state.enabled ? '已开启' : '已暂停'}</span><Switch checked={state.enabled} label="请求头修改总开关" disabled={busy || !ready} onChange={enabled => { void commit({ ...state, enabled }, enabled ? '请求头修改已开启' : '请求头修改已暂停'); }} /></div></div>
            {!isExtension && <div className="preview-banner"><Info size={15} /><span>当前为网页预览，样例规则仅供体验；加载插件后可修改真实请求。</span></div>}
            {loadError && <div className="error-banner" role="alert"><Info size={16} /><span>{loadError}</span><button className="text-button" onClick={() => { void refresh(); }}>重新加载</button></div>}
            {draft && !editor && <div className="draft-banner"><Pencil size={15} /><span>有一份未完成的规则草稿</span><button className="text-button" onClick={() => { setEditor(draft); setDraft(undefined); }}>继续编辑</button><button className="icon-button" aria-label="丢弃草稿" onClick={() => { void writeDraft().then(() => setDraft(undefined)); }}><X size={14} /></button></div>}
            {!state.enabled && <div className="pause-banner"><Info size={15} /><span>请求头修改已暂停。规则仍保留，开启总开关即可恢复。</span></div>}
            <section className="rules-section" aria-label="请求头规则">
              <div className="rules-toolbar"><div className="rules-section-title"><h2>我的规则</h2><span>{state.rules.length}</span></div><div className="toolbar-actions"><button className="button ghost" disabled={!ready || busy} onClick={() => fileRef.current?.click()}><ArrowUpFromLine size={15} />导入</button><button className="button ghost" disabled={!ready} onClick={exportRules}><ArrowDownToLine size={15} />导出</button><span className="toolbar-divider" /><button className="button primary" disabled={!ready || busy} onClick={newRule}><Plus size={16} />新建规则</button></div></div>
              <div className="filter-bar"><div className="status-tabs" role="tablist" aria-label="规则状态">{([{ value: 'all', text: '全部规则', count: state.rules.length }, { value: 'enabled', text: '已启用', count: enabledCount }, { value: 'disabled', text: '已停用', count: state.rules.length - enabledCount }] as const).map(tab => <button role="tab" aria-selected={status === tab.value} key={tab.value} className={status === tab.value ? 'selected' : ''} onClick={() => setStatus(tab.value)}>{tab.text}<span>{tab.count}</span></button>)}</div><label className="search-input"><Search size={16} /><input aria-label="搜索规则" placeholder="搜索名称、URL 或 Header" value={query} onChange={e => setQuery(e.target.value)} />{query && <button aria-label="清空搜索" onClick={() => setQuery('')}><X size={13} /></button>}</label></div>
              {site && <button className={`site-filter ${siteOnly ? 'selected' : ''}`} aria-pressed={siteOnly} onClick={() => setSiteOnly(!siteOnly)}><Globe2 size={14} />当前站点：{new URL(site).host}{siteOnly && <Check size={13} />}</button>}
              <div className="rule-list">
                {loading ? <div className="empty-state"><div className="loading-spinner" /><p>正在加载规则…</p></div> : visibleRules.length ? visibleRules.map(rule => <article key={rule.id} className={`rule-card ${!rule.enabled || !state.enabled ? 'inactive' : ''}`}>
                  <div className="rule-card-top"><div className="rule-icon"><SlidersHorizontal size={19} /></div><div className="rule-title"><div><h3>{rule.name}</h3><span className={`rule-status ${rule.enabled && state.enabled ? 'enabled' : ''}`}><span />{!state.enabled ? '已暂停' : rule.enabled ? '已启用' : '已停用'}</span></div>{rule.description && <p>{rule.description}</p>}</div><div className="rule-actions"><Switch checked={rule.enabled} label={`${rule.name}开关`} disabled={busy || !ready} onChange={enabled => { void commit({ ...state, rules: state.rules.map(r => r.id === rule.id ? { ...r, enabled } : r) }, enabled ? '规则已启用' : '规则已停用'); }} /><span className="action-divider" /><button className="icon-button" aria-label={`编辑${rule.name}`} title="编辑规则" disabled={busy} onClick={() => { setEditor(rule); setDraft(undefined); }}><Pencil size={16} /></button><div className="rule-menu-wrap"><button className={`icon-button ${menu === rule.id ? 'selected' : ''}`} aria-label={`${rule.name}更多操作`} aria-expanded={menu === rule.id} disabled={busy} onClick={() => setMenu(menu === rule.id ? undefined : rule.id)}><MoreHorizontal size={19} /></button>{menu === rule.id && <div className="rule-menu"><button onClick={() => { setEditor({ ...rule, id: crypto.randomUUID(), name: `${rule.name} 副本`.slice(0, 80), headers: rule.headers.map(h => ({ ...h, id: crypto.randomUUID() })) }); setMenu(undefined); }}><Copy size={15} />复制规则</button><button disabled={state.rules[0]?.id === rule.id} onClick={() => { void commit({ ...state, rules: [rule, ...state.rules.filter(r => r.id !== rule.id)] }, '规则已移至顶部'); setMenu(undefined); }}><ArrowUpFromLine size={15} />移至顶部</button><div /><button className="danger" onClick={() => { setDeleting(rule); setMenu(undefined); }}><Trash2 size={15} />删除规则</button></div>}</div></div></div>
                  <div className="rule-url"><Globe2 size={14} /><div>{rule.patterns.map(pattern => <code key={pattern}>{pattern}</code>)}</div><span className="method-label">{rule.methods.length ? rule.methods.join(' / ') : 'ALL METHODS'}</span></div>
                  <div className="header-preview">{rule.headers.map(header => <div className={`header-chip ${header.operation === 'remove' ? 'remove' : ''}`} key={header.id}><span className="operation-badge">{header.operation === 'set' ? 'SET' : 'DEL'}</span><code>{header.name}</code>{header.operation === 'set' && <><span className="header-colon">:</span><code className="header-value">{header.value || '（空值）'}</code></>}</div>)}</div>
                  <div className="rule-card-footer"><span><Code2 size={13} />{rule.scope === 'all' ? '所有请求类型' : rule.scope === 'xhr' ? 'Fetch / XHR' : '页面导航'}</span><span>{rule.headers.length} 个 Header</span></div>
                </article>) : <div className="empty-state"><div className="empty-icon"><SlidersHorizontal size={28} /></div><h3>{state.rules.length ? '没有找到匹配的规则' : '从第一条规则开始'}</h3><p>{state.rules.length ? '换个关键词，或调整筛选条件试试。' : '设置 URL 与 Header，轻松切换你的开发环境。'}</p>{state.rules.length ? <button className="button secondary" onClick={() => { setQuery(''); setStatus('all'); setSiteOnly(false); }}>清除筛选</button> : <button className="button primary" onClick={newRule} disabled={!ready}><Plus size={16} />新建规则</button>}</div>}
              </div>
              <div className="list-summary"><span>共 {state.rules.length} 条规则<span className="summary-separator">·</span>{enabledCount} 条已启用</span><span><GripVertical size={13} />冲突时，靠前的规则优先</span></div>
            </section>
            <div className="tip-panel"><div className="tip-icon"><Zap size={18} /></div><div><strong>一点小提示</strong><p>URL 支持通配符，例如 <code>*://*.example.com/*</code>。保存后立即对新的请求生效。</p></div><button className="text-button" onClick={() => setModal('help')}>查看指南<ArrowUpRight size={14} /></button></div>
          </> : <>
            <div className="page-heading"><div><div className="title-line"><h1>你的开发工具箱</h1></div><p>少一点来回切换，多一点专注开发。</p></div><span className="label-tag">TOOLBOX</span></div>
            <div className="tool-collection-title"><h2>全部工具</h2><span>为日常开发准备的小帮手</span></div><div className="tool-grid">{tools.map(tool => <article className={`tool-card ${!tool.available ? 'coming' : ''}`} key={tool.id}><div className="tool-card-heading"><span className="tool-icon"><tool.icon size={23} /></span><span className="label-tag">{tool.available ? tool.tag : '计划中'}</span></div><h3>{tool.name}</h3><p>{tool.description}</p>{tool.available ? <button className="text-button" onClick={() => setView(tool.id)}>打开工具<ArrowUpRight size={15} /></button> : <span className="coming-label">后续加入</span>}</article>)}</div><div className="tool-roadmap"><Layers3 size={20} /><div><strong>一个入口，持续扩展</strong><p>请求头管理是第一站，更多工具将在这里陆续加入。</p></div></div>
          </>}
          <footer className="page-footer"><span><ShieldCheck size={14} />配置保存在本地</span><span>Built for a smoother workflow.</span></footer>
        </div>
      </main>
    </div>
    <input className="file-input" type="file" accept="application/json,.json" ref={fileRef} onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; try { if (file.size > 2_000_000) throw new Error('文件不能超过 2 MB。'); const imported = parseImport(await file.text()); setImportState(imported); setModal('import'); } catch (error) { setNotice({ text: (error as Error).message, error: true }); } }} />
    {editor && <RuleEditor initial={editor} existing={state.rules.some(r => r.id === editor.id)} busy={busy} onSave={saveRule} onClose={() => setEditor(undefined)} />}
    {deleting && <Modal title="删除规则" onClose={() => { if (!busy) setDeleting(undefined); }}><div className="modal-body"><p>确定删除「{deleting.name}」？这条规则将不再修改请求头。</p></div><div className="modal-footer"><button className="button secondary" disabled={busy} onClick={() => setDeleting(undefined)}>取消</button><button className="button danger-button" disabled={busy} onClick={async () => { if (await commit({ ...state, rules: state.rules.filter(r => r.id !== deleting.id) }, '规则已删除')) setDeleting(undefined); }}>删除规则</button></div></Modal>}
    {modal === 'import' && importState && <Modal title="导入规则" onClose={() => { if (!busy) setModal(undefined); }}><div className="modal-body"><div className="import-icon"><ArrowUpFromLine size={25} /></div><p>已读取 <strong>{importState.rules.length} 条规则</strong>，选择如何导入：</p><p className="field-hint">合并会保留现有规则。替换会使用文件中的规则及总开关状态。</p></div><div className="modal-footer"><button className="button secondary" disabled={busy} onClick={async () => { if (await commit({ ...importState, revision: state.revision }, '配置已替换')) setModal(undefined); }}>替换现有配置</button><button className="button primary" disabled={busy} onClick={async () => { const additions = importState.rules.map(r => ({ ...r, id: crypto.randomUUID(), headers: r.headers.map(h => ({ ...h, id: crypto.randomUUID() })) })); if (await commit({ ...state, rules: [...state.rules, ...additions], proxies: [...(state.proxies ?? []), ...(importState.proxies ?? []).map(p => ({ ...p, id: crypto.randomUUID() }))], blocks: [...(state.blocks ?? []), ...(importState.blocks ?? []).map(p => ({ ...p, id: crypto.randomUUID() }))], mocks: [...(state.mocks ?? []), ...(importState.mocks ?? []).map(p => ({ ...p, id: crypto.randomUUID() }))] }, `已合并 ${additions.length + (importState.proxies ?? []).length} 条规则`)) setModal(undefined); }}>合并规则</button></div></Modal>}
    {modal === 'help' && <Modal title="使用指南" onClose={() => setModal(undefined)}><div className="modal-body help-body"><div className="help-intro"><span className="brand-mark"><SlidersHorizontal size={22} /></span><div><strong>从工具栏，管理你的请求</strong><p>三步完成一次环境切换</p></div></div><ol className="guide-steps"><li><span>1</span><div><strong>创建一条规则</strong><p>点击「新建规则」，填写名称与目标 URL。</p></div></li><li><span>2</span><div><strong>添加 Header</strong><p>「设置」会新增或覆盖 Header；「删除」会移除指定字段。</p></div></li><li><span>3</span><div><strong>保存，发起新请求</strong><p>已启用的规则立即生效；页面已有请求需刷新或重新发起。</p></div></li></ol><div className="help-section"><h3>URL 匹配示例</h3><div className="help-example"><code>*://*.example.com/*</code><span>主域名与所有子域名</span></div><div className="help-example"><code>http://localhost:3000/api/*</code><span>指定端口下的 API</span></div><p>支持 http、https、* 协议及路径通配符。规则区分路径大小写；请求类型和方法可进一步限制范围。</p></div><div className="help-section"><h3>你可能想知道</h3><p>关闭弹窗不影响规则运行。未保存的编辑会保留为草稿；取消或关闭编辑对话框会丢弃草稿。列表靠前的规则优先，可在更多操作中「移至顶部」。</p><p>本工具修改发出的请求头，不修改响应头。Cookie、Host 等特殊字段仍受浏览器约束；它不会改变服务端权限或自动解决 CORS。</p></div>{!isExtension && <div className="help-section"><h3>加载插件</h3><p>执行 npm run build，在 chrome://extensions 开启开发者模式，选择「加载已解压的扩展程序」，选中 dist 目录，然后固定到工具栏。</p></div>}</div><div className="modal-footer"><button className="button primary" onClick={() => setModal(undefined)}>知道了</button></div></Modal>}
    {modal === 'settings' && <Modal title="工具箱设置" onClose={() => setModal(undefined)}><div className="modal-body"><div className="settings-row"><div><strong>本地存储</strong><p>规则和草稿只保存在当前浏览器，不上传云端。</p></div><ShieldCheck size={20} /></div><div className="settings-row"><div><strong>配置备份</strong><p>导出为 JSON，或从其他设备的备份中导入。</p></div><div className="settings-actions"><button className="button secondary" disabled={!ready} onClick={exportRules}>导出</button><button className="button secondary" disabled={!ready} onClick={() => { setModal(undefined); fileRef.current?.click(); }}>导入</button></div></div><div className="settings-row"><div><strong>请求访问范围</strong><p>插件可处理 HTTP / HTTPS 请求，仅修改匹配启用规则的 URL。</p></div><Globe2 size={20} /></div><div className="settings-row"><div><strong>DevPocket</strong><p>轻量的前端开发工具箱，让日常调试更顺手。</p></div><span className="label-tag">v0.1.0</span></div></div><div className="modal-footer"><button className="button primary" onClick={() => setModal(undefined)}>完成</button></div></Modal>}
    {notice && <div className={`toast ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}>{notice.error ? <Info size={17} /> : <CheckCheck size={17} />}<span>{notice.text}</span><button aria-label="关闭提示" onClick={() => setNotice(undefined)}><X size={14} /></button></div>}
  </div></FeedbackContext.Provider>;
}
