import test from 'node:test';
import assert from 'node:assert/strict';
import { compareJson, diffCounts, parseJsonTree } from '../src/lib/jsonTree';
import { visibleJsonRows } from '../src/components/JsonTreeView';

const diff = (left: string, right: string) => compareJson(parseJsonTree(left), parseJsonTree(right));
test('node parsing preserves large numeric tokens, duplicate keys, escaped strings and empty containers', () => {
  const root = parseJsonTree('{"id":900719925474099312345,"a":1,"a":2,"text":"\\u4e2d\\n","items":[],"empty":{}}');
  assert.equal(root.children[0].node.raw, '900719925474099312345');
  assert.deepEqual(root.children.map(entry => entry.key), ['id', 'a', 'a', 'text', 'items', 'empty']);
  assert.equal(root.children[3].node.raw, '"\\u4e2d\\n"');
  assert.equal(root.children[4].node.kind, 'array');
  assert.deepEqual(root.children[5].node.children, []);
});
test('object comparison ignores key order and matches duplicate key occurrences safely', () => {
  assert.equal(diff('{"a":1,"b":2}', '{"b":2,"a":1}').status, 'same');
  const root = diff('{"a":1,"a":2,"__proto__":3}', '{"__proto__":3,"a":1,"a":4}');
  assert.deepEqual(diffCounts(root), { added: 0, removed: 0, modified: 1 });
  assert.equal(new Set(root.children.map(child => child.id)).size, 3);
  assert.deepEqual(diffCounts(diff('{"a":1,"a":2}', '{"a":1}')), { added: 0, removed: 1, modified: 0 });
});
test('decimal comparison never rounds IDs and compares equivalent decimal and exponent spellings', () => {
  assert.equal(diff('900719925474099312345', '900719925474099312346').status, 'modified');
  for (const [left, right] of [['1.00', '1e0'], ['-0', '0'], ['1e9999', '10e9998'], ['0.001', '1e-3']]) assert.equal(diff(left, right).status, 'same');
  assert.equal(diff('1e9999', '2e9999').status, 'modified');
  assert.equal(diff('"a"', '"\\u0061"').status, 'same');
  assert.equal(diff('1', '"1"').status, 'modified');
});
test('nested differences count replacements and whole added or removed branches once', () => {
  const root = diff('{"profile":{"name":"old"},"removed":{"nested":1},"list":[1,2]}', '{"profile":{"name":"new"},"added":{"nested":1},"list":[1,3,4]}');
  assert.deepEqual(diffCounts(root), { added: 2, removed: 1, modified: 2 });
  assert.deepEqual(diffCounts(diff('{"a":1}', '[1]')), { added: 0, removed: 0, modified: 1 });
});
test('collapsed parents hide descendants on both sides and expansion keeps matching rows aligned', () => {
  const root = diff('{"user":{"id":1},"list":[1,2]}', '{"user":{"id":2},"list":[1]}');
  assert.equal(visibleJsonRows(root, () => false).rows.length, 1);
  const expanded = visibleJsonRows(root, () => true);
  assert.equal(expanded.rows.length, 9);
  assert.equal(expanded.rows.find(row => row.diff.label === '1')?.diff.right, undefined);
  assert.equal(visibleJsonRows(root, (_id, depth) => depth === 0).rows.length, 4);
});
test('node parsing rejects invalid JSON and bounds nesting, node count and visible rendering', () => {
  assert.throws(() => parseJsonTree('{bad}'), /JSON 格式错误/);
  assert.throws(() => parseJsonTree(''), /粘贴/);
  assert.throws(() => parseJsonTree('['.repeat(66) + '0' + ']'.repeat(66)), /64 层/);
  assert.throws(() => parseJsonTree(JSON.stringify(Array(20_001).fill(0))), /2 万/);
  const root = diff(JSON.stringify(Array(1200).fill(0)), JSON.stringify(Array(1200).fill(0)));
  const visible = visibleJsonRows(root, () => true);
  assert.equal(visible.rows.length, 1000); assert.equal(visible.clipped, true);
});
