import { parseJsonTree, type JsonNode } from './jsonTree';

export function timestampDate(value: string, unit: 'seconds' | 'milliseconds'): Date {
  if (!/^-?\d+(?:\.\d+)?$/.test(value.trim())) throw new Error('请输入有效的秒或毫秒时间戳。');
  const milliseconds = Number(value) * (unit === 'seconds' ? 1000 : 1);
  if (!Number.isFinite(milliseconds) || Math.abs(milliseconds) > 8.64e15) throw new Error('时间戳超出日期范围。');
  return new Date(milliseconds);
}
export function dateTimestamp(value: string): number {
  // Require an explicit offset; avoid silently interpreting dates in a different timezone.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) throw new Error('请使用含时区的 ISO 日期，例如 2026-11-07T20:00:00+08:00。');
  const ms = Date.parse(value);
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (!Number.isFinite(ms) || month < 1 || month > 12 || day < 1 || day > maxDay) throw new Error('日期无效。');
  return ms;
}
export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
export function decodeBase64(text: string, url = false): string {
  let normalized = text.trim();
  if (url) normalized = normalized.replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 === 1) throw new Error('Base64 格式无效。');
  if (normalized.includes('=') && normalized.length % 4) throw new Error('Base64 填充无效。');
  normalized = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(normalized), ch => ch.charCodeAt(0))); }
  catch { throw new Error('无法解码为 UTF-8 文本。'); }
}
export type Codec = 'base64' | 'unicode' | 'html';
export function encodeText(text: string, codec: Codec): string {
  if (codec === 'base64') return encodeBase64(text);
  if (codec === 'unicode') return text.split('').map(ch => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`).join('');
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return text.replace(/[&<>"']/g, ch => entities[ch]);
}
export function decodeText(text: string, codec: Codec): string {
  if (codec === 'base64') return decodeBase64(text);
  if (codec === 'unicode') {
    if (/\\u(?![a-fA-F0-9]{4})/.test(text)) throw new Error('Unicode 转义应为 \\u 加四位十六进制字符。');
    return text.replace(/\\u([a-fA-F0-9]{4})/g, (_, code: string) => String.fromCharCode(parseInt(code, 16)));
  }
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', copy: '©', reg: '®', trade: '™', euro: '€', hellip: '…', mdash: '—', ndash: '–' };
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z][a-z\d]+);/gi, (raw, entity: string) => {
    if (!entity.startsWith('#')) {
      if (entities[entity]) return entities[entity];
      if (typeof document === 'undefined') return raw;
      const decoder = document.createElement('textarea'); decoder.innerHTML = raw; return decoder.value;
    }
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    if (code > 0x10ffff || code >= 0xd800 && code <= 0xdfff) throw new Error(`HTML 字符实体无效：${raw}`);
    return String.fromCodePoint(code);
  });
}
export function decodeJwt(token: string): { header: JsonNode; payload: JsonNode; expires?: number; notBefore?: number; algorithm?: string } {
  const parts = token.trim().split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || parts.some(part => !/^[A-Za-z0-9_-]*$/.test(part))) throw new Error('请输入三段式 JWT（Header.Payload.Signature）。');
  const header = parseJsonTree(decodeBase64(parts[0], true));
  const payload = parseJsonTree(decodeBase64(parts[1], true));
  if (header.kind !== 'object' || payload.kind !== 'object') throw new Error('JWT Header 和 Payload 必须是 JSON 对象。');
  const claim = (key: string) => {
    const node = payload.children.find(entry => entry.key === key)?.node;
    return node?.kind === 'number' && Number.isFinite(Number(node.raw)) ? Number(node.raw) : undefined;
  };
  const alg = header.children.find(entry => entry.key === 'alg')?.node;
  return { header, payload, expires: claim('exp'), notBefore: claim('nbf'), algorithm: alg?.kind === 'string' ? JSON.parse(alg.raw) as string : undefined };
}
