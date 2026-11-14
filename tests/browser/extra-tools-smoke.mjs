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
if (!process.argv.includes('--runtime-only')) {
tool('时间戳'); fill('时间戳内容', '0'); action('click', 'button', '转为日期'); check('1970-01-01');
fill('时间戳内容', '2026-11-07T20:00:00+08:00'); action('click', 'button', '转为时间戳'); check('毫秒');
fill('时间戳内容', 'bad'); action('click', 'button', '转为日期'); check('请输入有效'); layout();
tool('JWT 解码'); const b64 = text => Buffer.from(text).toString('base64url');
fill('JWT内容', `${b64('{"alg":"HS256"}')}.${b64('{"exp":1,"user":{"id":900719925474099312345}}')}.sig`); check('已过期'); check('900719925474099312345');
action('click', 'button', '左侧折叠节点 user'); check('左侧展开节点 user'); fill('JWT内容', 'bad'); check('请输入三段式'); layout();
tool('文本编解码'); fill('文本编解码内容', '中文 👋'); action('click', 'button', '编码'); check('5Lit5paH');
fill('文本编解码内容', Buffer.from('中文 👋').toString('base64')); action('click', 'button', '解码'); check('中文 👋');
action('click', 'button', '生成 UUID'); assert.match(snapshot, /[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}/);
action('click', 'button', '清空文本编解码'); action('click', 'button', '取消'); check('文本编解码结果'); layout();
tool('请求阻断'); action('click', 'button', '添加请求阻断'); fill('请求阻断 1 URL', '*://block-extra.example/api/*'); check('已自动保存');
action('click', 'switch', '请求阻断 1 开关'); assert.match(snapshot, /textbox "请求阻断 1 URL"[^\n]*\[disabled\]/); action('click', 'switch', '请求阻断 1 开关');
action('click', 'button', '请求阻断 1 详细设置'); action('click', 'button', 'GET'); check('已自动保存'); action('click', 'button', '关闭');
action('click', 'button', '删除请求阻断 1'); action('click', 'button', '取消'); check('block-extra.example'); layout();
tool('接口 Mock'); const mockIndex = (snapshot.match(/textbox "接口 Mock \d+ URL"/g) || []).length + 1;
action('click', 'button', '添加接口 Mock'); check('dialog "接口 Mock详细设置"'); fill('接口 Mock匹配 URL', '*://mock-extra.example/api/*'); check('已自动保存');
fill('Mock 响应正文', '{"message":"中文","id":900719925474099312345}'); check('已自动保存');
action('type', 'spinbutton', 'Mock 状态码', '--text', '503', '--fill'); action('type', 'spinbutton', 'Mock 延迟', '--text', '20', '--fill'); check('已自动保存');
fill('Mock 响应正文', '{bad}'); check('JSON 响应正文格式无效'); fill('Mock 响应正文', '{"ok":true}'); check('已自动保存'); action('click', 'button', '关闭');
action('click', 'switch', '接口 Mock开关'); assert.match(snapshot, new RegExp(`textbox "接口 Mock ${mockIndex} URL"[^\\n]*\\[disabled\\]`)); action('click', 'switch', '接口 Mock开关'); layout();
snapshot = contents(cli('reload', '--tab-id', tab, '--timeout-ms', '15000')); tool('接口 Mock'); check('mock-extra.example'); tool('请求阻断'); check('block-extra.example');
tool('站点存储'); action('click', 'button', '读取当前站点'); check('preview.example'); action('click', 'button', '添加存储项'); fill('存储名称', 'devpocket-extra-test'); fill('存储值', 'original'); action('click', 'button', '创建存储项'); check('已创建');
action('click', 'button', '编辑存储 devpocket-extra-test'); fill('存储值', 'edited'); action('click', 'button', '关闭'); check('已自动写入'); check('edited');
action('click', 'button', '删除存储 devpocket-extra-test'); action('click', 'button', '取消'); check('edited'); action('click', 'button', '删除存储 devpocket-extra-test'); action('click', 'button', '确认删除'); check('已删除'); layout();
for (const area of ['sessionStorage', 'Cookie']) { action('click', 'button', area); action('click', 'button', '读取当前站点'); check('已读取'); }
try { const shot = cli('screenshot', '--tab-id', tab); const shotPath = shot.match(/path:\s*([^\n]+\.png)/)?.[1]; if (shotPath) { mkdirSync('docs/screenshots', { recursive: true }); copyFileSync(shotPath, resolve('docs/screenshots/storage-popup.png')); } }
catch (error) { if (!String(error.stdout).includes('ELECTRON_CAPTURE_BUSY')) throw error; console.log('Optional screenshot skipped: host native capture is busy.'); }
action('click', 'button', '更多工具'); check('更多工具'); check('JWT 解码'); action('click', 'button', '关闭');
console.log('Six tool UI checks passed: conversions/errors, JWT folding, rule toggles/details/drafts, storage CRUD/confirmation, compact layout.');
}
const fixture = cli('navigate', '--tab-id', tab, '--url', base + '/tests/browser/mock-fixture.html', '--timeout-ms', '15000'); snapshot = contents(fixture); action('click', 'button', '验证 Mock 运行时'); check('ALL MOCK CHECKS PASSED'); console.log(snapshot);
