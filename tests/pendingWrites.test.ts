import test from 'node:test';
import assert from 'node:assert/strict';
import { flushPendingWrites, registerPendingWrites } from '../src/lib/pendingWrites';
test('close waits for every registered writer and ignores unmounted writers', async () => {
  let finish!: () => void;
  const slow = new Promise<void>(resolve => { finish = resolve; });
  let fastSaved = false, closed = false;
  const stopSlow = registerPendingWrites(() => slow);
  const stopFast = registerPendingWrites(async () => { fastSaved = true; });
  const removed = registerPendingWrites(async () => { throw Error('unmounted'); }); removed();
  try {
    const closing = flushPendingWrites().then(() => { closed = true; });
    await Promise.resolve();
    assert.equal(fastSaved, true); assert.equal(closed, false);
    finish(); await closing; assert.equal(closed, true);
  } finally { stopSlow(); stopFast(); }
});
