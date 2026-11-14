import { emptyState, type AppState } from './model';
import { compileRules, validateState } from './rules';
export const STORAGE_KEY = 'devpocket-tools-state';

export interface EngineAdapter {
  read(): Promise<AppState | undefined>;
  write(state: AppState): Promise<void>;
  getRules(): Promise<chrome.declarativeNetRequest.Rule[]>;
  updateRules(rules: chrome.declarativeNetRequest.Rule[], oldIds: number[]): Promise<void>;
  supportsRegex(regex: string, requireCapturing?: boolean): Promise<boolean>;
}

export function createEngine(adapter: EngineAdapter) {
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const result = queue.then(job); queue = result.catch(() => undefined); return result;
  };
  async function apply(state: AppState) {
    const rules = compileRules(state);
    for (const rule of rules) {
      if (!await adapter.supportsRegex(rule.condition.regexFilter!, !!rule.action.redirect?.regexSubstitution)) throw new Error('URL 规则过于复杂，浏览器无法编译，请简化匹配范围。');
    }
    const old = await adapter.getRules();
    await adapter.updateRules(rules, old.map(r => r.id));
    return old;
  }
  return {
    read: () => enqueue(async () => { const state = await adapter.read() ?? emptyState(); validateState(state); return state; }),
    save: (next: AppState) => enqueue(async () => {
      validateState(next);
      const current = await adapter.read() ?? emptyState();
      if (next.revision !== current.revision) throw new Error('规则已在其他窗口更新，已加载最新配置，请重试。');
      const saved = { ...next, revision: current.revision + 1 };
      const oldRules = await apply(saved);
      try { await adapter.write(saved); }
      catch (error) {
        // Roll back browser rules if persisting the corresponding UI state fails.
        const active = await adapter.getRules();
        await adapter.updateRules(oldRules, active.map(r => r.id));
        throw error;
      }
      return saved;
    }),
    restore: () => enqueue(async () => { const state = await adapter.read() ?? emptyState(); await apply(state); return state; }),
  };
}
