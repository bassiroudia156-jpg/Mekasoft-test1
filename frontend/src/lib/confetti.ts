'use client';

import confetti from 'canvas-confetti';

// 2026-08-20: "il nous faut un joli page paiements succès ... ajoute des
// animations de confettis" — shared trigger for both subscription
// payment-success screens (subscriptions/return for an already-logged-in
// upgrade, subscriptions/welcome for the anonymous landing-page checkout).
// Two short bursts from the bottom-left/bottom-right corners read as a
// celebration rather than canvas-confetti's default single center
// explosion. Respects prefers-reduced-motion (same convention as
// AnimatedNumber) — skips the animation entirely rather than firing it
// instantly/without motion.
const BRAND_COLORS = ['#152a4e', '#de6a34', '#1a7a4a', '#ffffff'];

export function fireSuccessConfetti(): void {
  if (typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const durationMs = 2000;
  const end = Date.now() + durationMs;

  (function frame() {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 60,
      startVelocity: 45,
      origin: { x: 0, y: 0.75 },
      colors: BRAND_COLORS,
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 60,
      startVelocity: 45,
      origin: { x: 1, y: 0.75 },
      colors: BRAND_COLORS,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}
