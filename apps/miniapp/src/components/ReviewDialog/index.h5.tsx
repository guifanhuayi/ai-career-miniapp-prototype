import { useEffect, useRef } from 'react';
import ActionButton from '../ActionButton';
import type { ReviewDialogProps } from './types';

export default function ReviewDialog(p: ReviewDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="review-sheet review-modal"
      aria-label="答题回顾"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          p.onClose();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        p.onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) p.onClose();
      }}
    >
      <div className="row-title">答题回顾</div>
      <ActionButton label="关闭答题回顾" variant="link" onClick={p.onClose} />
      {p.children}
    </dialog>
  );
}
