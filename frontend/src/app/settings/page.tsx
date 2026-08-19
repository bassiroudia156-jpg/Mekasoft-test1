// Ported from Banani SettingsPage(+_next1, identical content — one
// canonical page). Sections: Rapport mensuel / Export de données / Atelier
// / Abonnement — atelier/business-level settings only.
//
// 2026-08-19: Compte (name/email/phone) and Sécurité (password, 2FA,
// Google-link) were retired from this page and moved to the new full-page
// /profile (per user feedback: personal-account info duplicated what the
// "Mon profil" slide-over already showed, and belongs with it, not here).
// Removing those two sections promotes Rapport mensuel to the first section
// on the page — same "où il y avait les infos perso" slot the user asked
// the reports/export section to occupy.
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import Sidebar from '@/components/layout/Sidebar';
import UpgradeSubscriptionModal from '@/components/subscriptions/UpgradeSubscriptionModal';
import PageHeader from '@/components/ui/PageHeader';
import FormSection from '@/components/ui/FormSection';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import { ApiError } from '@/lib/api';

interface OrgSummary {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
  street: string | null;
  taxId: string | null;
  plan: string;
}

interface SubscriptionInfo {
  plan: string;
  provider: 'STRIPE' | 'MONEROO' | 'CHARIOW';
  status: 'ACTIVE' | 'GRACE' | 'EXPIRED' | 'CANCELED';
  currentPeriodEnd: string;
  graceEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
}

const SUBSCRIPTION_PROVIDER_LABEL: Record<string, string> = {
  STRIPE: 'Carte bancaire (Stripe)',
  MONEROO: 'Mobile Money (Moneroo)',
  CHARIOW: 'Mobile Money (Chariow)',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// Mirrors lib/server/plans/limits.ts's PLAN_PRICING/PLAN_LIMITS — a local
// copy for the same reason page.tsx's landing pricing section has one (that
// module lives under lib/server/, this is client-rendered display copy).
const EXPORT_RESOURCES = [
  { key: 'clients', label: 'Clients' },
  { key: 'vehicles', label: 'Véhicules' },
  { key: 'interventions', label: 'Interventions' },
  { key: 'invoices', label: 'Factures' },
  { key: 'payments', label: 'Paiements' },
] as const;

const PLAN_INFO: Record<string, { label: string; blurb: string; badge: string }> = {
  FREE: {
    label: 'Gratuit',
    blurb: 'Jusqu’à 3 clients, 3 véhicules, 5 interventions/mois, 1 utilisateur.',
    badge: 'bg-muted text-muted-foreground',
  },
  PRO: {
    label: 'Pro',
    blurb: 'Illimité + partage WhatsApp + logo sur les factures.',
    badge: 'bg-primary/10 text-primary',
  },
  BUSINESS: {
    label: 'Business',
    blurb: "Tout Pro + jusqu'à 5 utilisateurs, rôles, rapports, export.",
    badge: 'bg-accent/10 text-accent',
  },
};

export default function SettingsPage() {
  const user = useUser();
  const { toast } = useToast();
  const [org, setOrg] = useState<OrgSummary | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  // Not gated on `user` (2026-08-19): these two calls are cookie-authenticated
  // like every other api() call, not dependent on AuthContext's client-side
  // `user` state — waiting for `user` to resolve first serialized this page
  // behind a full extra GET /api/auth/me round-trip (the slowest single call
  // on this page against Neon) for no reason. Firing on mount lets both race
  // AuthContext's own fetch instead of queuing behind it. useUser()'s own
  // effect still handles the logged-out redirect; a stray 401 here while
  // that redirect is in flight is harmless (both setters just no-op via catch).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ organizations: OrgSummary[] }>('/api/organizations');
        if (!cancelled) setOrg(res.organizations[0] ?? null);
      } catch {
        // Atelier section just hides itself below.
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
        const res = await api<{
          subscription: SubscriptionInfo | null;
          availableProviders: string[];
        }>('/api/subscriptions');
        if (cancelled) return;
        setSubscription(res.subscription);
        setAvailableProviders(res.availableProviders);
      } catch {
        // Abonnement section falls back to the plan badge only.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function openBillingPortal() {
    setPortalLoading(true);
    try {
      const res = await api<{ url: string }>('/api/subscriptions/portal', { method: 'POST' });
      window.location.href = res.url;
    } catch (err) {
      const message =
        err instanceof ApiError && err.code === 'NO_STRIPE_SUBSCRIPTION'
          ? "Aucun abonnement Stripe actif n'a été trouvé."
          : "Impossible d'ouvrir le portail de facturation. Réessayez.";
      toast(message, 'error');
      setPortalLoading(false);
    }
  }

  if (!user) return null;

  // Derived from the single `org` fetch below rather than a second,
  // duplicate GET /api/organizations (this page previously also called
  // useCallerOrganization(), which fires its own identical request —
  // removed 2026-08-19, was doubling this page's slowest network
  // round-trip for no benefit since `org` already carries `id`).
  const organizationId = org?.id ?? null;
  const canEditShop = user.orgRole === 'OWNER' || user.orgRole === 'ADMIN';
  // EXPIRED/CANCELED rows still exist in the DB (downgrade.ts never
  // deletes them) but don't entitle the org to anything anymore — treat
  // those the same as "no subscription" for which UI to show.
  const hasActiveOrGraceSubscription =
    !!subscription && (subscription.status === 'ACTIVE' || subscription.status === 'GRACE');

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar active="settings" />

      <div className="flex-1 flex flex-col min-w-0">
        <PageHeader eyebrow="Paramètres" title="Atelier & abonnement" />

        <div className="flex-1 w-full p-6 flex flex-col gap-6 max-w-2xl lg:mx-auto">
          {/* Rapport mensuel — Business only */}
          {organizationId && org && (
            <FormSection title="Rapport mensuel">
              {org.plan === 'BUSINESS' ? (
                <a
                  href="/api/reports/monthly/pdf"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-sm border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-input w-fit"
                >
                  <Icon i="file-chart-column" size={13} />
                  Télécharger le rapport de ce mois-ci
                </a>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Réservé au plan Business — recettes, interventions, nouveaux clients et meilleurs
                  clients du mois, en PDF.
                </p>
              )}
            </FormSection>
          )}

          {/* Export de données — Business only */}
          {organizationId && org && (
            <FormSection title="Export de données">
              {org.plan === 'BUSINESS' ? (
                <div className="flex flex-wrap gap-2">
                  {EXPORT_RESOURCES.map((r) => (
                    <a
                      key={r.key}
                      href={`/api/export/${r.key}`}
                      className="inline-flex items-center gap-2 rounded-sm border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-input"
                    >
                      <Icon i="download" size={13} />
                      {r.label}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Réservé au plan Business — exportez vos clients, véhicules, interventions,
                  factures et paiements en CSV.
                </p>
              )}
            </FormSection>
          )}

          {/* Atelier */}
          {organizationId && org && (
            <FormSection title="Atelier">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-muted-foreground uppercase tracking-widest">
                    Nom de l&apos;atelier
                  </label>
                  <div className="border border-border rounded-md px-3 py-2 bg-input text-sm text-foreground">
                    {org.name}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-muted-foreground uppercase tracking-widest">
                    Adresse
                  </label>
                  <div className="border border-border rounded-md px-3 py-2 bg-input text-sm text-foreground">
                    {[org.street, org.city].filter(Boolean).join(', ') || '—'}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-muted-foreground uppercase tracking-widest">
                    Numéro SIRET
                  </label>
                  <div className="border border-border rounded-md px-3 py-2 bg-input text-sm text-foreground">
                    {org.taxId || '—'}
                  </div>
                </div>
                {canEditShop && (
                  <Link href="/settings/shop">
                    <Button type="button" variant="outline" className="self-start">
                      <Icon i="pencil" size={14} />
                      Modifier l&apos;atelier
                    </Button>
                  </Link>
                )}
              </div>
            </FormSection>
          )}

          {/* Plan — deliberately last (2026-08-19, per Banani re-selection):
              was between Sécurité and Rapport mensuel, moved below Atelier
              so the upgrade CTA doesn't sit in front of the account's core
              settings while org data is still loading. */}
          {organizationId && org && (
            <>
              {hasActiveOrGraceSubscription ? (
                <FormSection title="Abonnement">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          (PLAN_INFO[org.plan] ?? PLAN_INFO.FREE)!.badge
                        }`}
                      >
                        Plan {(PLAN_INFO[org.plan] ?? PLAN_INFO.FREE)!.label}
                      </span>
                      {subscription!.status === 'GRACE' && (
                        <span className="rounded-full bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">
                          Paiement en retard
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {(PLAN_INFO[org.plan] ?? PLAN_INFO.FREE)!.blurb}
                    </p>

                    <div className="flex flex-col gap-1 rounded-md border border-border bg-input px-3 py-2.5 text-xs">
                      <p className="text-foreground">
                        Payé via{' '}
                        {SUBSCRIPTION_PROVIDER_LABEL[subscription!.provider] ??
                          subscription!.provider}
                      </p>
                      {subscription!.status === 'GRACE' && subscription!.graceEndsAt ? (
                        <p className="text-warning">
                          Le renouvellement n&apos;a pas été détecté — repasse en Gratuit le{' '}
                          {formatDate(subscription!.graceEndsAt)} sauf renouvellement.
                        </p>
                      ) : subscription!.cancelAtPeriodEnd ? (
                        <p className="text-muted-foreground">
                          Annulé — actif jusqu&apos;au {formatDate(subscription!.currentPeriodEnd)},
                          puis repasse en Gratuit.
                        </p>
                      ) : (
                        <p className="text-muted-foreground">
                          Prochain renouvellement le {formatDate(subscription!.currentPeriodEnd)}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {org.plan !== 'BUSINESS' && (
                        <Button type="button" variant="accent" onClick={() => setUpgradeOpen(true)}>
                          <Icon i="zap" size={14} />
                          Passer à Business
                        </Button>
                      )}
                      {(subscription!.provider === 'MONEROO' ||
                        subscription!.provider === 'CHARIOW') &&
                        subscription!.status === 'GRACE' && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setUpgradeOpen(true)}
                          >
                            <Icon i="refresh-cw" size={14} />
                            Renouveler maintenant
                          </Button>
                        )}
                      {subscription!.provider === 'STRIPE' && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={openBillingPortal}
                          disabled={portalLoading}
                        >
                          <Icon i="credit-card" size={14} />
                          {portalLoading ? 'Ouverture…' : 'Gérer mon abonnement'}
                        </Button>
                      )}
                    </div>
                  </div>
                </FormSection>
              ) : org.plan === 'FREE' ? (
                <div className="bg-gradient-to-r from-primary to-primary/80 border border-primary rounded-lg p-6 lg:p-8 flex flex-col gap-4">
                  <div>
                    <h3 className="text-lg font-bold font-headings text-primary-foreground">
                      Passez à un forfait supérieur
                    </h3>
                    <p className="text-sm text-primary-foreground/80 mt-2">
                      Accédez à toutes les fonctionnalités premium et développez votre atelier avec
                      MekaSoft Pro ou Business.
                    </p>
                  </div>
                  <Link
                    href="/subscriptions/plans"
                    className="w-full px-4 py-3 bg-primary-foreground text-primary rounded-md text-sm font-medium flex items-center gap-2 justify-center hover:bg-primary-foreground/90 transition-colors"
                  >
                    <Icon i="arrow-up-right" size={16} />
                    Voir les forfaits
                  </Link>
                </div>
              ) : (
                // Plan attribué manuellement (pnpm db:set-org-plan / route
                // admin) sans ligne Subscription réelle — pas de date/
                // fournisseur à afficher, et la bannière "upgrade" serait
                // trompeuse puisque le garage est déjà sur ce forfait.
                <FormSection title="Abonnement">
                  <div className="flex flex-col gap-4">
                    <span
                      className={`self-start rounded-full px-3 py-1 text-xs font-semibold ${
                        (PLAN_INFO[org.plan] ?? PLAN_INFO.FREE)!.badge
                      }`}
                    >
                      Plan {(PLAN_INFO[org.plan] ?? PLAN_INFO.FREE)!.label}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Forfait attribué manuellement — aucun abonnement en ligne actif.
                    </p>
                    {org.plan !== 'BUSINESS' && (
                      <Button
                        type="button"
                        variant="accent"
                        className="self-start"
                        onClick={() => setUpgradeOpen(true)}
                      >
                        <Icon i="zap" size={14} />
                        Passer à Business
                      </Button>
                    )}
                  </div>
                </FormSection>
              )}
            </>
          )}
        </div>
      </div>

      <UpgradeSubscriptionModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        availableProviders={availableProviders}
        defaultPlan={org?.plan === 'FREE' || !org ? 'PRO' : 'BUSINESS'}
      />
    </div>
  );
}
