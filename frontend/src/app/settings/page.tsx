// Ported from Banani SettingsPage(+_next1, identical content — one
// canonical page). Sections: Compte / Sécurité / Atelier.
//
// This route previously held a generic pre-Banani stub (plain gray
// Tailwind, no Sidebar/layout) with two real working flows: password
// change/set branching and Google-account linking. Both are preserved here,
// relocated rather than dropped (see phase-8-settings.md Decision 8):
//   - password change/set now lives in ChangePasswordModal
//   - Google-link becomes a third row in "Sécurité" (no Banani screen shows
//     it, but it's real shipped functionality with nowhere else to live)
//
// The 2FA row is informational only (no "Activer" — no 2FA infra exists,
// Decision 6). The upgrade-to-Pro banner is dropped entirely (Decision 7).
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useCallerOrganization } from '@/lib/useCallerOrganization';
import { useToast } from '@/contexts/ToastContext';
import Sidebar from '@/components/layout/Sidebar';
import ManagerProfilePanel from '@/components/layout/ManagerProfilePanel';
import ChangePasswordModal from '@/components/account/ChangePasswordModal';
import EditProfileModal from '@/components/account/EditProfileModal';
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
  const { organizationId } = useCallerOrganization(!!user);
  const [profileOpen, setProfileOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [org, setOrg] = useState<OrgSummary | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
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
  }, [user]);

  useEffect(() => {
    if (!user) return;
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

  const googleLinked = user.linkedProviders.includes('google');
  const canEditShop = user.orgRole === 'OWNER' || user.orgRole === 'ADMIN';

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar active="settings" onProfileClick={() => setProfileOpen(true)} />

      <div className="flex-1 flex flex-col min-w-0">
        <PageHeader eyebrow="Paramètres" title="Paramètres du compte" />

        <div className="flex-1 w-full p-6 flex flex-col gap-6 max-w-2xl lg:mx-auto">
          {/* Compte */}
          <FormSection title="Compte">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs text-muted-foreground uppercase tracking-widest">
                  Nom
                </label>
                <div className="border border-border rounded-md px-3 py-2 bg-input text-sm text-foreground">
                  {user.name || '—'}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-muted-foreground uppercase tracking-widest">
                  Email
                </label>
                <div className="border border-border rounded-md px-3 py-2 bg-input text-sm text-foreground">
                  {user.email}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-muted-foreground uppercase tracking-widest">
                  Téléphone
                </label>
                <div className="border border-border rounded-md px-3 py-2 bg-input text-sm text-foreground">
                  {user.phone || '—'}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="self-start"
                onClick={() => setEditProfileOpen(true)}
              >
                <Icon i="pencil" size={14} />
                Modifier les informations
              </Button>
            </div>
          </FormSection>

          {/* Sécurité */}
          <FormSection title="Sécurité">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3 py-2 border-b border-border">
                <div>
                  <p className="text-sm font-medium text-foreground">Mot de passe</p>
                  <p className="text-xs text-muted-foreground">
                    {user.hasPassword ? 'Défini' : 'Non défini (connexion via Google)'}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setChangePasswordOpen(true)}>
                  {user.hasPassword ? 'Changer' : 'Définir'}
                </Button>
              </div>

              <div className="flex items-center justify-between gap-3 py-2 border-b border-border">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Authentification à deux facteurs
                  </p>
                  <p className="text-xs text-muted-foreground">Non activée</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">Compte Google</p>
                  <p className="text-xs text-muted-foreground">
                    {googleLinked
                      ? 'Tu peux te connecter via Google.'
                      : 'Lie ton compte pour te connecter en un clic.'}
                  </p>
                </div>
                {googleLinked ? (
                  <span className="rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-medium text-success">
                    Lié
                  </span>
                ) : (
                  <a
                    href="/api/auth/oauth/google/start?next=/settings"
                    className="inline-flex items-center justify-center gap-2 rounded-sm border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-input"
                  >
                    Lier Google
                  </a>
                )}
              </div>
            </div>
          </FormSection>

          {/* Plan */}
          {organizationId && org && (
            <FormSection title="Abonnement">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        (PLAN_INFO[org.plan] ?? PLAN_INFO.FREE)!.badge
                      }`}
                    >
                      Plan {(PLAN_INFO[org.plan] ?? PLAN_INFO.FREE)!.label}
                    </span>
                    {subscription && subscription.status === 'GRACE' && (
                      <span className="rounded-full bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">
                        Paiement en retard
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {(PLAN_INFO[org.plan] ?? PLAN_INFO.FREE)!.blurb}
                </p>

                {subscription && (
                  <div className="flex flex-col gap-1 rounded-md border border-border bg-input px-3 py-2.5 text-xs">
                    <p className="text-foreground">
                      Payé via{' '}
                      {SUBSCRIPTION_PROVIDER_LABEL[subscription.provider] ?? subscription.provider}
                    </p>
                    {subscription.status === 'GRACE' && subscription.graceEndsAt ? (
                      <p className="text-warning">
                        Le renouvellement n&apos;a pas été détecté — repasse en Gratuit le{' '}
                        {formatDate(subscription.graceEndsAt)} sauf renouvellement.
                      </p>
                    ) : subscription.cancelAtPeriodEnd ? (
                      <p className="text-muted-foreground">
                        Annulé — actif jusqu&apos;au {formatDate(subscription.currentPeriodEnd)},
                        puis repasse en Gratuit.
                      </p>
                    ) : (
                      <p className="text-muted-foreground">
                        Prochain renouvellement le {formatDate(subscription.currentPeriodEnd)}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {org.plan !== 'BUSINESS' && (
                    <Button type="button" variant="accent" onClick={() => setUpgradeOpen(true)}>
                      <Icon i="zap" size={14} />
                      Passer à {org.plan === 'FREE' ? 'Pro ou Business' : 'Business'}
                    </Button>
                  )}
                  {subscription &&
                    (subscription.provider === 'MONEROO' || subscription.provider === 'CHARIOW') &&
                    subscription.status === 'GRACE' && (
                      <Button type="button" variant="outline" onClick={() => setUpgradeOpen(true)}>
                        <Icon i="refresh-cw" size={14} />
                        Renouveler maintenant
                      </Button>
                    )}
                  {subscription && subscription.provider === 'STRIPE' && (
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
          )}

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
        </div>
      </div>

      <ManagerProfilePanel
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        organizationId={organizationId}
      />
      <ChangePasswordModal open={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} />
      <EditProfileModal open={editProfileOpen} onClose={() => setEditProfileOpen(false)} />
      <UpgradeSubscriptionModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        availableProviders={availableProviders}
        defaultPlan={org?.plan === 'FREE' || !org ? 'PRO' : 'BUSINESS'}
      />
    </div>
  );
}
