import { type ReactNode } from 'react';
import clsx from 'clsx';

// Right-side sliding panel — the pattern behind ManagerProfilePanel. Kept as
// a primitive (not baked into ManagerProfilePanel itself) since other
// domains may want the same slide-over affordance later (e.g. an
// intervention quick-view from the dashboard).
export interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  widthClassName?: string;
}

export default function SlideOver({
  open,
  onClose,
  children,
  widthClassName = 'w-96',
}: SlideOverProps) {
  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-foreground/30 z-40" onClick={onClose} aria-hidden="true" />
      )}
      <div
        className={clsx(
          'fixed top-0 right-0 h-full bg-surface border-l border-border shadow-lg z-50 overflow-y-auto transition-transform',
          widthClassName,
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {children}
      </div>
    </>
  );
}
