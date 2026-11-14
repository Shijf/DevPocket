// Run against the isolated documentation preview on port 5174.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const browserCli = process.env.DEVPOCKET_BROWSER_CLI || 'browser-cli';
const cli = (...args) => execFileSync(browserCli, args, { encoding: 'utf8', timeout: 30000 });
const temporary = mkdtempSync(resolve(tmpdir(), 'devpocket-capture-'));
const cropper = resolve(temporary, 'crop-screenshot');
process.on('exit', () => rmSync(temporary, { recursive: true, force: true }));
execFileSync('swiftc', ['scripts/crop-screenshot.swift', '-o', cropper]);
const opened = cli('new_tab', '--url', 'http://127.0.0.1:5174/popup.html', '--wait-until', 'domcontentloaded');
const tab = opened.match(/tabId:\s*(\S+)/)?.[1];
assert.ok(tab, opened);
function contents(output) {
  const path = output.match(/(?:snapshotPath|spillPath):\s*([^\n]+\.md)/)?.[1];
  return path && existsSync(path) ? readFileSync(path, 'utf8') : output;
}
let snapshot = contents(cli('reload', '--tab-id', tab, '--timeout-ms', '15000'));
function action(command, role, label, ...args) {
  const line = snapshot.split('\n').find(line => line.includes(`${role} "${label}"`) && line.includes('[ref='));
  assert.ok(line, `Missing ${label}\n${snapshot}`);
  snapshot = contents(cli(command, '--tab-id', tab, '--ref', line.match(/\[ref=(\w+)\]/)[1], ...args));
}
const click = label => action('click', 'button', label);
const fill = (label, value) => action('type', 'textbox', label, '--text', value, '--fill');
function check(text) {
  if (!snapshot.includes(text)) {
    cli('wait_for', '--tab-id', tab, '--text', text, '--timeout-ms', '15000');
    snapshot = contents(cli('snapshot', '--tab-id', tab));
  }
  assert.ok(snapshot.includes(text));
}
function value(expression) {
  return JSON.parse(cli('evaluate', '--tab-id', tab, '--expression', expression).match(/value:\s*([^\n]+)/)[1]);
}
mkdirSync('docs/screenshots', { recursive: true });
const captures = [];
function shot(name) {
  const rect = value('(document.querySelector("dialog[open]") ?? document.querySelector(".popup-tools")).getBoundingClientRect().toJSON()');
  const scale = value('window.devicePixelRatio');
  const viewportHeight = value('window.innerHeight');
  assert.ok(rect.width > 0 && rect.width <= 520);
  assert.ok(rect.height <= 580 && rect.bottom <= viewportHeight, 'Popup must fit in the viewport.');
  const output = cli('screenshot', '--tab-id', tab);
  const raw = output.match(/path:\s*([^\n]+\.png)/)?.[1];
  assert.ok(raw, output);
  const target = resolve(`docs/screenshots/guide-${name}.png`);
  execFileSync(cropper, [raw, target, String(Math.round(rect.x * scale)), String(Math.round(rect.y * scale)), String(Math.ceil(rect.width * scale)), String(Math.ceil(rect.height * scale))]);
  captures.push({ file: `guide-${name}.png`, width: rect.width, height: rect.height });
  console.log(`Captured ${name}`);
}
check('DevPocket'); shot('headers');
click('Header 1 详细设置'); shot('header-settings'); click('关闭');
click('资源代理');
fill('代理 1 来源', 'https://example.com/app.js');
fill('代理 1 目标', 'http://localhost:3000/app.js');
check('http://localhost:3000/app.js'); shot('proxy');
click('JSON');
fill('JSON 内容', '{"name":"DevPocket","version":1,"features":{"mock":false,"proxy":true},"tags":["debug","web"]}');
click('对比');
fill('右侧 JSON 内容', '{"name":"DevPocket","version":2,"features":{"mock":true,"proxy":true},"tags":["debug","web"],"ready":true}');
check('修改'); shot('json-compare');
click('URL'); fill('URL / 待编解码文本', 'https://example.com/search?env=staging&tag=debug&tag=web#results'); shot('url');
click('更多工具'); shot('more-tools');
click('调整工具顺序'); shot('tool-order'); click('关闭');
click('更多工具'); click('接口 Mock');
if (snapshot.includes('button "接口 Mock 1 详细设置"')) click('接口 Mock 1 详细设置');
else click('添加接口 Mock');
fill('接口 Mock匹配 URL', '*://api.example.com/users/*');
fill('Mock 响应正文', '{"id":42,"name":"Demo user","status":"ready"}');
check('Demo user'); shot('mock-settings'); click('关闭');
writeFileSync('docs/screenshots/guide-captures.json', JSON.stringify({ brand: 'DevPocket', source: 'isolated localhost:5174 web preview; demonstration data; Chinese UI', captures }, null, 2) + '\n');
console.log('Guide screenshots captured. No native extension network validation performed.');
