import Icon from '@/components/ui/Icon';
import Button from '@/components/ui/Button';

export interface LogoutConfirmModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  userEmail?: string;
  userLabel?: string;
  confirming?: boolean;
}

// Ported from LogoutConfirmationScreen / LogoutConfirmationFromContextMenu —
// same content, two Banani trigger points (sidebar context menu, profile
// panel) collapse into one modal component here.
export default function LogoutConfirmModal({
  open,
  onCancel,
  onConfirm,
  userEmail,
  userLabel,
  confirming = false,
}: LogoutConfirmModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-foreground/30" onClick={onCancel} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Se déconnecter ?"
        className="relative max-w-sm w-full bg-surface border border-border rounded-lg p-8 shadow-lg"
      >
        <div className="flex justify-center mb-6">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-warning/10">
            <Icon i="log-out" size={32} className="text-warning" />
          </div>
        </div>

        <div className="text-center mb-6">
          <h2 className="text-lg font-bold font-headings text-foreground mb-2">Se déconnecter ?</h2>
          <p className="text-xs text-muted-foreground">
            Êtes-vous sûr de vouloir quitter MekaSoft ?
          </p>
        </div>

        <div className="bg-background rounded-md p-4 border border-border mb-6">
          <div className="flex items-start gap-2">
            <Icon i="info" size={12} className="text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              Vous serez complètement déconnecté de votre compte MekaSoft et vous devrez vous
              reconnecter pour accéder à l&apos;application.
            </p>
          </div>
        </div>

        {(userEmail || userLabel) && (
          <div className="bg-muted/20 rounded-md p-3 mb-6 border border-border">
            <p className="text-xs text-muted-foreground mb-1">Compte déconnecté :</p>
            {userEmail && <p className="text-sm font-medium text-foreground">{userEmail}</p>}
            {userLabel && <p className="text-xs text-muted-foreground mt-1">{userLabel}</p>}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <Button variant="warning" onClick={onConfirm} disabled={confirming}>
            <Icon i="log-out" size={14} />
            {confirming ? 'Déconnexion…' : 'Se déconnecter'}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={confirming}>
            Annuler
          </Button>
        </div>
      </div>
    </div>
  );
}
