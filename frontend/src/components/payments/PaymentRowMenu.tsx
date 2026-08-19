import RowMenu from '@/components/ui/RowMenu';
import type { PaymentStatus } from './PaymentRow';

export interface PaymentRowMenuProps {
  status: PaymentStatus;
  onChangeStatus: (status: PaymentStatus) => void;
}

// 2026-08-18 audit fix: Banani's own mock left this row's "..." with
// nothing behind it (bare icon, no menu). User explicitly asked for it to
// become functional so a Virement bancaire/Chèque payment created `En
// attente` (see derivePaymentStatus) can be flipped to `Payé` once it
// actually clears — previously nothing in the app could ever make that
// transition. Built on the shared RowMenu primitive (portal + fixed
// positioning — see its own header comment).
export default function PaymentRowMenu({ status, onChangeStatus }: PaymentRowMenuProps) {
  const target: PaymentStatus = status === 'Payé' ? 'En attente' : 'Payé';

  return (
    <RowMenu
      iconSize={14}
      items={[
        {
          key: 'toggle',
          label: target === 'Payé' ? 'Marquer comme payé' : 'Marquer comme en attente',
          icon: target === 'Payé' ? 'circle-check' : 'clock',
          onClick: () => onChangeStatus(target),
        },
      ]}
    />
  );
}
