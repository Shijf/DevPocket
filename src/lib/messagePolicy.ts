import type { AppState } from './model';
import { emptyState } from './model';
import { runtimeMocks } from './networkDebug';

export type AllowedMessage = { type: 'state:read' | 'state:save' } | { type: 'mock:read'; origin: string };
export function authorizeMessage(message: unknown, sender: chrome.runtime.MessageSender, extensionId: string): AllowedMessage | undefined {
  if (sender.id !== extensionId || !message || typeof message !== 'object') return undefined;
  const type = (message as { type?: unknown }).type;
  try {
    if (!sender.url) return undefined;
    const url = new URL(sender.url);
    if (type === 'state:read' || type === 'state:save') {
      if (url.protocol !== 'chrome-extension:' || url.hostname !== extensionId || !['/popup.html', '/index.html'].includes(url.pathname)) return undefined;
      if (sender.origin !== undefined && sender.origin !== `chrome-extension://${extensionId}`) return undefined;
      return { type };
    }
    if (type === 'mock:read' && ['http:', 'https:'].includes(url.protocol)
      && sender.origin === url.origin && Number.isInteger(sender.tab?.id) && sender.tab!.id! >= 0 && Number.isInteger(sender.frameId) && sender.frameId! >= 0) {
      // Chrome supplies the effective security origin. Opaque frames are never authorized.
      return { type, origin: url.origin };
    }
  } catch { /* Reject missing or malformed browser sender metadata. */ }
  return undefined;
}
export function scopedMockState(state: AppState, origin: string): AppState {
  // Never send Header credentials, proxy destinations, utility drafts, or foreign-site Mock data.
  return { ...emptyState(), mocks: runtimeMocks(state, origin).map(row => ({ ...row, pageOrigin: origin })) };
}
