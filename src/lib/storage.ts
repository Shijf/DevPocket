import { demoState, type AppState, type HeaderRule } from './model';
import { STORAGE_KEY } from './engine';
import { validateState } from './rules';
export const isExtension = typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id) && location.protocol === 'chrome-extension:';
const PREVIEW_KEY = 'devpocket-tools-preview-v1';
const DRAFT_KEY = 'devpocket-tools-editor-draft';

async function message(type: string, state?: AppState): Promise<AppState> {
  const response = await chrome.runtime.sendMessage({ type, state }) as { ok: boolean; state: AppState; error: string };
  if (!response?.ok) throw new Error(response?.error || '后台未响应，请在扩展管理页重新加载插件。');
  return response.state;
}
export async function readState(): Promise<AppState> {
  if (isExtension) return message('state:read');
  const stored = localStorage.getItem(PREVIEW_KEY);
  const value: unknown = stored ? JSON.parse(stored) : demoState();
  validateState(value);
  if (!stored) localStorage.setItem(PREVIEW_KEY, JSON.stringify(value));
  return value;
}
export async function saveState(state: AppState): Promise<AppState> {
  if (isExtension) return message('state:save', state);
  validateState(state);
  const current = await readState();
  if (current.revision !== state.revision) throw new Error('配置已在其他窗口更新，请重试。');
  const saved = { ...state, revision: state.revision + 1 };
  localStorage.setItem(PREVIEW_KEY, JSON.stringify(saved));
  return saved;
}
export function subscribeState(callback: () => void): () => void {
  if (isExtension) {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => { if (area === 'local' && changes[STORAGE_KEY]) callback(); };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }
  const listener = (event: StorageEvent) => { if (event.key === PREVIEW_KEY) callback(); };
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}
export async function currentSite(): Promise<string | undefined> {
  if (!isExtension) return undefined;
  try { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); return tab.url && /^https?:/.test(tab.url) ? new URL(tab.url).href : undefined; } catch { return undefined; }
}
export async function openManager() {
  if (isExtension) await chrome.runtime.openOptionsPage();
  else window.open(new URL('index.html', location.href).href, '_blank', 'noopener');
}
export async function readDraft(): Promise<HeaderRule | undefined> {
  try { return isExtension ? (await chrome.storage.local.get(DRAFT_KEY))[DRAFT_KEY] as HeaderRule | undefined : JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') || undefined; } catch { return undefined; }
}
export async function writeDraft(rule?: HeaderRule) {
  if (isExtension) { if (rule) await chrome.storage.local.set({ [DRAFT_KEY]: rule }); else await chrome.storage.local.remove(DRAFT_KEY); }
  else { if (rule) localStorage.setItem(DRAFT_KEY, JSON.stringify(rule)); else localStorage.removeItem(DRAFT_KEY); }
}

// Serialize popup tool saves and merge each edit with the newest committed state.
let moduleQueue: Promise<unknown> = Promise.resolve();
export function saveModule(update: (current: AppState) => AppState): Promise<AppState> {
  const job = moduleQueue.then(async () => {
    for (let attempt = 0; ; attempt++) {
      const current = await readState();
      try { return await saveState(update(current)); }
      catch (error) {
        if (attempt || !/其他窗口/.test((error as Error).message)) throw error;
      }
    }
  });
  moduleQueue = job.catch(() => undefined);
  return job;
}
