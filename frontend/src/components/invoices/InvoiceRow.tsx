import Badge, { type BadgeTone } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import InvoiceRowMenu from './InvoiceRowMenu';

export type InvoiceStatus = 'Émise' | 'Payée' | 'En attente';

export interface InvoiceRowProps {
  reference: string;
  client: string;
  description: string;
  date: string;
  amount: string;
  status: InvoiceStatus;
  onView?: () => void;
  onDownloadPdf: () => void;
  onPrint: () => void;
  onResend: () => void;
  onDelete: () => void;
}

const STATUS_TONE: Record<InvoiceStatus, BadgeTone> = {
  Émise: 'primary',
  Payée: 'success',
  'En attente': 'warning',
};

// Banani never factored a shared row component for the invoices list (see
// phase-6-invoices.md source note) — the same row JSX repeats identically
// across 4 raw screens, extracted here per the project's rule-of-three
// principle regardless of Banani's own factoring choices.
export default function InvoiceRow({
  reference,
  client,
  description,
  date,
  amount,
  status,
  onView,
  onDownloadPdf,
  onPrint,
  onResend,
  onDelete,
}: InvoiceRowProps) {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 border-b border-border bg-surface">
      <div className="text-xs font-medium text-muted-foreground w-24 shrink-0 font-headings">
        {reference}
      </div>
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-sm font-medium text-foreground truncate">{client}</span>
        <span className="text-xs text-muted-foreground truncate">{description}</span>
      </div>
      <div className="text-xs text-muted-foreground w-28 shrink-0">{date}</div>
      <div className="text-sm font-bold text-foreground w-32 text-right shrink-0 font-headings">
        {amount}
      </div>
      <Badge tone={STATUS_TONE[status]} className="w-24 shrink-0">
        {status}
      </Badge>
      <Button variant="primary" size="sm" onClick={onView} className="shrink-0">
        Voir
      </Button>
      <InvoiceRowMenu
        onDownloadPdf={onDownloadPdf}
        onPrint={onPrint}
        onResend={onResend}
        onViewDetails={() => onView?.()}
        onDelete={onDelete}
      />
    </div>
  );
}
