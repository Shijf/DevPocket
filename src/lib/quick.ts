import { createHeader, createRule, type AppState, type HeaderRule, type HeaderEntry } from './model';
import { validateRule } from './rules';

export const QUICK_RULE_ID = 'quick-headers';
export function quickRule(state: AppState): HeaderRule {
  return state.rules.find(rule => rule.id === QUICK_RULE_ID) ?? {
    ...createRule(), id: QUICK_RULE_ID, name: '快速请求头', patterns: ['*://*/*'],
  };
}
export function saveQuickRule(state: AppState, draft: HeaderRule): AppState {
  const headers = draft.headers.filter(header => header.name.trim() || header.value);
  const rule = { ...draft, id: QUICK_RULE_ID, name: '快速请求头', updatedAt: Date.now(), headers: headers.map(header => ({ ...header, name: header.name.trim(), value: header.operation === 'remove' ? '' : header.value })) };
  if (headers.length) {
    const error = validateRule(rule);
    if (error) throw new Error(error);
  }
  const others = state.rules.filter(existing => existing.id !== QUICK_RULE_ID);
  return { ...state, rules: headers.length ? [rule, ...others] : others };
}
export function blankQuickRow(rule: HeaderRule): HeaderRule {
  return { ...rule, headers: rule.headers.length ? rule.headers : [createHeader()] };
}

export interface QuickRow extends HeaderEntry {
  enabled: boolean; patterns: string[]; methods: string[]; scope: HeaderRule['scope'];
}
export function createQuickRow(): QuickRow {
  return { ...createHeader(), enabled: true, patterns: ['*://*/*'], methods: [], scope: 'all' };
}
export function rowsFromState(state: AppState): QuickRow[] {
  const ids = new Set<string>();
  return state.rules.flatMap(rule => rule.headers.map(header => {
    const id = ids.has(header.id) ? crypto.randomUUID() : header.id; ids.add(id);
    return { ...header, id, enabled: rule.enabled, patterns: [...rule.patterns], methods: [...rule.methods], scope: rule.scope };
  }));
}
export function stateFromRows(state: AppState, rows: QuickRow[], enabled = state.enabled): AppState {
  const rules = rows.filter(row => row.name.trim() || row.value).map(row => ({
    id: `quick-header:${row.id}`, name: row.name.trim() || '请求头', description: '', enabled: row.enabled,
    patterns: [...new Set(row.patterns.map(pattern => pattern.trim()).filter(Boolean))], methods: row.methods,
    scope: row.scope, updatedAt: Date.now(),
    headers: [{ id: row.id, name: row.name.trim(), value: row.operation === 'remove' ? '' : row.value, operation: row.operation }],
  }));
  for (const rule of rules) { const error = validateRule(rule); if (error) throw new Error(error); }
  return { ...state, enabled, rules };
}
