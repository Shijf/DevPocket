import type { AppState } from './model';
import { HTTP_METHODS, patternToRegex } from './rules';
import { PROXY_TYPES, type ProxyType } from './proxy';

export interface BlockRule { id: string; source: string; enabled: boolean; methods: string[]; resourceTypes: ProxyType[] }
export interface MockRule { id: string; source: string; enabled: boolean; methods: string[]; status: number; delay: number; body: string; contentType: string; pageOrigin?: string }
export const createBlock = (): BlockRule => ({ id: crypto.randomUUID(), source: '', enabled: true, methods: [], resourceTypes: [...PROXY_TYPES] });
export const createMock = (): MockRule => ({ id: crypto.randomUUID(), source: '', enabled: true, methods: [], status: 200, delay: 0, body: '{}', contentType: 'application/json', pageOrigin: '' });
export function validateNetworkRows(value: unknown, kind: 'blocks' | 'mocks'): asserts value is (BlockRule | MockRule)[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('每个工具最多支持 100 条规则。');
  if (JSON.stringify(value).length > 1000000) throw new Error('单个工具配置总大小不能超过 100 万字符。');
  const ids = new Set<string>();
  for (const row of value) {
    if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id) || typeof row.source !== 'string' || typeof row.enabled !== 'boolean'
      || !Array.isArray(row.methods) || !row.methods.every((method: string) => HTTP_METHODS.includes(method as typeof HTTP_METHODS[number])) || new Set(row.methods).size !== row.methods.length) throw new Error('规则 ID、开关或请求方法无效。');
    ids.add(row.id); patternToRegex(row.source);
    if (kind === 'blocks') {
      if (!Array.isArray(row.resourceTypes) || !row.resourceTypes.length || !row.resourceTypes.every((type: ProxyType) => PROXY_TYPES.includes(type)) || new Set(row.resourceTypes).size !== row.resourceTypes.length) throw new Error('请选择有效的资源类型。');
    } else {
      if (row.pageOrigin !== undefined && (typeof row.pageOrigin !== 'string' || (row.pageOrigin !== '' && !mockPageOrigin(row.pageOrigin)))) throw new Error('生效页面应为完整 HTTP／HTTPS origin，例如 https://app.example.com（不含路径、通配符或账号）。');
      if (!Number.isInteger(row.status) || row.status < 200 || row.status > 599 || !Number.isInteger(row.delay) || row.delay < 0 || row.delay > 30000) throw new Error('状态码应为 200–599，延迟应为 0–30000 毫秒。');
      if (typeof row.body !== 'string' || row.body.length > 100000 || typeof row.contentType !== 'string' || !/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+(?:;[\x20-\x7e]*)?$/.test(row.contentType)) throw new Error('响应正文最多 10 万字符，Content-Type 应为有效 MIME 类型。');
      if ([204, 205, 304].includes(row.status) && row.body) throw new Error('204／205／304 响应不能包含正文。');
      if (row.contentType.split(';')[0].endsWith('json') && row.body) { try { JSON.parse(row.body); } catch { throw new Error('JSON 响应正文格式无效。'); } }
    }
  }
}
export function stateFromNetwork(state: AppState, kind: 'blocks' | 'mocks', rows: (BlockRule | MockRule)[], enabled: boolean): AppState {
  const configured = rows.filter(row => row.source.trim()).map(row => ({ ...row, source: row.source.trim() }));
  validateNetworkRows(configured, kind);
  return kind === 'blocks' ? { ...state, blocks: configured as BlockRule[], blockEnabled: enabled } : { ...state, mocks: configured as MockRule[], mockEnabled: enabled };
}
// Page scope is an exact origin, independent of the URL of a cross-origin API.
export function mockPageOrigin(value: string): string | undefined {
  try {
    if (value.length > 2048 || /[\s\x00-\x1f\x7f*\\]/.test(value) || !/^https?:\/\/[^/?#]+\/?$/i.test(value)) return undefined;
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return undefined;
    return url.origin;
  } catch { return undefined; }
}
export function mockPageOrigins(row: MockRule): string[] {
  if (row.pageOrigin) { const origin = mockPageOrigin(row.pageOrigin); return origin ? [origin] : []; }
  // Legacy / blank scope: only a concrete request host at its specified/default port.
  // Wildcard hosts must be explicitly scoped; never turn them into page permissions.
  const match = /^(\*|https?):\/\/([^/?#]+)(?:[/?]|$)/.exec(row.source);
  if (!match || match[2].includes('*')) return [];
  return (match[1] === '*' ? ['http', 'https'] : [match[1]])
    .flatMap(scheme => { const origin = mockPageOrigin(`${scheme}://${match[2]}`); return origin ? [origin] : []; });
}
export interface RuntimeMock extends MockRule { regex: string }
export function runtimeMocks(state: AppState, pageOrigin: string): RuntimeMock[] {
  const origin = mockPageOrigin(pageOrigin);
  if (!origin || state.mockEnabled === false) return [];
  return (state.mocks ?? []).filter(row => row.enabled && mockPageOrigins(row).includes(origin)).map(row => ({
    // Only necessary response fields cross the page boundary, never arbitrary imported keys.
    id: row.id, source: row.source, enabled: true, methods: [...row.methods], status: row.status,
    delay: row.delay, body: row.body, contentType: row.contentType, regex: patternToRegex(row.source),
  }));
}
