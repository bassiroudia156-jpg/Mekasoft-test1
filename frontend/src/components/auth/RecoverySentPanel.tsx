import Icon from '@/components/ui/Icon';
import Button from '@/components/ui/Button';

export interface RecoverySentPanelProps {
  email: string;
  resent?: boolean;
  onResend: () => void;
  resending?: boolean;
}

const STEPS = [
  { title: 'Ouvrez votre email', detail: 'Cherchez un email de MekaSoft' },
  { title: 'Cliquez sur le lien', detail: 'Le lien est valide 30 minutes' },
  { title: 'Créez un nouveau mot de passe', detail: 'Choisissez un mot de passe sécurisé' },
];

// Ported from PasswordRecoveryLinkSent(+_next1)/PasswordRecoveryLinkResent.
// Renders inside the standalone /forgot-password page's max-w-sm column
// (see that page — split out from /login's original combined-page design
// per explicit user request, 2026-08-17).
export default function RecoverySentPanel({
  email,
  resent = false,
  onResend,
  resending = false,
}: RecoverySentPanelProps) {
  return (
    <div>
      <div className="flex justify-center mb-4">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-success/10">
          <Icon i="mail-check" size={22} className="text-success" />
        </div>
      </div>

      <div className="text-center mb-6">
        <h2 className="text-lg font-bold font-headings text-foreground mb-1">
          {resent ? 'Lien renvoyé' : 'Lien envoyé'}
        </h2>
        <p className="text-xs text-muted-foreground">
          {resent
            ? 'Vous allez recevoir un nouvel email de réinitialisation.'
            : 'Vérifiez votre boîte email pour continuer.'}
        </p>
      </div>

      <div className="bg-muted/20 rounded-lg p-4 mb-6 border border-border">
        <div className="flex items-center gap-2 mb-2">
          <Icon i="mail" size={14} className="text-muted-foreground" />
          <p className="text-xs font-medium text-foreground">Email de récupération</p>
        </div>
        <p className="text-sm font-medium text-foreground">{email}</p>
      </div>

      <div className="flex flex-col gap-3 mb-6">
        {STEPS.map((step, i) => (
          <div key={step.title} className="flex items-start gap-3">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex-shrink-0">
              {i + 1}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{step.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{step.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-3 mb-6">
        <div className="flex gap-2 text-xs">
          <Icon i="info" size={12} className="text-primary flex-shrink-0 mt-0.5" />
          <p className="text-primary">
            Reçu aucun email ? Vérifiez votre dossier spam ou demandez un nouveau lien.
          </p>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={onResend}
        disabled={resending}
        className="w-full"
      >
        {resending ? 'Envoi…' : 'Renvoyer le lien'}
      </Button>
    </div>
  );
}
