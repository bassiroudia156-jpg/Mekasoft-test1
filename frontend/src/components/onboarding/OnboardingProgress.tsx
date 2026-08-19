export interface OnboardingProgressProps {
  step: number; // 1-4
  totalSteps?: number;
  /** Step 4's "Terminé" state — success-colored, full bar. */
  complete?: boolean;
}

export default function OnboardingProgress({
  step,
  totalSteps = 4,
  complete = false,
}: OnboardingProgressProps) {
  const pct = complete ? 100 : Math.round((step / totalSteps) * 100);

  return (
    <div className="w-full mb-10">
      <div className="flex items-center justify-between mb-3">
        <span
          className={`text-xs font-medium uppercase tracking-widest ${complete ? 'text-success' : 'text-muted-foreground'}`}
        >
          {complete ? 'Terminé' : `Étape ${step} sur ${totalSteps}`}
        </span>
      </div>
      <div className="w-full bg-muted rounded-full h-1">
        <div
          className={`h-1 rounded-full transition-all ${complete ? 'bg-success' : 'bg-primary'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
