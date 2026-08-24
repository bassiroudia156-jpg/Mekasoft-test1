// Shared number-grouping helper for every @react-pdf/renderer document in
// this codebase (invoices, payment receipts, subscription receipts,
// monthly reports).
//
// 2026-08-24 bug fix — `Number.prototype.toLocaleString('fr-FR')` groups
// thousands with U+202F (NARROW NO-BREAK SPACE, the correct French
// typographic character), but react-pdf's base Helvetica font (WinAnsi
// encoding) has no glyph for it: inside a rendered PDF it shows up as a
// garbled character (reads like a stray "/"), e.g. "39 000" renders as
// "39/000". Confirmed root cause by inspecting the exact code points
// `toLocaleString('fr-FR')` produces (U+202F, not a plain space).
//
// Browsers/HTML have no such problem (system/web fonts cover U+202F fully)
// — this helper is for @react-pdf/renderer <Text> content only. Web-side
// FCFA formatting (page components, `lib/currency.ts`) should keep using
// `toLocaleString('fr-FR')` as-is; do not swap those to this helper.
import 'server-only';

/** Groups an integer's thousands with a plain ASCII space — never a
 * locale-dependent separator — so it always renders correctly in a PDF's
 * base14 font regardless of the Node/ICU version running the server. */
export function groupThousands(n: number): string {
  const sign = n < 0 ? '-' : '';
  const digits = Math.round(Math.abs(n)).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${grouped}`;
}

/** `groupThousands` + a trailing currency label — the common case at
 * every call site (`"39 000 FCFA"`, `"12 500 XOF"`, ...). */
export function formatMoneyForPdf(n: number, currency = 'FCFA'): string {
  return `${groupThousands(n)} ${currency}`;
}
