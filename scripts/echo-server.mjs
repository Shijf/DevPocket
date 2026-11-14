import { createServer } from 'node:http';
const server = createServer((request, response) => {
  if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return; }
  if (request.url?.startsWith('/echo')) {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ method: request.method, url: request.url, headers: request.headers }, null, 2));
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>请求头验证</title><style>body{font:15px system-ui;margin:40px;line-height:1.7;color:#303038}button{padding:10px 18px;cursor:pointer}pre{padding:20px;background:#f6f6f8;white-space:pre-wrap;word-break:break-word}</style><h1>DevPocket 请求头验证</h1><p>插件中创建 URL 为 http://127.0.0.1:8787/echo* 的规则，设置 x-swimlane = feature-dev，然后点击下方按钮。</p><button id="send">发起请求</button><pre id="result">等待请求…</pre><script>document.getElementById('send').onclick=async()=>{try{const response=await fetch('/echo?t='+Date.now(),{headers:{'x-existing':'original'}});document.getElementById('result').textContent=await response.text()}catch(error){document.getElementById('result').textContent=String(error)}};</script></html>`);
});
server.listen(8787, '127.0.0.1', () => console.log('Header echo server: http://127.0.0.1:8787'));
