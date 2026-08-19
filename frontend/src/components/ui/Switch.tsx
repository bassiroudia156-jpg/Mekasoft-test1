'use client';

import clsx from 'clsx';

// No Banani screen was selected for this — the TVA on/off toggle (see
// interventions/new and interventions/[id]) was requested directly on top
// of the existing design system, same as the dashboard search/filter bar
// earlier this project. Built as a real <button role="switch"> (not a
// checkbox) so there's no risk of the controlled-input-without-onChange
// class of bug already fixed once in this app (see PartsRow.tsx) — a
// button's onClick is always wired by construction.
export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  id?: string;
}

export default function Switch({ checked, onChange, label, disabled = false, id }: SwitchProps) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
        checked ? 'bg-primary' : 'bg-border',
        disabled && 'opacity-50 pointer-events-none',
      )}
    >
      <span
        className={clsx(
          'inline-block h-4 w-4 transform rounded-full bg-background shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
