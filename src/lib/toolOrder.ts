export function normalizeToolOrder(value: unknown, known: readonly string[], legacyShortcuts: readonly string[] = []): string[] {
  const saved = Array.isArray(value) ? value : [];
  const order = saved.filter((id): id is string => typeof id === 'string' && known.includes(id));
  // Older versions saved only the More menu. Keep those preferences behind the
  // original four shortcuts; fully saved orders can move every tool freely.
  const prefix = order.some(id => legacyShortcuts.includes(id)) ? [] : legacyShortcuts.filter(id => known.includes(id));
  return [...new Set([...prefix, ...order, ...known])];
}

export function moveTool(order: readonly string[], id: string, index: number): string[] {
  if (!order.includes(id) || !Number.isInteger(index)) return [...order];
  const next = order.filter(item => item !== id);
  next.splice(Math.max(0, Math.min(index, next.length)), 0, id);
  return next;
}

export function createOrderWriter(write: (order: string[]) => Promise<void>) {
  let pending = Promise.resolve();
  return {
    save(order: readonly string[]) {
      const snapshot = [...order];
      pending = pending.catch(() => undefined).then(() => write(snapshot));
      return pending;
    },
    flush: () => pending,
  };
}
