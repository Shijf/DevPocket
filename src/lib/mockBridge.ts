import { runtimeMocks } from './networkDebug';
import { MOCK_EVENT, MOCK_READY } from './mockRuntime';
import { validateState } from './rules';

// Origin comes from the isolated world's document, never a page event payload.
export function installMockBridge(target: EventTarget, getOrigin: () => string,
  read: () => Promise<unknown>, subscribe: (notify: () => void) => () => void) {
  let generation = 0;
  let disposed = false;
  async function publish() {
    const request = ++generation;
    const origin = getOrigin();
    let detail = '[]';
    try {
      const state = await read();
      validateState(state);
      detail = JSON.stringify(runtimeMocks(state, origin));
    } catch { /* Invalid/unavailable state clears previously delivered configuration. */ }
    if (!disposed && request === generation && origin === getOrigin()) {
      target.dispatchEvent(new CustomEvent(MOCK_EVENT, { detail }));
    }
  }
  const ready = () => { void publish(); };
  target.addEventListener(MOCK_READY, ready);
  const unsubscribe = subscribe(ready);
  ready();
  return () => { disposed = true; ++generation; target.removeEventListener(MOCK_READY, ready); unsubscribe(); };
}
