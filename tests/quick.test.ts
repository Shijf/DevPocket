import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRule, emptyState } from '../src/lib/model';
import { quickRule, QUICK_RULE_ID, saveQuickRule, createQuickRow, rowsFromState, stateFromRows } from '../src/lib/quick';
import { compileRules } from '../src/lib/rules';

test('simple popup defaults to all HTTP/HTTPS requests', () => {
  const state = emptyState(); const quick = quickRule(state);
  assert.deepEqual(quick.patterns, ['*://*/*']); assert.equal(state.rules.length, 0);
  quick.headers[0].name = 'x-test'; quick.headers[0].value = 'hello';
  const next = saveQuickRule(state, quick);
  assert.equal(next.rules[0].id, QUICK_RULE_ID);
  assert.equal(compileRules(next)[0].action.requestHeaders?.[0].value, 'hello');
});
test('quick saves preserve existing detailed rules and their settings', () => {
  const other = createRule(); other.name = 'Existing'; other.headers[0].name = 'x-existing';
  const state = { ...emptyState(), rules: [other] };
  const quick = quickRule(state); quick.headers[0].name = 'x-test';
  const next = saveQuickRule(state, quick); assert.deepEqual(next.rules[1], other);
  quick.patterns = ['https://example.com/api/*']; quick.methods = ['POST'];
  const updated = saveQuickRule(next, quick);
  assert.equal(updated.rules.filter(r => r.id === QUICK_RULE_ID).length, 1);
  assert.deepEqual(updated.rules[0].methods, ['POST']);
});
test('blank rows do not create rules, and deleting all keys removes only the quick rule', () => {
  const state = emptyState(); const quick = quickRule(state);
  assert.equal(saveQuickRule(state, quick).rules.length, 0);
  quick.headers[0].name = 'x-test'; const saved = saveQuickRule(state, quick);
  assert.equal(saveQuickRule(saved, { ...quick, headers: [] }).rules.length, 0);
});
test('quick settings reject nameless values, duplicate headers and invalid detailed scope', () => {
  const state = emptyState(); const quick = quickRule(state); quick.headers[0].value = 'value';
  assert.throws(() => saveQuickRule(state, quick), /Header/);
  quick.headers[0].name = 'x-test'; quick.headers.push({ ...quick.headers[0], id: 'second' });
  assert.throws(() => saveQuickRule(state, quick), /重复/);
  quick.headers.pop(); quick.patterns = ['bad-url'];
  assert.throws(() => saveQuickRule(state, quick), /URL/);
});

test('each Header gets independent URL, operation, request method and enable settings', () => {
  const first = { ...createQuickRow(), name: 'x-first', value: 'one', patterns: ['https://a.example.com/*'], methods: ['POST'] };
  const second = { ...createQuickRow(), name: 'x-second', operation: 'remove' as const, patterns: ['https://b.example.com/*'], enabled: false };
  const state = stateFromRows(emptyState(), [first, second]);
  assert.deepEqual(state.rules[0].patterns, first.patterns); assert.deepEqual(state.rules[0].methods, ['POST']);
  assert.equal(state.rules[1].enabled, false); assert.equal(state.rules[1].headers[0].operation, 'remove');
  assert.equal(compileRules(state).length, 1);
});
test('legacy grouped rules retain every Header and its effective conditions during migration', () => {
  const rule = createRule(); rule.name = 'Legacy'; rule.patterns = ['https://example.com/api/*']; rule.methods = ['GET']; rule.enabled = false;
  rule.headers = [{ id: 'first', name: 'x-first', value: 'a', operation: 'set' }, { id: 'second', name: 'x-second', value: '', operation: 'remove' }];
  const original = { ...emptyState(), rules: [rule] };
  const migrated = stateFromRows(original, rowsFromState(original));
  assert.equal(migrated.rules.length, 2);
  for (const rowRule of migrated.rules) { assert.deepEqual(rowRule.patterns, rule.patterns); assert.deepEqual(rowRule.methods, rule.methods); assert.equal(rowRule.enabled, false); }
  assert.deepEqual(migrated.rules.map(r => r.headers[0]), rule.headers);
});
test('blank rows are ignored, duplicate keys with distinct scopes stay independent, and malformed edits reject', () => {
  const first = { ...createQuickRow(), name: 'x-test', value: 'a' };
  const second = { ...createQuickRow(), name: 'x-test', value: 'b', patterns: ['https://example.com/*'] };
  const state = stateFromRows(emptyState(), [first, createQuickRow(), second]);
  assert.equal(state.rules.length, 2);
  assert.throws(() => stateFromRows(state, [{ ...first, value: 'a\r\nx-injected: b' }]), /Header/);
  assert.equal(state.rules[0].headers[0].value, 'a');
});
