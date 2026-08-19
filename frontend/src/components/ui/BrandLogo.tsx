export interface BrandLogoProps {
  /**
   * Which lockup to render, picked by the surrounding background — 'light'
   * for light/white surfaces, 'dark' for dark navy/near-black ones. Each
   * exported SVG carries its own matching background card (see
   * public/brand/logo-*.svg), so pick the variant that blends in rather than
   * fighting the section's own background.
   */
  variant: 'light' | 'dark';
  className?: string;
}

// Renders the full MekaSoft lockup (icon + wordmark) as a static asset —
// replaces spots that used to hand-build the "Meka"+"soft" wordmark out of
// styled <span>s with no icon (PublicNav, the landing page footer). Plain
// <img>, not next/image: static local SVG, no @next/next lint rule is
// registered in this project either way (see settings/shop/page.tsx for the
// same pattern), and next/image needs dangerouslyAllowSVG for SVG
// optimization anyway — not worth it for a handful of brand placements.
export default function BrandLogo({ variant, className }: BrandLogoProps) {
  return (
    <img
      src={`/brand/logo-${variant}.svg`}
      alt="MekaSoft"
      width={552}
      height={208}
      className={className}
    />
  );
}
