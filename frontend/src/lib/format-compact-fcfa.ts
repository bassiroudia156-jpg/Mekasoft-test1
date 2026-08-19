// "2,4M" / "170 K" / "450" — compact FCFA formatting for dashboard/payments
// stat cards. No currency suffix here (callers that need "FCFA" append it —
// StatCard already renders it via its own `sub` label). Extracted from
// app/payments/page.tsx's local `formatCompact` — second real occurrence
// (dashboard KPIs), rule-of-three floor.
export function formatCompactAmount(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}M`;
  }
  if (n >= 1_000) return `${Math.round(n / 1000)} K`;
  return n.toLocaleString('fr-FR');
}
