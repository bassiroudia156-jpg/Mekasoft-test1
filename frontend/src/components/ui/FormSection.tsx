import { type ReactNode } from 'react';

export interface FormSectionProps {
  title: string;
  children: ReactNode;
}

// The `bg-surface border border-border rounded-md p-6` + uppercase label
// header repeats across every multi-section form in the flow (client,
// vehicle, onboarding forms) — extracted per the rule-of-three guidance.
export default function FormSection({ title, children }: FormSectionProps) {
  return (
    <div className="bg-surface border border-border rounded-md p-6">
      <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-5">
        {title}
      </div>
      {children}
    </div>
  );
}
