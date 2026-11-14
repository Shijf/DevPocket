import test from 'node:test';
import assert from 'node:assert/strict';
let currentUrl = 'https://example.com/page', documentId = 'document-1', granted = true, failCSS = '', navigateOnCSS = false;
function editableElement(initial: string | null) {
  let value = initial;
  return {
    getAttribute: (_name: string) => value,
    setAttribute: (_name: string, next: string) => { value = next; },
    removeAttribute: (_name: string) => { value = null; },
    get isContentEditable() { return value === 'true'; },
  };
}
const nonEditable = editableElement('false');
const pageBody = { ...editableElement(null), querySelectorAll: () => nonEditable.getAttribute('contenteditable')?.toLowerCase() === 'false' ? [nonEditable] : [] };
Object.defineProperty(pageBody, 'isContentEditable', { get: () => pageBody.getAttribute('contenteditable') === 'true' });
const pageWindow = {}, pageDocument: { designMode: string; body: typeof pageBody | null } = { designMode: 'off', body: pageBody };
const cacheNames = new Set(['assets-v1', 'api-v1']), scopes = new Set(['https://example.com/']);
const injected = new Set<string>(), permissionRequests: string[][] = [];
const scriptArguments: unknown[][] = [];
Object.defineProperty(globalThis, 'location', { configurable: true, value: { protocol: 'chrome-extension:' } });
Object.defineProperty(globalThis, 'chrome', { configurable: true, value: {
  runtime: { id: 'test', getManifest: () => ({ optional_permissions: ['scripting'] }) },
  permissions: { request: async ({ permissions }: { permissions: string[] }) => { permissionRequests.push(permissions); return granted; } },
  tabs: { query: async () => [{ id: 5, url: currentUrl }], get: async () => ({ id: 5, url: currentUrl }) },
  scripting: {
    executeScript: async (details: { func: (...args: never[]) => unknown; args: never[]; target: chrome.scripting.InjectionTarget; world: string }) => {
      // Chrome requires JSON-serializable args; structuredClone would accept undefined.
      assert.deepEqual(JSON.parse(JSON.stringify(details.args)), details.args, 'executeScript args must be JSON-serializable');
      scriptArguments.push(structuredClone(details.args));
      assert.equal(details.target.tabId, 5); assert.equal(details.world, 'ISOLATED');
      if (details.target.documentIds) assert.deepEqual(details.target.documentIds, [documentId]); else assert.deepEqual(details.target.frameIds, [0]);
      const original = globalThis.location;
      Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: new URL(currentUrl).origin } });
      Object.defineProperty(globalThis, 'window', { configurable: true, value: { ...pageWindow, isSecureContext: true, caches: {}, ...pageWindow } });
      // Persist the isolated-world state between invocations.
      Object.assign(globalThis.window, pageWindow);
      Object.defineProperty(globalThis, 'document', { configurable: true, value: pageDocument });
      Object.defineProperty(globalThis, 'caches', { configurable: true, value: { keys: async () => [...cacheNames], delete: async (name: string) => cacheNames.delete(name) } });
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { serviceWorker: { getRegistrations: async () => [...scopes].map(scope => ({ scope, active: { scriptURL: scope + 'sw.js' }, unregister: async () => scopes.delete(scope) })) } } });
      try { const result = await details.func(...details.args); Object.assign(pageWindow, globalThis.window); return [{ result, documentId }]; }
      finally { Object.defineProperty(globalThis, 'location', { configurable: true, value: original }); }
    },
    insertCSS: async (details: chrome.scripting.CSSInjection) => { assert.equal(details.origin, 'USER'); assert.deepEqual(details.target.documentIds, [documentId]); if (details.css === failCSS) throw new Error('CSS injection failed'); injected.add(details.css!); if (navigateOnCSS) { navigateOnCSS = false; documentId = 'document-after-navigation'; injected.clear(); Reflect.deleteProperty(pageWindow, '__devpocketToolsPageDebugV1'); pageDocument.designMode = 'off'; } },
    removeCSS: async (details: chrome.scripting.CSSInjection) => { assert.deepEqual(details.target.documentIds, [documentId]); injected.delete(details.css!); },
  },
} });
const api = await import('../src/lib/pageTools');
test('page debug omits optional state when reading and sends JSON state when updating', async () => {
  const target = await api.acquirePageTarget();
  scriptArguments.length = 0;
  assert.deepEqual(await api.pageDebug(target), api.cleanDebugState());
  assert.deepEqual(scriptArguments, [['https://example.com']]);
  const next = { outlines: false, animations: false, editable: true };
  assert.deepEqual(await api.pageDebug(target, next), next);
  assert.deepEqual(scriptArguments.slice(1), [['https://example.com'], ['https://example.com', next]]);
  await api.pageDebug(target, api.cleanDebugState());
});
test('page tools request declared optional scripting and refuse denied or non-HTTP pages', async () => {
  permissionRequests.length = 0;
  const pending = api.acquirePageTarget(); assert.deepEqual(permissionRequests, [['scripting']]);
  assert.equal((await pending).tabId, 5);
  granted = false; await assert.rejects(api.acquirePageTarget(), /未授予/); granted = true;
  currentUrl = 'chrome://extensions/'; await assert.rejects(api.acquirePageTarget(), /HTTP/); currentUrl = 'https://example.com/page';
});
test('cache clearing only removes explicitly selected names/scopes and rejects origin changes', async () => {
  const target = await api.acquirePageTarget();
  const inventory = await api.inspectCaches(target); assert.deepEqual(inventory.caches, ['assets-v1', 'api-v1']); assert.equal(inventory.workers.length, 1);
  const result = await api.clearCaches(target, { caches: ['assets-v1'], workers: [] }); assert.equal(result.deleted, 1); assert.equal(cacheNames.has('api-v1'), true); assert.equal(scopes.size, 1);
  const missing = await api.clearCaches(target, { caches: ['missing'], workers: ['https://example.com/'] }); assert.equal(missing.deleted, 1); assert.equal(missing.failed.length, 1);
  currentUrl = 'https://other.example/'; await assert.rejects(api.clearCaches(target, { caches: ['api-v1'], workers: [] }), /切换站点/); assert.equal(cacheNames.has('api-v1'), true);
  currentUrl = 'https://example.com/page';
});
test('page toggles restore original designMode, pin CSS to the document and roll back partial failure', async () => {
  const target = await api.acquirePageTarget();
  assert.deepEqual(await api.pageDebug(target), api.cleanDebugState());
  await api.pageDebug(target, { outlines: true, animations: true, editable: true });
  assert.equal(pageDocument.designMode, 'on'); assert.equal(injected.size, 3);
  assert.equal((await api.pageDebug(target)).editable, true);
  await api.pageDebug(target, api.cleanDebugState()); assert.equal(pageDocument.designMode, 'off'); assert.equal(injected.size, 0);
  failCSS = api.debugCSS.animations;
  await assert.rejects(api.pageDebug(target, { outlines: true, animations: true, editable: true }), /CSS injection failed/);
  assert.equal(injected.size, 0); assert.equal(pageDocument.designMode, 'off'); assert.deepEqual(await api.pageDebug(target), api.cleanDebugState()); failCSS = '';
  pageDocument.designMode = 'on'; await api.pageDebug(target, { outlines: false, animations: false, editable: true }); await api.pageDebug(target, api.cleanDebugState()); assert.equal(pageDocument.designMode, 'on');
  currentUrl = 'https://other.example/'; await assert.rejects(api.pageDebug(target, api.cleanDebugState()), /切换站点/); currentUrl = 'https://example.com/page';
});
test('same-origin navigation during CSS changes never applies old debug state to the new document', async () => {
  const target = await api.acquirePageTarget();
  navigateOnCSS = true;
  await assert.rejects(api.pageDebug(target, { outlines: true, animations: true, editable: true }), /恢复未全部完成/);
  assert.equal(injected.size, 0); assert.equal(pageDocument.designMode, 'off'); assert.deepEqual(await api.pageDebug(target), api.cleanDebugState());
});
test('editing overrides blocked body/descendants and restores their exact original attributes', async () => {
  const target = await api.acquirePageTarget();
  pageBody.setAttribute('contenteditable', 'false');
  nonEditable.setAttribute('contenteditable', 'FALSE');
  pageDocument.designMode = 'off';
  await api.pageDebug(target, { outlines: false, animations: false, editable: true });
  assert.equal(pageBody.getAttribute('contenteditable'), 'true');
  assert.equal(nonEditable.getAttribute('contenteditable'), 'true');
  assert.equal(injected.has(api.debugCSS.editable), true);
  await api.pageDebug(target, api.cleanDebugState());
  assert.equal(pageBody.getAttribute('contenteditable'), 'false');
  assert.equal(nonEditable.getAttribute('contenteditable'), 'FALSE');
  assert.equal(pageDocument.designMode, 'off');
  assert.equal(injected.size, 0);
  pageBody.removeAttribute('contenteditable');
});
test('editing preserves attributes changed by the site and rolls back CSS if the body is missing', async () => {
  const target = await api.acquirePageTarget();
  await api.pageDebug(target, { outlines: false, animations: false, editable: true });
  nonEditable.setAttribute('contenteditable', 'plaintext-only');
  await api.pageDebug(target, api.cleanDebugState());
  assert.equal(nonEditable.getAttribute('contenteditable'), 'plaintext-only');
  assert.equal(pageBody.getAttribute('contenteditable'), null);
  pageDocument.body = null;
  try {
    await assert.rejects(api.pageDebug(target, { outlines: true, animations: false, editable: true }), /正文尚未加载/);
    assert.equal(injected.size, 0);
    assert.deepEqual(await api.pageDebug(target), api.cleanDebugState());
  } finally { pageDocument.body = pageBody; nonEditable.setAttribute('contenteditable', 'false'); }
});
