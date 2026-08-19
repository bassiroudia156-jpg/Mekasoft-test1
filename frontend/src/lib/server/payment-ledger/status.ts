// Payment.status is derived at creation, not manually edited later — see
// decision #3 in phase-7-payments.md. Espèces/Mobile Money settle
// instantly; Virement bancaire needs bank-side confirmation; Chèque's own
// sub-form exposes a "Statut" picker (À encaisser/Encaissé) that maps
// directly onto this.
import 'server-only';

export const PAYMENT_METHODS = ['Espèces', 'Virement bancaire', 'Mobile Money', 'Chèque'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const CHEQUE_STATUSES = ['À encaisser', 'Encaissé'] as const;
export type ChequeStatus = (typeof CHEQUE_STATUSES)[number];

export function derivePaymentStatus(
  method: PaymentMethod,
  chequeStatus?: ChequeStatus,
): 'Payé' | 'En attente' {
  switch (method) {
    case 'Espèces':
    case 'Mobile Money':
      return 'Payé';
    case 'Virement bancaire':
      return 'En attente';
    case 'Chèque':
      return chequeStatus === 'Encaissé' ? 'Payé' : 'En attente';
    default: {
      const _exhaustive: never = method;
      return _exhaustive;
    }
  }
}
