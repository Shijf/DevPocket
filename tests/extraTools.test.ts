import test from 'node:test';
import assert from 'node:assert/strict';
import { timestampDate, dateTimestamp, encodeBase64, decodeBase64, encodeText, decodeText, decodeJwt } from '../src/lib/extraTools';
import { createBlock, createMock, stateFromNetwork, runtimeMocks, validateNetworkRows } from '../src/lib/networkDebug';
import { emptyState } from '../src/lib/model';
import { compileRules, validateState } from '../src/lib/rules';
import { findMock, mockBody, waitMock } from '../src/lib/mockRuntime';

test('timestamp converts seconds/milliseconds and explicit timezone without losing sign', () => {
  assert.equal(timestampDate('0', 'seconds').toISOString(), '1970-01-01T00:00:00.000Z');
  assert.equal(timestampDate('-1', 'milliseconds').getTime(), -1);
  assert.equal(timestampDate('1.25', 'seconds').getTime(), 1250);
  assert.equal(dateTimestamp('2026-11-07T20:00:00+08:00'), Date.parse('2026-11-07T12:00:00Z'));
  for (const value of ['2026-02-30T12:00:00Z', '2026-13-01T12:00:00Z', '2026-11-07T20:00:00', 'bad']) assert.throws(() => dateTimestamp(value));
  for (const value of ['Infinity', 'abc', '9e100', '999999999999999999999']) assert.throws(() => timestampDate(value, 'seconds'));
});
test('UTF-8 Base64 round-trips Chinese/emoji and rejects malformed or binary UTF-8', () => {
  for (const value of ['', '中文 👋\n', 'a&<>', '\u0000']) assert.equal(decodeBase64(encodeBase64(value)), value);
  for (const value of ['!', 'a', 'YQ=', '/w==']) assert.throws(() => decodeBase64(value));
  assert.equal(decodeBase64('5Lit5paH', true), '中文');
});
test('Unicode and HTML codecs handle surrogate pairs and decode without evaluating markup', () => {
  assert.equal(decodeText(encodeText('中文 👋', 'unicode'), 'unicode'), '中文 👋');
  assert.equal(decodeText(encodeText('<script>"&\'</script>', 'html'), 'html'), '<script>"&\'</script>');
  assert.equal(decodeText('&#x1f44b;', 'html'), '👋');
  assert.equal(decodeText('&amp;lt;', 'html'), '&lt;');
  assert.equal(decodeText('&nbsp;&copy;', 'html'), '\u00a0©');
  assert.throws(() => decodeText('\\u12', 'unicode'));
  assert.throws(() => decodeText('&#x110000;', 'html'));
});
const jwtPart = (text: string) => encodeBase64(text).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
test('JWT decodes claims while preserving big integers and duplicate fields', () => {
  const value = decodeJwt(`${jwtPart('{"alg":"HS256"}')}.${jwtPart('{"id":900719925474099312345,"role":1,"role":2,"exp":123,"nbf":100}')}.sig`);
  assert.equal(value.expires, 123); assert.equal(value.notBefore, 100); assert.equal(value.algorithm, 'HS256');
  assert.equal(value.payload.children[0].node.raw, '900719925474099312345');
  assert.equal(value.payload.children.filter(row => row.key === 'role').length, 2);
  for (const value of ['bad', 'a.b.c', `${jwtPart('[]')}.${jwtPart('{}')}.`, `${jwtPart('{}')}.${jwtPart('null')}.`]) assert.throws(() => decodeJwt(value));
});
test('block rules have unique IDs, explicit main_frame, methods, case-sensitive paths and independent switches', () => {
  const block = { ...createBlock(), source: '*://EXAMPLE.com/API/*', methods: ['POST'] };
  const mock = { ...createMock(), source: '*://example.com/mock' };
  const state = { ...emptyState(), blocks: [block], mocks: [mock] };
  const compiled = compileRules(state);
  assert.equal(compiled.length, 1); assert.equal(compiled[0].action.type, 'block');
  assert.ok(compiled[0].condition.resourceTypes?.includes('main_frame' as chrome.declarativeNetRequest.ResourceType));
  assert.deepEqual(compiled[0].condition.requestMethods, ['post']);
  assert.ok(new RegExp(compiled[0].condition.regexFilter!).test('https://example.com/API/a'));
  assert.equal(new RegExp(compiled[0].condition.regexFilter!).test('https://example.com/api/a'), false);
  assert.equal(compileRules({ ...state, blockEnabled: false }).length, 0);
  assert.equal(runtimeMocks({ ...state, blockEnabled: false }, 'https://example.com').length, 1);
  assert.equal(runtimeMocks({ ...state, mockEnabled: false }, 'https://example.com').length, 0);
  assert.equal(compileRules({ ...state, blocks: [{ ...block, enabled: false }] }).length, 0);
});
test('network module saves preserve other tools and reject invalid imported configuration', () => {
  const state = { ...emptyState(), blocks: [{ ...createBlock(), source: '*://example.com/*' }] };
  const saved = stateFromNetwork(state, 'mocks', [{ ...createMock(), source: 'https://example.com/api', body: '{"ok":true}' }], true);
  assert.deepEqual(saved.blocks, state.blocks); assert.equal(saved.mocks?.length, 1);
  assert.equal(stateFromNetwork(saved, 'mocks', [createMock()], false).mocks?.length, 0);
  for (const patch of [{ status: 199 }, { delay: 30001 }, { status: 204 }, { body: '{bad}' }, { contentType: 'text/plain\r\nX: yes' }]) assert.throws(() => validateNetworkRows([{ ...saved.mocks![0], ...patch }], 'mocks'));
  assert.throws(() => validateState({ ...saved, blockEnabled: 'yes' }));
  assert.throws(() => validateNetworkRows([{ ...state.blocks[0], resourceTypes: [] }], 'blocks'));
});
test('Mock matching preserves case-sensitive paths, methods, priority, HEAD and empty response semantics', async () => {
  const rows = runtimeMocks({ ...emptyState(), mocks: [{ ...createMock(), source: '*://example.com/API/*', methods: ['GET'], body: '{"ok":true}' }] }, 'https://example.com');
  assert.equal(findMock(rows, 'https://EXAMPLE.com/API/x#part', 'GET'), rows[0]);
  assert.equal(findMock(rows, 'https://example.com/api/x', 'GET'), undefined);
  assert.equal(findMock(rows, 'https://example.com/API/x', 'POST'), undefined);
  assert.equal(mockBody(rows[0], 'HEAD'), null);
  assert.equal(mockBody({ ...rows[0], status: 204 }, 'GET'), null);
  const abort = new AbortController(); const pending = waitMock(10000, abort.signal); abort.abort(); await assert.rejects(pending, { name: 'AbortError' });
  await waitMock(0);
});
