import { isExtension } from './storage';
import { requestStoragePermission, siteTarget, type SiteTarget } from './siteStorage';
export interface CacheInventory { caches: string[]; workers: { scope: string; script: string }[] }
export interface CacheSelection { caches: string[]; workers: string[] }
export interface CacheClearResult { deleted: number; failed: string[] }
export interface PageDebugState { outlines: boolean; animations: boolean; editable: boolean }
export const cleanDebugState = (): PageDebugState => ({ outlines: false, animations: false, editable: false });
export const debugCSS = {
  outlines: '* { outline: 1px solid rgba(255,102,0,.65) !important; }',
  animations: '*, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }',
  editable: 'html, body, body * { -webkit-user-select: text !important; user-select: text !important; }',
};
// Self-contained functions serialized by chrome.scripting; do not capture module variables.
export async function cacheInPage(origin: string, selection?: CacheSelection): Promise<CacheInventory | CacheClearResult> {
  if (location.origin !== origin) throw new Error('页面已切换站点，请重新读取。');
  if (!window.isSecureContext || !('caches' in window) || !('serviceWorker' in navigator)) throw new Error('此页面不支持 Cache Storage／Service Worker，请使用 HTTPS 或 localhost。');
  if (!selection) return { caches: await caches.keys(), workers: (await navigator.serviceWorker.getRegistrations()).map(worker => ({ scope: worker.scope, script: (worker.active || worker.waiting || worker.installing)?.scriptURL || '' })) };
  let deleted = 0; const failed: string[] = [];
  // Check again after enumeration, before each mutation.
  const registrations = await navigator.serviceWorker.getRegistrations();
  for (const name of selection.caches) {
    try { if (location.origin !== origin) throw new Error('站点已改变'); if (await caches.delete(name)) deleted++; else failed.push(`缓存 ${name} 已不存在`); } catch { failed.push(`缓存 ${name} 清理失败`); }
  }
  for (const scope of selection.workers) {
    try { if (location.origin !== origin) throw new Error('站点已改变'); const worker = registrations.find(worker => worker.scope === scope); if (worker && await worker.unregister()) deleted++; else failed.push(`Worker ${scope} 未注销`); } catch { failed.push(`Worker ${scope} 注销失败`); }
  }
  return { deleted, failed };
}
export function debugInPage(origin: string, next?: PageDebugState): PageDebugState {
  if (location.origin !== origin) throw new Error('页面已切换站点，请重新读取。');
  const context = window as unknown as { __devpocketToolsPageDebugV1?: { state: PageDebugState; originalMode: string; editableAttributes?: Map<HTMLElement, string | null> } };
  let record = context.__devpocketToolsPageDebugV1;
  if (!next) return record ? { ...record.state } : { outlines: false, animations: false, editable: false };
  if (!record) { record = { state: { outlines: false, animations: false, editable: false }, originalMode: document.designMode }; context.__devpocketToolsPageDebugV1 = record; }
  if (next.editable) {
    if (!document.body) throw new Error('页面正文尚未加载，请稍后重新读取。');
    if (!record.state.editable) record.originalMode = document.designMode;
    // Explicit editing hosts and non-editable descendants can override designMode.
    // Save exact attributes so disabling the tool restores the site's own behavior.
    const attributes = record.editableAttributes ?? new Map<HTMLElement, string | null>();
    const elements = [document.body, ...document.body.querySelectorAll<HTMLElement>('[contenteditable="false" i]')];
    const updated: [HTMLElement, string | null][] = [];
    const previousMode = document.designMode;
    try {
      for (const element of elements) {
        const previous = element.getAttribute('contenteditable');
        if (!attributes.has(element)) attributes.set(element, previous);
        updated.push([element, previous]);
        element.setAttribute('contenteditable', 'true');
      }
      document.designMode = 'on';
      if (document.designMode !== 'on' || !document.body.isContentEditable) throw new Error('浏览器未开启文字编辑，请刷新页面后重试。');
      record.editableAttributes = attributes;
    } catch (error) {
      for (const [element, value] of updated.reverse()) { if (value === null) element.removeAttribute('contenteditable'); else element.setAttribute('contenteditable', value); }
      document.designMode = previousMode;
      throw error;
    }
  } else if (record.state.editable) {
    for (const [element, value] of record.editableAttributes ?? []) {
      // Do not overwrite a new attribute deliberately changed by the page.
      if (element.getAttribute('contenteditable') !== 'true') continue;
      if (value === null) element.removeAttribute('contenteditable'); else element.setAttribute('contenteditable', value);
    }
    record.editableAttributes = undefined;
    document.designMode = record.originalMode;
  }
  record.state = { ...next };
  return { ...record.state };
}
export async function acquirePageTarget(): Promise<SiteTarget> {
  // Must start permission request synchronously from the user's click.
  if (!await requestStoragePermission('localStorage')) throw new Error('未授予页面操作权限。');
  return siteTarget();
}
async function ensureTarget(target: SiteTarget) {
  const tab = await chrome.tabs.get(target.tabId!);
  if (!tab.url || new URL(tab.url).origin !== new URL(target.url).origin) throw new Error('页面已切换站点，请重新读取。');
}
let previewCache: CacheInventory = { caches: ['demo-assets-v1', 'demo-api-v1'], workers: [{ scope: 'https://preview.example/', script: 'https://preview.example/sw.js' }] };
let previewDebug = cleanDebugState();
export async function inspectCaches(target: SiteTarget): Promise<CacheInventory> {
  if (!isExtension) return structuredClone(previewCache);
  await ensureTarget(target);
  const [result] = await chrome.scripting.executeScript({ target: { tabId: target.tabId!, frameIds: [0] }, world: 'ISOLATED', func: cacheInPage, args: [new URL(target.url).origin] });
  if (!result?.result || !('caches' in result.result)) throw new Error('无法读取页面缓存。');
  return result.result as CacheInventory;
}
export async function clearCaches(target: SiteTarget, selection: CacheSelection): Promise<CacheClearResult> {
  if (!isExtension) { const before = previewCache.caches.length + previewCache.workers.length; previewCache = { caches: previewCache.caches.filter(name => !selection.caches.includes(name)), workers: previewCache.workers.filter(worker => !selection.workers.includes(worker.scope)) }; return { deleted: before - previewCache.caches.length - previewCache.workers.length, failed: [] }; }
  await ensureTarget(target);
  const [result] = await chrome.scripting.executeScript({ target: { tabId: target.tabId!, frameIds: [0] }, world: 'ISOLATED', func: cacheInPage, args: [new URL(target.url).origin, selection] });
  if (!result?.result || !('deleted' in result.result)) throw new Error('无法清理页面缓存。');
  return result.result as CacheClearResult;
}
export async function pageDebug(target: SiteTarget, next?: PageDebugState): Promise<PageDebugState> {
  if (!isExtension) { if (next) previewDebug = { ...next }; return { ...previewDebug }; }
  await ensureTarget(target);
  let injectionTarget: chrome.scripting.InjectionTarget = { tabId: target.tabId!, frameIds: [0] };
  const read = async (state?: PageDebugState) => {
    const origin = new URL(target.url).origin;
    // Omit absent state: Chrome rejects undefined inside ScriptInjection.args.
    const args: [string] | [string, PageDebugState] = state === undefined ? [origin] : [origin, state];
    const [result] = await chrome.scripting.executeScript({ target: injectionTarget, world: 'ISOLATED', func: debugInPage, args });
    if (!result?.result) throw new Error('无法操作页面。');
    if (!injectionTarget.documentIds && result.documentId) injectionTarget = { tabId: target.tabId!, documentIds: [result.documentId] };
    return result.result as PageDebugState;
  };
  const previous = await read(); if (!next) return previous;
  const changed: (keyof PageDebugState)[] = [];
  try {
    for (const key of ['outlines', 'animations', 'editable'] as const) if (next[key] !== previous[key]) {
      await ensureTarget(target);
      const details = { target: injectionTarget, css: debugCSS[key], origin: 'USER' as const };
      if (next[key]) await chrome.scripting.insertCSS(details); else await chrome.scripting.removeCSS(details);
      changed.push(key);
    }
    await ensureTarget(target);
    return await read(next);
  } catch (error) {
    // Restore CSS already changed when another operation fails on the same document.
    const rollbackErrors: unknown[] = [];
    for (const key of changed.reverse()) {
      try { await ensureTarget(target); const details = { target: injectionTarget, css: debugCSS[key], origin: 'USER' as const }; if (previous[key]) await chrome.scripting.insertCSS(details); else await chrome.scripting.removeCSS(details); }
      catch (rollbackError) { rollbackErrors.push(rollbackError); }
    }
    if (rollbackErrors.length) throw new Error('页面状态变化，恢复未全部完成，请刷新页面后重新读取。');
    throw error;
  }
}
