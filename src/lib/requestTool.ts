export interface RequestInput { url: string; method: string; headers: string; body: string }
export interface RequestResult { status: number; statusText: string; url: string; headers: string; body: string; bytes: number; elapsed: number; truncated: boolean }
export function prepareRequest(input: RequestInput): { url: string; init: RequestInit } {
  let url: URL; try { url = new URL(input.url); } catch { throw new Error('请输入完整的 HTTP／HTTPS URL。'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('仅支持不含用户名密码的 HTTP／HTTPS URL。');
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(input.method)) throw new Error('请求方法无效。');
  if (input.body.length > 500000 || input.headers.length > 20000) throw new Error('正文最多 50 万字符，Header 最多 2 万字符。');
  const headers = new Headers();
  for (const line of input.headers.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const colon = line.indexOf(':'); if (colon < 1) throw new Error('每行 Header 格式为 Key: Value。');
    const key = line.slice(0, colon).trim(), value = line.slice(colon + 1).trim();
    if (/^(cookie|host|content-length|origin|referer|connection|accept-encoding|proxy-.*|sec-.*)$/i.test(key)) throw new Error(`${key} 由浏览器管理，不能手动设置。`);
    try { headers.append(key, value); } catch { throw new Error(`Header ${key} 的名称或值无效。`); }
  }
  if (['GET', 'HEAD'].includes(input.method) && input.body) throw new Error('GET／HEAD 不支持请求正文，请清空正文或更换方法。');
  return { url: url.href, init: { method: input.method, headers, body: ['GET', 'HEAD'].includes(input.method) ? undefined : input.body || undefined, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' } };
}
export async function sendRequest(input: RequestInput, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<RequestResult> {
  const { url, init } = prepareRequest(input), start = performance.now();
  signal.throwIfAborted();
  const response = await fetcher(url, { ...init, signal });
  const limit = 1024 * 1024, chunks: Uint8Array[] = []; let bytes = 0, truncated = false;
  const reader = response.body?.getReader();
  if (reader) {
    try {
      while (true) {
        signal.throwIfAborted(); const chunk = await reader.read(); if (chunk.done) break;
        const remaining = limit - bytes;
        chunks.push(chunk.value.slice(0, remaining)); bytes += Math.min(chunk.value.length, remaining);
        if (chunk.value.length > remaining) { truncated = true; await reader.cancel(); break; }
      }
    } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
    finally { reader.releaseLock(); }
  }
  const data = new Uint8Array(bytes); let offset = 0; for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
  signal.throwIfAborted();
  const type = response.headers.get('content-type') || '';
  const binary = /^(image|audio|video|font)\/|application\/(octet-stream|pdf|zip)/i.test(type);
  return { status: response.status, statusText: response.statusText, url: response.url || url, headers: [...response.headers].map(([key, value]) => `${key}: ${value}`).join('\n'), body: binary ? `二进制响应（${type}），已读取 ${bytes} 字节。` : new TextDecoder().decode(data), bytes, elapsed: Math.round(performance.now() - start), truncated };
}
