export interface DiffLine { left?: string; right?: string; kind: 'same' | 'added' | 'removed' | 'changed' }
export function textDiff(left: string, right: string): DiffLine[] {
  if (left.length + right.length > 200000) throw new Error('对比内容合计最多 20 万字符。');
  const a = left.split('\n'), b = right.split('\n');
  if (a.length > 1000 || b.length > 1000) throw new Error('每侧最多 1000 行，请缩小对比范围。');
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const rows: DiffLine[] = []; let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { rows.push({ left: a[i++], right: b[j++], kind: 'same' }); continue; }
    const removed: string[] = [], added: string[] = [];
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) break;
      if (j === b.length || (i < a.length && dp[i + 1][j] >= dp[i][j + 1])) removed.push(a[i++]); else added.push(b[j++]);
    }
    for (let k = 0; k < Math.max(removed.length, added.length); k++) rows.push({ left: removed[k], right: added[k], kind: removed[k] === undefined ? 'added' : added[k] === undefined ? 'removed' : 'changed' });
  }
  return rows;
}
export interface ParsedColor { hex: string; rgb: string; hsl: string; channels: [number, number, number] }
export function parseColor(input: string): ParsedColor {
  const text = input.trim().toLowerCase(); let channels: [number, number, number];
  const hex = text.match(/^#([a-f\d]{3}|[a-f\d]{6})$/);
  const rgb = text.match(/^rgb\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*\)$/);
  const hsl = text.match(/^hsl\(\s*([+-]?[\d.]+)(?:deg)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%\s*\)$/);
  if (hex) { const value = hex[1].length === 3 ? [...hex[1]].map(c => c + c).join('') : hex[1]; channels = [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16)) as typeof channels; }
  else if (rgb) { channels = rgb.slice(1).map(Number) as typeof channels; if (channels.some(c => !Number.isFinite(c) || c < 0 || c > 255)) throw new Error('RGB 通道范围是 0–255。'); channels = channels.map(Math.round) as typeof channels; }
  else if (hsl) {
    let [h, s, l] = hsl.slice(1).map(Number);
    if (![h, s, l].every(Number.isFinite) || s < 0 || s > 100 || l < 0 || l > 100) throw new Error('HSL 饱和度、亮度范围是 0–100%。');
    h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100;
    const hue = (p: number, q: number, t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    channels = (s === 0 ? [l, l, l] : [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)]).map(c => Math.round(c * 255)) as typeof channels;
  } else throw new Error('请输入 #RGB、#RRGGBB、rgb(…) 或 hsl(…)。');
  const [r, g, b] = channels.map(c => c / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360;
  return { channels, hex: '#' + channels.map(c => c.toString(16).padStart(2, '0')).join(''), rgb: `rgb(${channels.join(', ')})`, hsl: `hsl(${Math.round(h)}, ${+(s * 100).toFixed(1)}%, ${+(l * 100).toFixed(1)}%)` };
}
export function contrastRatio(a: ParsedColor, b: ParsedColor): number {
  const luminance = (color: ParsedColor) => color.channels.map(c => { const x = c / 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }).reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0);
  const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
export async function hashBytes(bytes: Uint8Array, algorithm: 'SHA-256' | 'SHA-512'): Promise<string> {
  if (bytes.byteLength > 20 * 1024 * 1024) throw new Error('文件或文本最多 20 MB。');
  const result = await crypto.subtle.digest(algorithm, bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(result)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export interface RegexInput { pattern: string; flags: string; text: string; replacement: string }
export interface RegexMatch { index: number; value: string; groups: (string | undefined)[]; named?: Record<string, string> }
export function matchRegex(input: RegexInput) {
  if (input.text.length > 100000 || input.pattern.length > 2048) throw new Error('文本最多 10 万字符，正则最多 2048 字符。');
  if (!/^[dgimsuvy]*$/.test(input.flags) || new Set(input.flags).size !== input.flags.length) throw new Error('正则标志无效或重复。');
  const regex = new RegExp(input.pattern, input.flags), matches: RegexMatch[] = []; let match: RegExpExecArray | null;
  while ((match = regex.exec(input.text))) {
    matches.push({ index: match.index, value: match[0], groups: match.slice(1), named: match.groups });
    if (!regex.global) break;
    if (matches.length >= 500) return { matches, clipped: true, replaced: null };
    if (!match[0].length) { const next = regex.lastIndex; regex.lastIndex += regex.unicode || input.flags.includes('v') ? (input.text.codePointAt(next) ?? 0) > 0xffff ? 2 : 1 : 1; }
  }
  const replaced = input.text.replace(new RegExp(input.pattern, input.flags), input.replacement);
  if (replaced.length > 200000) throw new Error('替换结果超过 20 万字符，请缩小范围。');
  return { matches, clipped: false, replaced };
}
