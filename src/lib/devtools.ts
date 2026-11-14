export const MAX_TOOL_TEXT = 500_000;
export function checkTextSize(text: string) {
  if (text.length > MAX_TOOL_TEXT) throw new Error('内容过长，最多支持 50 万个字符。');
}
export function formatJson(text: string, compact = false): string {
  checkTextSize(text);
  const source = text.trim();
  if (!source) throw new Error('请先粘贴 JSON。');
  try { JSON.parse(source); } catch (error) { throw new Error(`JSON 格式错误：${(error as Error).message}`); }
  // Keep original number and string tokens: no rounding of large IDs or loss of duplicate keys.
  const tokens = source.match(/"(?:\\.|[^"\\])*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\],:]/g)!;
  if (compact) return tokens.join('');
  let depth = 0, result = '';
  const newline = () => '\n' + '  '.repeat(depth);
  tokens.forEach((token, index) => {
    const previous = tokens[index - 1], next = tokens[index + 1];
    if (token === '{' || token === '[') {
      result += token;
      if (next !== (token === '{' ? '}' : ']')) { depth++; if (depth > 64) throw new Error('嵌套超过 64 层，请使用压缩模式查看。'); result += newline(); }
    } else if (token === '}' || token === ']') {
      if (previous !== (token === '}' ? '{' : '[')) { depth--; result += newline(); }
      result += token;
    } else if (token === ',') result += ',' + newline();
    else if (token === ':') result += ': ';
    else result += token;
  });
  return result;
}
export function parseUrl(text: string): URL {
  checkTextSize(text);
  let url: URL;
  try { url = new URL(text.trim()); } catch { throw new Error('请输入完整 URL，例如 https://example.com/path?a=1。'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL 解析支持 HTTP / HTTPS 地址。');
  return url;
}
export function updateUrlParams(text: string, entries: { key: string; value: string }[]): string {
  const url = parseUrl(text);
  const params = new URLSearchParams();
  entries.forEach(({ key, value }) => params.append(key, value));
  url.search = params.toString();
  return url.href;
}
export function codec(text: string, decode = false): string {
  checkTextSize(text);
  try { return decode ? decodeURIComponent(text) : encodeURIComponent(text); }
  catch { throw new Error(decode ? '编码不完整或不是有效的 UTF-8 百分号编码。' : '文本包含无效字符，无法编码。'); }
}
