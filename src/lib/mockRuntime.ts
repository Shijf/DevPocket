import { mockMatches } from './mockMatch';
import type { RuntimeMock } from './networkDebug';
export const MOCK_EVENT = 'devpocket-tools:mock-config';
export const MOCK_READY = 'devpocket-tools:mock-ready';
export function findMock(rows: RuntimeMock[], url: string, method: string): RuntimeMock | undefined {
  try { const parsed = new URL(url); parsed.hash = ''; parsed.hostname = parsed.hostname.toLowerCase(); return rows.find(row => row.enabled && (!row.methods.length || row.methods.includes(method.toUpperCase())) && mockMatches(row.source, parsed)); }
  catch { return undefined; }
}
export function waitMock(delay: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const aborted = () => { clearTimeout(timer); signal?.removeEventListener('abort', aborted); reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', aborted); resolve(); }, delay);
    if (signal?.aborted) aborted(); else signal?.addEventListener('abort', aborted, { once: true });
  });
}
export function mockBody(rule: RuntimeMock, method: string): string | null {
  return method.toUpperCase() === 'HEAD' || [204, 205, 304].includes(rule.status) ? null : rule.body;
}
const statusText = (status: number) => ({ 200: 'OK', 201: 'Created', 204: 'No Content', 304: 'Not Modified', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 500: 'Internal Server Error', 503: 'Service Unavailable' }[status] ?? 'Mock Response');

// Runs in the page's MAIN world. It does not read extension storage or send privileged messages.
export function installMockRuntime(target: Window & typeof globalThis) {
  let rows: RuntimeMock[] = [];
  let teardown: (() => void) | undefined;
  target.addEventListener(MOCK_EVENT, event => {
    try { const data: unknown = JSON.parse((event as CustomEvent<string>).detail);
      if (!Array.isArray(data) || data.length > 100) return;
      // This channel is visible to the page: accept only bounded response configs, never executable code.
      if (!data.every(row => row && typeof row.source === 'string' && row.source.length <= 256 && typeof row.regex === 'string' && row.regex.length <= 2048 && typeof row.body === 'string' && row.body.length <= 100000 && typeof row.enabled === 'boolean' && Array.isArray(row.methods) && row.methods.every((m: unknown) => typeof m === 'string') && Number.isInteger(row.status) && row.status >= 200 && row.status <= 599 && Number.isInteger(row.delay) && row.delay >= 0 && row.delay <= 30000 && typeof row.contentType === 'string' && !/[\r\n]/.test(row.contentType))) return;
      rows = data as RuntimeMock[];
      if (rows.length && !teardown) teardown = activate();
      else if (!rows.length && teardown) { teardown(); teardown = undefined; }
    } catch { /* Ignore malformed page events. */ }
  });
  function activate() {
    const nativeFetch = target.fetch;
    const patchedFetch: typeof fetch = async function(input: RequestInfo | URL, init?: RequestInit) {
      const raw = input instanceof target.Request ? input.url : String(input);
      const url = new URL(raw, target.location.href).href;
      const method = init?.method ?? (input instanceof target.Request ? input.method : 'GET');
      const rule = findMock(rows, url, method);
      if (!rule) return nativeFetch.call(target, input, init);
      const request = new target.Request(input, init);
      await waitMock(rule.delay, request.signal);
      const response = new target.Response(mockBody(rule, method), { status: rule.status, statusText: statusText(rule.status), headers: { 'Content-Type': rule.contentType, 'X-DevPocket-Mock': 'true' } });
      Object.defineProperty(response, 'url', { value: url });
      return response;
    };
    const NativeXHR = target.XMLHttpRequest;
    class MockXHR extends NativeXHR {
      private mock?: RuntimeMock;
      private mockUrl = '';
      private mockMethod = 'GET';
      private state = 0;
      private code = 0;
      private text = '';
      private controller?: AbortController;
      private sent = false;
      constructor() {
        super();
        for (const key of ['readyState', 'status', 'statusText', 'responseText', 'response', 'responseURL', 'responseXML'] as const) {
          const nativeGetter = Object.getOwnPropertyDescriptor(NativeXHR.prototype, key)?.get;
          Object.defineProperty(this, key, { configurable: true, get: () => {
            if (!this.mock) return nativeGetter?.call(this);
            if (key === 'readyState') return this.state;
            if (key === 'status') return this.code;
            if (key === 'statusText') return this.code ? statusText(this.code) : '';
            if (key === 'responseURL') return this.state >= 2 ? this.mockUrl : '';
            if (key === 'responseXML') return null;
            if (key === 'responseText') { if (this.responseType && this.responseType !== 'text') throw new DOMException('responseText requires text responseType', 'InvalidStateError'); return this.state >= 3 ? this.text : ''; }
            if (this.state !== 4) return this.responseType === '' || this.responseType === 'text' ? '' : null;
            if (this.responseType === 'json') { try { return JSON.parse(this.text); } catch { return null; } }
            if (this.responseType === 'arraybuffer') return new TextEncoder().encode(this.text).buffer;
            if (this.responseType === 'blob') return new Blob([this.text], { type: this.mock.contentType });
            return this.text;
          } });
        }
      }
      override open(method: string, url: string | URL, async = true, username?: string | null, password?: string | null) {
        this.controller?.abort(); this.sent = false;
        this.mockUrl = new URL(String(url), target.location.href).href; this.mockMethod = method.toUpperCase();
        this.mock = async ? findMock(rows, this.mockUrl, this.mockMethod) : undefined;
        this.state = 1; this.code = 0; this.text = '';
        super.open(method, url, async, username, password);
      }
      private emit(type: string) { this.dispatchEvent(type === 'readystatechange' ? new Event(type) : new ProgressEvent(type)); }
      private ready(state: number) { this.state = state; this.emit('readystatechange'); }
      override send(body?: Document | XMLHttpRequestBodyInit | null) {
        if (!this.mock) return super.send(body);
        if (this.state !== 1 || this.sent) throw new DOMException('Request already sent or not opened', 'InvalidStateError');
        this.sent = true;
        const rule = this.mock, controller = new AbortController(); this.controller = controller;
        let timedOut = false;
        const timer = this.timeout ? setTimeout(() => { timedOut = true; controller.abort(); }, this.timeout) : undefined;
        this.emit('loadstart');
        void waitMock(rule.delay, controller.signal).then(() => {
          if (this.controller !== controller) return;
          const stillActive = () => this.controller === controller && !controller.signal.aborted;
          this.code = rule.status; this.ready(2); if (!stillActive()) return;
          this.text = mockBody(rule, this.mockMethod) ?? ''; this.ready(3); if (!stillActive()) return;
          this.emit('progress'); if (!stillActive()) return;
          this.ready(4); if (!stillActive()) return;
          this.emit('load'); if (!stillActive()) return;
          this.emit('loadend');
        }, () => {
          if (this.controller !== controller) return;
          this.code = 0; this.text = ''; this.ready(4); this.emit(timedOut ? 'timeout' : 'abort'); this.emit('loadend'); this.state = 0;
        }).finally(() => { clearTimeout(timer); if (this.controller === controller) this.controller = undefined; });
      }
      override abort() {
        if (!this.mock) return super.abort();
        if (this.controller && this.state >= 2) { const controller = this.controller; this.controller = undefined; controller.abort(); this.code = 0; this.text = ''; this.ready(4); this.emit('abort'); this.emit('loadend'); this.state = 0; }
        else if (this.controller) this.controller.abort(); else { this.code = 0; this.text = ''; this.state = 0; }
      }
      override getResponseHeader(name: string): string | null {
        if (!this.mock) return super.getResponseHeader(name);
        if (this.state < 2 || !this.code) return null;
        return name.toLowerCase() === 'content-type' ? this.mock.contentType : name.toLowerCase() === 'x-devpocket-mock' ? 'true' : null;
      }
      override getAllResponseHeaders() { return !this.mock ? super.getAllResponseHeaders() : this.state >= 2 && this.code ? `content-type: ${this.mock.contentType}\r\nx-devpocket-mock: true\r\n` : ''; }
    }
    try { target.fetch = patchedFetch; target.XMLHttpRequest = MockXHR; }
    catch (error) { if (target.fetch === patchedFetch) target.fetch = nativeFetch; throw error; }
    return () => {
      // Respect wrappers deliberately installed by the site after activation.
      if (target.fetch === patchedFetch) target.fetch = nativeFetch;
      if (target.XMLHttpRequest === MockXHR) target.XMLHttpRequest = NativeXHR;
    };
  }
  target.dispatchEvent(new Event(MOCK_READY));
}
