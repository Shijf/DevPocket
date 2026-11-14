import test from 'node:test';
import assert from 'node:assert/strict';
import { codec, formatJson, MAX_TOOL_TEXT, parseUrl, updateUrlParams } from '../src/lib/devtools';

test('JSON pretty and compact preserve large integers, number spelling and duplicate keys', () => {
  const raw = '{"id":900719925474099312345,"n":1.2300e+40,"a":1,"a":2}';
  const pretty = formatJson(raw);
  assert.ok(pretty.includes('900719925474099312345'));
  assert.ok(pretty.includes('1.2300e+40'));
  assert.equal(formatJson(pretty, true), raw);
  assert.equal((pretty.match(/"a"/g) || []).length, 2);
});
test('JSON formatting handles empty containers, scalar roots, Unicode and escaped strings', () => {
  for (const source of ['null', 'false', '12', '"你好"', '[]', '{}', '{"a":[],"b":{},"text":"a\\\"b\\\\c\\n"}', '[1,{"a":[2,3]},"a : , { }"]']) {
    assert.deepEqual(JSON.parse(formatJson(source)), JSON.parse(source));
    assert.deepEqual(JSON.parse(formatJson(source, true)), JSON.parse(source));
  }
  assert.equal(formatJson('{"a":[1,2]}'), '{\n  "a": [\n    1,\n    2\n  ]\n}');
});
test('JSON rejects malformed data, oversized input and deeply nested pretty output', () => {
  for (const source of ['', '{a:1}', '{"a":1,}', '//comment\n{}', 'undefined']) assert.throws(() => formatJson(source));
  assert.throws(() => formatJson(' '.repeat(MAX_TOOL_TEXT + 1)), /过长/);
  const nested = '['.repeat(65) + '0' + ']'.repeat(65);
  assert.throws(() => formatJson(nested), /64 层/);
  assert.equal(formatJson(nested, true), nested);
});
test('URL parsing exposes domain, path, fragment and duplicate query parameters', () => {
  const url = parseUrl(' HTTPS://EXAMPLE.COM:8443/path?tag=a&tag=b&q=%E4%B8%AD+%E6%96%87#section ');
  assert.equal(url.host, 'example.com:8443');
  assert.equal(url.pathname, '/path');
  assert.deepEqual(url.searchParams.getAll('tag'), ['a', 'b']);
  assert.equal(url.searchParams.get('q'), '中 文');
  assert.equal(url.hash, '#section');
});
test('URL parameter edits preserve ordering, duplicates, empty entries and fragment', () => {
  const next = updateUrlParams('https://example.com/path?old=1#section', [{ key: 'tag', value: 'a' }, { key: 'tag', value: '中 文&=' }, { key: '', value: '' }]);
  const url = new URL(next);
  assert.deepEqual([...url.searchParams], [['tag', 'a'], ['tag', '中 文&='], ['', '']]);
  assert.equal(url.hash, '#section');
  assert.equal(updateUrlParams(next, []), 'https://example.com/path#section');
});
test('percent codec round trips Unicode and treats literal plus signs as plus', () => {
  const text = '中文 /?a=1&b=hello world+';
  assert.equal(codec(codec(text), true), text);
  assert.equal(codec('a+b', true), 'a+b');
  for (const value of ['%', '%E4%B8', '%ZZ']) assert.throws(() => codec(value, true), /编码/);
  assert.throws(() => codec('\ud800'), /无效字符/);
  for (const url of ['example.com', '/relative', 'javascript:alert(1)', 'file:///tmp/a']) assert.throws(() => parseUrl(url));
});
