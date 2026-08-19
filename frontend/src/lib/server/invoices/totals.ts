// Invoice tax math — deliberately its own tiny copy rather than importing
// interventions/totals.ts's computeTotals: same 3-line shape, but keeping
// each domain's lib folder self-contained avoids a cross-domain coupling
// for something this trivial.
import 'server-only';

export interface InvoiceTotals {
  taxAmount: number;
  amount: number;
}

export function computeInvoiceTotals(subtotal: number, taxRatePct: number): InvoiceTotals {
  const taxAmount = Math.round((subtotal * taxRatePct) / 100);
  return { taxAmount, amount: subtotal + taxAmount };
}

export const PAYMENT_TERMS = [
  { value: 'À réception', days: 0 },
  { value: 'Net 15 jours', days: 15 },
  { value: 'Net 30 jours', days: 30 },
  { value: 'Net 45 jours', days: 45 },
  { value: 'Net 60 jours', days: 60 },
] as const;

export function dueDateFromTerms(issueDate: Date, paymentTerms: string): Date {
  const match = PAYMENT_TERMS.find((t) => t.value === paymentTerms);
  const days = match?.days ?? 30;
  const due = new Date(issueDate);
  due.setDate(due.getDate() + days);
  return due;
}
