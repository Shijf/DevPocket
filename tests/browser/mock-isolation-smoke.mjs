import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
const base = 'http://127.0.0.1:5173';
const browserCli = process.env.DEVPOCKET_BROWSER_CLI || 'browser-cli';
const cli = (...args) => execFileSync(browserCli, args, { encoding: 'utf8', timeout: 30000 });
const publicDir = cli('public_dir').trim();
const catalog = readFileSync(resolve(publicDir, 'INDEX.md'), 'utf8');
assert.ok(catalog.includes('devpocket-tools-inspect-layout.js'), 'Run utilities browser checks first to prepare the shared layout inspector.');
function contents(output) { const path = output.match(/(?:snapshotPath|spillPath|output):\s*([^\n]+\.(?:md|json))/)?.[1]; return path && existsSync(path) ? readFileSync(path, 'utf8') : output; }
const opened = cli('new_tab', '--url', base + '/popup.html', '--timeout-ms', '15000');
const tab = opened.match(/tabId:\s*(\S+)/)?.[1] || opened.match(/^tab (\S+)/m)?.[1]; assert.ok(tab, opened);
let snapshot = contents(cli('reload', '--tab-id', tab, '--timeout-ms', '15000'));
function ref(role, label) { const line = snapshot.split('\n').find(line => line.includes(`${role} "${label}"`) && line.includes('[ref=')); assert.ok(line, `Missing ${role} ${label}\n${snapshot}`); return line.match(/\[ref=(\w+)\]/)[1]; }
function action(command, role, label, ...args) { snapshot = contents(cli(command, '--tab-id', tab, '--ref', ref(role, label), ...args, '--timeout-ms', '15000')); }
function check(text) { if (!snapshot.includes(text)) { cli('wait_for', '--tab-id', tab, '--text', text, '--timeout-ms', '15000'); snapshot = contents(cli('snapshot', '--tab-id', tab)); } assert.ok(snapshot.includes(text), `Missing ${text}`); }
function tool(name) { action('click', 'button', '更多工具'); action('click', 'button', name); }
function fill(label, value) { action('type', 'textbox', label, '--text', value, '--fill'); }
function layout() {
  const raw = cli('evaluate', '--tab-id', tab, '--expression-file', resolve(publicDir, 'devpocket-tools-inspect-layout.js'));
  assert.match(raw, /"shellWidth":\s*520/); assert.match(raw, /"overflow":\[\]/);
  const data = JSON.parse(raw.match(/value: (\{.*\})/)[1]); assert.ok(data.popupHeight <= 580); console.log(raw.trim());
}
if (!snapshot.includes('button "接口 Mock"')) action('click', 'button', '更多工具');
action('click', 'button', '接口 Mock');
const index = (snapshot.match(/textbox "接口 Mock \d+ URL"/g) || []).length + 1;
action('click', 'button', '添加接口 Mock'); check('dialog "接口 Mock详细设置"');
fill('接口 Mock匹配 URL', '*://*.mock-isolation.example/api/*'); check('通配域名规则未指定页面时不会生效');
fill('Mock 生效页面', 'https://app.mock-isolation.example'); check('已自动保存');
fill('Mock 响应正文', '{"scoped":true}'); check('已自动保存');
fill('Mock 生效页面', 'https://*.mock-isolation.example'); check('生效页面应为完整');
fill('Mock 生效页面', 'https://app.mock-isolation.example:8443'); check('已自动保存'); layout();
action('click', 'switch', '启用此规则');
assert.match(snapshot, /textbox "Mock 生效页面"[^\n]*\[disabled\]/);
action('click', 'switch', '启用此规则'); check('已自动保存'); action('click', 'button', '关闭');
snapshot = contents(cli('reload', '--tab-id', tab, '--timeout-ms', '15000'));
if (!snapshot.includes('button "接口 Mock"')) action('click', 'button', '更多工具');
action('click', 'button', '接口 Mock'); action('click', 'button', `接口 Mock ${index} 详细设置`);
check('https://app.mock-isolation.example:8443'); check('scoped'); action('click', 'button', '关闭');
action('click', 'button', `删除接口 Mock ${index}`); action('click', 'button', '确认删除'); check('已自动保存');
snapshot = contents(cli('navigate', '--tab-id', tab, '--url', base + '/tests/browser/mock-fixture.html', '--timeout-ms', '15000'));
action('click', 'button', '验证 Mock 运行时'); check('ALL MOCK CHECKS PASSED'); console.log(snapshot);
