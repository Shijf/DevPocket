import test from 'node:test';
import assert from 'node:assert/strict';
import { textDiff, parseColor, contrastRatio, hashBytes, matchRegex } from '../src/lib/productivity';

test('text diff preserves both inputs while aligning inserted, removed and repeated lines', () => {
  for (const [left, right] of [['a\nb\nc', 'a\nx\nb\nc'], ['a\nx\nb', 'a\nb'], ['a\nb\na\nc', 'a\na\nz\nc'], ['中文\nold\n', '中文\nnew\n'], ['', ''], ['a', '']]) {
    const rows = textDiff(left, right);
    assert.equal(rows.filter(row => row.left !== undefined).map(row => row.left).join('\n'), left);
    assert.equal(rows.filter(row => row.right !== undefined).map(row => row.right).join('\n'), right);
  }
  assert.equal(textDiff('a\nb', 'a\nx\nb')[1].kind, 'added');
  assert.equal(textDiff('a\nx\nb', 'a\nb')[1].kind, 'removed');
  assert.equal(textDiff('old', 'new')[0].kind, 'changed');
  assert.throws(() => textDiff('a\n'.repeat(1001), ''), /1000/);
  assert.throws(() => textDiff('a'.repeat(200001), ''), /20 万/);
});
test('color conversion supports shorthand HEX, RGB, hue wrapping and accurate WCAG luminance', () => {
  assert.equal(parseColor('#f60').hex, '#ff6600');
  assert.equal(parseColor('rgb(255, 102, 0)').hex, '#ff6600');
  assert.equal(parseColor('hsl(24, 100%, 50%)').hex, '#ff6600');
  assert.equal(parseColor('hsl(-120, 100%, 50%)').hex, '#0000ff');
  assert.equal(parseColor('hsl(0 0% 50%)').hex, '#808080');
  assert.equal(contrastRatio(parseColor('#fff'), parseColor('#000')), 21);
  assert.equal(contrastRatio(parseColor('#fff'), parseColor('#fff')), 1);
  assert.ok(contrastRatio(parseColor('#777'), parseColor('#fff')) < 4.5);
  for (const input of ['#ffff', 'rgb(300, 0, 0)', 'hsl(0, 101%, 50%)', 'hsl(0, 10%, 110%)', 'url(https://example.com)', 'rgba(0,0,0,0.5)']) assert.throws(() => parseColor(input));
});
test('hashes match published SHA vectors including empty input and UTF-8 bytes', async () => {
  assert.equal(await hashBytes(new TextEncoder().encode('abc'), 'SHA-256'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(await hashBytes(new Uint8Array(), 'SHA-512'), 'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e');
  const { createHash } = await import('node:crypto');
  const bytes = new TextEncoder().encode('中文 👋\n');
  assert.equal(await hashBytes(bytes, 'SHA-512'), createHash('sha512').update(bytes).digest('hex'));
  await assert.rejects(hashBytes(new Uint8Array(20 * 1024 * 1024 + 1), 'SHA-256'), /20 MB/);
});
test('regex captures named groups and native replacement semantics without losing zero-width unicode matches', () => {
  const result = matchRegex({ pattern: '(?<name>\\w+)@(\\w+)', flags: 'g', text: 'alice@mail bob@test', replacement: '$<name> ($2)' });
  assert.equal(result.matches.length, 2); assert.equal(result.matches[1].index, 11); assert.equal(result.matches[0].named?.name, 'alice');
  assert.equal(result.replaced, 'alice (mail) bob (test)');
  assert.deepEqual(matchRegex({ pattern: '(?:)', flags: 'gu', text: '👋', replacement: '-' }).matches.map(match => match.index), [0, 2]);
  assert.equal(matchRegex({ pattern: 'a', flags: '', text: 'aaa', replacement: 'x' }).replaced, 'xaa');
  assert.equal(matchRegex({ pattern: 'a', flags: 'y', text: 'aaa', replacement: 'x' }).matches.length, 1);
  assert.equal(matchRegex({ pattern: 'z', flags: 'g', text: 'abc', replacement: '' }).matches.length, 0);
  const capped = matchRegex({ pattern: 'a', flags: 'g', text: 'a'.repeat(501), replacement: 'x' });
  assert.equal(capped.clipped, true); assert.equal(capped.replaced, null);
  for (const [pattern, flags] of [['[', 'g'], ['x', 'gg'], ['x', 'q']]) assert.throws(() => matchRegex({ pattern, flags, text: 'x', replacement: '' }));
});
