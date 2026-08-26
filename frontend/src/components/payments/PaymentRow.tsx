import Badge, { type BadgeTone } from '@/components/ui/Badge';
import Icon from '@/components/ui/Icon';
import PaymentRowMenu from './PaymentRowMenu';

export type PaymentStatus = 'Payé' | 'En attente';
export type PaymentMethod = 'Espèces' | 'Virement bancaire' | 'Mobile Money' | 'Chèque';

export interface PaymentRowProps {
  reference: string;
  invoiceReference: string;
  client: string;
  amount: string;
  method: PaymentMethod;
  date: string;
  status: PaymentStatus;
  onChangeStatus: (status: PaymentStatus) => void;
}

const STATUS_TONE: Record<PaymentStatus, BadgeTone> = {
  Payé: 'success',
  'En attente': 'accent',
};

const METHOD_ICON: Record<PaymentMethod, string> = {
  Espèces: 'banknote',
  Chèque: 'file-text',
  'Virement bancaire': 'send',
  'Mobile Money': 'smartphone',
};

export default function PaymentRow({
  reference,
  invoiceReference,
  client,
  amount,
  method,
  date,
  status,
  onChangeStatus,
}: PaymentRowProps) {
  return (
    <div className="flex items-center gap-4 px-5 py-3 border-b border-border bg-surface">
      <div className="text-xs font-bold text-foreground w-20 shrink-0">{reference}</div>
      <div className="text-xs text-muted-foreground w-20 shrink-0 font-medium">
        {invoiceReference}
      </div>
      <div className="text-sm text-foreground flex-1 min-w-0 truncate">{client}</div>
      <div className="text-sm font-bold text-foreground w-32 text-right shrink-0">{amount}</div>
      <div className="w-28 shrink-0">
        <div className="flex items-center gap-1.5">
          <Icon i={METHOD_ICON[method]} size={12} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{method}</span>
        </div>
      </div>
      <div className="text-xs text-muted-foreground w-24 shrink-0">{date}</div>
      <Badge tone={STATUS_TONE[status]} className="w-24 shrink-0">
        {status}
      </Badge>
      <div className="flex items-center justify-end w-8 shrink-0">
        <PaymentRowMenu status={status} onChangeStatus={onChangeStatus} />
      </div>
    </div>
  );
}
