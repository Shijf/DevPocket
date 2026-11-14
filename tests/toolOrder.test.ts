import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderWriter, moveTool, normalizeToolOrder } from '../src/lib/toolOrder';

test('saved tool order removes obsolete/duplicate IDs and appends newly available tools', () => {
  const known = ['storage', 'timestamp', 'jwt', 'regex'];
  assert.deepEqual(normalizeToolOrder(['jwt', 'removed-tool', 'storage', 'jwt', 123], known), ['jwt', 'storage', 'timestamp', 'regex']);
  for (const value of [null, undefined, {}, 'invalid']) assert.deepEqual(normalizeToolOrder(value, known), known);
  assert.deepEqual(normalizeToolOrder(['headers', 'proxy', 'json', 'url'], known), known);
});
test('moving a tool preserves every other relative position and handles grid boundaries', () => {
  const order = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveTool(order, 'c', 0), ['c', 'a', 'b', 'd']);
  assert.deepEqual(moveTool(order, 'a', 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveTool(order, 'b', 99), ['a', 'c', 'd', 'b']);
  assert.deepEqual(moveTool(order, 'a', -1), order);
  assert.deepEqual(moveTool(order, 'missing', 0), order);
  assert.deepEqual(moveTool(order, 'b', NaN), order);
  assert.deepEqual(order, ['a', 'b', 'c', 'd']);
});
test('legacy More-only order preserves original shortcuts while unified order can replace them', () => {
  const shortcuts = ['headers', 'proxy', 'json', 'url'];
  const known = [...shortcuts, 'storage', 'timestamp', 'jwt', 'page'];
  assert.deepEqual(normalizeToolOrder(['jwt', 'storage', 'jwt', 'removed'], known, shortcuts), [...shortcuts, 'jwt', 'storage', 'timestamp', 'page']);
  const customized = ['page', 'jwt', 'storage', 'timestamp', 'url', 'json', 'proxy', 'headers'];
  assert.deepEqual(normalizeToolOrder(customized, known, shortcuts), customized);
  assert.deepEqual(normalizeToolOrder(null, known, shortcuts), known);
  const moved = moveTool(known, 'page', 0);
  assert.deepEqual(moved.slice(0, 4), ['page', 'headers', 'proxy', 'json']);
  assert.deepEqual(normalizeToolOrder([...moved, 'page', 'removed'], [...known, 'new-tool'], shortcuts), [...moved, 'new-tool']);
});
test('rapid sorting writes are serialized and closing waits for the final snapshot', async () => {
  let release!: () => void; const first = new Promise<void>(resolve => release = resolve);
  const saved: string[][] = []; let writes = 0;
  const writer = createOrderWriter(async order => { if (!writes++) await first; saved.push(order); });
  const snapshot = ['b', 'a']; writer.save(snapshot); snapshot[0] = 'mutated';
  writer.save(['a', 'b']);
  let flushed = false; const flush = writer.flush().then(() => flushed = true);
  await Promise.resolve(); assert.equal(flushed, false); release(); await flush;
  assert.deepEqual(saved, [['b', 'a'], ['a', 'b']]);
});
test('failed order storage blocks flush until a retry succeeds without poisoning the queue', async () => {
  let fail = true; const saved: string[][] = [];
  const writer = createOrderWriter(async order => { if (fail) throw new Error('storage failed'); saved.push(order); });
  await assert.rejects(writer.save(['b', 'a']), /storage failed/);
  await assert.rejects(writer.flush(), /storage failed/);
  fail = false; await writer.save(['b', 'a']); await writer.flush(); assert.deepEqual(saved, [['b', 'a']]);
});
