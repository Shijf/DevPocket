import { isExtension } from './storage';
export type StorageArea = 'cookies' | 'localStorage' | 'sessionStorage';
export interface StorageEntry { id: string; name: string; value: string; cookie?: chrome.cookies.Cookie }
export interface SiteTarget { tabId?: number; url: string }
export function cookieIdentity(cookie: chrome.cookies.Cookie): string { return JSON.stringify([cookie.storeId, cookie.domain, cookie.path, cookie.name, cookie.partitionKey ?? null]); }
export function cookieUrl(cookie: Pick<chrome.cookies.Cookie, 'domain' | 'path' | 'secure'>): string { return `${cookie.secure ? 'https' : 'http'}://${cookie.domain.replace(/^\./, '')}${cookie.path}`; }
export function cookieDetails(site: string, cookie: chrome.cookies.Cookie, value: string): chrome.cookies.SetDetails {
  const hostname = new URL(site).hostname;
  const domain = cookie.domain.replace(/^\./, '');
  if (hostname !== domain && !hostname.endsWith(`.${domain}`)) throw new Error('Cookie 不属于当前站点。');
  return { url: cookieUrl(cookie), name: cookie.name, value, path: cookie.path, secure: cookie.secure, httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite, storeId: cookie.storeId, ...(cookie.hostOnly ? {} : { domain: cookie.domain }),
    ...(cookie.session ? {} : { expirationDate: cookie.expirationDate }), ...(cookie.partitionKey ? { partitionKey: cookie.partitionKey } : {}) };
}
export async function siteTarget(): Promise<SiteTarget> {
  if (!isExtension) return { url: 'https://preview.example/' };
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) throw new Error('请先打开一个 HTTP／HTTPS 网站，再使用页面工具。');
  return { tabId: tab.id, url: tab.url };
}
export async function requestStoragePermission(area: StorageArea): Promise<boolean> {
  if (!isExtension) return true;
  const permission = area === 'cookies' ? 'cookies' : 'scripting';
  // Use the manifest actually loaded by Chrome, which may still precede a dist rebuild.
  const manifest = chrome.runtime.getManifest();
  const permissions = { permissions: [permission] };
  const reloadMessage = `当前加载的扩展未声明 ${permission} 权限。请在扩展管理页点击 DevPocket 的重新加载按钮，再重新打开工具箱；若加载的是旧目录，请改为最新的 dist 目录。`;
  if (manifest.permissions?.includes(permission)) return chrome.permissions.contains(permissions);
  if (!manifest.optional_permissions?.includes(permission)) throw new Error(reloadMessage);
  // Start the optional request before any await to preserve the click's user gesture.
  try { return await chrome.permissions.request(permissions); }
  catch (error) {
    if (/Only permissions specified in the manifest/i.test((error as Error).message)) throw new Error(reloadMessage);
    throw error;
  }
}
async function ensureSite(target: SiteTarget) {
  if (!isExtension) return;
  const tab = await chrome.tabs.get(target.tabId!);
  if (!tab.url || new URL(tab.url).origin !== new URL(target.url).origin) throw new Error('页面已切换站点，请重新读取。');
}
async function executeStorage(target: SiteTarget, area: 'localStorage' | 'sessionStorage', operation: 'read' | 'write' | 'delete', name = '', value = ''): Promise<StorageEntry[]> {
  await ensureSite(target);
  const [result] = await chrome.scripting.executeScript({ target: { tabId: target.tabId!, frameIds: [0] }, world: 'ISOLATED',
    func: (storageArea, action, key, text, origin) => {
      if (location.origin !== origin) throw new Error('页面已切换站点。');
      const storage = storageArea === 'localStorage' ? localStorage : sessionStorage;
      if (action === 'write') storage.setItem(key, text); else if (action === 'delete') storage.removeItem(key);
      return Object.keys(storage).map(name => ({ id: name, name, value: storage.getItem(name) ?? '' }));
    }, args: [area, operation, name, value, new URL(target.url).origin] });
  if (!result || !Array.isArray(result.result)) throw new Error('无法访问站点存储，请检查权限或刷新页面。');
  return result.result as StorageEntry[];
}
// Web preview uses its own sandbox, never reads the user's actual website storage.
function previewRows(area: StorageArea): StorageEntry[] { return JSON.parse(localStorage.getItem(`devpocket-storage-preview-${area}`) || '[]') as StorageEntry[]; }
export async function readSiteStorage(target: SiteTarget, area: StorageArea): Promise<StorageEntry[]> {
  if (!isExtension) return previewRows(area);
  await ensureSite(target);
  if (area !== 'cookies') return executeStorage(target, area, 'read');
  const stores = await chrome.cookies.getAllCookieStores();
  const storeId = stores.find(store => store.tabIds.includes(target.tabId!))?.id;
  if (!storeId) throw new Error('无法定位当前标签页的 Cookie 存储。');
  return (await chrome.cookies.getAll({ url: target.url, storeId })).map(cookie => ({ id: cookieIdentity(cookie), name: cookie.name, value: cookie.value, cookie }));
}
export async function writeSiteStorage(target: SiteTarget, area: StorageArea, entry: StorageEntry): Promise<StorageEntry[]> {
  if (!entry.name || entry.name.length > 2048 || entry.value.length > 100000) throw new Error('请输入名称，名称最多 2048 字符，值最多 10 万字符。');
  if (!isExtension) { const rows = previewRows(area); const next = [...rows.filter(row => row.id !== entry.id), entry]; localStorage.setItem(`devpocket-storage-preview-${area}`, JSON.stringify(next)); return next; }
  await ensureSite(target);
  if (area !== 'cookies') return executeStorage(target, area, 'write', entry.name, entry.value);
  if (entry.cookie) {
    const current = await readSiteStorage(target, area);
    if (!current.some(row => row.id === entry.id)) throw new Error('Cookie 已被页面删除，请重新读取。');
    await ensureSite(target);
    const saved = await chrome.cookies.set(cookieDetails(target.url, entry.cookie, entry.value));
    if (!saved) throw new Error('Cookie 写入被浏览器拒绝。');
  } else {
    const stores = await chrome.cookies.getAllCookieStores();
    const storeId = stores.find(store => store.tabIds.includes(target.tabId!))?.id;
    if (!storeId) throw new Error('无法定位当前标签页的 Cookie 存储。');
    await ensureSite(target);
    const saved = await chrome.cookies.set({ storeId, url: target.url, name: entry.name, value: entry.value, path: '/', secure: new URL(target.url).protocol === 'https:', sameSite: 'lax' });
    if (!saved) throw new Error('Cookie 写入被浏览器拒绝。');
  }
  return readSiteStorage(target, area);
}
export async function deleteSiteStorage(target: SiteTarget, area: StorageArea, entry: StorageEntry): Promise<StorageEntry[]> {
  if (!isExtension) { const rows = previewRows(area).filter(row => row.id !== entry.id); localStorage.setItem(`devpocket-storage-preview-${area}`, JSON.stringify(rows)); return rows; }
  await ensureSite(target);
  if (area !== 'cookies') return executeStorage(target, area, 'delete', entry.name);
  if (!entry.cookie) throw new Error('缺少 Cookie 属性，请重新读取。');
  cookieDetails(target.url, entry.cookie, entry.value);
  const selected = await chrome.cookies.get({ url: cookieUrl(entry.cookie), name: entry.name, storeId: entry.cookie.storeId, ...(entry.cookie.partitionKey ? { partitionKey: entry.cookie.partitionKey } : {}) });
  if (!selected || cookieIdentity(selected) !== entry.id) throw new Error('存在同名不同路径或域名的 Cookie，无法安全定位删除目标。');
  await ensureSite(target);
  await chrome.cookies.remove({ url: cookieUrl(entry.cookie), name: entry.name, storeId: entry.cookie.storeId, ...(entry.cookie.partitionKey ? { partitionKey: entry.cookie.partitionKey } : {}) });
  const rows = await readSiteStorage(target, area);
  if (rows.some(row => row.id === entry.id)) throw new Error('Cookie 未删除，请检查浏览器限制。');
  return rows;
}
