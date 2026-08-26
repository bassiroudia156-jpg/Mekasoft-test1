import Badge, { type BadgeTone } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';

export type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  DRAFT: 'Brouillon',
  SENT: 'Envoyé',
  ACCEPTED: 'Accepté',
  REJECTED: 'Refusé',
  EXPIRED: 'Expiré',
};

const STATUS_TONE: Record<QuoteStatus, BadgeTone> = {
  DRAFT: 'muted',
  SENT: 'primary',
  ACCEPTED: 'success',
  REJECTED: 'accent',
  EXPIRED: 'muted',
};

export interface QuoteRowProps {
  id: string;
  client: string;
  vehicle: string;
  work: string;
  date: string;
  amount: string;
  status: QuoteStatus;
  converted?: boolean;
  onView?: () => void;
}

export default function QuoteRow({
  id,
  client,
  vehicle,
  work,
  date,
  amount,
  status,
  converted,
  onView,
}: QuoteRowProps) {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 border-b border-border bg-surface">
      <div className="text-xs font-medium text-muted-foreground w-24 shrink-0 font-headings">
        {id}
      </div>
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-sm font-medium text-foreground truncate">{client}</span>
        <span className="text-xs text-muted-foreground truncate">{vehicle}</span>
      </div>
      <div className="flex-1 text-sm text-foreground truncate min-w-0">{work}</div>
      <div className="text-xs text-muted-foreground w-36 shrink-0">{date}</div>
      <div className="text-sm font-bold text-foreground w-32 text-right shrink-0 font-headings">
        {amount}
      </div>
      <div className="flex items-center gap-1.5 w-36 shrink-0">
        <Badge tone={STATUS_TONE[status]}>{QUOTE_STATUS_LABEL[status]}</Badge>
        {converted && (
          <span title="Converti en intervention" className="text-success">
            <Icon i="circle-check" size={14} />
          </span>
        )}
      </div>
      <Button variant="primary" size="sm" onClick={onView} className="shrink-0">
        Voir
      </Button>
    </div>
  );
}
