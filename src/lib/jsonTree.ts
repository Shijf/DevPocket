import { checkTextSize } from './devtools';

export interface JsonNode {
  kind: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  raw: string;
  children: { key: string; node: JsonNode }[];
}
export type DiffStatus = 'same' | 'added' | 'removed' | 'modified';
export interface JsonDiff {
  id: string;
  label: string;
  left?: JsonNode;
  right?: JsonNode;
  status: DiffStatus;
  children: JsonDiff[];
}

export function parseJsonTree(text: string): JsonNode {
  checkTextSize(text);
  const source = text.trim();
  if (!source) throw new Error('请先粘贴 JSON。');
  try { JSON.parse(source); } catch (error) { throw new Error(`JSON 格式错误：${(error as Error).message}`); }
  const tokens = source.match(/"(?:\\.|[^"\\])*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\],:]/g)!;
  let cursor = 0, count = 0;
  function read(depth: number): JsonNode {
    if (depth > 64) throw new Error('节点视图最多支持 64 层嵌套，请使用文本模式。');
    if (++count > 20_000) throw new Error('节点视图最多支持 2 万个节点，请使用文本模式。');
    const raw = tokens[cursor++];
    if (raw === '{' || raw === '[') {
      const children: JsonNode['children'] = [], close = raw === '{' ? '}' : ']';
      while (tokens[cursor] !== close) {
        const key = raw === '{' ? JSON.parse(tokens[cursor++]) as string : String(children.length);
        if (raw === '{') cursor++; // colon; JSON.parse already validated the grammar
        children.push({ key, node: read(depth + 1) });
        if (tokens[cursor] === ',') cursor++;
      }
      cursor++;
      return { kind: raw === '{' ? 'object' : 'array', raw, children };
    }
    return { kind: raw[0] === '"' ? 'string' : raw === 'null' ? 'null' : raw === 'true' || raw === 'false' ? 'boolean' : 'number', raw, children: [] };
  }
  return read(0);
}

// Normalize a decimal as digits + exponent without converting through Number.
function decimal(raw: string): string {
  const [coefficient, exponent = '0'] = raw.toLowerCase().split('e');
  const negative = coefficient.startsWith('-');
  const unsigned = negative ? coefficient.slice(1) : coefficient;
  const [whole, fraction = ''] = unsigned.split('.');
  let digits = (whole + fraction).replace(/^0+/, '');
  if (!digits) return '0';
  const zeroes = digits.length - digits.replace(/0+$/, '').length;
  digits = digits.slice(0, digits.length - zeroes);
  return `${negative ? '-' : ''}${digits}e${BigInt(exponent) - BigInt(fraction.length) + BigInt(zeroes)}`;
}
export function isContainer(node?: JsonNode): boolean {
  return node?.kind === 'object' || node?.kind === 'array';
}
function entries(node?: JsonNode) {
  const occurrences = new Map<string, number>();
  return (node?.children ?? []).map(entry => {
    const occurrence = occurrences.get(entry.key) ?? 0;
    occurrences.set(entry.key, occurrence + 1);
    return { ...entry, identity: `${JSON.stringify(entry.key)}#${occurrence}` };
  });
}

export function compareJson(left?: JsonNode, right?: JsonNode, id = '$', label = '$'): JsonDiff {
  const leftEntries = entries(left), rightEntries = entries(right);
  const compatible = left?.kind === right?.kind;
  const rightMap = new Map(rightEntries.map(entry => [entry.identity, entry]));
  const leftKeys = new Set(leftEntries.map(entry => entry.identity));
  const children = leftEntries.map(entry => compareJson(entry.node, compatible ? rightMap.get(entry.identity)?.node : undefined, `${id}/${encodeURIComponent(entry.identity)}`, entry.key));
  rightEntries.filter(entry => !compatible || !leftKeys.has(entry.identity)).forEach(entry => children.push(compareJson(undefined, entry.node, `${id}/${compatible ? '' : 'right:'}${encodeURIComponent(entry.identity)}`, entry.key)));
  let status: DiffStatus = !left ? 'added' : !right ? 'removed' : 'same';
  if (left && right) {
    const sameValue = left.kind === 'number' && right.kind === 'number' ? decimal(left.raw) === decimal(right.raw)
      : left.kind === 'string' && right.kind === 'string' ? JSON.parse(left.raw) === JSON.parse(right.raw) : left.raw === right.raw;
    if (!compatible || (isContainer(left) ? children.some(child => child.status !== 'same') : !sameValue)) status = 'modified';
  }
  return { id, label, left, right, status, children };
}
export function diffCounts(root: JsonDiff): { added: number; removed: number; modified: number } {
  const counts = { added: 0, removed: 0, modified: 0 };
  function visit(node: JsonDiff) {
    if (node.status === 'same') return;
    if (node.status === 'added' || node.status === 'removed') { counts[node.status]++; return; }
    if (!isContainer(node.left) || node.left?.kind !== node.right?.kind) { counts.modified++; return; }
    node.children.forEach(visit);
  }
  visit(root);
  return counts;
}
