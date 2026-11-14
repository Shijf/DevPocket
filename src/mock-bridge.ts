import { installMockBridge } from './lib/mockBridge';

// No direct storage access: the worker authorizes Chrome's sender origin and returns scoped data.
installMockBridge(window, () => window.origin === location.origin ? location.origin : 'null',
  async () => {
    const response = await chrome.runtime.sendMessage({ type: 'mock:read' });
    if (!response?.ok) throw new Error('Mock configuration unavailable');
    return response.state;
  },
  notify => {
    const listener: Parameters<typeof chrome.runtime.onMessage.addListener>[0] = (message, sender) => {
      if (sender.id === chrome.runtime.id && message?.type === 'mock:changed') notify();
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  });
