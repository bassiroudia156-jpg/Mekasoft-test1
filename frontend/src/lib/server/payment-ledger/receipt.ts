// Receipt reference format — matches Banani's own worked example exactly:
// invoice "FAC-2025-087" + payment "PAY-2025-025" → "REC-2025-087-PAY-025"
// (strip the "FAC-" prefix off the invoice reference, keep the payment's
// own sequence number). Only generated when `generateReceipt` was checked
// at registration (decision #6, phase-7-payments.md).
import 'server-only';

export function formatReceiptReference(invoiceReference: string, paymentReference: string): string {
  const invoicePart = invoiceReference.replace(/^FAC-/, '');
  const paymentSeq = paymentReference.split('-').pop() ?? paymentReference;
  return `REC-${invoicePart}-PAY-${paymentSeq}`;
}
