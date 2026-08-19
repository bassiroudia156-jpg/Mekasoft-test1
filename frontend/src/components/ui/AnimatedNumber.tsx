'use client';

import { useEffect, useRef, useState } from 'react';

export interface AnimatedNumberProps {
  /** The target numeric value to display. */
  value: number;
  /** Formats the interpolated value each frame — default: rounded, fr-FR grouped.
   * `| undefined` (not just `?`) so callers can pass an optional prop of
   * their own straight through under exactOptionalPropertyTypes (see
   * StatCard's `format` prop, which does exactly this). */
  format?: ((n: number) => string) | undefined;
  /** Animation length in ms. Kept short — this is a subtle nudge, not a show. */
  duration?: number;
  className?: string;
}

const defaultFormat = (n: number) => Math.round(n).toLocaleString('fr-FR');

// 2026-08-18: "je veux aussi que les chiffres affichent des micro
// animations" — counts/amounts on KPI cards and list-page stat headers
// ease from their previous value to the new one instead of just snapping,
// on first mount and on every subsequent change (filter switch, optimistic
// update, refetch). Deliberately short (450ms) and ease-out only — no
// bounce/overshoot, matching the "pas de too much" brief. Respects
// prefers-reduced-motion by skipping straight to the final value.
export default function AnimatedNumber({
  value,
  format = defaultFormat,
  duration = 450,
  className,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);
  const mountedOnce = useRef(false);

  useEffect(() => {
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }

    // First mount: count up from 0 for the "premium load" feel. Every
    // subsequent change: ease from whatever was last shown.
    const from = mountedOnce.current ? fromRef.current : 0;
    mountedOnce.current = true;

    if (from === value) {
      setDisplay(value);
      return;
    }

    const start = performance.now();
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    function tick(now: number) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      // ease-out cubic — quick start, gentle settle, no overshoot.
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + (value - from) * eased;
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // Deliberately only `value` in the deps array — `duration`/`format` are
    // stable per caller (defined inline as consts or module-level
    // functions), and this project's eslint config has no react-hooks
    // deps-checking rule to satisfy either way.
  }, [value]);

  return <span className={className}>{format(display)}</span>;
}
