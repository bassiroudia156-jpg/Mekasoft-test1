// Resolves a Banani-style kebab-case icon name (e.g. "layout-dashboard",
// "trending-up") to its lucide-react PascalCase component (LayoutDashboard,
// TrendingUp). Banani designs reference ~40 distinct icon names across the
// flow; a dynamic lookup avoids hand-maintaining a name→component map that
// falls out of sync as new screens get implemented.
import { icons, type LucideProps } from 'lucide-react';

export interface IconProps extends Omit<LucideProps, 'ref'> {
  /** Kebab-case lucide icon name, e.g. "wrench", "chevron-down". */
  i: string;
}

function toPascalCase(kebab: string): string {
  return kebab
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export default function Icon({ i, ...props }: IconProps) {
  const name = toPascalCase(i) as keyof typeof icons;
  const LucideIcon = icons[name];

  if (!LucideIcon) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[Icon] Unknown lucide icon "${i}" (looked up as "${name}")`);
    }
    return null;
  }

  return <LucideIcon {...props} />;
}
