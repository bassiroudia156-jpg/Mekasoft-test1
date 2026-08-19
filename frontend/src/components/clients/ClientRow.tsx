import Icon from '@/components/ui/Icon';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';

export type ClientStatus = 'actif' | 'inactif';

export interface ClientRowProps {
  name: string;
  phone: string;
  email: string;
  vehicles: number;
  totalSpent: string;
  lastVisit: string;
  status: ClientStatus;
  onView?: () => void;
}

export default function ClientRow({
  name,
  phone,
  email,
  vehicles,
  totalSpent,
  lastVisit,
  status,
  onView,
}: ClientRowProps) {
  return (
    <div className="flex items-center gap-4 px-5 py-3 border-b border-border bg-surface">
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-sm font-medium text-foreground truncate">{name}</span>
        <span className="text-xs text-muted-foreground truncate">{phone}</span>
      </div>

      <div className="text-xs text-muted-foreground w-40 truncate">{email}</div>

      <Badge tone="primary" dot={false} className="w-20 shrink-0">
        <Icon i="car" size={12} />
        {vehicles} veh.
      </Badge>

      <div className="text-sm font-bold text-foreground w-28 text-right shrink-0">{totalSpent}</div>
      <div className="text-xs text-muted-foreground w-24 text-right shrink-0">{lastVisit}</div>

      <Badge tone={status === 'actif' ? 'success' : 'muted'} className="w-20 shrink-0">
        {status === 'actif' ? 'Actif' : 'Inactif'}
      </Badge>

      <Button variant="soft" size="sm" onClick={onView} className="shrink-0">
        Voir
      </Button>
    </div>
  );
}
