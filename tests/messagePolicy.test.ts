import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeMessage, scopedMockState } from '../src/lib/messagePolicy';
import { emptyState } from '../src/lib/model';
import { createMock } from '../src/lib/networkDebug';
const ui = { id: 'test', url: 'chrome-extension://test/popup.html', origin: 'chrome-extension://test' };
const page = { id: 'test', url: 'https://app.example.com/path', origin: 'https://app.example.com', tab: { id: 1 } as chrome.tabs.Tab, frameId: 0 };

test('state access is restricted to the actual extension UI, including the options tab', () => {
  for (const type of ['state:read', 'state:save'] as const) {
    assert.deepEqual(authorizeMessage({ type }, ui, 'test'), { type });
    assert.deepEqual(authorizeMessage({ type }, { ...ui, url: 'chrome-extension://test/index.html', tab: page.tab }, 'test'), { type });
    for (const sender of [page, { ...ui, id: 'other' }, { ...ui, origin: 'null' }, { ...ui, url: 'chrome-extension://other/popup.html' }, { ...ui, url: 'chrome-extension://test/background.js' }, { ...ui, url: 'https://test/popup.html' }, { id: 'test' }]) assert.equal(authorizeMessage({ type }, sender, 'test'), undefined);
  }
});
test('Mock reads use Chrome security metadata, never message payload, and reject opaque frames', () => {
  assert.deepEqual(authorizeMessage({ type: 'mock:read', origin: 'https://victim.example.com' }, page, 'test'), { type: 'mock:read', origin: page.origin });
  for (const sender of [ui, { ...page, origin: 'null' }, { ...page, origin: undefined }, { ...page, origin: 'https://other.example.com' }, { ...page, tab: undefined }, { ...page, frameId: undefined }, { ...page, frameId: -1 }, { ...page, url: 'about:blank' }]) assert.equal(authorizeMessage({ type: 'mock:read' }, sender, 'test'), undefined);
});
test('content response contains no full state, foreign Mock, credentials or arbitrary fields', () => {
  const state = { ...emptyState(), rules: [{ headers: [{ value: 'header-secret' }] }] as never[], mocks: [
    { ...createMock(), source: 'https://api.example.com/*', pageOrigin: page.origin, body: '{"local":true}' },
    { ...createMock(), source: 'https://private.example.com/*', pageOrigin: 'https://other.example.com', body: '{"secret":"foreign-secret"}' },
  ] };
  const scoped = scopedMockState(state, page.origin);
  assert.equal(scoped.mocks?.length, 1); assert.equal(scoped.mocks?.[0].pageOrigin, page.origin);
  assert.deepEqual(scoped.rules, []); assert.doesNotMatch(JSON.stringify(scoped), /header-secret|foreign-secret|private.example/);
});
