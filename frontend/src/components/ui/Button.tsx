import {
  type ButtonHTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  forwardRef,
  useState,
} from 'react';
import clsx from 'clsx';

// Axes of variation seen across the Banani flow: filled accent CTA
// ("Nouvelle intervention"), filled primary ("Voir" in InterventionRow),
// soft primary ("Voir" in ClientRow), bare outline ("Changer le mot de
// passe"), primary-tinted outline ("Envoyer le lien de réinitialisation"),
// text-only ghost ("Réinitialiser"), filled warning for confirmations
// ("Se déconnecter"), and filled destructive for irreversible deletes
// ("Supprimer" in DeleteVehicleConfirmation). Eight variants covers every
// button in the 109 fetched screens, no more.
type Variant =
  | 'primary'
  | 'accent'
  | 'outline'
  | 'outline-primary'
  | 'ghost'
  | 'soft'
  | 'warning'
  | 'destructive';
type Size = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  accent: 'bg-accent text-accent-foreground hover:bg-accent/90',
  outline: 'bg-background border border-border text-foreground hover:bg-input',
  'outline-primary': 'bg-background border border-primary text-primary hover:bg-primary/5',
  ghost: 'text-primary hover:text-primary/80',
  soft: 'bg-primary/5 border border-primary/10 text-primary hover:bg-primary/10',
  warning: 'bg-warning text-warning-foreground hover:bg-warning/90',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2.5 text-sm',
};

let rippleSeq = 0;
const RIPPLE_DURATION_MS = 500;

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = 'primary', size = 'md', className, children, onPointerDown, disabled, ...props },
    ref,
  ) => {
    // 2026-08-18: "un peu de micro animation avec des effets ripple, assez
    // premium... pas de too much" — one Material-style ripple per press,
    // on the shared Button primitive so every real action across the app
    // (CTAs, form submits, confirm/delete buttons, table-row "Voir") gets
    // it consistently for free, without touching every page individually.
    // `bg-current` picks up each variant's own foreground color, so it
    // adapts automatically (soft white wash on filled buttons, soft
    // primary wash on outline/ghost) with zero per-variant config.
    const [ripples, setRipples] = useState<{ id: number; x: number; y: number; size: number }[]>(
      [],
    );

    function handlePointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
      onPointerDown?.(e);
      if (disabled) return;
      const reduceMotion =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (reduceMotion) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 1.6;
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;
      const id = ++rippleSeq;
      setRipples((prev) => [...prev, { id, x, y, size }]);
      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== id));
      }, RIPPLE_DURATION_MS);
    }

    return (
      <button
        ref={ref}
        disabled={disabled}
        onPointerDown={handlePointerDown}
        className={clsx(
          'relative overflow-hidden inline-flex items-center justify-center gap-2 rounded-sm font-medium',
          // 2026-08-18: "un peu d'animation sur les boutons" — a small
          // press/lift on every button in the app (not just marketing CTAs).
          // Kept subtle (no translate-y, which would jitter inline buttons
          // sitting in dense table rows) — just a tactile scale-down on
          // click plus the existing color transition.
          'transition-all duration-150 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100',
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          className,
        )}
        {...props}
      >
        {children}
        {ripples.map((r) => (
          <span
            key={r.id}
            aria-hidden="true"
            className="animate-button-ripple pointer-events-none absolute rounded-full bg-current"
            style={{ left: r.x, top: r.y, width: r.size, height: r.size }}
          />
        ))}
      </button>
    );
  },
);
Button.displayName = 'Button';

export default Button;
