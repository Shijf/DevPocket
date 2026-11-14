import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const base = process.argv[2] || 'http://127.0.0.1:5173';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw Error('Only local preview origins are allowed.');
const browserCli = process.env.DEVPOCKET_BROWSER_CLI || 'browser-cli';
const cli = (...args) => execFileSync(browserCli, args, { encoding: 'utf8', timeout: 30_000 });
function contents(output) {
  const path = output.match(/(?:snapshotPath|spillPath|output):\s*([^\n]+\.(?:md|json))/)?.[1];
  return path && existsSync(path) ? readFileSync(path, 'utf8') : output;
}
const opened = cli('new_tab', '--url', base + '/popup.html', '--wait-until', 'domcontentloaded', '--timeout-ms', '15000');
const tab = opened.match(/tabId:\s*(\S+)/)?.[1] || opened.match(/^tab (\S+)/m)?.[1];
assert.ok(tab, opened);
// The host may reuse its active webview; reload to clear an earlier open dialog.
let snapshot = contents(cli('reload', '--tab-id', tab, '--timeout-ms', '15000'));
if (!snapshot.includes('Header 1 Key')) snapshot = contents(cli('snapshot', '--tab-id', tab));
function ref(role, label) {
  const line = snapshot.split('\n').find(line => line.includes(`${role} "${label}"`) && line.includes('[ref='));
  assert.ok(line, `Missing ${role} ${label}\n${snapshot}`);
  return line.match(/\[ref=(\w+)\]/)[1];
}
function action(command, role, label, ...args) {
  snapshot = contents(cli(command, '--tab-id', tab, '--ref', ref(role, label), ...args, '--timeout-ms', '15000'));
}
function check(text) {
  if (!snapshot.includes(text)) { cli('wait_for', '--tab-id', tab, '--text', text, '--timeout-ms', '15000'); snapshot = contents(cli('snapshot', '--tab-id', tab)); }
  assert.ok(snapshot.includes(text), `Missing ${text}`);
}
check('DevPocket'); check('v0.1.0'); check('关闭工具箱');
check('当前工具操作'); check('项配置'); check('整体启用');
assert.equal((snapshot.match(/- text: 请求头\s*$/gm) || []).length, 1, 'The selected tab should be the only tool title.');
check('switch "Header 1 开关"');
const headerCount = (snapshot.match(/textbox "Header \d+ Key"/g) || []).length;
action('click', 'button', '添加 Header');
action('click', 'switch', `Header ${headerCount + 1} 开关`);
assert.match(snapshot, new RegExp(`textbox "Header ${headerCount + 1} Key"[^\\n]*\\[disabled\\]`));
assert.match(snapshot, new RegExp(`textbox "Header ${headerCount + 1} Value"[^\\n]*\\[disabled\\]`));
action('click', 'button', `Header ${headerCount + 1} 详细设置`);
assert.match(snapshot, /textbox "匹配 URL"[^\n]*\[disabled\]/);
assert.match(snapshot, /button "POST"[^\n]*\[disabled\]/);
action('click', 'switch', '启用此 Header');
if (/switch "Header 开关"[^\n]*\[checked\]/.test(snapshot)) assert.doesNotMatch(snapshot, /textbox "匹配 URL"[^\n]*\[disabled\]/);
action('click', 'button', '关闭');
action('click', 'button', `删除 Header ${headerCount + 1}`); check('dialog "删除 Header"');
action('click', 'button', '取消'); check(`Header ${headerCount + 1} Key`);
action('click', 'button', `删除 Header ${headerCount + 1}`);
action('click', 'button', '确认删除');

action('click', 'button', '资源代理');
check('来源 URL'); check('目标 URL'); check('导入代理配置'); check('导出代理配置');
check('当前工具操作'); check('整体启用');
assert.equal((snapshot.match(/- text: 资源代理\s*$/gm) || []).length, 1);
assert.equal(snapshot.includes('dialog '), false);
assert.equal(snapshot.includes('button "保存"'), false);
// Remove only rows created by a previously interrupted run of this test.
const previous = []; let rowNumber = 0;
for (const line of snapshot.split('\n')) {
  const row = line.match(/textbox "代理 (\d+) 来源"/); if (row) rowNumber = Number(row[1]);
  if (line.includes('- text: https://proxy-smoke-')) previous.push(rowNumber);
}
for (const row of previous.sort((a, b) => b - a)) { action('click', 'button', `删除代理 ${row}`); action('click', 'button', '确认删除'); }
action('click', 'button', '添加代理');
const index = (snapshot.match(/textbox "代理 \d+ 来源"/g) || []).length;
const source = `https://proxy-smoke-${Date.now()}.example/api/*`;
const target = 'http://127.0.0.1:3000/api/*';
action('type', 'textbox', `代理 ${index} 来源`, '--text', source, '--fill');
check('未应用，草稿已保留');
action('type', 'textbox', `代理 ${index} 目标`, '--text', target, '--fill');
if (!snapshot.includes('已自动保存')) { cli('wait_for', '--tab-id', tab, '--text', '已自动保存', '--timeout-ms', '15000'); snapshot = contents(cli('snapshot', '--tab-id', tab)); }
check('已自动保存');
action('click', 'button', `代理 ${index} 详细设置`);
check('dialog "代理详细设置"'); check('CSS'); check('字体'); check('接口');
action('click', 'button', 'POST');
assert.match(snapshot, /button "POST"[^\n]*\[pressed\]/);
action('click', 'button', '关闭');
action('click', 'switch', `代理 ${index} 开关`);
assert.doesNotMatch(snapshot, new RegExp(`switch "代理 ${index} 开关"[^\n]*\\[checked\\]`));
assert.match(snapshot, new RegExp(`textbox "代理 ${index} 来源"[^\\n]*\\[disabled\\]`));
assert.match(snapshot, new RegExp(`textbox "代理 ${index} 目标"[^\\n]*\\[disabled\\]`));
action('click', 'button', `代理 ${index} 详细设置`);
assert.doesNotMatch(snapshot, /switch "启用此代理"[^\n]*\[checked\]/);
assert.match(snapshot, /textbox "来源 URL"[^\n]*\[disabled\]/);
assert.match(snapshot, /button "POST"[^\n]*\[disabled\]/);
action('click', 'button', '关闭');
action('click', 'switch', '资源代理开关');
for (const line of snapshot.split('\n').filter(line => /textbox "代理 \d+ (来源|目标)"/.test(line))) assert.ok(line.includes('[disabled]'), line);
action('click', 'switch', '资源代理开关');
action('click', 'button', '请求头');
assert.equal((snapshot.match(/textbox "Header \d+ Key"/g) || []).length, headerCount);
snapshot = contents(cli('reload', '--tab-id', tab, '--timeout-ms', '15000'));
action('click', 'button', '资源代理'); check(source); check(target);
action('click', 'button', `代理 ${index} 详细设置`);
assert.match(snapshot, /button "POST"[^\n]*\[pressed\]/);
assert.doesNotMatch(snapshot, /switch "启用此代理"[^\n]*\[checked\]/);
action('click', 'button', '关闭');
const publicDir = cli('public_dir').trim();
const indexPath = resolve(publicDir, 'INDEX.md');
const catalog = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : '| 域名 | path | 功能 | 文件 |\n|---|---|---|---|\n';
copyFileSync(resolve('tests/browser/inspect-layout.js'), resolve(publicDir, 'devpocket-tools-inspect-layout.js'));
const line = '| 127.0.0.1:5173 | / 与 /popup.html | 检查可见根节点、尺寸与溢出 | devpocket-tools-inspect-layout.js |';
writeFileSync(indexPath, catalog.split('\n').filter(row => !row.includes('devpocket-tools-inspect-layout.js')).join('\n').trimEnd() + '\n' + line + '\n');
const layout = cli('evaluate', '--tab-id', tab, '--expression-file', resolve(publicDir, 'devpocket-tools-inspect-layout.js'));
const measured = JSON.parse(layout.match(/value: (\{.*\})/)[1]);
assert.ok(measured.popupHeight >= 340 && measured.popupHeight <= 580); assert.equal(measured.topGap, 52);
assert.equal(measured.transparentGap, 0); assert.equal(measured.headingBackground, 'rgb(255, 254, 253)');
assert.match(layout, /"shellWidth":\s*520/); assert.match(layout, /"overflow":\[\]/);
mkdirSync('docs/screenshots', { recursive: true });
const shot = cli('screenshot', '--tab-id', tab);
const path = shot.match(/path:\s*([^\n]+\.png)/)?.[1];
if (path) copyFileSync(path, resolve('docs/screenshots/proxy-popup.png'));
action('click', 'button', `删除代理 ${index}`); check('dialog "删除代理"');
action('click', 'button', '取消'); check(source);
action('click', 'button', `删除代理 ${index}`);
action('click', 'button', '确认删除');
assert.equal(snapshot.includes(source), false);
action('click', 'button', '关闭工具箱'); check('Popup 预览已关闭');
action('click', 'button', '重新打开'); check('来源 URL');
console.log('Proxy popup passed: empty rows, validation drafts, autosave, dialog, POST, switch, tool isolation, reload persistence, delete, 520px and no overflow.');
console.log('Layout:', layout.trim()); console.log('Tab:', tab);
