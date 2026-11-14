import { createEngine, STORAGE_KEY } from './lib/engine';
import type { AppState } from './lib/model';
import { authorizeMessage, scopedMockState } from './lib/messagePolicy';

// Utility drafts and full network configuration are available only to extension contexts.
const storageReady = chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
void storageReady.catch(() => console.error('Unable to restrict extension storage access'));


const engine = createEngine({
  read: async () => (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] as AppState | undefined,
  write: async state => { await chrome.storage.local.set({ [STORAGE_KEY]: state }); },
  getRules: () => chrome.declarativeNetRequest.getDynamicRules(),
  updateRules: (addRules, removeRuleIds) => chrome.declarativeNetRequest.updateDynamicRules({ addRules, removeRuleIds }),
  supportsRegex: async (regex, requireCapturing) => (await chrome.declarativeNetRequest.isRegexSupported({ regex, isCaseSensitive: true, requireCapturing })).isSupported,
});

async function badge(state: AppState) {
  const count = (state.enabled ? state.rules.filter(r => r.enabled).length : 0) + (state.proxyEnabled !== false ? (state.proxies ?? []).filter(r => r.enabled).length : 0) + (state.blockEnabled !== false ? (state.blocks ?? []).filter(r => r.enabled).length : 0) + (state.mockEnabled !== false ? (state.mocks ?? []).filter(r => r.enabled).length : 0);
  await Promise.all([
    chrome.action.setBadgeText({ text: count ? String(count) : '' }),
    chrome.action.setBadgeBackgroundColor({ color: '#BD3C00' }),
    chrome.action.setTitle({ title: `DevPocket · ${count} 条网络规则已启用` }),
  ]);
}
const restore = () => { storageReady.then(() => engine.restore()).then(badge).catch(error => console.error('Unable to restore header rules', error)); };
chrome.runtime.onInstalled.addListener(restore);
chrome.runtime.onStartup.addListener(restore);
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !message || typeof message !== 'object') return;
  const request = authorizeMessage(message, sender, chrome.runtime.id);
  if (!request) { sendResponse({ ok: false, error: '此来源无权访问扩展配置。' }); return; }
  const job = storageReady.then(async () => {
    if (request.type === 'mock:read') return scopedMockState(await engine.read(), request.origin);
    return request.type === 'state:read' ? engine.read() : engine.save((message as { state: AppState }).state);
  });
  job.then(async state => {
    // Cosmetic badge failure must never turn an already committed save into a failed response.
    try { if (request.type !== 'mock:read') await badge(state); } catch (error) { console.error('Unable to update badge', error); }
    sendResponse({ ok: true, state });
  }).catch(error => sendResponse({ ok: false, error: error instanceof Error ? error.message : '保存失败。' }));
  return true;
});

// Storage changes remain in trusted contexts; content scripts receive an invalidation only.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[STORAGE_KEY]) return;
  void chrome.tabs.query({}).then(tabs => Promise.all(tabs.filter(tab => tab.id !== undefined && /^https?:/.test(tab.url ?? '')).map(tab =>
    chrome.tabs.sendMessage(tab.id!, { type: 'mock:changed' }).catch(() => undefined)))).catch(() => undefined);
});
