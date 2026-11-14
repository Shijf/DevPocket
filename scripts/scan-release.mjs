import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const findings = [];
const blocked = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['credential-token-pattern', /(?:gh[pousr]_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|sk_live_[A-Za-z0-9]{20,})/],
];
function scan(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) { scan(path); continue; }
    if (/\.(?:map|ts|tsx)$/.test(name) || name.startsWith('.')) findings.push({ file: path, kind: 'unexpected-development-file' });
    if (!/\.(?:js|json|html|css|txt)$/.test(name)) continue;
    const text = readFileSync(path, 'utf8');
    for (const [kind, pattern] of blocked) if (pattern.test(text)) findings.push({ file: path, kind });
  }
}
scan('dist');
const report = { date: '2026-11-14', scope: 'Current dist text assets only; not a provenance or exhaustive secret guarantee', findings };
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/release-scan.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (findings.length) process.exitCode = 1;
