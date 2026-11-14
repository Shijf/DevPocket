import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
const browserCli = process.env.DEVPOCKET_BROWSER_CLI || 'browser-cli';
const cli = (...args) => execFileSync(browserCli, args, { encoding: 'utf8', timeout: 30000 });
function contents(output) {
  const path = output.match(/(?:snapshotPath|spillPath):\s*([^\n]+\.md)/)?.[1];
  return path && existsSync(path) ? readFileSync(path, 'utf8') : output;
}
const opened = cli('new_tab', '--url', 'http://127.0.0.1:5173/tests/browser/page-edit-fixture.html', '--wait-until', 'domcontentloaded');
const tab = opened.match(/tabId:\s*(\S+)/)?.[1]; assert.ok(tab, opened);
let snapshot = contents(opened);
function action(command, role, label, ...args) {
  const line = snapshot.split('\n').find(line => line.includes(`${role} "${label}"`) && line.includes('[ref='));
  assert.ok(line, `Missing ${label}\n${snapshot}`);
  snapshot = contents(cli(command, '--tab-id', tab, '--ref', line.match(/\[ref=(\w+)\]/)[1], ...args));
}
action('click', 'button', '开启文字编辑验证');
assert.ok(snapshot.includes('READY FOR KEYBOARD INPUT'), snapshot);
console.log('Editing host and selection styles enabled.');
action('click', 'textbox', '编辑验证文字');
action('press_key', 'textbox', '编辑验证文字', '--key', 'End');
action('press_key', 'textbox', '编辑验证文字', '--key', 'x');
action('click', 'button', '检查输入并恢复');
assert.ok(snapshot.includes('PAGE EDIT KEYBOARD AND RESTORE PASSED'), snapshot);
console.log(snapshot);
console.log('Real keyboard input and original editing attributes/styles restored in browser fixture; MV3 injection remains adapter-tested.');
