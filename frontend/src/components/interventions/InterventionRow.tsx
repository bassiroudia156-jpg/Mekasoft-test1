import Badge, { type BadgeTone } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';

export type InterventionStatus = 'En cours' | 'Terminé' | 'En attente' | 'Non payé';

export interface InterventionRowProps {
  id: string;
  client: string;
  vehicle: string;
  work: string;
  date: string;
  amount: string;
  status: InterventionStatus;
  onView?: () => void;
}

const STATUS_TONE: Record<InterventionStatus, BadgeTone> = {
  'En cours': 'warning',
  Terminé: 'success',
  'En attente': 'muted',
  'Non payé': 'accent',
};

export default function InterventionRow({
  id,
  client,
  vehicle,
  work,
  date,
  amount,
  status,
  onView,
}: InterventionRowProps) {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 border-b border-border bg-surface">
      <div className="text-xs font-medium text-muted-foreground w-16 shrink-0 font-headings">
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
      <Badge tone={STATUS_TONE[status]} className="w-28 shrink-0">
        {status}
      </Badge>
      <Button variant="primary" size="sm" onClick={onView} className="shrink-0">
        Voir
      </Button>
    </div>
  );
}
