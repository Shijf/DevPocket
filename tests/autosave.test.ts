import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAutosaver } from '../src/lib/autosave';

test('rapid edits during an in-flight save coalesce to the latest snapshot', async () => {
  const values: number[] = [];
  let release!: () => void;
  const first = new Promise<void>(resolve => { release = resolve; });
  const saver = createAutosaver<number>(async value => { values.push(value); if (value === 1) await first; });
  const pending = saver.enqueue(1); saver.enqueue(2); saver.enqueue(3); release(); await pending;
  assert.deepEqual(values, [1, 3]);
});
test('a failed save does not strand subsequent input', async () => {
  const values: number[] = [];
  const saver = createAutosaver<number>(async value => { values.push(value); if (value === 1) throw new Error('validation'); });
  const pending = saver.enqueue(1); saver.enqueue(2); await pending;
  await saver.enqueue(3); assert.deepEqual(values, [1, 2, 3]);
});
test('flush waits for the newest snapshot before export', async () => {
  let value = '';
  const saver = createAutosaver<string>(async next => { await Promise.resolve(); value = next; });
  saver.enqueue('old'); saver.enqueue('new'); await saver.flush(); assert.equal(value, 'new');
});
