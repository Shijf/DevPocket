import type { ProxyRule } from './proxy';
import type { BlockRule, MockRule } from './networkDebug';
export type HeaderOperation = 'set' | 'remove';
export type RequestScope = 'all' | 'xhr' | 'navigation';
export interface HeaderEntry { id: string; name: string; value: string; operation: HeaderOperation }
export interface HeaderRule {
  id: string; name: string; description: string; enabled: boolean;
  patterns: string[]; methods: string[]; scope: RequestScope;
  headers: HeaderEntry[]; updatedAt: number;
}
export interface AppState { version: 1; revision: number; enabled: boolean; rules: HeaderRule[]; proxies?: ProxyRule[]; proxyEnabled?: boolean; blocks?: BlockRule[]; blockEnabled?: boolean; mocks?: MockRule[]; mockEnabled?: boolean }
export const emptyState = (): AppState => ({ version: 1, revision: 0, enabled: true, rules: [] });
export const createHeader = (): HeaderEntry => ({ id: crypto.randomUUID(), name: '', value: '', operation: 'set' });
export const createRule = (hostname?: string): HeaderRule => ({
  id: crypto.randomUUID(), name: '', description: '', enabled: true,
  patterns: [hostname ? `*://${hostname}/*` : '*://localhost/*'], methods: [], scope: 'all',
  headers: [createHeader()], updatedAt: Date.now(),
});
export function demoState(): AppState {
  const rule = (name: string, description: string, patterns: string[], headers: [string, string][], enabled = true): HeaderRule => ({
    ...createRule(), name, description, patterns, enabled,
    headers: headers.map(([name, value]) => ({ ...createHeader(), name, value })),
  });
  return { ...emptyState(), rules: [
    rule('泳道环境', '让请求走到指定的测试泳道', ['*://*.example.com/*'], [['x-swimlane', 'feature-dev'], ['x-env', 'staging']]),
    rule('本地接口调试', '本地开发时，快速切换调试环境', ['*://localhost/*', '*://127.0.0.1/*'], [['x-debug', 'true']]),
    rule('自定义请求标识', '为联调请求添加来源标记', ['*://api.example.com/*'], [['x-request-source', 'devpocket']], false),
  ] };
}
