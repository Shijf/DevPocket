import { useEffect, useState } from 'react';
import { isExtension } from './storage';
import { createDraftWriter } from './draftWriter';
import { registerPendingWrites } from './pendingWrites';

// Utility drafts are independent of the network-rule revision and of web preview data.
export function useToolDraft(key: string) {
  const storageKey = `devpocket-${key}-text-draft`;
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [draftError, setDraftError] = useState('');
  const [writer] = useState(createDraftWriter);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const value = isExtension ? (await chrome.storage.local.get(storageKey))[storageKey] : localStorage.getItem(`preview-${storageKey}`);
        if (!cancelled && typeof value === 'string') setText(value);
      } catch { if (!cancelled) setDraftError('草稿读取失败。'); }
      finally { if (!cancelled) setLoaded(true); }
    };
    void load();
    return () => { cancelled = true; };
  }, [storageKey]);
  useEffect(() => registerPendingWrites(writer.flush), [writer]);
  function update(value: string) {
    setText(value); setDraftError('');
    void writer.save(async () => {
      if (isExtension) {
        if (value) await chrome.storage.local.set({ [storageKey]: value });
        else await chrome.storage.local.remove(storageKey);
      } else {
        if (value) localStorage.setItem(`preview-${storageKey}`, value);
        else localStorage.removeItem(`preview-${storageKey}`);
      }
    }).catch(() => setDraftError('草稿保存失败，请复制内容后重试。'));
  }
  return { text, update, loaded, draftError };
}
