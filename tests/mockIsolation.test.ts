import test from 'node:test';
import assert from 'node:assert/strict';
import { createMock, runtimeMocks, mockPageOrigins, validateNetworkRows } from '../src/lib/networkDebug';
import { emptyState } from '../src/lib/model';
import { installMockBridge } from '../src/lib/mockBridge';
import { MOCK_EVENT, MOCK_READY } from '../src/lib/mockRuntime';
import { setImmediate } from 'node:timers/promises';

const privateRule = { ...createMock(), source: 'https://api.example.com/private/*', pageOrigin: 'https://app.example.com', body: '{"secret":"private-body"}' };
const state = { ...emptyState(), mocks: [privateRule] };

test('explicit page scope permits cross-origin API only on the exact authorized page origin', () => {
  const rows = runtimeMocks(state, 'https://APP.example.com:443');
  assert.equal(rows.length, 1); assert.equal(rows[0].body, privateRule.body);
  for (const origin of ['https://api.example.com', 'https://unrelated.example', 'https://sub.app.example.com', 'http://app.example.com', 'https://app.example.com:8443', 'https://app.example.com.evil.test', 'null', 'about:blank', 'file:///tmp/a', 'https://app.example.com/path', 'https://app.example.com@evil.test']) {
    assert.deepEqual(runtimeMocks(state, origin), [], origin);
  }
  assert.deepEqual(runtimeMocks({ ...state, mockEnabled: false }, 'https://app.example.com'), []);
  assert.deepEqual(runtimeMocks({ ...state, mocks: [{ ...privateRule, enabled: false }] }, 'https://app.example.com'), []);
});

test('legacy exact-host rules use default or specified ports; wildcard-host rules fail closed', () => {
  const legacy = { ...createMock(), source: '*://EXAMPLE.com/api/*' }; delete legacy.pageOrigin;
  assert.deepEqual(mockPageOrigins(legacy), ['http://example.com', 'https://example.com']);
  assert.equal(runtimeMocks({ ...state, mocks: [legacy] }, 'https://example.com').length, 1);
  assert.equal(runtimeMocks({ ...state, mocks: [legacy] }, 'https://example.com:8443').length, 0);
  assert.deepEqual(mockPageOrigins({ ...legacy, source: 'http://localhost:3000/*' }), ['http://localhost:3000']);
  for (const source of ['*://*/*', '*://*.example.com/*']) {
    const rule = { ...legacy, source };
    validateNetworkRows([rule], 'mocks'); // Old configurations remain readable, not broadcast.
    assert.deepEqual(mockPageOrigins(rule), []);
    assert.deepEqual(runtimeMocks({ ...state, mocks: [rule] }, 'https://example.com'), []);
    assert.equal(runtimeMocks({ ...state, mocks: [{ ...rule, pageOrigin: 'https://example.com' }] }, 'https://example.com').length, 1);
  }
});

test('scope validation rejects broad, credential-bearing, malformed or non-origin values', () => {
  for (const pageOrigin of ['*', '*://example.com', 'https://*.example.com', 'https://app.example.com/path', 'https://user:pass@app.example.com', 'https://app.example.com?q=1', 'https://app.example.com#x', ' https://app.example.com', 'https://app.example.com\\evil', 'file:///tmp', 'null', 7]) {
    assert.throws(() => validateNetworkRows([{ ...privateRule, pageOrigin }], 'mocks'), String(pageOrigin));
  }
  validateNetworkRows([{ ...privateRule, pageOrigin: 'https://APP.example.com:443/' }], 'mocks');
});

test('page payload excludes unrelated rules and arbitrary imported fields', () => {
  const rows = runtimeMocks({ ...state, mocks: [{ ...privateRule, extraSecret: 'not-for-the-page' } as typeof privateRule, { ...privateRule, id: 'other', pageOrigin: 'https://other.example.com', body: '{"secret":"other-site"}' }] }, 'https://app.example.com');
  assert.equal(rows.length, 1);
  assert.doesNotMatch(JSON.stringify(rows), /extraSecret|not-for-the-page|other-site|pageOrigin/);
});

test('bridge ready events cannot spoof an origin; changes clear revoked configuration', async () => {
  const target = new EventTarget(); const events: string[] = [];
  target.addEventListener(MOCK_EVENT, event => events.push((event as CustomEvent<string>).detail));
  let current = state; let origin = 'https://unrelated.example'; let notify = () => {};
  const dispose = installMockBridge(target, () => origin, async () => current, callback => { notify = callback; return () => {}; });
  await setImmediate(); assert.equal(events.at(-1), '[]');
  target.dispatchEvent(new CustomEvent(MOCK_READY, { detail: { origin: privateRule.pageOrigin, url: privateRule.source } }));
  await setImmediate(); assert.equal(events.at(-1), '[]');
  origin = 'https://app.example.com'; notify(); await setImmediate();
  assert.equal(JSON.parse(events.at(-1)!)[0].body, privateRule.body);
  current = { ...state, mocks: [] }; notify(); await setImmediate(); assert.equal(events.at(-1), '[]');
  current = state; notify(); await setImmediate();
  current = { ...state, mockEnabled: false }; notify(); await setImmediate(); assert.equal(events.at(-1), '[]');
  const count = events.length; dispose(); target.dispatchEvent(new Event(MOCK_READY)); await setImmediate(); assert.equal(events.length, count);
});

test('bridge discards stale reads and clears configs on storage or validation failure', async () => {
  const target = new EventTarget(); const events: string[] = []; let notify = () => {};
  target.addEventListener(MOCK_EVENT, event => events.push((event as CustomEvent<string>).detail));
  const pending: { resolve: (value: unknown) => void; reject: (error: Error) => void }[] = [];
  const dispose = installMockBridge(target, () => 'https://app.example.com', () => new Promise((resolve, reject) => pending.push({ resolve, reject })), callback => { notify = callback; return () => {}; });
  notify(); pending[1].resolve({ ...state, mocks: [] }); await setImmediate();
  pending[0].resolve(state); await setImmediate(); assert.deepEqual(events, ['[]']);
  notify(); pending[2].resolve(state); await setImmediate(); assert.match(events.at(-1)!, /private-body/);
  notify(); pending[3].reject(new Error('storage unavailable')); await setImmediate(); assert.equal(events.at(-1), '[]');
  notify(); pending[4].resolve({ ...state, mocks: [{ ...privateRule, status: 0 }] }); await setImmediate(); assert.equal(events.at(-1), '[]');
  dispose();
});
