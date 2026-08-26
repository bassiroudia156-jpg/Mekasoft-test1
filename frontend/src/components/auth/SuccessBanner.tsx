import Icon from '@/components/ui/Icon';

export interface SuccessBannerProps {
  message: string;
}

// The "Mot de passe changé avec succès" / "Vous avez été déconnecté avec
// succès" alert seen at the top of LoginAfterPasswordChange and
// LoginPageAfterLogout — extracted since /login now covers both contextual
// states (plus the reset-password redirect) via one component instead of
// three near-identical inline blocks.
export default function SuccessBanner({ message }: SuccessBannerProps) {
  return (
    <div className="bg-success/10 border border-success/20 rounded-lg px-4 py-3 mb-6 flex gap-3">
      <Icon i="circle-check" size={16} className="text-success flex-shrink-0 mt-0.5" />
      <p className="text-xs text-success font-medium">{message}</p>
    </div>
  );
}
