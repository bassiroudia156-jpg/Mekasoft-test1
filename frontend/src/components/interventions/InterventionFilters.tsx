import Icon from '@/components/ui/Icon';

export interface InterventionFiltersProps {
  clientLabel?: string;
  vehicleLabel?: string;
  dateLabel?: string;
  onClientClick?: () => void;
  onVehicleClick?: () => void;
  onDateClick?: () => void;
  onReset?: () => void;
}

function FilterChip({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick?: (() => void) | undefined;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2.5 bg-input border border-border rounded-md cursor-pointer hover:bg-input/80"
    >
      <Icon i={icon} size={14} className="text-muted-foreground flex-shrink-0" />
      <span className="text-sm text-muted-foreground">{label}</span>
      <Icon i="chevron-down" size={12} className="text-muted-foreground flex-shrink-0" />
    </button>
  );
}

export default function InterventionFilters({
  clientLabel = 'Client',
  vehicleLabel = 'Véhicule',
  dateLabel = 'Date',
  onClientClick,
  onVehicleClick,
  onDateClick,
  onReset,
}: InterventionFiltersProps) {
  return (
    <div className="flex items-center gap-3">
      <FilterChip icon="user" label={clientLabel} onClick={onClientClick} />
      <FilterChip icon="car" label={vehicleLabel} onClick={onVehicleClick} />
      <FilterChip icon="calendar" label={dateLabel} onClick={onDateClick} />
      <button
        type="button"
        onClick={onReset}
        className="flex items-center gap-2 px-3 py-2.5 text-sm text-primary font-medium hover:text-primary/80"
      >
        <Icon i="x" size={14} />
        Réinitialiser
      </button>
    </div>
  );
}
