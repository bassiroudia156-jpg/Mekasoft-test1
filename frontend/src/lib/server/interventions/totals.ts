// Shared money math for interventions — used by both the create route and
// the add/remove-part routes so the denormalized `amount` field on
// Intervention is always computed the same way. Integer FCFA throughout
// (CLAUDE.md invariant — no decimals).
import 'server-only';

export interface InterventionTotals {
  subtotal: number;
  tax: number;
  total: number;
}

export function computeTotals(
  laborAmount: number,
  partsAmount: number,
  taxRatePct: number,
): InterventionTotals {
  const subtotal = laborAmount + partsAmount;
  const tax = Math.round((subtotal * taxRatePct) / 100);
  return { subtotal, tax, total: subtotal + tax };
}
