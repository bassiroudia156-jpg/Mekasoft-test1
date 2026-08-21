// Display-only currency conversion (2026-08-21) — "je veux qu'il y'ait la
// possibilite de changer de devise (multi devise)" on the invoices page.
//
// This is deliberately NOT a real multi-currency feature: the `Invoice`
// model has no `currency` field, `amount` is stored as a plain FCFA
// integer (per CLAUDE.md's money-handling invariant — smallest unit,
// never decimals), and PDFs/emails/CSV exports/the dashboard's revenue
// aggregation are all untouched by this. This module only lets the
// invoices LIST reformat already-FCFA amounts into another currency for
// viewing convenience, using a static/approximate rate — never sent to
// the server, never affects what's actually invoiced or legally recorded.
// A real per-invoice stored currency (schema migration, tax math for
// non-zero-decimal currencies, PDF/email changes) is a separate, much
// larger feature — out of scope here by explicit user choice.

export type DisplayCurrency = 'FCFA' | 'EUR' | 'USD';

export const DISPLAY_CURRENCIES: { value: DisplayCurrency; label: string }[] = [
  { value: 'FCFA', label: 'FCFA' },
  { value: 'EUR', label: 'EUR (indicatif)' },
  { value: 'USD', label: 'USD (indicatif)' },
];

// XOF (FCFA) is fixed-pegged to EUR — CFA franc BCEAO peg, unchanged since
// 1999: 1 EUR = 655.957 XOF exactly, so the EUR figure is actually exact,
// not approximate. USD/XOF floats on the market; 600 is a rounded, static
// approximation good enough for an indicative display toggle — it is NOT
// a live rate. Revisit (or wire a live FX provider) if real-time USD
// precision is ever needed.
const XOF_PER_UNIT: Record<Exclude<DisplayCurrency, 'FCFA'>, number> = {
  EUR: 655.957,
  USD: 600,
};

/** Converts an FCFA (XOF) integer amount into the chosen display currency.
 * Returns the raw number — round/format at the call site. */
export function convertFromFcfa(amountFcfa: number, currency: DisplayCurrency): number {
  if (currency === 'FCFA') return amountFcfa;
  return amountFcfa / XOF_PER_UNIT[currency];
}

/** Converts + formats an FCFA amount for display. FCFA stays a
 * zero-decimal grouped integer; EUR/USD get 2 decimals since unlike XOF
 * they aren't zero-decimal currencies. */
export function formatDisplayAmount(amountFcfa: number, currency: DisplayCurrency): string {
  const converted = convertFromFcfa(amountFcfa, currency);
  if (currency === 'FCFA') {
    return `${Math.round(converted).toLocaleString('fr-FR')} FCFA`;
  }
  return `${converted.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}
