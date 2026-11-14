import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { prepareRequest, sendRequest, type RequestInput } from '../src/lib/requestTool';
const input: RequestInput = { url: 'https://example.com/api', method: 'GET', headers: '', body: '' };
test('request validation rejects unsafe schemes, credentials, malformed headers and GET bodies', () => {
  for (const url of ['file:///tmp/a', 'javascript:alert(1)', 'https://u:p@example.com', '/api']) assert.throws(() => prepareRequest({ ...input, url }));
  for (const headers of ['missing colon', 'bad key: value', 'Cookie: token=1', 'Host: example.com', 'Sec-Fetch-Site: none']) assert.throws(() => prepareRequest({ ...input, headers }));
  assert.throws(() => prepareRequest({ ...input, body: '{}' }), /不支持/);
  assert.throws(() => prepareRequest({ ...input, method: 'TRACE' }), /无效/);
  const prepared = prepareRequest({ ...input, method: 'POST', headers: 'X-Test: one\nX-Test: two\nContent-Type: application/json', body: '{}' });
  assert.equal((prepared.init.headers as Headers).get('x-test'), 'one, two');
  assert.equal(prepared.init.credentials, 'omit'); assert.equal(prepared.init.body, '{}');
});
test('request performs real local POST, preserves status/body/headers and supports abort', async () => {
  const server = createServer((req, res) => {
    if (req.url === '/delay') { req.on('close', () => res.destroy()); return; }
    let body = ''; req.on('data', data => body += data);
    req.on('end', () => { res.writeHead(418, { 'Content-Type': 'application/json', 'X-Echo': 'yes' }); res.end(JSON.stringify({ method: req.method, body, header: req.headers['x-test'] })); });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}`;
  try {
    const result = await sendRequest({ url, method: 'POST', headers: 'X-Test: hello\nContent-Type: application/json', body: '{"ok":true}' }, new AbortController().signal);
    assert.equal(result.status, 418); assert.match(result.headers, /x-echo: yes/); assert.equal(JSON.parse(result.body).body, '{"ok":true}'); assert.equal(result.truncated, false); assert.ok(result.elapsed >= 0);
    assert.equal(JSON.parse(result.body).method, 'POST'); assert.equal(JSON.parse(result.body).header, 'hello');
    const controller = new AbortController(); const pending = sendRequest({ ...input, url: url + '/delay' }, controller.signal); controller.abort(); await assert.rejects(pending);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
test('response size is bounded, reader is cancelled, binary data is identified and pre-abort does not fetch', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(1024 * 1024 + 10).fill(65)); }, cancel() { cancelled = true; } });
  const response = await sendRequest(input, new AbortController().signal, (async () => new Response(stream)) as typeof fetch);
  assert.equal(response.bytes, 1024 * 1024); assert.equal(response.truncated, true); assert.equal(cancelled, true);
  const binary = await sendRequest(input, new AbortController().signal, (async () => new Response(new Uint8Array([0, 255]), { headers: { 'Content-Type': 'image/png' } })) as typeof fetch);
  assert.match(binary.body, /二进制响应/);
  const controller = new AbortController(); controller.abort(); let called = false;
  await assert.rejects(sendRequest(input, controller.signal, (async () => { called = true; return new Response(''); }) as typeof fetch)); assert.equal(called, false);
});
test('manual requests reject redirects instead of forwarding headers or bodies to another destination', async () => {
  let destinationHits = 0;
  const server = createServer((req, res) => {
    if (req.url === '/redirect') { res.writeHead(307, { Location: '/destination' }); res.end(); }
    else { destinationHits++; res.end('unexpected'); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  try {
    await assert.rejects(sendRequest({ url: `http://127.0.0.1:${address.port}/redirect`, method: 'POST', headers: 'Authorization: Bearer test-only', body: 'private-body' }, new AbortController().signal));
    assert.equal(destinationHits, 0);
    const request = prepareRequest(input); assert.equal(request.init.redirect, 'error'); assert.equal(request.init.referrerPolicy, 'no-referrer');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
