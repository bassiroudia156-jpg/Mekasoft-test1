'use client';

// Provider picker — POSTs /api/subscriptions/checkout and redirects the
// whole tab to the hosted checkout page returned by whichever provider was
// picked (Stripe/Moneroo/Chariow). No client-side "processing" state beyond
// the redirect itself — the actual outcome is decided by
// /subscriptions/return polling /api/subscriptions/verify after the user
// comes back.
//
// 2026-08-21: the plan itself is chosen on the pricing grid now (a
// "Choisir Pro"/"Choisir Business" button per card, see
// subscriptions/plans/page.tsx) and passed in as `plan` — no in-modal
// Pro-vs-Business picker here anymore, this just confirms the payment
// method for whichever plan the caller already picked.
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';

export interface UpgradeSubscriptionModalProps {
  open: boolean;
  onClose: () => void;
  plan: 'PRO' | 'BUSINESS';
  availableProviders: string[];
  /** Pre-validated coupon (2026-08-20) — set when the caller already
   * confirmed the code via POST /api/coupons/validate on the pricing page,
   * so the discounted total can be shown here before payment too. The
   * checkout route re-validates server-side regardless (never trust the
   * client-computed discount). Coupon UI is PRO-scoped — callers should
   * never pass one alongside `plan="BUSINESS"`. */
  appliedCoupon?: { code: string; discountedPriceFcfa: number } | null | undefined;
}

// Mirrors lib/server/plans/limits.ts's PLAN_PRICING — static fallback,
// overridden below by GET /api/plans/pricing (audit fix, 2026-08-21: an
// admin override via /admin/pricing wasn't reaching this modal, so a user
// could confirm a price here that didn't match what they'd actually be
// charged — see that route's header comment).
const PLAN_INFO: Record<'PRO' | 'BUSINESS', { label: string; priceFcfa: number }> = {
  PRO: { label: 'Pro', priceFcfa: 9_900 },
  BUSINESS: { label: 'Business', priceFcfa: 19_900 },
};

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
  // 2026-08-22 — api()'s ApiError.message is the raw `error` code, not the
  // server's friendly `message` field (see lib/api.ts), so every code the
  // checkout route can throw needs an entry here or it renders as-is (e.g.
  // "COUPON_UNSUPPORTED_FOR_PROVIDER" verbatim). COUPON_UNSUPPORTED_FOR_PROVIDER
  // itself shouldn't normally be reachable anymore — the provider picker
  // below disables Chariow while a coupon is applied — but keep the
  // message in case a coupon gets applied/provider picked in an order the
  // guard doesn't anticipate. The other COUPON_* codes mirror
  // COUPON_ERROR_LABEL on the pricing page (a re-validation race: the
  // coupon was fine when the visitor applied it, invalid by the time this
  // checkout POST re-checks it — expired/exhausted/deactivated in between).
  COUPON_UNSUPPORTED_FOR_PROVIDER:
    "Ce code promo n'est pas compatible avec Mobile Money. Retirez-le ou payez par carte.",
  COUPON_NOT_FOUND: 'Le code promo appliqué est introuvable. Réessayez sans code.',
  COUPON_INACTIVE: "Le code promo appliqué n'est plus actif.",
  COUPON_EXPIRED: 'Le code promo appliqué a expiré.',
  COUPON_REDEMPTION_LIMIT_REACHED: "Le code promo a atteint sa limite d'utilisation.",
  COUPON_PLAN_MISMATCH: "Le code promo ne s'applique pas à ce forfait.",
};

export default function UpgradeSubscriptionModal({
  open,
  onClose,
  plan,
  availableProviders,
  appliedCoupon,
}: UpgradeSubscriptionModalProps) {
  const [livePriceFcfa, setLivePriceFcfa] = useState<number | null>(null);
  const pricing = { ...PLAN_INFO[plan], priceFcfa: livePriceFcfa ?? PLAN_INFO[plan].priceFcfa };
  const [provider, setProvider] = useState<string | null>(availableProviders[0] ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 2026-08-22 bug fix — Chariow can't accept a coupon at all (no API for a
  // custom amount; see checkout/route.ts's COUPON_UNSUPPORTED_FOR_PROVIDER
  // guard). A user who applies a coupon then picks Chariow used to only
  // find out after clicking "Continuer" and hitting a 400. Steer them away
  // from the dead end instead: if a coupon is (or becomes) applied while
  // Chariow is selected, fall back to the first other available provider.
  useEffect(() => {
    if (appliedCoupon && provider === 'CHARIOW') {
      setProvider(availableProviders.find((name) => name !== 'CHARIOW') ?? null);
    }
  }, [appliedCoupon, provider, availableProviders]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ pricing: Record<string, { priceFcfa: number }> }>(
          '/api/plans/pricing',
        );
        if (!cancelled) setLivePriceFcfa(res.pricing[plan]?.priceFcfa ?? null);
      } catch {
        // Falls back to PLAN_INFO's static price above.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, plan]);

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
          plan,
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
      title={`Passer au plan ${pricing.label}`}
      icon="zap"
      maxWidth="lg"
    >
      <div className="flex flex-col gap-6">
        <div className="rounded-md border border-primary bg-primary/5 px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Plan {pricing.label}</p>
          {appliedCoupon ? (
            <p className="text-xs text-muted-foreground">
              <span className="line-through mr-1.5">
                {pricing.priceFcfa.toLocaleString('fr-FR')}
              </span>
              <span className="text-success font-semibold">
                {appliedCoupon.discountedPriceFcfa.toLocaleString('fr-FR')} FCFA/mois
              </span>{' '}
              — code {appliedCoupon.code} appliqué.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {pricing.priceFcfa.toLocaleString('fr-FR')} FCFA/mois — accès à toutes les
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
                // 2026-08-22 — Chariow has no discount API (Chariow.md §6);
                // disable it up front instead of letting the user hit
                // COUPON_UNSUPPORTED_FOR_PROVIDER after clicking through.
                const disabledByCoupon = name === 'CHARIOW' && !!appliedCoupon;
                return (
                  <button
                    key={name}
                    type="button"
                    disabled={disabledByCoupon}
                    onClick={() => setProvider(name)}
                    className={`flex items-center gap-3 text-left rounded-md border px-4 py-3 transition-colors ${
                      disabledByCoupon
                        ? 'opacity-40 cursor-not-allowed border-border'
                        : provider === name
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-input'
                    }`}
                  >
                    <Icon i={info.icon} size={16} className="text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{info.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {disabledByCoupon ? 'Indisponible avec un code promo' : info.blurb}
                      </p>
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
