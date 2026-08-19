'use client';

// Plan × provider picker — POSTs /api/subscriptions/checkout and redirects
// the whole tab to the hosted checkout page returned by whichever provider
// was picked (Stripe/Moneroo/Chariow). No client-side "processing" state
// beyond the redirect itself — the actual outcome is decided by
// /subscriptions/return polling /api/subscriptions/verify after the user
// comes back.
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';

export interface UpgradeSubscriptionModalProps {
  open: boolean;
  onClose: () => void;
  availableProviders: string[];
  defaultPlan?: 'PRO' | 'BUSINESS';
}

// Mirrors lib/server/plans/limits.ts's PLAN_PRICING — same local-copy
// convention as the landing page / Settings' PLAN_INFO (that module lives
// under lib/server/, this is client-rendered display copy).
const PLANS = [
  { value: 'PRO' as const, label: 'Pro', priceFcfa: 9_900 },
  { value: 'BUSINESS' as const, label: 'Business', priceFcfa: 19_900 },
];

const PROVIDERS: Record<string, { label: string; blurb: string; icon: string }> = {
  STRIPE: {
    label: 'Carte bancaire',
    blurb: 'Stripe — renouvellement automatique',
    icon: 'credit-card',
  },
  MONEROO: {
    label: 'Mobile Money',
    blurb: 'Moneroo — Orange Money, Wave, MTN…',
    icon: 'smartphone',
  },
  CHARIOW: { label: 'Mobile Money', blurb: 'Chariow — Orange Money, Wave…', icon: 'smartphone' },
};

const ERROR_MAP: Record<string, string> = {
  PHONE_REQUIRED:
    'Ajoutez un numéro de téléphone dans Mon profil > Atelier avant de payer par mobile money.',
  SUBSCRIPTION_PROVIDER_UNCONFIGURED: "Ce moyen de paiement n'est pas encore disponible.",
  CHECKOUT_FAILED: 'Le paiement a échoué au démarrage. Réessayez.',
};

export default function UpgradeSubscriptionModal({
  open,
  onClose,
  availableProviders,
  defaultPlan = 'PRO',
}: UpgradeSubscriptionModalProps) {
  const [plan, setPlan] = useState<'PRO' | 'BUSINESS'>(defaultPlan);
  const [provider, setProvider] = useState<string | null>(availableProviders[0] ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setError(null);
    onClose();
  }

  async function onConfirm() {
    if (!provider) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await api<{ checkoutUrl: string }>('/api/subscriptions/checkout', {
        method: 'POST',
        body: { plan, provider },
      });
      window.location.href = res.checkoutUrl;
    } catch (err) {
      setError(err instanceof ApiError ? (ERROR_MAP[err.code] ?? err.message) : 'Erreur réseau.');
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Passer à un plan supérieur"
      icon="zap"
      maxWidth="lg"
    >
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-3">Plan</p>
          <div className="grid grid-cols-2 gap-3">
            {PLANS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPlan(p.value)}
                className={`text-left rounded-md border px-4 py-3 transition-colors ${
                  plan === p.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-input'
                }`}
              >
                <p className="text-sm font-semibold text-foreground">{p.label}</p>
                <p className="text-xs text-muted-foreground">
                  {p.priceFcfa.toLocaleString('fr-FR')} FCFA/mois
                </p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-3">
            Moyen de paiement
          </p>
          {availableProviders.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Aucun moyen de paiement n&apos;est encore configuré — contactez-nous en attendant.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {availableProviders.map((name) => {
                const info = PROVIDERS[name];
                if (!info) return null;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setProvider(name)}
                    className={`flex items-center gap-3 text-left rounded-md border px-4 py-3 transition-colors ${
                      provider === name
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-input'
                    }`}
                  >
                    <Icon i={info.icon} size={16} className="text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{info.label}</p>
                      <p className="text-xs text-muted-foreground">{info.blurb}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="text-xs text-warning">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-3 pt-4 border-t border-border">
          <Button
            type="button"
            variant="primary"
            disabled={submitting || !provider}
            onClick={onConfirm}
          >
            {submitting ? 'Redirection…' : 'Continuer vers le paiement'}
          </Button>
          <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
            Annuler
          </Button>
        </div>
      </div>
    </Modal>
  );
}
