import { type HTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

// The `bg-surface border border-border rounded-md p-5` shell repeats across
// StatCard, RevenueChart, QuickActions and every modal container in the
// Banani flow — extracted per the rule-of-three guidance.
export default function Card({ className, children, ...props }: CardProps) {
  return (
    <div className={clsx('bg-surface border border-border rounded-md p-5', className)} {...props}>
      {children}
    </div>
  );
}
