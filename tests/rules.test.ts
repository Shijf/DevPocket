import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRule, emptyState, type AppState } from '../src/lib/model';
import { compileRules, matchesSite, matchesUrl, parseImport, patternToRegex, validateRule, validateState } from '../src/lib/rules';

function fixture(): AppState {
  const rule = createRule(); rule.name = 'Integration'; rule.patterns = ['*://*.example.com/api/*'];
  rule.headers[0] = { id: 'header-1', name: 'X-Swimlane', value: 'test', operation: 'set' };
  return { ...emptyState(), rules: [rule] };
}
test('wildcards match domains and subdomains without leaking to lookalikes', () => {
  const expression = new RegExp(patternToRegex('*://*.example.com/api/*'));
  for (const url of ['https://example.com/api/users', 'http://one.two.example.com:8080/api/users?q=1']) assert.ok(expression.test(url));
  for (const url of ['https://notexample.com/api/users', 'https://example.com.evil.com/api/users', 'https://example.com/API/users', 'ftp://example.com/api/users', 'https://evil.com/?https://example.com/api/users']) assert.equal(expression.test(url), false);
});
test('localhost patterns include arbitrary ports; explicit port stays exact', () => {
  assert.ok(new RegExp(patternToRegex('*://localhost/*')).test('http://localhost:5173/api'));
  assert.ok(new RegExp(patternToRegex('http://localhost:3000/api/*')).test('http://localhost:3000/api/users'));
  assert.equal(new RegExp(patternToRegex('http://localhost:3000/api/*')).test('http://localhost:3001/api/users'), false);
});
test('literal punctuation is escaped rather than interpreted as regex', () => {
  const expression = new RegExp(patternToRegex('https://example.com/api/(test).json?type=x'));
  assert.ok(expression.test('https://example.com/api/(test).json?type=x'));
  assert.equal(expression.test('https://example.com/api/testXjson?type=x'), false);
});
test('invalid URL patterns and controls are rejected', () => {
  for (const pattern of ['example.com', 'file://*/*', 'https://example.com/\n', 'https://', '*://example.com.evil.com@evil.com/*']) assert.throws(() => patternToRegex(pattern));
});
test('set adds/overrides, remove omits value, and navigation is explicitly included', () => {
  const state = fixture(); state.rules[0].headers.push({ id: 'header-2', name: 'Cookie', value: '', operation: 'remove' });
  const compiled = compileRules(state);
  assert.deepEqual(compiled[0].action.requestHeaders, [{ header: 'x-swimlane', operation: 'set', value: 'test' }, { header: 'cookie', operation: 'remove' }]);
  assert.ok(compiled[0].condition.resourceTypes!.includes('main_frame' as chrome.declarativeNetRequest.ResourceType));
});
test('global pause and per-rule switches remove effective rules', () => {
  const state = fixture(); state.enabled = false; assert.deepEqual(compileRules(state), []);
  state.enabled = true; state.rules[0].enabled = false; assert.deepEqual(compileRules(state), []);
});
test('URL alternatives receive distinct IDs and preserve group priority', () => {
  const state = fixture(); state.rules[0].patterns.push('*://localhost/*');
  state.rules.push({ ...state.rules[0], id: 'second', patterns: ['*://example.com/*'], scope: 'xhr', methods: ['POST'] });
  const rules = compileRules(state);
  assert.deepEqual(rules.map(r => r.id), [1, 2, 3]);
  assert.equal(rules[0].priority, rules[1].priority);
  assert.ok(rules[1].priority! > rules[2].priority!);
  assert.deepEqual(rules[2].condition.resourceTypes, ['xmlhttprequest']);
  assert.deepEqual(rules[2].condition.requestMethods, ['post']);
});
test('Header validation rejects CRLF injection, bad names and case-insensitive duplicates', () => {
  const rule = fixture().rules[0]; rule.headers[0].value = 'foo\r\nx-injected: true'; assert.ok(validateRule(rule));
  rule.headers[0].value = 'ok'; rule.headers[0].name = 'Bad Header'; assert.ok(validateRule(rule));
  rule.headers[0].name = 'X-Swimlane'; rule.headers.push({ ...rule.headers[0], id: 'other', name: 'x-swimlane' }); assert.match(validateRule(rule)!, /重复/);
});
test('empty Header values are valid while non-Latin-1 values are rejected', () => {
  const rule = fixture().rules[0]; rule.headers[0].value = ''; assert.equal(validateRule(rule), null);
  rule.headers[0].value = '中文'; assert.ok(validateRule(rule));
});
test('import validates version, nested shape, duplicate IDs and limits', () => {
  const state = fixture(); assert.deepEqual(parseImport(JSON.stringify(state)), state);
  assert.throws(() => parseImport('{bad json'), /JSON/);
  assert.throws(() => parseImport(JSON.stringify({ ...state, version: 2 })), /版本/);
  assert.throws(() => validateState({ ...state, rules: [null] }), /无效/);
  assert.throws(() => validateState({ ...state, rules: [state.rules[0], state.rules[0]] }), /ID/);
  assert.throws(() => parseImport('x'.repeat(2_000_001)), /过大/);
});
test('URL matching strips fragments and preserves path case', () => {
  const rule = fixture().rules[0]; assert.ok(matchesUrl(rule, 'https://EXAMPLE.com/api/users#foo'));
  assert.equal(matchesUrl(rule, 'https://example.com/API/users'), false);
});
test('current-site filtering includes API-path rules and keeps ports and schemes exact', () => {
  const rule = fixture().rules[0]; assert.ok(matchesSite(rule, 'https://example.com/home'));
  rule.patterns = ['http://localhost:3000/api/*'];
  assert.ok(matchesSite(rule, 'http://localhost:3000/home'));
  assert.equal(matchesSite(rule, 'http://localhost:3001/home'), false);
  assert.equal(matchesSite(rule, 'https://localhost:3000/home'), false);
});
