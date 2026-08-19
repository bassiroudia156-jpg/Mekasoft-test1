import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';

export interface DeleteVehicleModalTarget {
  id: string;
  brand: string;
  model: string;
  registration: string;
  owner: string;
}

export interface DeleteVehicleModalProps {
  target: DeleteVehicleModalTarget | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

// Extracted from /vehicles/page.tsx (2026-08-18 audit) so the client-profile
// page's vehicle sub-list can trigger the exact same confirm flow instead
// of duplicating it — both pages own their own DELETE call + optimistic
// state update, this component is pure presentation + the confirm/cancel
// callbacks.
export default function DeleteVehicleModal({
  target,
  deleting,
  onCancel,
  onConfirm,
}: DeleteVehicleModalProps) {
  return (
    <Modal open={!!target} onClose={onCancel} maxWidth="md">
      {target && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-destructive/10">
              <Icon i="triangle-alert" size={20} className="text-destructive" />
            </div>
            <div className="text-base font-bold font-headings text-foreground">
              Supprimer le véhicule ?
            </div>
          </div>

          <div className="bg-destructive/5 border border-destructive/20 rounded-md px-4 py-3">
            <p className="text-sm text-foreground">
              Vous êtes sur le point de supprimer
              <br />
              <span className="font-bold">
                {target.brand} {target.model} ({target.registration})
              </span>
              <br />
              du propriétaire
              <br />
              <span className="font-bold">{target.owner}</span>
            </p>
          </div>

          <div className="text-xs text-muted-foreground">
            Cette action ne peut pas être annulée. Un véhicule avec un historique
            d&apos;interventions ne peut pas être supprimé.
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={deleting}
              className="flex-1 justify-center"
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirm}
              disabled={deleting}
              className="flex-1 justify-center"
            >
              {deleting ? 'Suppression…' : 'Supprimer'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
