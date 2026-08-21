'use client';

// Provider picker — POSTs /api/subscriptions/checkout and redirects the
// whole tab to the hosted checkout page returned by whichever provider was
// picked (Stripe/Moneroo/Chariow). No client-side "processing" state beyond
// the redirect itself — the actual outcome is decided by
// /subscriptions/return polling /api/subscriptions/verify after the user
// comes back.
//
// 2026-08-20: dropped the Pro-vs-Business plan picker — BUSINESS was
// retired (its advantages merged into PRO/"Premium", see
// lib/server/plans/limits.ts's header comment), leaving nothing to choose
// between. This modal now only ever checks out `'PRO'`; the plan grid
// became a single static summary card.
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';

export interface UpgradeSubscriptionModalProps {
  open: boolean;
  onClose: () => void;
  availableProviders: string[];
  /** Pre-validated coupon (2026-08-20) — set when the caller already
   * confirmed the code via POST /api/coupons/validate on the pricing page,
   * so the discounted total can be shown here before payment too. The
   * checkout route re-validates server-side regardless (never trust the
   * client-computed discount). */
  appliedCoupon?: { code: string; discountedPriceFcfa: number } | null | undefined;
}

// Mirrors lib/server/plans/limits.ts's PLAN_PRICING.PRO — same local-copy
// convention as the landing page / profile page (that module lives under
// lib/server/, this is client-rendered display copy).
const PLAN_LABEL = 'Premium';
const PLAN_PRICE_FCFA = 9_900;

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
  appliedCoupon,
}: UpgradeSubscriptionModalProps) {
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
        body: {
          plan: 'PRO',
          provider,
          ...(appliedCoupon ? { couponCode: appliedCoupon.code } : {}),
        },
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
      title="Passer au plan Premium"
      icon="zap"
      maxWidth="lg"
    >
      <div className="flex flex-col gap-6">
        <div className="rounded-md border border-primary bg-primary/5 px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Plan {PLAN_LABEL}</p>
          {appliedCoupon ? (
            <p className="text-xs text-muted-foreground">
              <span className="line-through mr-1.5">{PLAN_PRICE_FCFA.toLocaleString('fr-FR')}</span>
              <span className="text-success font-semibold">
                {appliedCoupon.discountedPriceFcfa.toLocaleString('fr-FR')} FCFA/mois
              </span>{' '}
              — code {appliedCoupon.code} appliqué.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {PLAN_PRICE_FCFA.toLocaleString('fr-FR')} FCFA/mois — accès à toutes les
              fonctionnalités.
            </p>
          )}
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
