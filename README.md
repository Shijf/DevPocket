# DevPocket

DevPocket 是一个运行在 Chromium 浏览器工具栏中的前端调试工具箱。

它可以帮助你：

- 修改、删除请求 Header
- 代理本地 JS、CSS、图片和接口资源
- 阻断请求或模拟 fetch / XHR 响应
- 调试 JSON、URL、JWT、正则、文本和颜色
- 查看站点存储、缓存和页面状态

配置会自动保存，网页预览数据与扩展配置相互隔离。

## 安装运行

```bash
npm install
npm run dev
```

打开 `http://127.0.0.1:5173/popup.html` 可以预览 Popup。

构建浏览器扩展：

```bash
npm run build
```

然后打开浏览器的扩展管理页，开启开发者模式，选择「加载已解压的扩展程序」，加载项目中的 `dist` 目录。

## 使用

打开扩展后选择工具，填写配置并打开开关。以请求 Header 为例：

1. 填写 Header Key 和 Value。
2. 点击设置图标配置 URL、请求方法和操作。
3. 打开行开关或工具开关。
4. 重新发起请求或刷新页面。

修改会自动保存。URL 支持常见通配符，例如：

```text
*://*.example.com/*
http://localhost:3000/api/*
```

## 本地资源

需要把本地文件作为资源 URL 使用时：

```bash
npm run serve:local -- /absolute/path/to/assets 3000
```

然后在资源代理中把目标地址填写为 `http://127.0.0.1:3000/...`。

## 常用命令

```bash
npm run dev
npm run build
npm test
npm run check
```

项目使用 React、Vite、TypeScript 和 Manifest V3 构建。
