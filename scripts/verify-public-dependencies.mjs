// Downloads public tarballs to an isolated temporary directory; does not install or execute packages.
import { readFileSync, mkdtempSync, rmSync, readdirSync, lstatSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile), lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const temp = mkdtempSync(join(tmpdir(), 'devpocket-public-packages-'));
const names = ['react', 'react-dom', 'scheduler', 'lucide-react'];
const results = [];
try {
  for (const name of names) {
    const entry = lock.packages[`node_modules/${name}`];
    const { stdout } = await exec('npm', ['pack', `${name}@${entry.version}`, '--ignore-scripts', '--registry=https://registry.npmjs.org', '--pack-destination', temp, '--json'], { timeout: 30000 });
    const filename = JSON.parse(stdout)[0].filename;
    if (filename.includes('/') || filename.includes('..')) throw new Error('Unexpected tarball filename');
    const archive = join(temp, filename);
    const digest = 'sha512-' + createHash('sha512').update(readFileSync(archive)).digest('base64');
    if (digest !== entry.integrity) throw new Error(`Public tarball digest differs for ${name}`);
    const { stdout: listing } = await exec('tar', ['-tzf', archive], { timeout: 10000 });
    const paths = listing.split('\n').filter(path => path && !path.endsWith('/'));
    const mismatches = [];
    const expected = new Set();
    for (const path of paths) {
      if (!path.startsWith('package/') || path.split('/').some(part => part === '..')) throw new Error('Unsafe archive entry');
      const relative = path.slice(8); expected.add(relative);
      const { stdout: bytes } = await exec('tar', ['-xOzf', archive, path], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, timeout: 10000 });
      const installed = join('node_modules', name, relative);
      try { if (!readFileSync(installed).equals(bytes)) mismatches.push(relative); } catch { mismatches.push(relative); }
    }
    const extra = [];
    function inspect(path, prefix = '') {
      for (const file of readdirSync(path)) {
        const full = join(path, file), relative = prefix + file;
        if (lstatSync(full).isDirectory()) inspect(full, relative + '/');
        else if (!expected.has(relative)) extra.push(relative);
      }
    }
    inspect(join('node_modules', name));
    results.push({ name, version: entry.version, publicTarballIntegrityMatches: true, checkedFiles: paths.length, mismatchedFiles: mismatches, extraInstalledFiles: extra });
  }
} finally { rmSync(temp, { recursive: true, force: true }); }
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/public-dependency-verification.json', JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
console.log(JSON.stringify(results, null, 2));
if (results.some(result => result.mismatchedFiles.length || result.extraInstalledFiles.length)) process.exitCode = 1;
