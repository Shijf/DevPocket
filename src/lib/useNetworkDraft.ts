import { useEffect, useRef, useState } from 'react';
import { useToolDraft } from './useToolDraft';
import { readState, saveModule, subscribeState } from './storage';
import { stateFromNetwork, createBlock, createMock, type BlockRule, type MockRule } from './networkDebug';
import { createAutosaver } from './autosave';
import { registerPendingWrites } from './pendingWrites';

type Snapshot = { rows: (BlockRule | MockRule)[]; enabled: boolean };
export function useNetworkDraft(kind: 'blocks' | 'mocks') {
  const draft = useToolDraft(`${kind}-config`);
  const [snapshot, setSnapshot] = useState<Snapshot>({ rows: [], enabled: true });
  const [loaded, setLoaded] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
  const latest = useRef(snapshot), dirty = useRef(false), generation = useRef(0), alive = useRef(true);
  const enabledKey = kind === 'blocks' ? 'blockEnabled' : 'mockEnabled';
  const save = useRef(createAutosaver<{ value: Snapshot; revision: number }>(async ({ value, revision }) => {
    try {
      try { stateFromNetwork(await readState(), kind, value.rows, value.enabled); }
      catch (e) { await saveModule(state => ({ ...state, [enabledKey]: value.enabled, [kind]: (state[kind] ?? []).map(row => ({ ...row, enabled: value.rows.find(draft => draft.id === row.id)?.enabled ?? row.enabled })) })); throw e; }
      await saveModule(state => stateFromNetwork(state, kind, value.rows, value.enabled));
      if (alive.current && revision === generation.current) { draft.update(''); dirty.current = false; setError(''); setStatus('已自动保存'); }
    } catch (e) { if (alive.current && revision === generation.current) { setError((e as Error).message); setStatus('未应用，草稿已保留'); } }
  }));
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => registerPendingWrites(() => save.current.flush()), []);
  useEffect(() => {
    if (!draft.loaded) return;
    let cancelled = false;
    void readState().then(state => {
      if (cancelled) return;
      let value: Snapshot = { rows: state[kind] ?? [], enabled: state[enabledKey] !== false };
      let restoredDraft = false;
      if (draft.text) { try {
        const candidate = JSON.parse(draft.text) as Snapshot;
        if (Array.isArray(candidate.rows) && candidate.rows.length <= 100 && typeof candidate.enabled === 'boolean'
          && new Set(candidate.rows.map(row => row?.id)).size === candidate.rows.length
          && candidate.rows.every(row => row && typeof row.id === 'string' && row.id && typeof row.source === 'string' && typeof row.enabled === 'boolean' && Array.isArray(row.methods) && row.methods.every(method => typeof method === 'string')
            && (kind === 'blocks' ? Array.isArray((row as BlockRule).resourceTypes) && (row as BlockRule).resourceTypes.every(type => typeof type === 'string') : typeof (row as MockRule).body === 'string' && typeof (row as MockRule).contentType === 'string' && Number.isFinite((row as MockRule).status) && Number.isFinite((row as MockRule).delay)))) { value = candidate; restoredDraft = true; }
      } catch { /* Keep committed state if an old draft is malformed. */ } }
      latest.current = value; setSnapshot(value); setLoaded(true);
      if (restoredDraft) { dirty.current = true; setStatus('自动保存中…'); void save.current.enqueue({ value, revision: ++generation.current }); }
    }).catch(e => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
    // Restore once, then the local UI owns this draft.
  }, [draft.loaded, kind]);
  useEffect(() => subscribeState(() => {
    if (dirty.current || !loaded) return;
    void readState().then(state => { if (!alive.current || dirty.current) return; const value = { rows: state[kind] ?? [], enabled: state[enabledKey] !== false }; latest.current = value; setSnapshot(value); }).catch(e => { if (alive.current) setError((e as Error).message); });
  }), [kind, loaded, enabledKey]);
  function apply(value: Snapshot) {
    latest.current = value; dirty.current = true; setSnapshot(value); setError(''); setStatus('自动保存中…');
    draft.update(JSON.stringify(value)); void save.current.enqueue({ value, revision: ++generation.current });
  }
  return { ...snapshot, loaded, error: error || draft.draftError, status, apply, latest, flush: save.current.flush,
    create: kind === 'blocks' ? createBlock : createMock };
}
