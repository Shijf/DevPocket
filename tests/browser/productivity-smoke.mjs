import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const browserCli = process.env.DEVPOCKET_BROWSER_CLI || 'browser-cli';
const cli = (...args) => execFileSync(browserCli, args, { encoding: 'utf8', timeout: 30000 });
const publicDir = cli('public_dir').trim();
assert.ok(readFileSync(resolve(publicDir, 'INDEX.md'), 'utf8').includes('devpocket-tools-inspect-layout.js'));
function contents(output) { const path = output.match(/(?:snapshotPath|spillPath|output):\s*([^\n]+\.(?:md|json))/)?.[1]; return path && existsSync(path) ? readFileSync(path, 'utf8') : output; }
const opened = cli('new_tab', '--url', 'http://127.0.0.1:5173/popup.html', '--timeout-ms', '15000');
const tab = opened.match(/tabId:\s*(\S+)/)?.[1] || opened.match(/^tab (\S+)/m)?.[1]; assert.ok(tab, opened);
let snapshot = contents(cli('reload', '--tab-id', tab, '--timeout-ms', '15000'));
function ref(role, label) { const line = snapshot.split('\n').find(line => line.includes(`${role} "${label}"`) && line.includes('[ref=')); assert.ok(line, `Missing ${role} ${label}\n${snapshot}`); return line.match(/\[ref=(\w+)\]/)[1]; }
function action(command, role, label, ...args) { snapshot = contents(cli(command, '--tab-id', tab, '--ref', ref(role, label), ...args, '--timeout-ms', '15000')); }
function check(text) { if (!snapshot.includes(text)) { cli('wait_for', '--tab-id', tab, '--text', text, '--timeout-ms', '15000'); snapshot = contents(cli('snapshot', '--tab-id', tab)); } assert.ok(snapshot.includes(text), `Missing ${text}\n${snapshot}`); }
function tool(name) { action('click', 'button', '更多工具'); action('click', 'button', name); }
function fill(label, value) { action('type', 'textbox', label, '--text', value, '--fill'); }
function layout() { const raw = cli('evaluate', '--tab-id', tab, '--expression-file', resolve(publicDir, 'devpocket-tools-inspect-layout.js')); assert.match(raw, /"shellWidth":\s*520/); assert.match(raw, /"overflow":\[\]/); const data = JSON.parse(raw.match(/value: (\{.*\})/)[1]); assert.ok(data.popupHeight <= 580); }
function clickSummary(label) { const line = snapshot.split('\n').find(line => line.includes(`"${label}"`) && line.includes('[ref=') && !line.includes('textbox')); assert.ok(line, snapshot); snapshot = contents(cli('click', '--tab-id', tab, '--ref', line.match(/\[ref=(\w+)\]/)[1], '--timeout-ms', '15000')); }
const pagesOnly = process.argv.includes('--pages-only');
if (!pagesOnly) {
action('click', 'button', '更多工具'); fill('搜索工具', '正则'); check('button "正则测试"'); assert.ok(!snapshot.includes('button "时间戳"')); action('click', 'button', '正则测试');
fill('正则表达式', '(\\w+)@(\\w+)'); fill('匹配文本', 'alice@mail bob@test'); fill('正则替换内容', '$1 ($2)'); check('2 个匹配'); clickSummary('替换结果'); check('alice (mail) bob (test)'); layout();
fill('正则表达式', '['); check('Invalid regular expression'); fill('正则表达式', '(a+)+$'); fill('匹配文本', 'a'.repeat(2000) + '!'); check('正则执行超时'); fill('正则表达式', 'alice'); fill('匹配文本', 'alice'); check('1 个匹配');
action('click', 'button', '清空正则测试'); action('click', 'button', '取消'); check('alice'); console.log('Regex: captures/replacement/errors/timeout/cancel clear passed');
tool('文本 Diff'); fill('左侧文本', 'first\nold\nlast'); fill('右侧文本', 'first\nnew\nlast'); action('click', 'button', '比较文本'); check('修改 1'); check('− old'); check('+ new'); layout();
fill('右侧文本', 'first\nold\nlast'); action('click', 'button', '比较文本'); check('内容一致'); console.log('Text diff: aligned changes and equality passed');
tool('颜色工具'); fill('文字颜色', '#000'); fill('背景颜色', '#fff'); check('21.00 : 1'); check('AAA 通过'); fill('文字颜色', 'hsl(24, 100%, 50%)'); check('#ff6600'); fill('文字颜色', '#bad-color'); check('请输入'); fill('文字颜色', '#333'); layout(); console.log('Color: conversion/contrast/invalid input passed');
tool('哈希计算'); fill('哈希文本', 'abc'); action('click', 'button', '计算哈希'); check('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'); action('select_option', 'combobox', '哈希算法', '--label', 'SHA-512'); action('click', 'button', '计算哈希'); check('ddaf35a193617abacc417349ae20413112'); layout(); console.log('Hash: both algorithms passed');
tool('接口请求'); fill('请求 URL', 'http://127.0.0.1:5173/tests/browser/native.json'); action('click', 'button', '发送请求'); check('200 OK'); check('native'); assert.ok(snapshot.includes('true')); action('click', 'button', '响应 Header'); check('content-type'); layout(); fill('请求 URL', 'file:///tmp/example'); action('click', 'button', '发送请求'); check('仅支持'); console.log('Request: real browser fetch/response headers/invalid URL passed');
}
tool('缓存清理'); action('click', 'button', '读取当前页面'); check('demo-assets-v1'); action('click', 'checkbox', '清理缓存 demo-assets-v1'); action('click', 'button', '清理选中的 1 项'); check('确认清理站点缓存'); action('click', 'button', '取消'); check('demo-assets-v1'); action('click', 'button', '清理选中的 1 项'); action('click', 'button', '确认清理'); check('已清理 1 项'); assert.ok(!snapshot.includes('checkbox "清理缓存 demo-assets-v1"')); check('demo-api-v1'); layout(); console.log('Cache: selection/confirmation/cancel/unselected preservation passed');
tool('页面调试'); action('click', 'button', '读取当前页面'); for (const name of ['显示元素边界', '关闭 CSS 动画', '编辑页面文字']) { action('click', 'switch', name); check('页面调试状态已更新'); assert.match(snapshot, new RegExp(`switch "${name}" \\[checked\\]`)); }
action('click', 'button', '恢复页面调试'); check('已恢复页面调试状态'); assert.ok(!snapshot.includes('[checked]')); layout(); console.log('Page debug: all toggles and restore passed');
// Page operations register with the close queue and still work after reopening the popup.
action('click', 'button', '关闭工具箱'); check('Popup 预览已关闭'); action('click', 'button', '重新打开'); check('显示元素边界');
if (!pagesOnly) {
snapshot = contents(cli('reload', '--tab-id', tab, '--timeout-ms', '15000')); tool('文本 Diff'); check('first'); tool('正则测试'); check('alice');
snapshot = contents(cli('navigate', '--tab-id', tab, '--url', 'http://127.0.0.1:5173/tests/browser/productivity-fixture.html', '--timeout-ms', '15000')); action('click', 'button', '验证新增工具运行时'); check('ALL PRODUCTIVITY RUNTIME CHECKS PASSED'); console.log(snapshot);
console.log('Seven new tools passed UI, layout, draft restore and runtime checks. Chrome API orchestration is covered by adapter tests; native MV3 validation remains manual.');
} else console.log('Cache/page UI, confirmation, restore, close/reopen and layout checks passed.');
