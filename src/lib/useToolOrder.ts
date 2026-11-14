import { useEffect, useRef, useState } from 'react';
import { tools, type ToolId } from '../tools/registry';
import { isExtension } from './storage';
import { registerPendingWrites } from './pendingWrites';
import { createOrderWriter, moveTool, normalizeToolOrder } from './toolOrder';

const key = 'devpocket-tools-more-tool-order';
const previewKey = `preview-${key}`;
const originalShortcuts: ToolId[] = ['headers', 'proxy', 'json', 'url'];
const defaults: ToolId[] = [...originalShortcuts, ...tools.filter(item => !originalShortcuts.includes(item.id)).map(item => item.id)];
export function useToolOrder() {
  const [order, setOrder] = useState<ToolId[]>(defaults), [loaded, setLoaded] = useState(false), [error, setError] = useState('');
  const latest = useRef<ToolId[]>(defaults), revision = useRef(0);
  const [writer] = useState(() => createOrderWriter(async value => {
    if (isExtension) await chrome.storage.local.set({ [key]: value });
    else localStorage.setItem(previewKey, JSON.stringify(value));
  }));
  async function load(active: () => boolean = () => true) {
    try {
      const value: unknown = isExtension ? (await chrome.storage.local.get(key))[key] : JSON.parse(localStorage.getItem(previewKey) || 'null');
      if (active()) { const normalized = normalizeToolOrder(value, defaults, originalShortcuts) as ToolId[]; latest.current = normalized; setOrder(normalized); setLoaded(true); setError(''); }
    } catch { if (active()) setError('工具顺序读取失败，请重试。'); }
  }
  useEffect(() => { let active = true; void load(() => active); return () => { active = false; }; }, []);
  useEffect(() => registerPendingWrites(writer.flush), [writer]);
  function save(next: ToolId[]) {
    if (!loaded) return;
    latest.current = next; setOrder(next); setError('');
    const current = ++revision.current;
    void writer.save(next).catch(() => { if (revision.current === current) setError('工具顺序保存失败，请重试。'); });
  }
  function move(id: ToolId, index: number) {
    const next = moveTool(latest.current, id, index) as ToolId[];
    if (next.some((item, i) => item !== latest.current[i])) save(next);
  }
  return { order, loaded, error, move, reset: () => save([...defaults]), retry: () => { if (loaded) save([...latest.current]); else void load(); } };
}
