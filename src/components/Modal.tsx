import { useContext, useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { FeedbackContext } from './FeedbackContext';
export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const feedback = useContext(FeedbackContext);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => { const node = ref.current!; node.showModal(); node.querySelector<HTMLInputElement>('input')?.focus(); const cancel = (event: Event) => { event.preventDefault(); closeRef.current(); }; node.addEventListener('cancel', cancel); return () => { node.removeEventListener('cancel', cancel); node.close(); }; }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} aria-labelledby="modal-title"><div className="modal-heading"><h2 id="modal-title">{title}</h2><button className="icon-button" aria-label="关闭" onClick={onClose}><X size={18} /></button></div>{feedback?.error && <div className="modal-error" role="alert">{feedback.text}</div>}{children}</dialog>;
}
