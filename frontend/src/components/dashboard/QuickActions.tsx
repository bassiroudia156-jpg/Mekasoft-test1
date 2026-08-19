import Icon from '@/components/ui/Icon';
import Card from '@/components/ui/Card';

export interface QuickAction {
  icon: string;
  label: string;
  onClick?: () => void;
}

export interface QuickActionsProps {
  title?: string;
  actions?: QuickAction[];
}

const DEFAULT_ACTIONS: Omit<QuickAction, 'onClick'>[] = [
  { icon: 'circle-plus', label: 'Nouveau client' },
  { icon: 'car', label: 'Nouveau véhicule' },
];

export default function QuickActions({
  title = 'Actions rapides',
  actions = DEFAULT_ACTIONS,
}: QuickActionsProps) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {title}
      </div>
      <div className="flex flex-col gap-2">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            className="flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-medium bg-secondary text-secondary-foreground"
          >
            <Icon i={a.icon} size={15} />
            {a.label}
          </button>
        ))}
      </div>
    </Card>
  );
}
