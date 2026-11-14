import { execFileSync } from 'node:child_process';
import { readFileSync, copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const browserCli = process.env.DEVPOCKET_BROWSER_CLI || 'browser-cli';
const cli = (...args) => execFileSync(browserCli, args, { encoding: 'utf8', timeout: 30000 });
const publicDir = cli('public_dir').trim();
const indexPath = resolve(publicDir, 'INDEX.md');
let catalog = readFileSync(indexPath, 'utf8');
for (const [file, description] of [['more-tools-drag.js', '模拟拖放事件验证排序'], ['more-tools-inspect.js', '只读检查顺序、存储和尺寸']]) {
  copyFileSync(resolve('tests/browser', file), resolve(publicDir, file));
  catalog = catalog.split('\n').filter(line => !line.includes(file)).join('\n').trimEnd() + `\n| 127.0.0.1:5173 | /popup.html | ${description} | ${file} |\n`;
  writeFileSync(indexPath, catalog);
}
function contents(output) { const path = output.match(/(?:snapshotPath|spillPath|output):\s*([^\n]+\.(?:md|json))/)?.[1]; return path && existsSync(path) ? readFileSync(path, 'utf8') : output; }
const opened = cli('new_tab', '--url', 'http://127.0.0.1:5173/popup.html', '--timeout-ms', '15000');
const tab = opened.match(/tabId:\s*(\S+)/)?.[1] || opened.match(/^tab (\S+)/m)?.[1]; assert.ok(tab, opened);
let snapshot = contents(cli('reload', '--tab-id', tab, '--timeout-ms', '15000'));
function ref(role, label) { const lines = snapshot.split('\n'); const dialog = lines.findIndex(line => line.includes('dialog "更多工具"')); const line = (dialog < 0 ? lines : lines.slice(dialog)).find(line => line.includes(`${role} "${label}"`) && line.includes('[ref=')); assert.ok(line, `Missing ${role} ${label}\n${snapshot}`); return line.match(/\[ref=(\w+)\]/)[1]; }
function action(command, role, label, ...args) { snapshot = contents(cli(command, '--tab-id', tab, '--ref', ref(role, label), ...args, ...(command === 'press_key' ? [] : ['--timeout-ms', '15000']))); }
function check(text) { if (!snapshot.includes(text)) { cli('wait_for', '--tab-id', tab, '--text', text, '--timeout-ms', '15000'); snapshot = contents(cli('snapshot', '--tab-id', tab)); } assert.ok(snapshot.includes(text), snapshot); }
function inspect() { const raw = cli('evaluate', '--tab-id', tab, '--expression-file', resolve(publicDir, 'more-tools-inspect.js')); const value = JSON.parse(raw.match(/value: (\{.*\})/)[1]); assert.equal(value.popupWidth, 520); assert.ok(value.popupHeight <= 580); assert.deepEqual(value.overflow, []); return value; }
action('click', 'button', '更多工具'); action('click', 'button', '调整工具顺序'); action('click', 'button', '恢复默认工具顺序');
const baseline = inspect().order; assert.equal(baseline.length, 17); assert.deepEqual(baseline.slice(0, 4), ['headers', 'proxy', 'json', 'url']);
action('click', 'button', '后移 请求头管理'); const swapped = [baseline[1], baseline[0], ...baseline.slice(2)]; assert.deepEqual(inspect().order, swapped);
for (let i = swapped.indexOf('jwt'); i > 0; i--) action('press_key', 'button', '排序 JWT 解码', '--key', 'Alt+ArrowUp');
const keyboard = ['jwt', ...swapped.filter(id => id !== 'jwt')]; assert.deepEqual(inspect().order, keyboard); assert.deepEqual(inspect().shortcuts, keyboard.slice(0, 4));
const dragRaw = cli('evaluate', '--tab-id', tab, '--expression-file', resolve(publicDir, 'more-tools-drag.js')); const drag = JSON.parse(dragRaw.match(/value: (\{.*\})/)[1]); assert.equal(drag.passed, true, dragRaw);
snapshot = contents(cli('snapshot', '--tab-id', tab)); action('click', 'button', '完成排序');
const sorted = inspect().order; assert.deepEqual(sorted, drag.after); assert.deepEqual(inspect().saved, sorted); assert.deepEqual(inspect().shortcuts, sorted.slice(0, 4));
action('type', 'textbox', '搜索工具', '--text', 'JWT', '--fill'); assert.deepEqual(inspect().order, ['jwt']);
action('type', 'textbox', '搜索工具', '--text', ' ', '--fill'); assert.deepEqual(inspect().order, sorted);
action('click', 'button', 'JWT 解码'); check('JWT内容'); assert.equal(inspect().toolSelected, 'JWT 解码');
action('click', 'button', '更多工具'); assert.deepEqual(inspect().order, sorted); action('click', 'button', '关闭');
action('click', 'button', '关闭工具箱'); check('Popup 预览已关闭'); action('click', 'button', '重新打开');
snapshot = contents(cli('reload', '--tab-id', tab, '--timeout-ms', '15000')); action('click', 'button', '更多工具'); assert.deepEqual(inspect().order, sorted);
assert.deepEqual(inspect().shortcuts, sorted.slice(0, 4));
action('click', 'button', '调整工具顺序'); action('click', 'button', '恢复默认工具顺序'); assert.deepEqual(inspect().order, baseline);
action('click', 'button', '完成排序'); assert.deepEqual(inspect().saved, baseline); action('click', 'button', '关闭');
assert.deepEqual(inspect().shortcuts, baseline.slice(0, 4));
console.log('All 17 tools passed ordering: dynamic shortcuts, arrow/keyboard moves, synthetic drag/drop, search, selection, close/reload persistence, reset and 520px layout.');
