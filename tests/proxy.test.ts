import test from 'node:test';
import assert from 'node:assert/strict';
import { createProxy, proxyRedirect, stateFromProxies, validateProxies } from '../src/lib/proxy';
import { compileRules, parseImport } from '../src/lib/rules';
import { createHeader, createRule, emptyState } from '../src/lib/model';
import { createEngine } from '../src/lib/engine';
import { stateFromRows } from '../src/lib/quick';
const proxy = (source = 'https://site.example/api/*', target = 'http://localhost:3000/api/*') => ({ ...createProxy(), source, target });

test('fixed URLs redirect all resource types including navigation', () => {
  const rules = compileRules({ ...emptyState(), proxies: [proxy('https://site.example/app.js', 'http://127.0.0.1:3000/app.js')] });
  assert.equal(rules[0].action.type, 'redirect');
  assert.equal(rules[0].action.redirect?.url, 'http://127.0.0.1:3000/app.js');
  for (const type of ['main_frame', 'stylesheet', 'script', 'font', 'image', 'xmlhttprequest']) assert.ok(rules[0].condition.resourceTypes?.includes(type as chrome.declarativeNetRequest.ResourceType));
});
test('path substitution preserves nested paths, query strings and percent encoding', () => {
  const { regex, redirect } = proxyRedirect(proxy('*://*.SITE.example/api/*', 'http://localhost:3000/mock/*'));
  const match = new RegExp(regex).exec('https://sub.site.example/api/v1/item%20name?q=1&n=2');
  assert.ok(match);
  assert.equal(match.length, 2);
  assert.equal(redirect.regexSubstitution?.replace('\\1', match[1]), 'http://localhost:3000/mock/v1/item%20name?q=1&n=2');
  assert.equal(new RegExp(regex).test('https://site.example/API/v1'), false);
  assert.equal(new RegExp(regex).test('https://site.example.evil/api/v1'), false);
});
test('fixed target drops the original query while a trailing wildcard can capture it', () => {
  const fixed = proxyRedirect(proxy('https://site.example/api/*', 'http://localhost:3000/mock?q=local'));
  assert.equal(fixed.redirect.url, 'http://localhost:3000/mock?q=local');
});
test('resource and method filters are explicit, precedence follows row order', () => {
  const a = { ...proxy(), methods: ['POST'], resourceTypes: ['xmlhttprequest'] as const };
  const b = proxy('https://site.example/assets/*', 'http://localhost:3000/assets/*');
  const rules = compileRules({ ...emptyState(), proxies: [{ ...a, resourceTypes: [...a.resourceTypes] }, b] });
  assert.deepEqual(rules[0].condition.requestMethods, ['post']);
  assert.deepEqual(rules[0].condition.resourceTypes, ['xmlhttprequest']);
  assert.ok(rules[0].priority! > rules[1].priority!);
});
test('headers and proxies have independent switches and unique dynamic IDs', () => {
  const header = { ...createRule(), name: 'test', headers: [{ ...createHeader(), name: 'x-test', value: 'one' }] };
  const state = { ...emptyState(), rules: [header], proxies: [proxy()] };
  const both = compileRules(state);
  assert.equal(new Set(both.map(r => r.id)).size, 2);
  assert.equal(compileRules({ ...state, enabled: false })[0].action.type, 'redirect');
  assert.equal(compileRules({ ...state, proxyEnabled: false })[0].action.type, 'modifyHeaders');
  assert.deepEqual(compileRules({ ...state, enabled: false, proxyEnabled: false }), []);
  assert.deepEqual(compileRules({ ...emptyState(), proxies: [{ ...proxy(), enabled: false }] }), []);
});
test('old version 1 config remains valid; both modules survive unrelated edits', () => {
  assert.deepEqual(parseImport(JSON.stringify(emptyState())), emptyState());
  const state = stateFromProxies(emptyState(), [proxy(), createProxy()], true);
  assert.equal(state.proxies?.length, 1);
  assert.deepEqual(stateFromRows(state, [], false).proxies, state.proxies);
  assert.deepEqual(stateFromProxies({ ...state, rules: [] }, [], false).rules, []);
  assert.deepEqual(parseImport(JSON.stringify(state)), state);
});
test('incomplete or malformed drafts are rejected without mutating committed data', () => {
  const state = emptyState();
  assert.throws(() => stateFromProxies(state, [{ ...createProxy(), source: 'https://site.example/app.js' }], true));
  for (const target of ['file:///tmp/app.js', 'javascript:alert(1)', 'https://a:b@site.example/js', 'http://localhost:3000/js#hash', 'http://localhost:3000/\\1']) assert.throws(() => proxyRedirect(proxy(undefined, target)));
  assert.throws(() => proxyRedirect(proxy('https://site.example/api/*/*', 'http://localhost:3000/*')));
  assert.throws(() => proxyRedirect(proxy(undefined, 'http://*.localhost/*')));
  assert.throws(() => validateProxies([{ ...proxy(), resourceTypes: [] }]));
  assert.throws(() => validateProxies([{ ...proxy(), methods: ['INVALID'] }]));
  assert.deepEqual(state, emptyState());
});
test('direct and cross-rule fixed-address redirect loops are rejected', () => {
  assert.throws(() => proxyRedirect(proxy('https://site.example/*', 'https://site.example/mock/*')), /循环/);
  assert.throws(() => validateProxies([proxy('https://a.example/x', 'https://b.example/x'), proxy('https://b.example/x', 'https://a.example/x')]), /循环/);
});
test('proxy saves require capturing support and storage failure rolls back both tools', async () => {
  const original = { ...emptyState(), proxies: [proxy('https://site.example/app.js', 'http://localhost:3000/app.js')] };
  let dynamic = compileRules(original);
  const before = structuredClone(dynamic);
  const checks: boolean[] = [];
  const engine = createEngine({
    read: async () => original,
    write: async () => { throw new Error('storage failed'); },
    getRules: async () => dynamic,
    updateRules: async add => { dynamic = add; },
    supportsRegex: async (_regex, capturing) => { checks.push(!!capturing); return true; },
  });
  await assert.rejects(engine.save({ ...original, proxies: [proxy()] }), /storage failed/);
  assert.deepEqual(checks, [true]);
  assert.deepEqual(dynamic, before);
});

 test('wildcard cycles across two mappings are rejected but disjoint same-host paths are allowed', () => {
   assert.throws(() => validateProxies([proxy('https://a.example/api/*', 'https://b.example/api/*'), proxy('https://b.example/api/*', 'https://a.example/api/*')]), /循环/);
   assert.doesNotThrow(() => validateProxies([proxy('http://localhost:3000/original/*', 'http://localhost:3000/local/*')]));
   assert.throws(() => proxyRedirect(proxy('https://site.example/api/x*', 'https://site.example/api/*x')), /循环/);
 });
