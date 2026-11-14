import test from 'node:test';
import assert from 'node:assert/strict';
import { demoState } from '../src/lib/model';
import { createMock } from '../src/lib/networkDebug';
let listener: (message: unknown, sender: chrome.runtime.MessageSender, respond: (value: any) => void) => unknown;
let releaseStorage = () => {}; let secured = false; let readCount = 0, writeCount = 0;
let state = { ...demoState(), mocks: [
  { ...createMock(), source: 'https://api.example.com/*', pageOrigin: 'https://app.example.com', body: '{"local":true}' },
  { ...createMock(), source: 'https://other.example.com/*', pageOrigin: 'https://other.example.com', body: '{"secret":"foreign-secret"}' },
] };
Object.defineProperty(globalThis, 'chrome', { configurable: true, value: {
  runtime: { id: 'test', onInstalled: { addListener() {} }, onStartup: { addListener() {} }, onMessage: { addListener(fn: typeof listener) { listener = fn; } } },
  storage: { local: { setAccessLevel: (options: unknown) => { assert.deepEqual(options, { accessLevel: 'TRUSTED_CONTEXTS' }); return new Promise<void>(resolve => { releaseStorage = () => { secured = true; resolve(); }; }); },
    get: async (key: string) => { assert.equal(secured, true); readCount++; return { [key]: state }; }, set: async (value: Record<string, typeof state>) => { writeCount++; state = Object.values(value)[0]; } }, onChanged: { addListener() {} } },
  declarativeNetRequest: { getDynamicRules: async () => [], updateDynamicRules: async () => {}, isRegexSupported: async () => ({ isSupported: true }) },
  action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setTitle: async () => {} },
  tabs: { query: async () => [] },
} });
await import('../src/background');
const ui = { id: 'test', url: 'chrome-extension://test/popup.html', origin: 'chrome-extension://test' };
const page = { id: 'test', url: 'https://app.example.com/', origin: 'https://app.example.com', tab: { id: 1 } as chrome.tabs.Tab, frameId: 0 };
const send = (message: unknown, sender = ui) => new Promise<any>(resolve => listener(message, sender, resolve));
test('worker secures storage before serving any configuration', async () => {
  const pending = send({ type: 'state:read' });
  await Promise.resolve(); assert.equal(readCount, 0); releaseStorage();
  const response = await pending; assert.equal(response.ok, true); assert.equal(readCount, 1);
});
test('worker rejects full-state read and save from content scripts without accessing storage', async () => {
  const before = readCount;
  for (const type of ['state:read', 'state:save']) { const response = await send({ type, state }, page); assert.equal(response.ok, false); assert.equal(response.state, undefined); }
  assert.equal(readCount, before); assert.equal(writeCount, 0);
});
test('worker Mock response is scoped to browser origin even if the page requests a foreign origin', async () => {
  const response = await send({ type: 'mock:read', origin: 'https://other.example.com' }, page);
  assert.equal(response.ok, true); assert.deepEqual(response.state.rules, []); assert.equal(response.state.mocks.length, 1);
  assert.doesNotMatch(JSON.stringify(response), /foreign-secret|feature\/swimlane/);
  const unrelated = await send({ type: 'mock:read' }, { ...page, url: 'https://unrelated.example/', origin: 'https://unrelated.example' });
  assert.deepEqual(unrelated.state.mocks, []);
  const opaque = await send({ type: 'mock:read' }, { ...page, origin: 'null' }); assert.equal(opaque.ok, false);
});
test('authorized extension UI still saves with revision checking', async () => {
  const response = await send({ type: 'state:save', state }); assert.equal(response.ok, true); assert.equal(writeCount, 1);
  const stale = await send({ type: 'state:save', state: { ...state, revision: state.revision - 1 } }); assert.equal(stale.ok, false); assert.equal(writeCount, 1);
});
