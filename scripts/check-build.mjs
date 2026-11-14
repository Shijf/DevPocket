import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.background.type, 'module');
const files = [manifest.action.default_popup, manifest.options_page, manifest.background.service_worker, ...Object.values(manifest.icons)];
for (const script of manifest.content_scripts ?? []) files.push(...script.js);
for (const file of files) assert.ok(existsSync(resolve('dist', file)), `Missing ${file}`);
for (const html of [manifest.action.default_popup, manifest.options_page]) {
  const content = readFileSync(resolve('dist', html), 'utf8');
  assert.doesNotMatch(content, /https?:\/\/|\/src\/|@vite/);
  for (const match of content.matchAll(/(?:src|href)="([^"]+)"/g)) assert.ok(existsSync(resolve('dist', match[1])), `Missing ${match[1]}`);
}
const background = readFileSync(resolve('dist', manifest.background.service_worker), 'utf8');
for (const match of background.matchAll(/from"([^"]+)"/g)) assert.ok(existsSync(resolve('dist', match[1])), `Missing worker dependency ${match[1]}`);
console.log('Manifest, UI assets, worker modules and CSP-compatible local references verified.');
for (const script of manifest.content_scripts ?? []) for (const file of script.js) assert.doesNotMatch(readFileSync(resolve('dist', file), 'utf8'), /\bimport\s*[{"']|\bexport\s*[{]/, `Content script must be a standalone bundle: ${file}`);
const regexWorkers = readdirSync('dist/assets').filter(file => /^regex-worker-.*\.js$/.test(file));
assert.equal(regexWorkers.length, 1, 'Regex must ship one local, CSP-compatible Worker asset');
assert.doesNotMatch(readFileSync(resolve('dist/assets', regexWorkers[0]), 'utf8'), /\bimport\s*[{"']|https?:\/\//);

// Exercise the shipped isolated-world bridge with Chrome API adapters, including opaque frames.
// This verifies the artifact's wiring; it is not native MV3 browser acceptance.
const { runInNewContext } = await import('node:vm');
const { setImmediate: settle } = await import('node:timers/promises');
const bridgeCode = readFileSync('dist/mock-bridge.js', 'utf8');
for (const [pageOrigin, securityOrigin, expected] of [
  ['https://app.example.com', 'https://app.example.com', 1],
  ['https://unrelated.example', 'https://unrelated.example', 0],
  ['https://app.example.com', 'null', 0],
]) {
  const page = Object.assign(new EventTarget(), { origin: securityOrigin });
  const delivered = [];
  page.addEventListener('devpocket-tools:mock-config', event => delivered.push(JSON.parse(event.detail)));
  const fixtureState = { version: 1, revision: 0, enabled: true, rules: [], mocks: [
    { id: 'allowed', source: 'https://api.example.com/*', pageOrigin: 'https://app.example.com', enabled: true, methods: [], status: 200, delay: 0, body: '{"ok":true}', contentType: 'application/json' },
    { id: 'foreign', source: 'https://private.example.com/*', pageOrigin: 'https://other.example.com', enabled: true, methods: [], status: 200, delay: 0, body: '{"secret":"foreign-body"}', contentType: 'application/json' },
  ] };
  runInNewContext(bridgeCode, { window: page, location: { origin: pageOrigin }, URL, CustomEvent, Event,
    chrome: { runtime: { id: 'test', sendMessage: async message => {
      assert.equal(message.type, 'mock:read');
      // Worker adapter returns only this page's scoped configuration.
      return { ok: true, state: { ...fixtureState, mocks: fixtureState.mocks.filter(row => row.pageOrigin === securityOrigin) } };
    }, onMessage: { addListener() {}, removeListener() {} } } },
  });
  await settle();
  assert.equal(delivered.length, 1, 'Built bridge publishes one scoped initial snapshot');
  assert.equal(delivered[0].length, expected, `Built bridge scope for ${pageOrigin} / ${securityOrigin}`);
  assert.doesNotMatch(JSON.stringify(delivered), /foreign-body/);
  page.dispatchEvent(new CustomEvent('devpocket-tools:mock-ready', { detail: { origin: 'https://other.example.com' } }));
  await settle();
  assert.equal(delivered.at(-1).length, expected, 'Page events cannot change bridge scope');
  assert.doesNotMatch(JSON.stringify(delivered), /foreign-body/);
}
console.log('Shipped Mock bridge origin isolation and opaque-frame adapters verified.');
