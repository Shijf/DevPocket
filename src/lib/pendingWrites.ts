const writers = new Set<() => Promise<unknown>>();
export function registerPendingWrites(flush: () => Promise<unknown>) {
  writers.add(flush);
  return () => { writers.delete(flush); };
}
export async function flushPendingWrites() {
  await Promise.all([...writers].map(flush => flush()));
}
