import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, type EngineAdapter } from '../src/lib/engine';
import { createRule, emptyState, type AppState } from '../src/lib/model';
import { compileRules } from '../src/lib/rules';
import { createBlock, createMock } from '../src/lib/networkDebug';

function fixture() {
  let stored: AppState = emptyState();
  let active: chrome.declarativeNetRequest.Rule[] = [];
  const flags = { updateFails: false, writeFails: false, regexSupported: true };
  const adapter: EngineAdapter = {
    read: async () => structuredClone(stored),
    write: async value => { if (flags.writeFails) throw new Error('storage failed'); stored = structuredClone(value); },
    getRules: async () => structuredClone(active),
    updateRules: async rules => { if (flags.updateFails) throw new Error('browser rejected'); active = structuredClone(rules); },
    supportsRegex: async () => flags.regexSupported,
  };
  const rule = createRule(); rule.name = 'Test'; rule.headers[0].name = 'x-test'; rule.headers[0].value = 'hello';
  const next = { ...stored, rules: [rule] };
  return { engine: createEngine(adapter), flags, next, stored: () => stored, active: () => active };
}
test('save compiles headers before persisting and advances revision', async () => {
  const f = fixture(); const saved = await f.engine.save(f.next);
  assert.equal(saved.revision, 1); assert.deepEqual(f.active(), compileRules(saved)); assert.deepEqual(f.stored(), saved);
});
test('browser rejection leaves config unchanged', async () => {
  const f = fixture(); f.flags.updateFails = true; await assert.rejects(f.engine.save(f.next), /browser rejected/);
  assert.deepEqual(f.stored(), emptyState()); assert.deepEqual(f.active(), []);
});
test('failed storage rolls effective rules back to previous state', async () => {
  const f = fixture(); const first = await f.engine.save(f.next); const before = f.active();
  f.flags.writeFails = true;
  await assert.rejects(f.engine.save({ ...first, enabled: false }), /storage failed/);
  assert.deepEqual(f.active(), before); assert.equal(f.stored().enabled, true); assert.equal(f.stored().revision, 1);
});
test('stale windows cannot overwrite a newer save', async () => {
  const f = fixture(); await f.engine.save(f.next); await assert.rejects(f.engine.save({ ...f.next, enabled: false }), /其他窗口/);
  assert.equal(f.stored().enabled, true);
});
test('concurrent writes are serialized and rejected when stale', async () => {
  const f = fixture(); const result = await Promise.allSettled([f.engine.save(f.next), f.engine.save({ ...f.next, enabled: false })]);
  assert.equal(result[0].status, 'fulfilled'); assert.equal(result[1].status, 'rejected'); assert.equal(f.stored().revision, 1);
});
test('one failed job does not poison the message queue', async () => {
  const f = fixture(); f.flags.updateFails = true; await assert.rejects(f.engine.save(f.next));
  f.flags.updateFails = false; const state = await f.engine.save(f.next); assert.equal(state.revision, 1);
});
test('unsupported regex is rejected before browser or storage writes', async () => {
  const f = fixture(); f.flags.regexSupported = false; await assert.rejects(f.engine.save(f.next), /过于复杂/);
  assert.deepEqual(f.active(), []); assert.deepEqual(f.stored(), emptyState());
});
test('startup restore reapplies persisted config without revising it', async () => {
  const f = fixture(); const saved = await f.engine.save(f.next); const restored = await f.engine.restore();
  assert.deepEqual(restored, saved); assert.deepEqual(f.active(), compileRules(saved));
});
test('block and Mock commits share revision checks and rollback without changing other tools', async () => {
  const f = fixture(); const saved = await f.engine.save({ ...f.next, blocks: [{ ...createBlock(), source: '*://blocked.example/*' }], mocks: [{ ...createMock(), source: '*://mocked.example/*' }] });
  assert.equal(f.active().filter(rule => rule.action.type === 'block').length, 1);
  assert.equal(new Set(f.active().map(rule => rule.id)).size, f.active().length);
  const before = f.active(); f.flags.writeFails = true;
  await assert.rejects(f.engine.save({ ...saved, blockEnabled: false, mockEnabled: false }), /storage failed/);
  assert.deepEqual(f.active(), before); assert.deepEqual(f.stored().mocks, saved.mocks); assert.deepEqual(f.stored().rules, f.next.rules);
});
