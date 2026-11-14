import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { request } from 'node:http';
import { spawn } from 'node:child_process';

test('local resource server rejects foreign origins, DNS rebinding, hidden files and escaping symlinks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'devpocket-local-server-'));
  const outside = await mkdtemp(join(tmpdir(), 'devpocket-outside-'));
  await writeFile(join(directory, 'app.js'), 'console.log("fixture");');
  await writeFile(join(directory, '.secret'), 'fixture-secret');
  await writeFile(join(outside, 'outside.js'), 'fixture-outside');
  await symlink(join(outside, 'outside.js'), join(directory, 'escape.js'));
  const reserve = createServer(); await new Promise<void>(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const address = reserve.address(); assert.ok(address && typeof address === 'object'); const port = address.port;
  await new Promise<void>(resolve => reserve.close(() => resolve()));
  const child = spawn(process.execPath, ['scripts/local-server.mjs', directory, String(port), 'https://authorized.example'], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise<void>((resolve, reject) => {
      let output = ''; const timer = setTimeout(() => reject(new Error('Local fixture did not start')), 5000);
      child.stdout.on('data', chunk => { output += chunk; if (output.includes('Local resources:')) { clearTimeout(timer); resolve(); } });
      child.on('exit', code => { clearTimeout(timer); reject(new Error(`Local fixture exited: ${code}`)); });
    });
    const base = `http://127.0.0.1:${port}`;
    const allowed = await fetch(base + '/app.js', { headers: { Origin: 'https://authorized.example' } });
    assert.equal(allowed.status, 200); assert.match(await allowed.text(), /fixture/);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://authorized.example');
    assert.equal(allowed.headers.get('access-control-allow-credentials'), null);
    assert.equal((await fetch(base + '/app.js', { headers: { Origin: 'https://evil.example' } })).status, 403);
    const badHost = await new Promise<number | undefined>((resolve, reject) => { const req = request(base + '/app.js', { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); req.end(); });
    assert.equal(badHost, 403);
    assert.equal((await fetch(base + '/app.js', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    assert.equal((await fetch(base + '/.secret')).status, 403);
    assert.equal((await fetch(base + '/escape.js')).status, 403);
    assert.equal((await fetch(base + '/%2e%2e%2foutside.js')).status, 403);
    const preflight = await fetch(base + '/app.js', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }); assert.equal(preflight.status, 403);
  } finally {
    child.kill('SIGTERM');
    await Promise.all([rm(directory, { recursive: true, force: true }), rm(outside, { recursive: true, force: true })]);
  }
});
