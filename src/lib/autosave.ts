export function createAutosaver<T>(save: (value: T) => Promise<void>) {
  let pending: T | undefined;
  let running: Promise<void> | undefined;
  function drain(): Promise<void> {
    if (running) return running;
    running = (async () => {
      while (pending !== undefined) {
        const value = pending; pending = undefined;
        try { await save(value); } catch { /* Callback reports errors; later edits remain actionable. */ }
      }
    })().finally(() => { running = undefined; if (pending !== undefined) return drain(); });
    return running;
  }
  return { enqueue(value: T) { pending = value; return drain(); }, flush: drain };
}
