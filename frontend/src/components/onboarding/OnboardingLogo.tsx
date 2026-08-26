import BrandLogo from '@/components/ui/BrandLogo';
import clsx from 'clsx';

export interface OnboardingLogoProps {
  size?: 'lg' | 'sm';
  className?: string;
}

// Repeats across all 4 onboarding steps (Banani sizes it slightly larger on
// step 1). "light" variant because this renders on bg-background (light).
// Was a hand-built BrandIcon + <span>MekaSoft</span> before 2026-08-19,
// which diverged from the real logo asset (see AuthBrandPanel/Sidebar for
// the same fix, same reasoning).
export default function OnboardingLogo({ size = 'sm', className }: OnboardingLogoProps) {
  const height = size === 'lg' ? 'h-10' : 'h-9';

  return (
    <div className={clsx(className)}>
      <BrandLogo variant="light" className={clsx(height, 'w-auto')} />
    </div>
  );
}
