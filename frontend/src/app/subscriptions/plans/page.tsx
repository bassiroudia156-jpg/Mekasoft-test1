// Banani: 83o75a2tYyMD/screens/UpgradePlansPage.jsx ("Upgrade Plans Page")
// — 3-tier pricing grid + FAQ. Real prices/features substituted for
// Banani's placeholder tiers (Basique/Professionnel/Entreprise → our real
// Gratuit/Pro/Business, see .planning/banani/subscription-plans-page.md).
// Reached from Mon profil's upgrade banner ("Voir les forfaits") — that
// section lived on /settings until 2026-08-19, when it moved to /profile
// alongside Atelier (see profile/page.tsx's header comment).
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import Sidebar from '@/components/layout/Sidebar';
import PageHeader from '@/components/ui/PageHeader';
import Icon from '@/components/ui/Icon';
import UpgradeSubscriptionModal from '@/components/subscriptions/UpgradeSubscriptionModal';

// Mirrors lib/server/plans/limits.ts's PLAN_PRICING/PLAN_LIMITS — same
// local-copy convention as the landing page and Settings (that module lives
// under lib/server/, this is client-rendered display copy).
const PLANS = [
  {
    plan: 'FREE' as const,
    label: 'Gratuit',
    blurb: 'Pour débuter',
    priceFcfa: 0,
    originalPriceFcfa: null as number | null,
    features: [
      { text: '3 clients max', included: true },
      { text: '3 véhicules max', included: true },
      { text: '5 interventions/mois', included: true },
      { text: 'Devis & factures PDF', included: true },
      { text: 'Partage WhatsApp', included: false },
    ],
  },
  {
    plan: 'PRO' as const,
    label: 'Pro',
    blurb: 'Le plus populaire',
    priceFcfa: 9_900,
    originalPriceFcfa: 12_000,
    featured: true,
    features: [
      { text: 'Clients illimités', included: true },
      { text: 'Véhicules illimités', included: true },
      { text: 'Interventions illimitées', included: true },
      { text: 'Partage WhatsApp', included: true },
      { text: 'Logo sur les factures', included: true },
    ],
  },
  {
    plan: 'BUSINESS' as const,
    label: 'Business',
    blurb: 'Pour les plus grands',
    priceFcfa: 19_900,
    originalPriceFcfa: 25_000,
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
  }, []);

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

  function openUpgrade(plan: 'PRO' | 'BUSINESS') {
    setSelectedPlan(plan);
    setUpgradeOpen(true);
  }

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

          {/* Plans grid — base: stacked, md+: 3 columns (Banani desktop grid) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
            {PLANS.map((p) => {
              const isCurrent = org?.plan === p.plan;
              return (
                <div
                  key={p.plan}
                  className={`bg-surface border rounded-lg p-6 flex flex-col gap-4 relative ${
                    p.featured ? 'border-primary' : 'border-border'
                  }`}
                >
                  {p.featured && (
                    <div className="absolute top-4 right-4 px-2 py-1 bg-primary text-primary-foreground rounded text-xs font-medium">
                      Populaire
                    </div>
                  )}

                  <div>
                    <h3 className="text-lg font-bold font-headings text-foreground">{p.label}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{p.blurb}</p>
                  </div>

                  <div
                    className={`border rounded-md p-4 ${
                      p.featured ? 'bg-primary/10 border-primary' : 'bg-background border-border'
                    }`}
                  >
                    {p.originalPriceFcfa && (
                      <div className="text-xs text-muted-foreground line-through mb-0.5">
                        {p.originalPriceFcfa.toLocaleString('fr-FR')} FCFA
                      </div>
                    )}
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-foreground">
                        {p.priceFcfa.toLocaleString('fr-FR')}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {p.priceFcfa === 0 ? 'FCFA — à vie' : 'FCFA / mois'}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    {p.features.map((f) => (
                      <div key={f.text} className="flex items-start gap-2">
                        <Icon
                          i={f.included ? 'check' : 'x'}
                          size={14}
                          className={`mt-0.5 flex-shrink-0 ${
                            f.included ? 'text-primary' : 'text-muted-foreground'
                          }`}
                        />
                        <span
                          className={`text-sm ${
                            f.included ? 'text-foreground' : 'text-muted-foreground'
                          }`}
                        >
                          {f.text}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-auto pt-2">
                    {isCurrent ? (
                      <div className="w-full px-4 py-2.5 border border-border text-muted-foreground rounded-md text-sm font-medium text-center">
                        Plan actuel
                      </div>
                    ) : p.plan === 'FREE' ? (
                      <div className="w-full px-4 py-2.5 text-xs text-muted-foreground text-center">
                        Inclus par défaut
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openUpgrade(p.plan)}
                        className={`w-full px-4 py-2.5 rounded-md text-sm font-medium flex items-center gap-2 justify-center transition-colors ${
                          p.featured
                            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                            : 'border border-border text-foreground hover:bg-input'
                        }`}
                      >
                        <Icon i="arrow-up-right" size={14} />
                        Choisir {p.label}
                      </button>
                    )}
                  </div>
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
        availableProviders={availableProviders}
        defaultPlan={selectedPlan}
      />
    </div>
  );
}
