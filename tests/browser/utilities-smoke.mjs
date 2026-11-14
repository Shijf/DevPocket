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
const tab = opened.match(/tabId:\s*(\S+)/)?.[1] || opened.match(/^tab (\S+)/m)?.[1]; assert.ok(tab, opened);
let snapshot = contents(cli('reload', '--tab-id', tab, '--timeout-ms', '15000'));
function ref(role, label) {
  const line = snapshot.split('\n').find(line => line.includes(`${role} "${label}"`) && line.includes('[ref='));
  assert.ok(line, `Missing ${role} ${label}`); return line.match(/\[ref=(\w+)\]/)[1];
}
function action(command, role, label, ...args) { snapshot = contents(cli(command, '--tab-id', tab, '--ref', ref(role, label), ...args, '--timeout-ms', '15000')); }
function check(text) {
  if (!snapshot.includes(text)) { cli('wait_for', '--tab-id', tab, '--text', text, '--timeout-ms', '15000'); snapshot = contents(cli('snapshot', '--tab-id', tab)); }
  assert.ok(snapshot.includes(text), `Missing ${text}`);
}
action('click', 'button', 'JSON');
check('解析结果');
action('type', 'textbox', 'JSON 内容', '--text', '{bad}', '--fill');
action('click', 'button', '格式化 / 校验'); check('JSON 格式错误');
action('type', 'textbox', 'JSON 内容', '--text', '{"id":900719925474099312345,"items":[1,2]}', '--fill');
action('click', 'button', '格式化 / 校验'); check('已格式化'); check('900719925474099312345');
action('click', 'button', '压缩 JSON'); check('已压缩');
action('click', 'button', '节点'); check('左侧 JSON 节点');
action('click', 'button', '显示行号'); assert.match(snapshot, /button "显示行号"[^\n]*\[pressed\]/);
action('click', 'button', '左侧折叠节点 items');
assert.match(snapshot, /button "左侧展开节点 items"/);
action('click', 'button', '展开全部节点'); check('左侧折叠节点 items');
action('click', 'button', '对比');
action('type', 'textbox', '右侧 JSON 内容', '--text', '{"id":900719925474099312346,"items":[1,3],"extra":true}', '--fill');
check('新增 1'); check('修改 2'); check('右侧 JSON 节点');
const compareShot = cli('screenshot', '--tab-id', tab), comparePath = compareShot.match(/path:\s*([^\n]+\.png)/)?.[1];
mkdirSync('docs/screenshots', { recursive: true }); if (comparePath) copyFileSync(comparePath, resolve('docs/screenshots/json-compare-popup.png'));
action('click', 'button', '左侧折叠节点 items'); check('右侧展开节点 items');
action('click', 'button', '右侧展开节点 items'); check('左侧折叠节点 items');
action('click', 'button', '清空 JSON'); check('确定清空右侧');
action('click', 'button', '取消'); check('900719925474099312346');
action('type', 'textbox', '右侧 JSON 内容', '--text', '{bad}', '--fill'); check('JSON 格式错误');
action('type', 'textbox', '右侧 JSON 内容', '--text', '{"id":900719925474099312345,"items":[1,2]}', '--fill'); check('两侧 JSON 一致');
snapshot = contents(cli('reload', '--tab-id', tab, '--timeout-ms', '15000'));
action('click', 'button', 'JSON'); action('click', 'button', '对比'); check('900719925474099312345'); check('两侧 JSON 一致');
action('click', 'button', '文本');
action('click', 'button', 'URL');
const url = 'https://example.com/path?tag=a&tag=b#section';
action('type', 'textbox', 'URL / 待编解码文本', '--text', url, '--fill');
check('example.com'); check('参数 2 Value');
action('type', 'textbox', '参数 2 Value', '--text', '中 文', '--fill'); check('%E4%B8%AD+%E6%96%87'); check('#section');
action('click', 'button', '添加参数'); check('参数 3 Key');
action('click', 'button', '删除参数 3'); check('dialog "删除参数"');
action('click', 'button', '取消'); check('参数 3 Key');
action('click', 'button', '删除参数 3'); action('click', 'button', '确认删除'); assert.equal(snapshot.includes('参数 3 Key'), false);
snapshot = contents(cli('reload', '--tab-id', tab, '--timeout-ms', '15000'));
action('click', 'button', 'URL'); check('%E4%B8%AD+%E6%96%87'); check('参数 2 Value');
action('click', 'button', 'JSON'); check('900719925474099312345');
action('click', 'button', '清空 JSON'); action('click', 'button', '确认清空');
action('click', 'button', 'URL');
action('type', 'textbox', 'URL / 待编解码文本', '--text', '中文 /?', '--fill');
action('click', 'button', '编码'); check('%E4%B8%AD'); check('已编码');
action('click', 'button', '解码'); check('中文 /?'); check('已解码');
action('type', 'textbox', 'URL / 待编解码文本', '--text', '%ZZ', '--fill');
action('click', 'button', '解码'); check('编码不完整');
action('click', 'button', '清空 URL'); action('click', 'button', '确认清空');
const publicDir = cli('public_dir').trim(), indexPath = resolve(publicDir, 'INDEX.md');
const catalog = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : '| 域名 | path | 功能 | 文件 |\n|---|---|---|---|\n';
copyFileSync(resolve('tests/browser/inspect-layout.js'), resolve(publicDir, 'devpocket-tools-inspect-layout.js'));
writeFileSync(indexPath, catalog.split('\n').filter(row => !row.includes('devpocket-tools-inspect-layout.js')).join('\n').trimEnd() + '\n| 127.0.0.1:5173 | / 与 /popup.html | 检查可见工具、尺寸与溢出 | devpocket-tools-inspect-layout.js |\n');
for (const tool of ['JSON', 'URL']) {
  action('click', 'button', tool);
  const layout = cli('evaluate', '--tab-id', tab, '--expression-file', resolve(publicDir, 'devpocket-tools-inspect-layout.js'));
  assert.match(layout, /"shellWidth":\s*520/); assert.match(layout, /"overflow":\[\]/);
  console.log(tool, layout.trim());
  const shot = cli('screenshot', '--tab-id', tab), path = shot.match(/path:\s*([^\n]+\.png)/)?.[1];
  mkdirSync('docs/screenshots', { recursive: true }); if (path) copyFileSync(path, resolve(`docs/screenshots/${tool.toLowerCase()}-popup.png`));
}
action('click', 'button', 'JSON'); action('click', 'button', '对比');
const compareLayout = cli('evaluate', '--tab-id', tab, '--expression-file', resolve(publicDir, 'devpocket-tools-inspect-layout.js'));
const compareMeasured = JSON.parse(compareLayout.match(/value: (\{.*\})/)[1]);
assert.equal(compareMeasured.shellWidth, 520); assert.ok(compareMeasured.popupHeight <= 580); assert.deepEqual(compareMeasured.overflow, []);
console.log('Compare', compareLayout.trim());
action('click', 'button', '请求头'); check('Header 1 开关');
action('click', 'button', '资源代理'); check('来源 URL');
console.log('Utilities UI passed: JSON errors/format/minify/large IDs, URL duplicate params/edit/add/delete, codec errors, independent drafts, reload, tool switching, 520px and no overflow.');
