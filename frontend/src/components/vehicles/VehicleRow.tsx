import Badge from '@/components/ui/Badge';
import VehicleRowMenu from './VehicleRowMenu';

export type VehicleStatus = 'Actif' | 'Inactif';

export interface VehicleRowProps {
  brand: string;
  model: string;
  registration: string;
  owner: string;
  mileage: string;
  lastService: string;
  status: VehicleStatus;
  onView: () => void;
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}

export default function VehicleRow({
  brand,
  model,
  registration,
  owner,
  mileage,
  lastService,
  status,
  onView,
  onEdit,
  onToggleStatus,
  onDelete,
}: VehicleRowProps) {
  return (
    <div className="flex items-center gap-4 px-5 py-3 border-b border-border bg-surface">
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-sm font-medium text-foreground truncate">
          {brand} {model}
        </span>
      </div>

      <div className="text-xs text-muted-foreground w-28 text-center truncate">{registration}</div>

      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-xs text-foreground truncate">{owner}</span>
      </div>

      <div className="text-xs text-muted-foreground w-32 text-right">{mileage}</div>
      <div className="text-xs text-muted-foreground w-24 text-right">{lastService}</div>

      <Badge tone={status === 'Actif' ? 'success' : 'muted'} className="w-20">
        {status}
      </Badge>

      <div className="flex items-center gap-1 w-14 justify-end">
        <VehicleRowMenu
          status={status}
          onView={onView}
          onEdit={onEdit}
          onToggleStatus={onToggleStatus}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}
