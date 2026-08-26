import { type ReactNode } from 'react';
import clsx from 'clsx';
import Icon from './Icon';

// Centered overlay + card — the pattern behind TeamManagementModal,
// AddTeamMemberModal, ChangePasswordModal, RegisterPayment and its method
// sub-forms. Banani's mocks render this open-by-default with no real
// backdrop-click/escape handling since they're static; this version is a
// real dialog (closes on backdrop click, optional title/close button).
//
// 2026-08-18 fix: the card had no max-height/overflow of its own — a form
// taller than the viewport (e.g. EditVehicleModal's 11 fields) just
// extended past the top/bottom of the screen with no way to scroll to it,
// since the outer wrapper is `fixed` (not the page). Now the card itself
// caps at 90vh and scrolls internally, so every field and the submit
// button stay reachable regardless of viewport height.
export interface ModalProps {
  open: boolean;
  onClose: () => void;
  // `| undefined` (not just `?`) so callers can pass a conditional
  // expression (`view === 'form' ? 'Title' : undefined`) under
  // exactOptionalPropertyTypes without a conditional-spread dance.
  title?: string | undefined;
  icon?: string;
  children: ReactNode;
  maxWidth?: 'md' | 'lg' | '2xl';
}

const MAX_WIDTH_CLASSES = {
  md: 'max-w-md',
  lg: 'max-w-lg',
  '2xl': 'max-w-2xl',
};

export default function Modal({
  open,
  onClose,
  title,
  icon,
  children,
  maxWidth = '2xl',
}: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-foreground/30" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          'relative w-full max-h-[90vh] overflow-y-auto bg-surface border border-border rounded-lg p-8 shadow-lg',
          MAX_WIDTH_CLASSES[maxWidth],
        )}
      >
        {title && (
          <div className="flex items-center gap-3 mb-6 pb-6 border-b border-border">
            {icon && (
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 shrink-0">
                <Icon i={icon} size={20} className="text-primary" />
              </div>
            )}
            <div className="flex-1">
              <h2 className="text-lg font-bold font-headings text-foreground">{title}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="p-1 text-muted-foreground hover:text-foreground"
            >
              <Icon i="x" size={16} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
