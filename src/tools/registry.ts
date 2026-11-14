import { ArrowLeftRight, Braces, Database, Link2, SlidersHorizontal, Clock, KeyRound, FlaskConical, Ban, Binary, Regex, GitCompareArrows, Palette, Hash, Send, Brush, ScanLine } from 'lucide-react';
export const tools = [
  { id: 'headers', name: '请求头管理', subtitle: '为每一次请求，加点自定义', description: '按 URL 为请求添加、覆盖或删除 Header，让环境切换和接口联调更顺手。', icon: SlidersHorizontal, available: true, tag: '网络调试' },
  { id: 'proxy', name: '资源代理', subtitle: '将网站资源指向本地', description: '将 JS、CSS、图片、字体与接口请求重定向到本地服务或指定 URL。', icon: ArrowLeftRight, available: true, tag: '网络调试' },
  { id: 'json', name: 'JSON 工具', subtitle: '', description: '格式化、校验、可折叠节点与左右结构对比，保留大整数和重复键。', icon: Braces, available: true, tag: '数据处理' },
  { id: 'storage', name: '站点存储', subtitle: '', description: '查看、编辑当前站点 Cookie、localStorage 和 sessionStorage。', icon: Database, available: true, tag: '网络调试' },
  { id: 'url', name: 'URL 工具', subtitle: '', description: '解析与编辑查询参数，支持百分号编码、解码和复制。', icon: Link2, available: true, tag: '效率工具' },
  { id: 'timestamp', name: '时间戳', subtitle: '', description: '秒、毫秒与含时区日期互转，查看 UTC 和本地时间。', icon: Clock, available: true, tag: '效率工具' },
  { id: 'jwt', name: 'JWT 解码', subtitle: '', description: '本地展示可折叠 Header／Payload，提示过期时间；不验证签名。', icon: KeyRound, available: true, tag: '数据处理' },
  { id: 'mocks', name: '接口 Mock', subtitle: '', description: '为页面 fetch／异步 XHR 设置 JSON、状态码与延迟。', icon: FlaskConical, available: true, tag: '网络调试' },
  { id: 'blocks', name: '请求阻断', subtitle: '', description: '按 URL、方法、资源类型阻止请求，验证失败降级。', icon: Ban, available: true, tag: '网络调试' },
  { id: 'codec', name: '文本编解码', subtitle: '', description: 'Base64、Unicode、HTML 实体转换与 UUID 生成。', icon: Binary, available: true, tag: '效率工具' },
  { id: 'regex', name: '正则测试', subtitle: '', description: '实时匹配高亮、捕获组与替换，独立 Worker 超时停止。', icon: Regex, available: true, tag: '数据处理' },
  { id: 'diff', name: '文本 Diff', subtitle: '', description: '左右逐行比较文本，标记新增、删除和修改。', icon: GitCompareArrows, available: true, tag: '数据处理' },
  { id: 'color', name: '颜色工具', subtitle: '', description: 'HEX、RGB、HSL 转换与 WCAG 文字对比度检查。', icon: Palette, available: true, tag: '效率工具' },
  { id: 'hash', name: '哈希计算', subtitle: '', description: '本地计算文本或文件的 SHA-256／SHA-512，不上传文件。', icon: Hash, available: true, tag: '数据处理' },
  { id: 'request', name: '接口请求', subtitle: '', description: '设置 URL、方法、Header 和正文，查看响应与耗时。', icon: Send, available: true, tag: '网络调试' },
  { id: 'cache', name: '缓存清理', subtitle: '', description: '选择清理当前站点 Cache Storage 与注销 Service Worker。', icon: Brush, available: true, tag: '网络调试' },
  { id: 'page', name: '页面调试', subtitle: '', description: '显示元素边界、关闭 CSS 动画、编辑文字，可恢复调试状态。', icon: ScanLine, available: true, tag: '效率工具' },
] as const;
export type ToolId = typeof tools[number]['id'];
