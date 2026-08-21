// Public payment-method picker (2026-08-19) — reached from the landing
// page's "S'abonner" buttons. No account exists yet: collects just enough
// (email/atelier name/phone) to start a real hosted checkout, then hands the
// visitor straight to Stripe (card) or Chariow/Moneroo (mobile money).
// Account + org creation happens AFTER payment succeeds, in the webhook —
// see lib/server/subscriptions/anonymous.ts and /subscriptions/welcome.
//
// Deliberately NOT gated behind useUser() — this page must work for
// logged-out visitors, which is the entire point.
'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import AuthBrandPanel from '@/components/auth/AuthBrandPanel';
import Field from '@/components/ui/Field';
import PhoneField from '@/components/ui/PhoneField';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';

type Plan = 'PRO' | 'BUSINESS';
type Method = 'CARD' | 'MOBILE_MONEY';
type MobileProvider = 'MONEROO' | 'CHARIOW';

// Mirrors lib/server/plans/limits.ts's PLAN_PRICING — same local-copy
// convention as the rest of this page's display copy.
const PLAN_INFO: Record<Plan, { label: string; priceFcfa: number }> = {
  PRO: { label: 'Pro', priceFcfa: 9_900 },
  BUSINESS: { label: 'Business', priceFcfa: 19_900 },
};

function isPlan(value: string | null): value is Plan {
  return value === 'PRO' || value === 'BUSINESS';
}

// 2026-08-21 audit fix — "je vois que ça ne s'affiche pas sur les prix
// pour pouvoir cliquer dessus et appliquer les coupons": POST
// /api/coupons/validate and POST /api/subscriptions/anonymous-checkout's
// `couponCode` field were both already fully implemented server-side, but
// this page — the actual "prices" page a logged-out visitor lands on from
// the landing page's #tarifs section — never rendered any coupon input at
// all. /subscriptions/plans (the authenticated in-app upgrade flow) has
// had this UI since 2026-08-20; this mirrors it, validated against
// whichever `plan` the visitor actually picked (PRO or BUSINESS), so a
// coupon restricted via `appliesToPlan` correctly matches or rejects.
interface AppliedCoupon {
  code: string;
  originalPriceFcfa: number;
  discountedPriceFcfa: number;
}
const COUPON_ERROR_LABEL: Record<string, string> = {
  NOT_FOUND: 'Code introuvable.',
  INACTIVE: "Ce code n'est plus actif.",
  EXPIRED: 'Ce code a expiré.',
  REDEMPTION_LIMIT_REACHED: "Ce code a atteint sa limite d'utilisation.",
  PLAN_MISMATCH: "Ce code ne s'applique pas à ce forfait.",
};

function CheckoutBody() {
  const params = useSearchParams();
  const plan: Plan = isPlan(params.get('plan')) ? (params.get('plan') as Plan) : 'PRO';

  const [availableProviders, setAvailableProviders] = useState<string[]>([]);
  const [method, setMethod] = useState<Method>('CARD');
  const [mobileProvider, setMobileProvider] = useState<MobileProvider | null>(null);

  const [email, setEmail] = useState('');
  const [atelierName, setAtelierName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [couponInput, setCouponInput] = useState('');
  const [couponChecking, setCouponChecking] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);

  async function applyCoupon() {
    const code = couponInput.trim();
    if (!code) return;
    setCouponChecking(true);
    setCouponError(null);
    try {
      const res = await api<{
        valid: boolean;
        code?: string;
        originalPriceFcfa?: number;
        discountedPriceFcfa?: number;
        error?: string;
      }>('/api/coupons/validate', { method: 'POST', body: { code, plan } });
      if (
        res.valid &&
        res.code !== undefined &&
        res.originalPriceFcfa !== undefined &&
        res.discountedPriceFcfa !== undefined
      ) {
        setAppliedCoupon({
          code: res.code,
          originalPriceFcfa: res.originalPriceFcfa,
          discountedPriceFcfa: res.discountedPriceFcfa,
        });
      } else {
        setAppliedCoupon(null);
        setCouponError(COUPON_ERROR_LABEL[res.error ?? ''] ?? 'Code invalide.');
      }
    } catch (err) {
      setAppliedCoupon(null);
      setCouponError(err instanceof ApiError ? err.message : 'Erreur réseau.');
    } finally {
      setCouponChecking(false);
    }
  }

  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponError(null);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ availableProviders: string[] }>(
          '/api/subscriptions/anonymous-checkout',
        );
        if (!cancelled) setAvailableProviders(res.availableProviders);
      } catch {
        // Buttons just render as unavailable below — no hard failure.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stripeAvailable = availableProviders.includes('STRIPE');
  const monerooAvailable = availableProviders.includes('MONEROO');
  const chariowAvailable = availableProviders.includes('CHARIOW');
  const mobileMoneyAvailable = monerooAvailable || chariowAvailable;

  const resolvedMobileProvider: MobileProvider | null =
    mobileProvider ?? (monerooAvailable ? 'MONEROO' : chariowAvailable ? 'CHARIOW' : null);
  const providerToSubmit = method === 'CARD' ? 'STRIPE' : resolvedMobileProvider;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!providerToSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await api<{ checkoutUrl: string }>('/api/subscriptions/anonymous-checkout', {
        method: 'POST',
        body: {
          email,
          atelierName,
          phone,
          plan,
          provider: providerToSubmit,
          ...(appliedCoupon ? { couponCode: appliedCoupon.code } : {}),
        },
      });
      window.location.href = res.checkoutUrl;
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Impossible de démarrer le paiement. Réessayez.',
      );
      setSubmitting(false);
    }
  }

  const pricing = PLAN_INFO[plan];
  const payableFcfa = appliedCoupon ? appliedCoupon.discountedPriceFcfa : pricing.priceFcfa;

  return (
    <div className="flex flex-col lg:flex-row bg-background min-h-screen">
      <AuthBrandPanel />

      <div className="flex flex-col justify-center w-full lg:w-1/2 bg-background px-6 lg:px-14 py-10">
        <div className="max-w-sm w-full mx-auto">
          <Link
            href="/#tarifs"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-fit mb-4"
          >
            <Icon i="arrow-left" size={14} />
            Retour aux forfaits
          </Link>

          <div className="mb-6">
            <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">
              S&apos;abonner
            </div>
            <h2 className="text-2xl font-bold font-headings text-foreground">
              Forfait {pricing.label}
            </h2>
            <p className="text-sm mt-1 flex items-baseline gap-2">
              {appliedCoupon ? (
                <>
                  <span className="text-muted-foreground/60 line-through">
                    {pricing.priceFcfa.toLocaleString('fr-FR')} FCFA
                  </span>
                  <span className="text-success font-semibold">
                    {appliedCoupon.discountedPriceFcfa.toLocaleString('fr-FR')} FCFA / mois
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">
                  {pricing.priceFcfa.toLocaleString('fr-FR')} FCFA / mois
                </span>
              )}
            </p>
          </div>

          {/* Coupon — server-validated (POST /api/coupons/validate) before
              checkout ever submits; see the AppliedCoupon comment above. */}
          <div className="bg-surface border border-border rounded-lg p-4 mb-6">
            {appliedCoupon ? (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm">
                  <Icon i="badge-percent" size={16} className="text-success" />
                  <span className="text-foreground">
                    Code <strong>{appliedCoupon.code}</strong> appliqué.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={removeCoupon}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  Retirer
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <Icon i="tag" size={16} className="text-muted-foreground shrink-0" />
                <input
                  type="text"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void applyCoupon())}
                  placeholder="Code promo (optionnel)"
                  className="flex-1 min-w-[140px] px-3 py-2 border border-border rounded-md text-sm bg-input"
                />
                <Button
                  type="button"
                  variant="outline-primary"
                  size="sm"
                  disabled={couponChecking || !couponInput.trim()}
                  onClick={() => void applyCoupon()}
                >
                  {couponChecking ? 'Vérification…' : 'Appliquer'}
                </Button>
              </div>
            )}
            {couponError && <p className="text-xs text-destructive mt-2">{couponError}</p>}
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field
              label="Adresse email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={setEmail}
              placeholder="votre@email.com"
              helper="Servira à créer votre compte MekaSoft après le paiement."
            />
            <Field
              label="Nom de l'atelier"
              name="atelierName"
              required
              value={atelierName}
              onChange={setAtelierName}
              placeholder="Garage Ndiaye"
            />
            <PhoneField label="Téléphone" name="phone" required value={phone} onChange={setPhone} />

            <div className="flex flex-col gap-2 mt-2">
              <label className="text-sm font-medium text-foreground">Moyen de paiement</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!stripeAvailable}
                  onClick={() => setMethod('CARD')}
                  className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-md border text-sm font-medium transition-colors ${
                    method === 'CARD'
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border text-foreground hover:bg-input'
                  } ${!stripeAvailable ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  <Icon i="credit-card" size={18} />
                  Carte bancaire
                  {!stripeAvailable && (
                    <span className="text-[10px] text-muted-foreground">Indisponible</span>
                  )}
                </button>
                <button
                  type="button"
                  disabled={!mobileMoneyAvailable}
                  onClick={() => setMethod('MOBILE_MONEY')}
                  className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-md border text-sm font-medium transition-colors ${
                    method === 'MOBILE_MONEY'
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border text-foreground hover:bg-input'
                  } ${!mobileMoneyAvailable ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  <Icon i="smartphone" size={18} />
                  Mobile Money
                  {!mobileMoneyAvailable && (
                    <span className="text-[10px] text-muted-foreground">Bientôt disponible</span>
                  )}
                </button>
              </div>

              {method === 'MOBILE_MONEY' && monerooAvailable && chariowAvailable && (
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setMobileProvider('MONEROO')}
                    className={`flex-1 px-3 py-2 rounded-md border text-xs font-medium ${
                      resolvedMobileProvider === 'MONEROO'
                        ? 'border-primary text-primary'
                        : 'border-border text-muted-foreground'
                    }`}
                  >
                    Moneroo
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileProvider('CHARIOW')}
                    className={`flex-1 px-3 py-2 rounded-md border text-xs font-medium ${
                      resolvedMobileProvider === 'CHARIOW'
                        ? 'border-primary text-primary'
                        : 'border-border text-muted-foreground'
                    }`}
                  >
                    Chariow
                  </button>
                </div>
              )}
            </div>

            {error && (
              <p role="alert" className="text-xs text-warning">
                {error}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              disabled={submitting || !providerToSubmit}
              className="w-full mt-2"
            >
              <Icon i="lock" size={14} />
              {submitting ? 'Redirection…' : `Payer ${payableFcfa.toLocaleString('fr-FR')} FCFA`}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-6">
            Déjà un compte ?{' '}
            <Link href="/login" className="text-primary font-medium">
              Se connecter
            </Link>{' '}
            puis accédez aux forfaits depuis votre profil.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AnonymousCheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutBody />
    </Suspense>
  );
}
