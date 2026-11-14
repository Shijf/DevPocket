import { proxyRedirect, validateProxies } from './proxy';
import { validateNetworkRows } from './networkDebug';
import type { AppState, HeaderRule } from './model';
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
export const MAX_RULES = 200;
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const ALL_TYPES: chrome.declarativeNetRequest.ResourceType[] = [
  'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object',
  'xmlhttprequest', 'ping', 'media', 'websocket', 'other',
] as chrome.declarativeNetRequest.ResourceType[];

// A deliberately small, well-defined wildcard grammar, compiled to RE2-safe regex.
export function patternToRegex(pattern: string): string {
  if (!pattern || pattern.length > 256 || /[\s\x00-\x1f\x7f]/.test(pattern)) throw new Error('URL 规则应为 1–256 个字符，且不能包含空白。');
  const match = /^(\*|https?):\/\/(\*|\*\.[A-Za-z0-9.-]+|[A-Za-z0-9.-]+(?::\d{1,5})?)(\/[^?#]*)?(\?[^#]*)?$/.exec(pattern);
  if (!match) throw new Error('URL 格式不正确，例如 *://*.example.com/* 或 http://localhost:3000/*。');
  const [, scheme, rawHost, rawPath = '/', query = ''] = match;
  const host = rawHost.toLowerCase();
  const escape = (value: string) => value.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const hostRegex = host === '*' ? '[^/?#]+' : host.startsWith('*.')
    ? `(?:[A-Za-z0-9-]+\\.)*${escape(host.slice(2))}(?::[0-9]+)?`
    : `${escape(host)}${host.includes(':') ? '' : '(?::[0-9]+)?'}`;
  return `^${scheme === '*' ? 'https?' : scheme}://${hostRegex}${escape(rawPath + query)}$`;
}

export function validateRule(rule: HeaderRule): string | null {
  if (!rule.name.trim() || rule.name.length > 80) return '请输入规则名称，最多 80 个字符。';
  if (rule.description.length > 200) return '规则描述最多 200 个字符。';
  if (!rule.patterns.length || rule.patterns.length > 10) return '请填写 1–10 条 URL 匹配规则。';
  try { rule.patterns.forEach(patternToRegex); } catch (e) { return (e as Error).message; }
  if (!['all', 'xhr', 'navigation'].includes(rule.scope)) return '请求类型不受支持。';
  if (rule.methods.some(method => !HTTP_METHODS.includes(method as typeof HTTP_METHODS[number]))) return '请求方法不受支持。';
  if (!rule.headers.length || rule.headers.length > 30) return '请添加 1–30 个 Header。';
  const seen = new Set<string>();
  for (const header of rule.headers) {
    if (!TOKEN.test(header.name)) return 'Header 名称只能包含有效的 HTTP 字段字符，不能包含空格或中文。';
    const key = header.name.toLowerCase();
    if (seen.has(key)) return `Header ${header.name} 重复，请在同一规则中只保留一项。`;
    seen.add(key);
    if (!['set', 'remove'].includes(header.operation)) return '仅支持设置和删除 Header。';
    if (header.value.length > 4096 || /[\x00-\x08\x0a-\x1f\x7f]|[^\x00-\xff]/.test(header.value)) return 'Header 值不能包含换行、控制字符或超出 Latin-1 的字符，且最多 4096 个字符。';
  }
  return null;
}

export function validateState(value: unknown): asserts value is AppState {
  if (!value || typeof value !== 'object') throw new Error('配置不是有效的对象。');
  const state = value as AppState;
  if (state.version !== 1 || typeof state.enabled !== 'boolean' || !Number.isSafeInteger(state.revision) || state.revision < 0 || !Array.isArray(state.rules)) throw new Error('配置格式或版本不受支持。');
  if (state.rules.length > MAX_RULES) throw new Error(`最多支持 ${MAX_RULES} 条规则。`);
  if (state.proxyEnabled !== undefined && typeof state.proxyEnabled !== 'boolean') throw new Error('资源代理开关无效。');
  if (state.proxies !== undefined) validateProxies(state.proxies);
  for (const key of ['blockEnabled', 'mockEnabled'] as const) if (state[key] !== undefined && typeof state[key] !== 'boolean') throw new Error('网络工具开关无效。');
  if (state.blocks !== undefined) validateNetworkRows(state.blocks, 'blocks');
  if (state.mocks !== undefined) validateNetworkRows(state.mocks, 'mocks');
  const ids = new Set<string>();
  for (const rule of state.rules) {
    if (!rule || typeof rule.id !== 'string' || !rule.id || ids.has(rule.id) || typeof rule.enabled !== 'boolean'
      || typeof rule.name !== 'string' || typeof rule.description !== 'string' || !Array.isArray(rule.patterns)
      || !rule.patterns.every(p => typeof p === 'string') || !Array.isArray(rule.methods)
      || !rule.methods.every(m => typeof m === 'string') || !Array.isArray(rule.headers) || !Number.isFinite(rule.updatedAt)
      || rule.headers.some(h => !h || typeof h.id !== 'string' || typeof h.name !== 'string' || typeof h.value !== 'string')) throw new Error('规则格式无效或规则 ID 重复。');
    ids.add(rule.id);
    const headerIds = rule.headers.map(h => h.id);
    if (headerIds.some(id => !id) || new Set(headerIds).size !== headerIds.length) throw new Error('Header ID 无效或重复。');
    const error = validateRule(rule);
    if (error) throw new Error(`${rule.name || '未命名规则'}：${error}`);
  }
}

export function compileRules(state: AppState): chrome.declarativeNetRequest.Rule[] {
  validateState(state);

  if ((state.enabled ? state.rules.filter(r => r.enabled).reduce((total, r) => total + r.patterns.length, 0) : 0) + (state.proxyEnabled !== false ? (state.proxies ?? []).filter(r => r.enabled).length : 0) > 1000) throw new Error('已启用规则的 URL 总数不能超过 1000，请减少匹配范围。');
  let id = 1;
  const headers = state.rules.flatMap((rule, index) => !state.enabled || !rule.enabled ? [] : rule.patterns.map(pattern => ({
    id: id++, priority: MAX_RULES - index,
    action: {
      type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
      requestHeaders: rule.headers.map(h => ({ header: h.name.toLowerCase(), operation: h.operation as chrome.declarativeNetRequest.HeaderOperation, ...(h.operation === 'set' ? { value: h.value } : {}) })),
    },
    condition: {
      regexFilter: patternToRegex(pattern), isUrlFilterCaseSensitive: true,
      resourceTypes: rule.scope === 'xhr' ? ['xmlhttprequest'] as chrome.declarativeNetRequest.ResourceType[]
        : rule.scope === 'navigation' ? ['main_frame', 'sub_frame'] as chrome.declarativeNetRequest.ResourceType[] : ALL_TYPES,
      ...(rule.methods.length ? { requestMethods: rule.methods.map(m => m.toLowerCase()) as chrome.declarativeNetRequest.RequestMethod[] } : {}),
    },
  })));
  const proxies = (state.proxies ?? []).flatMap((rule, index) => state.proxyEnabled === false || !rule.enabled ? [] : [{
    id: id++, priority: 1000 + MAX_RULES - index,
    action: { type: 'redirect' as chrome.declarativeNetRequest.RuleActionType, redirect: proxyRedirect(rule).redirect },
    condition: {
      regexFilter: proxyRedirect(rule).regex, isUrlFilterCaseSensitive: true,
      resourceTypes: rule.resourceTypes as chrome.declarativeNetRequest.ResourceType[],
      ...(rule.methods.length ? { requestMethods: rule.methods.map(m => m.toLowerCase()) as chrome.declarativeNetRequest.RequestMethod[] } : {}),
    },
  }]);
  const blocks = (state.blocks ?? []).flatMap((rule, index) => state.blockEnabled === false || !rule.enabled ? [] : [{
    id: id++, priority: 2000 + MAX_RULES - index,
    action: { type: 'block' as chrome.declarativeNetRequest.RuleActionType },
    condition: { regexFilter: patternToRegex(rule.source), isUrlFilterCaseSensitive: true,
      resourceTypes: rule.resourceTypes as chrome.declarativeNetRequest.ResourceType[],
      ...(rule.methods.length ? { requestMethods: rule.methods.map(m => m.toLowerCase()) as chrome.declarativeNetRequest.RequestMethod[] } : {}) },
  }]);
  if (headers.length + proxies.length + blocks.length > 1000) throw new Error('已启用网络规则不能超过 1000 条。');
  return [...headers, ...proxies, ...blocks];
}

export function matchesUrl(rule: HeaderRule, url: string): boolean {
  try { const parsed = new URL(url); parsed.hash = ''; parsed.hostname = parsed.hostname.toLowerCase(); return rule.patterns.some(p => new RegExp(patternToRegex(p)).test(parsed.href)); } catch { return false; }
}

export function matchesSite(rule: HeaderRule, url: string): boolean {
  try {
    const site = new URL(url).origin + '/';
    return rule.patterns.some(pattern => {
      const hostPattern = /^(\*|https?):\/\/([^/]+)/.exec(pattern);
      return hostPattern ? new RegExp(patternToRegex(`${hostPattern[1]}://${hostPattern[2]}/*`)).test(site) : false;
    });
  } catch { return false; }
}

export function parseImport(text: string): AppState {
  if (text.length > 2_000_000) throw new Error('配置文件过大，最多 2 MB。');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('文件内容不是有效的 JSON。'); }
  validateState(value);
  return value;
}
