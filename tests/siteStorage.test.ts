import test from 'node:test';
import assert from 'node:assert/strict';

let currentUrl = 'https://example.com/page';
let removed = 0, lastSet: unknown;
let loadedManifest = { manifest_version: 3, name: 'test', version: '1.0', permissions: ['storage'], optional_permissions: ['cookies', 'scripting'] };
const permissionRequests: string[][] = [];
let permissionGranted = true, permissionError = '';
const cookie: chrome.cookies.Cookie = { name: 'session', value: 'old', domain: '.example.com', path: '/', secure: true, httpOnly: true, hostOnly: false, session: false, expirationDate: 1800000000, sameSite: 'lax', storeId: '1', partitionKey: { topLevelSite: 'https://example.com' } };
let cookies: chrome.cookies.Cookie[] = [cookie];
const memory = new Map<string, string>();
const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) };
Object.defineProperty(globalThis, 'location', { configurable: true, value: { protocol: 'chrome-extension:', origin: 'chrome-extension://test' } });
Object.defineProperty(globalThis, 'chrome', { configurable: true, value: {
  runtime: { id: 'test', getManifest: () => loadedManifest },
  tabs: { query: async () => [{ id: 10, url: currentUrl }], get: async () => ({ id: 10, url: currentUrl }) },
  permissions: { contains: async ({ permissions }: { permissions: string[] }) => permissions.every(permission => loadedManifest.permissions.includes(permission)),
    request: async ({ permissions }: { permissions: string[] }) => {
      permissionRequests.push(permissions);
      if (permissionError) throw new Error(permissionError);
      if (permissions.some(permission => !loadedManifest.optional_permissions.includes(permission))) throw new Error('Only permissions specified in the manifest may be requested.');
      return permissionGranted;
    } },
  cookies: { getAllCookieStores: async () => [{ id: '1', tabIds: [10] }], getAll: async () => cookies,
    get: async () => cookies[0] ?? null, set: async (details: chrome.cookies.SetDetails) => { lastSet = details; cookies = [{ ...cookie, value: details.value ?? '' }]; return cookies[0]; },
    remove: async () => { removed++; cookies = []; return {}; } },
  scripting: { executeScript: async (details: { func: (...args: unknown[]) => unknown; args: unknown[]; target: { tabId: number }; world: string }) => {
    assert.equal(details.target.tabId, 10); assert.equal(details.world, 'ISOLATED');
    const before = globalThis.location;
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { protocol: 'https:', origin: new URL(currentUrl).origin } });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new Proxy(storage, { ownKeys: () => [...memory.keys()], getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) }) });
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: globalThis.localStorage });
    try { return [{ result: details.func(...details.args) }]; }
    finally { Object.defineProperty(globalThis, 'location', { configurable: true, value: before }); }
  } },
} });
const api = await import('../src/lib/siteStorage');
test('local/session storage request only scripting and cookies request only cookies from the loaded manifest', async () => {
  permissionRequests.length = 0;
  assert.equal(await api.requestStoragePermission('localStorage'), true);
  assert.equal(await api.requestStoragePermission('sessionStorage'), true);
  assert.equal(await api.requestStoragePermission('cookies'), true);
  assert.deepEqual(permissionRequests, [['scripting'], ['scripting'], ['cookies']]);
  permissionGranted = false;
  assert.equal(await api.requestStoragePermission('localStorage'), false);
  permissionGranted = true;
});
test('an old loaded manifest explains reload without issuing an undeclared permission request', async () => {
  const previous = loadedManifest;
  loadedManifest = { ...previous, optional_permissions: [] };
  permissionRequests.length = 0;
  try {
    await assert.rejects(api.requestStoragePermission('localStorage'), /scripting.*重新加载/);
    await assert.rejects(api.requestStoragePermission('cookies'), /cookies.*重新加载/);
    assert.deepEqual(permissionRequests, []);
  } finally { loadedManifest = previous; }
});
test('required permissions are used directly and Chrome manifest rejection provides actionable reload guidance', async () => {
  const previous = loadedManifest;
  permissionRequests.length = 0;
  loadedManifest = { ...previous, permissions: ['storage', 'scripting'], optional_permissions: ['cookies'] };
  try { assert.equal(await api.requestStoragePermission('localStorage'), true); assert.deepEqual(permissionRequests, []); }
  finally { loadedManifest = previous; }
  permissionError = 'Only permissions specified in the manifest may be requested.';
  try { await assert.rejects(api.requestStoragePermission('localStorage'), /扩展管理页.*重新加载/); }
  finally { permissionError = ''; }
});
test('Cookie edits preserve security, expiry, domain, store and partition properties', async () => {
  const target = await api.siteTarget(); const [entry] = await api.readSiteStorage(target, 'cookies');
  await api.writeSiteStorage(target, 'cookies', { ...entry, value: 'new' });
  assert.deepEqual(lastSet, { url: 'https://example.com/', name: 'session', value: 'new', path: '/', domain: '.example.com', secure: true, httpOnly: true, sameSite: 'lax', storeId: '1', expirationDate: 1800000000, partitionKey: cookie.partitionKey });
  assert.throws(() => api.cookieDetails('https://unrelated.example/', cookie, 'bad'), /不属于/);
});
test('Storage edits and deletion target the active main frame and preserve other keys', async () => {
  const target = await api.siteTarget(); memory.set('other', 'kept');
  await api.writeSiteStorage(target, 'localStorage', { id: 'test', name: 'test', value: '中文' });
  assert.equal(memory.get('test'), '中文');
  await api.deleteSiteStorage(target, 'localStorage', { id: 'test', name: 'test', value: '中文' });
  assert.equal(memory.has('test'), false); assert.equal(memory.get('other'), 'kept');
  await api.writeSiteStorage(target, 'sessionStorage', { id: 'session-key', name: 'session-key', value: 's' }); assert.equal(memory.get('session-key'), 's');
  currentUrl = 'https://elsewhere.example/';
  await assert.rejects(api.writeSiteStorage(target, 'localStorage', { id: 'test', name: 'test', value: 'bad' }), /切换站点/);
  currentUrl = 'https://example.com/page';
});
test('Cookie deletion refuses ambiguous identity instead of removing a sibling cookie', async () => {
  cookies = [{ ...cookie, path: '/other' }];
  await assert.rejects(api.deleteSiteStorage(await api.siteTarget(), 'cookies', { id: api.cookieIdentity(cookie), name: cookie.name, value: cookie.value, cookie }), /无法安全定位/);
  assert.equal(removed, 0);
  cookies = [cookie];
  assert.deepEqual(await api.deleteSiteStorage(await api.siteTarget(), 'cookies', { id: api.cookieIdentity(cookie), name: cookie.name, value: cookie.value, cookie }), []);
  assert.equal(removed, 1);
});
test('new cookies explicitly use the current tab cookie store', async () => {
  await api.writeSiteStorage(await api.siteTarget(), 'cookies', { id: 'new', name: 'new', value: 'test' });
  assert.equal((lastSet as chrome.cookies.SetDetails).storeId, '1');
});
