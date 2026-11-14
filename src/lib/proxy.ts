import type { AppState } from './model';
import { patternToRegex, HTTP_METHODS } from './rules';

export const PROXY_TYPES = ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest', 'ping', 'media', 'websocket', 'other'] as const;
export type ProxyType = typeof PROXY_TYPES[number];
export interface ProxyRule {
  id: string; source: string; target: string; enabled: boolean;
  methods: string[]; resourceTypes: ProxyType[];
}
export const createProxy = (): ProxyRule => ({ id: crypto.randomUUID(), source: '', target: '', enabled: true, methods: [], resourceTypes: [...PROXY_TYPES] });

// A target * substitutes the one wildcard in the source path (including query text).
export function proxyRedirect(rule: ProxyRule): { regex: string; redirect: chrome.declarativeNetRequest.Redirect } {
  const base = patternToRegex(rule.source);
  if (!rule.target || rule.target.length > 2048 || /[\s\x00-\x1f\x7f\\]/.test(rule.target)) throw new Error('目标应为有效的 HTTP / HTTPS URL，不能包含空白或反斜杠。');
  let target: URL;
  try { target = new URL(rule.target); } catch { throw new Error('请填写完整目标地址，例如 http://localhost:3000/app.js。'); }
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.hash) throw new Error('目标仅支持 HTTP / HTTPS，且不能包含账号、密码或片段。本地文件请通过 localhost 服务提供。');
  const pathStart = rule.source.indexOf('/', rule.source.indexOf('://') + 3);
  const path = pathStart < 0 ? '/' : rule.source.slice(pathStart);
  const targetStars = (rule.target.match(/\*/g) || []).length;
  if (targetStars && (targetStars !== 1 || (path.match(/\*/g) || []).length !== 1 || target.host.includes('*'))) throw new Error('路径映射需要来源路径与目标路径各一个 *；目标域名不能使用通配符。');
  if (targetMayMatch(rule, rule)) throw new Error('目标仍匹配来源，会造成循环重定向，请缩小来源范围。');
  if (!targetStars) return { regex: base, redirect: { url: target.href } };
  // Host wildcards are non-capturing, so the only capture is the source path wildcard.
  const hostEnd = base.indexOf('/', base.indexOf('://') + 3);
  const regex = base.slice(0, hostEnd) + base.slice(hostEnd).replace('.*', '(.*)');
  return { regex, redirect: { regexSubstitution: target.href.replace('*', '\\1') } };
}

// Prefix-overlap analysis errs on the side of rejecting ambiguous wildcard cycles.
function targetMayMatch(rule: ProxyRule, next: ProxyRule): boolean {
  const target = new URL(rule.target);
  if (!rule.target.includes('*')) return new RegExp(patternToRegex(next.source)).test(target.href);
  const authority = /^(\*|https?):\/\/([^/]+)/.exec(next.source)!;
  if (!new RegExp(patternToRegex(`${authority[1]}://${authority[2]}/*`)).test(target.origin + '/')) return false;
  const start = next.source.indexOf('/', next.source.indexOf('://') + 3);
  const sourcePath = start < 0 ? '/' : next.source.slice(start);
  const a = sourcePath.split('*')[0], b = (target.pathname + target.search).split('*')[0];
  return a.startsWith(b) || b.startsWith(a);
}

export function validateProxies(value: unknown): asserts value is ProxyRule[] {
  if (!Array.isArray(value) || value.length > 200) throw new Error('最多支持 200 条资源代理。');
  const ids = new Set<string>();
  for (const rule of value) {
    if (!rule || typeof rule.id !== 'string' || !rule.id || ids.has(rule.id) || typeof rule.source !== 'string' || typeof rule.target !== 'string' || typeof rule.enabled !== 'boolean'
      || !Array.isArray(rule.methods) || !rule.methods.every((m: string) => HTTP_METHODS.includes(m as typeof HTTP_METHODS[number]))
      || !Array.isArray(rule.resourceTypes) || !rule.resourceTypes.length || !rule.resourceTypes.every((t: ProxyType) => PROXY_TYPES.includes(t)) || new Set(rule.resourceTypes).size !== rule.resourceTypes.length) throw new Error('资源代理格式无效，请检查 URL、方法和资源类型。');
    ids.add(rule.id); proxyRedirect(rule);
  }
  // Catch cycles across rules, including wildcard path mappings.
  const active = value.filter(r => r.enabled);
  const edges = active.map(rule => active.flatMap((next, index) => targetMayMatch(rule, next) ? [index] : []));
  const visiting = new Set<number>(), visited = new Set<number>();
  function visit(index: number) {
    if (visiting.has(index)) throw new Error('代理规则之间形成循环，请修改来源或目标。');
    if (visited.has(index)) return;
    visiting.add(index); edges[index].forEach(visit); visiting.delete(index); visited.add(index);
  }
  active.forEach((_, index) => visit(index));
}
export function stateFromProxies(state: AppState, rows: ProxyRule[], enabled: boolean): AppState {
  const proxies = rows.filter(row => row.source.trim() || row.target.trim()).map(row => ({ ...row, source: row.source.trim(), target: row.target.trim() }));
  validateProxies(proxies);
  return { ...state, proxies, proxyEnabled: enabled };
}
