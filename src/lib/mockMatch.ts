// Match the existing URL wildcard grammar without JavaScript RegExp backtracking.
function globMatches(pattern: string, value: string): boolean {
  const parts = pattern.split('*');
  if (parts.length === 1) return value === pattern;
  if (!value.startsWith(parts[0])) return false;
  let offset = parts[0].length;
  for (const part of parts.slice(1, -1)) {
    const found = value.indexOf(part, offset);
    if (found < 0) return false;
    offset = found + part.length;
  }
  const tail = parts.at(-1)!;
  return value.length - tail.length >= offset && value.endsWith(tail);
}
export function mockMatches(source: string, url: URL): boolean {
  if (source.length > 256 || /[\s\x00-\x1f\x7f]/.test(source)) return false;
  const match = /^(\*|https?):\/\/(\*|\*\.[A-Za-z0-9.-]+|[A-Za-z0-9.-]+(?::\d{1,5})?)(\/[^?#]*)?(\?[^#]*)?$/.exec(source);
  if (!match || !['http:', 'https:'].includes(url.protocol) || (match[1] !== '*' && `${match[1]}:` !== url.protocol)) return false;
  const host = match[2].toLowerCase();
  if (host !== '*') {
    if (host.startsWith('*.')) {
      const domain = host.slice(2);
      if (url.hostname !== domain && !url.hostname.endsWith(`.${domain}`)) return false;
    } else if (host.includes(':') ? url.host !== host : url.hostname !== host) return false;
  }
  return globMatches((match[3] ?? '/') + (match[4] ?? ''), url.pathname + url.search);
}
