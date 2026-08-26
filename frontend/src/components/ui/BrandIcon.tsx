import { useId } from 'react';

export interface BrandIconProps {
  /** Pixel size of the square icon mark (width = height). */
  size?: number;
  className?: string;
}

// Inline render of the MekaSoft icon mark (rounded navy badge, wrench glyph,
// orange bolt accent — see /mekasoft-icon.svg at the repo root, the source
// asset this mirrors). Replaces every spot that used to hand-build an "icon
// in a colored box" placeholder (Sidebar rail, AuthBrandPanel, OnboardingLogo)
// with lucide's wrench glyph on a plain Tailwind bg color. Inlined as SVG
// (not an <img src>) so it stays crisp at every size with zero extra request
// and can be dropped into a `text-*` sized flex row like the placeholders it
// replaces. useId keeps the gradient id collision-free when multiple
// instances render on the same page (e.g. AuthBrandPanel's mobile + desktop
// variants both mount at once, one just hidden via CSS).
export default function BrandIcon({ size = 32, className }: BrandIconProps) {
  const gradientId = useId();

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 200 200"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#152A4E" />
          <stop offset="1" stopColor="#0E1F3B" />
        </linearGradient>
      </defs>
      <rect width="200" height="200" rx="44" fill={`url(#${gradientId})`} />
      <g transform="translate(36,36) scale(2)">
        <path
          d="M8 52 L8 16 Q8 12 12 12 L18 12 Q22 12 24 16 L32 32 L40 16 Q42 12 46 12 L52 12 Q56 12 56 16 L56 52"
          fill="none"
          stroke="white"
          strokeWidth={7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={32} cy={40} r={5} fill="#DE6A34" />
      </g>
    </svg>
  );
}
