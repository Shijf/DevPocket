import type { ReactNode } from 'react';
import { Switch } from './Switch';

interface ToolToolbarProps {
  summary: string;
  children: ReactNode;
  toggle?: { checked: boolean; disabled: boolean; label: string; onChange: (value: boolean) => void };
}

export function ToolToolbar({ summary, children, toggle }: ToolToolbarProps) {
  return <div className="quick-heading tool-toolbar" role="group" aria-label="当前工具操作">
    <span className="tool-summary">{summary}</span>
    <div className="quick-heading-actions">
      <div className="tool-action-group">{children}</div>
      {toggle && <div className="tool-master-toggle"><span>整体启用</span><Switch {...toggle} /></div>}
    </div>
  </div>;
}
