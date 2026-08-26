import { type ReactNode } from 'react';
import clsx from 'clsx';

export interface FilterButtonProps {
  label: ReactNode;
  active?: boolean;
  count?: number;
  onClick?: () => void;
}

// Reused across the Clients, Vehicles, Interventions and Invoices list
// screens — a generic primitive, not tied to one domain.
export default function FilterButton({
  label,
  active = false,
  count = 0,
  onClick,
}: FilterButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
        active
          ? 'bg-primary/10 text-primary border-primary/20'
          : 'bg-background border-border text-foreground',
      )}
    >
      {label}
      {count > 0 && (
        <span className="ml-1 bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
          {count}
        </span>
      )}
    </button>
  );
}
