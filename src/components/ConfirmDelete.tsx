import type { ReactNode } from 'react';
import { Modal } from './Modal';

export function ConfirmDelete({ title = '确认删除', children, onCancel, onConfirm, confirmLabel = '确认删除' }: {
  title?: string; children: ReactNode; onCancel: () => void; onConfirm: () => void; confirmLabel?: string;
}) {
  return <Modal title={title} onClose={onCancel}>
    <div className="delete-confirm-body">{children}</div>
    <div className="modal-footer">
      <button type="button" className="button secondary" autoFocus onClick={onCancel}>取消</button>
      <button type="button" className="button danger-button" onClick={onConfirm}>{confirmLabel}</button>
    </div>
  </Modal>;
}
