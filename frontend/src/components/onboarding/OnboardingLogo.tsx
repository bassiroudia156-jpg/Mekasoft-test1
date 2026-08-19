import BrandIcon from '@/components/ui/BrandIcon';
import clsx from 'clsx';

export interface OnboardingLogoProps {
  size?: 'lg' | 'sm';
  className?: string;
}

// Repeats across all 4 onboarding steps (Banani sizes it slightly larger on
// step 1: w-10/icon-20/text-xl vs w-9/icon-18/text-lg elsewhere).
export default function OnboardingLogo({ size = 'sm', className }: OnboardingLogoProps) {
  const iconSize = size === 'lg' ? 40 : 36;
  const text = size === 'lg' ? 'text-xl' : 'text-lg';

  return (
    <div className={clsx('flex items-center gap-3', className)}>
      <BrandIcon size={iconSize} className="rounded-md shrink-0" />
      <span className={clsx('font-headings font-bold text-foreground tracking-tight', text)}>
        MekaSoft
      </span>
    </div>
  );
}
