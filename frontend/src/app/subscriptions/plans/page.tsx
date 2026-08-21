// Banani: 83o75a2tYyMD/screens/UpgradePlansPage.jsx ("Upgrade Plans Page")
// — 3-tier pricing grid + FAQ (Basique/Professionnel/Entreprise → our real
// Gratuit/Pro/Business, see .planning/banani/subscription-plans-page.md).
// 2026-08-21: BUSINESS restored (reverting the 2026-08-20 "merge into Pro"
// — see lib/server/plans/limits.ts's header comment).
// Reached from Mon profil's upgrade banner ("Voir les forfaits") — that
// section lived on /settings until 2026-08-19, when it moved to /profile
// alongside Atelier (see profile/page.tsx's header comment).
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useRefetchOnFocus } from '@/lib/useRefetchOnFocus';
import Sidebar from '@/components/layout/Sidebar';
import PageHeader from '@/components/ui/PageHeader';
import Icon from '@/components/ui/Icon';
import Button from '@/components/ui/Button';
import UpgradeSubscriptionModal from '@/components/subscriptions/UpgradeSubscriptionModal';

// 2026-08-20 — "je veux que si j'applique un code promo que ça s'affiche
// sur la page Premium avant de passer au paiement". Server-validated via
// POST /api/coupons/validate (never trust a client-side discount
// calculation) before it ever reaches the checkout modal.
//
// 2026-08-21 audit fix: this used to hardcode `plan: 'PRO'` on every
// validate call, so a coupon admins restrict to BUSINESS via the new
// `appliesToPlan` selector (see admin/promotions/page.tsx) always came
// back PLAN_MISMATCH here — the discount then only ever rendered on the
// PRO card regardless. `plan` now travels with the applied coupon so the
// right card shows it, with a small toggle letting the visitor pick which
// plan to check the code against before applying.
interface AppliedCoupon {
  code: string;
  plan: 'PRO' | 'BUSINESS';
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

// Mirrors lib/server/plans/limits.ts's PLAN_PRICING/PLAN_LIMITS — same
// local-copy convention as the landing page and Settings (that module lives
// under lib/server/, this is client-rendered display copy).
//
// 2026-08-19: card visuals (dark inverted "featured" card, inline pill
// badge, plain price stack, primary-outline buttons) now deliberately
// mirror the landing page's #tarifs section (see page.tsx) — same pricing
// design in both places, per user request. `badge` is new here for that
// reason (landing shows "Populaire"/"Équipes" pills; this page previously
// only had an absolute-positioned "Populaire" corner ribbon on Pro).
const PLANS = [
  {
    plan: 'FREE' as const,
    label: 'Gratuit',
    blurb: 'Pour débuter',
    priceFcfa: 0,
    originalPriceFcfa: null as number | null,
    badge: null as string | null,
    features: [
      { text: '3 clients max', included: true },
      { text: '3 véhicules max', included: true },
      { text: '5 interventions/mois', included: true },
      { text: 'Devis & factures PDF', included: true },
      { text: 'Suivi des paiements', included: true },
    ],
  },
  {
    plan: 'PRO' as const,
    label: 'Pro',
    blurb: 'Le plus populaire',
    priceFcfa: 9_900,
    originalPriceFcfa: null as number | null,
    featured: true,
    badge: 'Populaire' as string | null,
    features: [
      { text: 'Clients illimités', included: true },
      { text: 'Véhicules illimités', included: true },
      { text: 'Interventions illimitées', included: true },
      { text: 'Logo sur les factures', included: true },
    ],
  },
  {
    plan: 'BUSINESS' as const,
    label: 'Business',
    blurb: 'Pour les plus grands',
    priceFcfa: 19_900,
    originalPriceFcfa: null as number | null,
    badge: 'Équipes' as string | null,
    features: [
      { text: 'Tout Pro', included: true },
      { text: "Jusqu'à 5 utilisateurs", included: true },
      { text: 'Rôles & permissions', included: true },
      { text: 'Rapport mensuel PDF', included: true },
      { text: 'Export de données CSV', included: true },
    ],
  },
];

const FAQS = [
  {
    q: 'Puis-je changer de forfait à tout moment ?',
    a: 'Oui — passez à Pro ou Business quand vous en avez besoin. Le changement est actif dès la confirmation du paiement.',
  },
  {
    q: 'Le plan Gratuit a-t-il une durée limitée ?',
    a: "Non, le plan Gratuit reste gratuit à vie, sans carte bancaire — jusqu'à 3 clients, 3 véhicules et 5 interventions par mois.",
  },
  {
    q: 'Comment fonctionne le paiement par Mobile Money (Moneroo/Chariow) ?',
    a: "Le mobile money ne permet pas de prélèvement automatique — chaque paiement est ponctuel. Vous recevrez un rappel par email (et WhatsApp si configuré) avant l'expiration, avec 3 jours de grâce avant un retour automatique au plan Gratuit.",
  },
  {
    q: 'Comment annuler mon abonnement ?',
    a: 'Par carte (Stripe) : depuis « Gérer mon abonnement » dans Mon profil, annulation immédiate ou en fin de période. Par mobile money : il suffit de ne pas renouveler au prochain paiement.',
  },
];

interface OrgSummary {
  id: string;
  plan: string;
}

export default function SubscriptionPlansPage() {
  const user = useUser();
  const [org, setOrg] = useState<OrgSummary | null>(null);
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'PRO' | 'BUSINESS'>('PRO');
  const [refreshTick, setRefreshTick] = useState(0);

  const [couponInput, setCouponInput] = useState('');
  const [couponPlan, setCouponPlan] = useState<'PRO' | 'BUSINESS'>('PRO');
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
      }>('/api/coupons/validate', { method: 'POST', body: { code, plan: couponPlan } });
      if (
        res.valid &&
        res.code !== undefined &&
        res.originalPriceFcfa !== undefined &&
        res.discountedPriceFcfa !== undefined
      ) {
        setAppliedCoupon({
          code: res.code,
          plan: couponPlan,
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

  // Switching which plan to check the code against invalidates whatever
  // was previously applied — it was validated (and priced) for the other
  // plan, so keeping it displayed would silently show a stale discount.
  function selectCouponPlan(next: 'PRO' | 'BUSINESS') {
    setCouponPlan(next);
    if (appliedCoupon) removeCoupon();
  }

  // 2026-08-19: "je veux que le chargement des donnees soit en temps reel" —
  // same refetch-on-focus convention as dashboard/page.tsx (see
  // useRefetchOnFocus's own comment: no push channel in this app, so
  // silently re-fetching on tab focus/visibility is the standard
  // near-zero-cost stand-in). Matters here specifically because mobile
  // money checkouts (Moneroo/Chariow) redirect out to a provider page and
  // back — a user who completes payment in another tab and returns to this
  // one should see "Plan actuel" flip without a manual reload.
  useRefetchOnFocus(() => setRefreshTick((t) => t + 1));

  // Not gated on `user` (2026-08-19, same fix as Settings): these are
  // cookie-authenticated like every api() call, independent of AuthContext's
  // client-side `user` state. Firing on mount lets them race AuthContext's
  // own GET /api/auth/me instead of queuing behind it. Also dropped the
  // separate useCallerOrganization() call that used to run alongside this
  // fetch — same endpoint, so it was a literal duplicate GET /api/organizations
  // on every load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ organizations: OrgSummary[] }>('/api/organizations');
        if (!cancelled) setOrg(res.organizations[0] ?? null);
      } catch {
        // Cards still render — "Plan actuel" badge just won't show mid-fetch.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ availableProviders: string[] }>('/api/subscriptions');
        if (!cancelled) setAvailableProviders(res.availableProviders);
      } catch {
        // Modal shows "aucun moyen de paiement configuré" — handled there.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar active="profile" />

      <div className="flex-1 flex flex-col min-w-0">
        <PageHeader eyebrow="Forfaits" title="Choisir un forfait" />

        <div className="flex-1 w-full p-4 lg:p-6 flex flex-col gap-6 max-w-5xl lg:mx-auto">
          <Link
            href="/profile"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-fit"
          >
            <Icon i="arrow-left" size={14} />
            Retour à mon profil
          </Link>

          <p className="text-sm text-muted-foreground -mt-2">
            Choisissez le forfait qui correspond aux besoins de votre atelier.
          </p>

          {/* Coupon — applied server-side-validated before checkout ever
              opens, so the discount is visible on the matching card. */}
          <div className="bg-surface border border-border rounded-lg p-4">
            {appliedCoupon ? (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm">
                  <Icon i="badge-percent" size={16} className="text-success" />
                  <span className="text-foreground">
                    Code <strong>{appliedCoupon.code}</strong> appliqué sur{' '}
                    <strong>{appliedCoupon.plan === 'PRO' ? 'Pro' : 'Business'}</strong> —{' '}
                    <span className="text-success font-semibold">
                      {appliedCoupon.discountedPriceFcfa.toLocaleString('fr-FR')} FCFA/mois
                    </span>{' '}
                    au lieu de {appliedCoupon.originalPriceFcfa.toLocaleString('fr-FR')} FCFA.
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
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Icon i="tag" size={16} className="text-muted-foreground shrink-0" />
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void applyCoupon())}
                    placeholder="Code promo (optionnel)"
                    className="flex-1 min-w-[160px] px-3 py-2 border border-border rounded-md text-sm bg-input"
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
                {/* A code can be restricted to one plan (admin's "Forfait
                    d'application") — this picks which price to check it
                    against, since the two plans have different prices. */}
                <div className="flex items-center gap-2 pl-6 text-xs">
                  <span className="text-muted-foreground">Pour le forfait :</span>
                  <div className="flex gap-1">
                    {(['PRO', 'BUSINESS'] as const).map((pl) => (
                      <button
                        key={pl}
                        type="button"
                        onClick={() => selectCouponPlan(pl)}
                        className={`px-2 py-1 rounded-md font-medium transition-colors ${
                          couponPlan === pl
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-input'
                        }`}
                      >
                        {pl === 'PRO' ? 'Pro' : 'Business'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {couponError && <p className="text-xs text-destructive mt-2">{couponError}</p>}
          </div>

          {/* Plans grid — same card design as the landing page's #tarifs
              section (dark inverted "featured" card, inline pill badge,
              plain price stack, primary-outline buttons on the non-featured
              tiers) so a logged-in upgrade and an anonymous visitor see the
              identical pricing presentation. base: stacked, md+: 3 columns. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
            {PLANS.map((p) => {
              const isCurrent = org?.plan === p.plan;
              const featured = !!p.featured;
              return (
                <div
                  key={p.plan}
                  className={`rounded-lg lg:rounded-xl p-5 lg:p-8 flex flex-col ${
                    featured ? 'bg-foreground' : 'bg-surface border border-border'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3
                      className={`font-bold font-headings text-base lg:text-lg ${
                        featured ? 'text-background' : 'text-foreground'
                      }`}
                    >
                      {p.label}
                    </h3>
                    {p.badge && (
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${
                          featured
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-secondary-foreground'
                        }`}
                      >
                        {p.badge}
                      </span>
                    )}
                  </div>
                  <p
                    className={`text-xs lg:text-sm mb-4 lg:mb-6 ${
                      featured ? 'text-background/60' : 'text-muted-foreground'
                    }`}
                  >
                    {p.blurb}
                  </p>

                  <div className="mb-4 lg:mb-6">
                    <div className="flex items-baseline gap-2 whitespace-nowrap">
                      {/* Coupon applied (2026-08-20, plan-aware since
                          2026-08-21): strike the normal price instead
                          of/on top of the original "before" price, and
                          show the discounted total on whichever card the
                          coupon was checked against. */}
                      {appliedCoupon && p.plan === appliedCoupon.plan ? (
                        <>
                          <span
                            className={`text-sm lg:text-base line-through ${
                              featured ? 'text-background/40' : 'text-muted-foreground/60'
                            }`}
                          >
                            {p.priceFcfa.toLocaleString('fr-FR')}
                          </span>
                          <span className="text-2xl lg:text-4xl font-bold text-success">
                            {appliedCoupon.discountedPriceFcfa.toLocaleString('fr-FR')}
                          </span>
                        </>
                      ) : (
                        <>
                          {p.originalPriceFcfa && (
                            <span
                              className={`text-sm lg:text-base line-through ${
                                featured ? 'text-background/40' : 'text-muted-foreground/60'
                              }`}
                            >
                              {p.originalPriceFcfa.toLocaleString('fr-FR')}
                            </span>
                          )}
                          <span
                            className={`text-2xl lg:text-4xl font-bold ${
                              featured ? 'text-background' : 'text-foreground'
                            }`}
                          >
                            {p.priceFcfa.toLocaleString('fr-FR')}
                          </span>
                        </>
                      )}
                    </div>
                    <span
                      className={`text-xs lg:text-sm ${
                        featured ? 'text-background/60' : 'text-muted-foreground'
                      }`}
                    >
                      {p.priceFcfa === 0 ? 'FCFA — à vie' : 'FCFA / mois'}
                    </span>
                  </div>

                  <div className="space-y-2 lg:space-y-3 mb-5 lg:mb-8 flex-1">
                    {p.features.map((f) => (
                      <div key={f.text} className="flex items-center gap-2">
                        <Icon
                          i={f.included ? 'check' : 'x'}
                          size={13}
                          className={`flex-shrink-0 w-[11px] h-[11px] lg:w-[13px] lg:h-[13px] ${
                            f.included
                              ? 'text-primary'
                              : featured
                                ? 'text-background/40'
                                : 'text-muted-foreground'
                          }`}
                        />
                        <span
                          className={`text-xs lg:text-sm ${
                            f.included
                              ? featured
                                ? 'text-background/90'
                                : 'text-foreground'
                              : featured
                                ? 'text-background/40'
                                : 'text-muted-foreground'
                          }`}
                        >
                          {f.text}
                        </span>
                      </div>
                    ))}
                  </div>

                  {isCurrent ? (
                    <div
                      className={`w-full py-2 lg:py-3 rounded lg:rounded-md text-xs lg:text-sm font-medium text-center border ${
                        featured
                          ? 'border-background/20 text-background/70'
                          : 'border-border text-muted-foreground'
                      }`}
                    >
                      Plan actuel
                    </div>
                  ) : p.plan === 'FREE' ? (
                    <div className="w-full py-2 lg:py-3 text-xs text-muted-foreground text-center">
                      Inclus par défaut
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPlan(p.plan as 'PRO' | 'BUSINESS');
                        setUpgradeOpen(true);
                      }}
                      className={`w-full py-2 lg:py-3 rounded lg:rounded-md text-xs lg:text-sm font-medium text-center transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
                        featured
                          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                          : 'border border-primary text-primary hover:bg-primary/5'
                      }`}
                    >
                      Choisir {p.label}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* FAQ */}
          <div className="bg-surface border border-border rounded-lg p-6">
            <h3 className="text-sm font-bold font-headings text-foreground uppercase tracking-widest mb-4">
              Questions fréquentes
            </h3>
            <div className="flex flex-col gap-4">
              {FAQS.map((f) => (
                <div key={f.q} className="border-b border-border pb-4 last:border-0 last:pb-0">
                  <p className="font-medium text-foreground text-sm">{f.q}</p>
                  <p className="text-sm text-muted-foreground mt-2">{f.a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <UpgradeSubscriptionModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        plan={selectedPlan}
        availableProviders={availableProviders}
        appliedCoupon={
          // Only carry the coupon into the modal if it was actually
          // validated against the plan the visitor is now checking out —
          // e.g. applied against Pro, then clicked "Choisir Business".
          appliedCoupon && selectedPlan === appliedCoupon.plan
            ? { code: appliedCoupon.code, discountedPriceFcfa: appliedCoupon.discountedPriceFcfa }
            : null
        }
      />
    </div>
  );
}
