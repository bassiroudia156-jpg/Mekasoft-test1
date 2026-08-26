import clsx from 'clsx';

export interface RadioCardProps {
  label: string;
  selected: boolean;
  onClick: () => void;
}

// The bordered radio-card toggle (Particulier/Entreprise, Client lui-même/
// Entreprise cliente) — same visual spec repeats across AddNewClient's
// type toggle and AddVehicle's ownership toggle.
export default function RadioCard({ label, selected, onClick }: RadioCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex items-center gap-3 px-3 py-2 border rounded-md cursor-pointer text-left',
        selected ? 'border-primary bg-primary/5' : 'border-border bg-background',
      )}
    >
      <div
        className={clsx(
          'w-4 h-4 border-2 rounded-full flex items-center justify-center shrink-0',
          selected ? 'border-primary' : 'border-border',
        )}
      >
        {selected && <div className="w-2 h-2 rounded-full bg-primary" />}
      </div>
      <span
        className={clsx(
          'text-sm',
          selected ? 'font-medium text-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
    </button>
  );
}
