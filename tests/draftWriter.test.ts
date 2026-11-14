import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftWriter } from '../src/lib/draftWriter';
test('failed draft write rejects the close barrier until a successful retry', async () => {
  const writer = createDraftWriter();
  await assert.rejects(writer.save(async () => { throw new Error('quota exceeded'); }));
  await assert.rejects(writer.flush(), /quota exceeded/);
  await writer.save(async () => {}); await writer.flush();
});
test('draft writes preserve order and flush waits for the newest pending edit', async () => {
  const writer = createDraftWriter(); const calls: string[] = []; let release = () => {};
  const first = writer.save(() => new Promise<void>(resolve => { calls.push('first'); release = resolve; }));
  const last = writer.save(async () => { calls.push('last'); });
  await Promise.resolve(); assert.deepEqual(calls, ['first']);
  let complete = false; const flush = writer.flush().then(() => { complete = true; });
  await Promise.resolve(); assert.equal(complete, false); release(); await Promise.all([first, last, flush]); assert.deepEqual(calls, ['first', 'last']);
});
