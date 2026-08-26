import RowMenu from '@/components/ui/RowMenu';
import type { VehicleStatus } from './VehicleRow';

export interface VehicleRowMenuProps {
  status: VehicleStatus;
  onView: () => void;
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}

// 2026-08-18 audit fix: the row "..." on both /vehicles and a client's
// profile page rendered with hover styling and an aria-label but no menu
// behind it at all (VehicleRow's onMoreClick prop was left undefined by
// most callers) — dead UI. Built on the shared RowMenu primitive (portal +
// fixed positioning, see its own header comment for why that matters
// specifically for a row menu sitting inside a horizontally-scrolling
// table).
export default function VehicleRowMenu({
  status,
  onView,
  onEdit,
  onToggleStatus,
  onDelete,
}: VehicleRowMenuProps) {
  return (
    <RowMenu
      items={[
        { key: 'view', label: 'Voir la fiche', icon: 'eye', onClick: onView },
        { key: 'edit', label: 'Modifier les informations', icon: 'pencil', onClick: onEdit },
        {
          key: 'toggle',
          label: status === 'Actif' ? 'Désactiver' : 'Activer',
          icon: 'power',
          onClick: onToggleStatus,
        },
        {
          key: 'delete',
          label: 'Supprimer',
          icon: 'trash-2',
          onClick: onDelete,
          tone: 'destructive',
          separatorBefore: true,
        },
      ]}
    />
  );
}
