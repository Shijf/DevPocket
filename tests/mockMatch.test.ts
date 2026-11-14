import test from 'node:test';
import assert from 'node:assert/strict';
import { mockMatches } from '../src/lib/mockMatch';
import { patternToRegex } from '../src/lib/rules';
test('bounded glob matching preserves the existing URL grammar without regex backtracking', () => {
  for (const pattern of ['*://*/*', '*://*.example.com/API/*', 'https://example.com/api/a*b*c?x=*', 'http://localhost:3000/*', 'https://example.com/api/*?x=1', 'https://example.com/a*a*a*b']) {
    for (const text of ['https://example.com/API/x', 'http://sub.example.com/API/x', 'https://example.com:8443/API/x', 'https://evil-example.com/API/x', 'https://example.com/api/abc?x=2', 'https://example.com/aaaaab', 'http://localhost:3000/a', 'https://example.com/api/z?x=1']) {
      const url = new URL(text); assert.equal(mockMatches(pattern, url), new RegExp(patternToRegex(pattern)).test(url.href), `${pattern} ${text}`);
    }
  }
  assert.equal(mockMatches('*://*/*', new URL('file:///a')), false);
  assert.equal(mockMatches('bad', new URL('https://example.com')), false);
});
test('adversarial multi-wildcard paths do not stall matching', { timeout: 1000 }, () => {
  const pattern = 'https://example.com/' + 'a*'.repeat(60) + 'z';
  assert.equal(mockMatches(pattern, new URL('https://example.com/' + 'a'.repeat(100000))), false);
});
