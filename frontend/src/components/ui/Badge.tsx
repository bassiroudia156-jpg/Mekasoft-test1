import { type ReactNode } from 'react';
import clsx from 'clsx';

// Every status pill in the flow (intervention status, client actif/inactif,
// vehicle actif/inactif, parts in-stock) follows the same shape: a dot +
// label pair, colored by tone. Encapsulates the tone→classes mapping so
// each row component doesn't reimplement its own statusConfig object.
export type BadgeTone = 'success' | 'warning' | 'muted' | 'accent' | 'primary';

export interface BadgeProps {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

const TONE_CLASSES: Record<BadgeTone, { bg: string; text: string; dotBg: string }> = {
  success: { bg: 'bg-success/10', text: 'text-success', dotBg: 'bg-success' },
  warning: { bg: 'bg-warning/10', text: 'text-warning', dotBg: 'bg-warning' },
  muted: { bg: 'bg-muted', text: 'text-muted-foreground', dotBg: 'bg-muted-foreground' },
  accent: { bg: 'bg-accent/10', text: 'text-accent', dotBg: 'bg-accent' },
  primary: { bg: 'bg-primary/10', text: 'text-primary', dotBg: 'bg-primary' },
};

export default function Badge({ tone = 'muted', dot = true, children, className }: BadgeProps) {
  const t = TONE_CLASSES[tone];
  return (
    <div
      className={clsx(
        'flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-medium',
        t.bg,
        t.text,
        className,
      )}
    >
      {dot && <div className={clsx('w-1.5 h-1.5 rounded-full', t.dotBg)} />}
      {children}
    </div>
  );
}
