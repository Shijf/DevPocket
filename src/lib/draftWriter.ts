// Keep failures observable to the close barrier while allowing a later edit to retry.
export function createDraftWriter() {
  let queue: Promise<void> = Promise.resolve();
  let failure: unknown;
  return {
    save(write: () => Promise<void>) {
      const job = queue.then(write);
      queue = job.then(() => { failure = undefined; }, error => { failure = error; });
      return job;
    },
    async flush() { await queue; if (failure) throw failure; },
  };
}
