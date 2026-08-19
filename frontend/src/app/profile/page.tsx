'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useAuth, useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useCallerOrganization } from '@/lib/useCallerOrganization';
import { orgRoleLabel } from '@/lib/roleLabel';
import Sidebar from '@/components/layout/Sidebar';
import PageHeader from '@/components/ui/PageHeader';
import FormSection from '@/components/ui/FormSection';
import Icon from '@/components/ui/Icon';
import UserAvatar from '@/components/ui/UserAvatar';
import Button from '@/components/ui/Button';
import LogoutConfirmModal from '@/components/auth/LogoutConfirmModal';
import TeamManagementModal from '@/components/team/TeamManagementModal';
import ChangePasswordModal from '@/components/account/ChangePasswordModal';
import EditProfileModal from '@/components/account/EditProfileModal';
import UpgradeSubscriptionModal from '@/components/subscriptions/UpgradeSubscriptionModal';

interface TeamMemberSummary {
  name: string;
  jobTitle: string | null;
  role: string;
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

// Mirrors lib/server/plans/limits.ts's PLAN_PRICING/PLAN_LIMITS — same
// local-copy convention as the landing page (that module lives under
// lib/server/, this is client-rendered display copy).
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

// Full-page "Mon profil" (2026-08-19, per user feedback) — replaces the
// ManagerProfilePanel right-side slide-over that used to open from the
// Sidebar's bottom account block on every authenticated page. Content is
// ported 1:1 from that panel, plus the "Compte Google" row that used to
// live in Settings' own Sécurité section: Settings' Compte/Sécurité
// sections were retired the same day (see settings/page.tsx) since they
// duplicated this page — all personal-account info now lives only here.
//
// 2026-08-19 (later same day): Atelier and Abonnement also moved here from
// /settings, which is now a redirect stub. The Sidebar's "Paramètres" nav
// item went through a couple of shapes that day (briefly renamed "Export"
// and pointed at a dedicated /export page, then that page's two sections —
// Rapport mensuel, Export de données — moved again into ExportMenu inline
// on /dashboard) before the nav item itself was removed for good, since
// nothing was left for it to point at. Atelier/Abonnement joined this page
// rather than staying orphaned: it already owned "Ma team" (also
// org-level), and the two sections were literally titled "Atelier &
// abonnement" as a pair on the old page, so keeping them together here
// preserves that grouping.
export default function ProfilePage() {
  const user = useUser();
  const { logout } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const {
    organizationId,
    plan: orgPlan,
    name: orgName,
    street: orgStreet,
    city: orgCity,
    taxId: orgTaxId,
  } = useCallerOrganization(!!user);

  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);

  const [team, setTeam] = useState<TeamMemberSummary[]>([]);
  const [teamCount, setTeamCount] = useState(0);
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [teamModalView, setTeamModalView] = useState<'list' | 'add'>('list');

  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{
          members: { name: string | null; email: string; jobTitle: string | null; role: string }[];
          invites: unknown[];
        }>(`/api/organizations/${organizationId}/members`);
        if (cancelled) return;
        setTeam(
          res.members
            .slice(0, 3)
            .map((m) => ({ name: m.name ?? m.email, jobTitle: m.jobTitle, role: m.role })),
        );
        setTeamCount(res.members.length + res.invites.length);
      } catch {
        // Section just stays empty rather than erroring the whole page.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  // Ported unchanged from the old /settings page — no `if (!user)` guard,
  // deps on `[user]` so it re-fires once AuthContext resolves.
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

  if (!user) return null;

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

  const [firstName, lastName] = (() => {
    const n = (user.name ?? '').trim();
    if (!n) return ['', ''];
    const i = n.indexOf(' ');
    return i === -1 ? [n, ''] : [n.slice(0, i), n.slice(i + 1)];
  })();
  const fullName = user.name ?? user.email;
  const role = orgRoleLabel(user.orgRole, user.jobTitle);
  const googleLinked = user.linkedProviders.includes('google');
  const canEditShop = user.orgRole === 'OWNER' || user.orgRole === 'ADMIN';
  // EXPIRED/CANCELED rows still exist in the DB (downgrade.ts never deletes
  // them) but don't entitle the org to anything anymore — treat those the
  // same as "no subscription" for which UI to show.
  const hasActiveOrGraceSubscription =
    !!subscription && (subscription.status === 'ACTIVE' || subscription.status === 'GRACE');

  async function confirmLogout() {
    setLoggingOut(true);
    await logout();
    router.push('/login?logged_out=1');
  }

  function openTeamModal(view: 'list' | 'add') {
    setTeamModalView(view);
    setTeamModalOpen(true);
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar active="profile" />

      <div className="flex-1 flex flex-col min-w-0">
        <PageHeader eyebrow="Mon compte" title="Mon profil" />

        <div className="flex-1 w-full p-6 pb-28 flex flex-col gap-6 max-w-2xl lg:mx-auto">
          {/* Profile header */}
          <div className="flex flex-col items-center text-center">
            <UserAvatar
              name={fullName}
              src={user.avatarUrl}
              className="w-20 h-20 rounded-lg mb-3 text-xl"
            />
            <h2 className="text-lg font-bold font-headings text-foreground">{fullName}</h2>
            <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">{role}</p>
          </div>

          {/* Informations personnelles */}
          <FormSection title="Informations personnelles">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs text-muted-foreground uppercase tracking-widest">
                  Prénom
                </label>
                <div className="border border-border rounded-md px-3 py-2 bg-input text-sm text-foreground">
                  {firstName || '—'}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-muted-foreground uppercase tracking-widest">
                  Nom
                </label>
                <div className="border border-border rounded-md px-3 py-2 bg-input text-sm text-foreground">
                  {lastName || '—'}
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
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3 p-3 bg-muted/20 border border-muted rounded-md">
                <div>
                  <p className="text-sm font-medium text-foreground">Mot de passe</p>
                  <p className="text-xs text-muted-foreground">
                    {user.hasPassword ? 'Défini' : 'Non défini (connexion via Google)'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setChangePasswordOpen(true)}
                  className="px-3 py-1.5 text-xs text-primary font-medium border border-primary rounded-md shrink-0"
                >
                  {user.hasPassword ? 'Changer' : 'Définir'}
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 p-3 bg-muted/20 border border-muted rounded-md">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Authentification à deux facteurs
                  </p>
                  <p className="text-xs text-muted-foreground">Non activée</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 p-3 bg-muted/20 border border-muted rounded-md">
                <div>
                  <p className="text-sm font-medium text-foreground">Compte Google</p>
                  <p className="text-xs text-muted-foreground">
                    {googleLinked
                      ? 'Tu peux te connecter via Google.'
                      : 'Lie ton compte pour te connecter en un clic.'}
                  </p>
                </div>
                {googleLinked ? (
                  <span className="rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-medium text-success shrink-0">
                    Lié
                  </span>
                ) : (
                  <a
                    href="/api/auth/oauth/google/start?next=/profile"
                    className="px-3 py-1.5 text-xs text-primary font-medium border border-primary rounded-md shrink-0"
                  >
                    Lier Google
                  </a>
                )}
              </div>
            </div>
          </FormSection>

          {/* Ma team */}
          {organizationId && (
            <FormSection title="Ma team">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {teamCount} membre{teamCount > 1 ? 's' : ''} dans votre équipe
                  </p>
                  <button
                    type="button"
                    onClick={() => openTeamModal('add')}
                    className="flex items-center gap-1 text-xs text-primary font-medium"
                  >
                    <Icon i="plus" size={12} />
                    Ajouter
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {team.map((member) => (
                    <div
                      key={member.name}
                      className="flex items-center gap-3 px-3 py-2 rounded-md bg-input border border-border"
                    >
                      <UserAvatar name={member.name} className="w-8 h-8 rounded" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {member.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {member.jobTitle ?? (member.role === 'OWNER' ? 'Gérant' : member.role)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => openTeamModal('list')}
                  className="text-xs text-primary font-medium text-left self-start"
                >
                  Voir toute l&apos;équipe
                </button>
              </div>
            </FormSection>
          )}

          {/* Atelier — moved here from /settings (2026-08-19, see header
              comment). Read-only summary card; editing happens on the
              dedicated /settings/shop form, same as before the move. */}
          {organizationId && (
            <FormSection title="Atelier">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-muted-foreground uppercase tracking-widest">
                    Nom de l&apos;atelier
                  </label>
                  <div className="border border-border rounded-md px-3 py-2 bg-input text-sm text-foreground">
                    {orgName || '—'}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-muted-foreground uppercase tracking-widest">
                    Adresse
                  </label>
                  <div className="border border-border rounded-md px-3 py-2 bg-input text-sm text-foreground">
                    {[orgStreet, orgCity].filter(Boolean).join(', ') || '—'}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-muted-foreground uppercase tracking-widest">
                    Numéro SIRET
                  </label>
                  <div className="border border-border rounded-md px-3 py-2 bg-input text-sm text-foreground">
                    {orgTaxId || '—'}
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

          {/* Abonnement — moved here from /settings (2026-08-19, see header
              comment); deliberately last, same as on the old page, so the
              upgrade CTA doesn't sit in front of the account's core
              settings while org data is still loading. */}
          {organizationId && (
            <>
              {hasActiveOrGraceSubscription ? (
                <FormSection title="Abonnement">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          (PLAN_INFO[orgPlan] ?? PLAN_INFO.FREE)!.badge
                        }`}
                      >
                        Plan {(PLAN_INFO[orgPlan] ?? PLAN_INFO.FREE)!.label}
                      </span>
                      {subscription!.status === 'GRACE' && (
                        <span className="rounded-full bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">
                          Paiement en retard
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {(PLAN_INFO[orgPlan] ?? PLAN_INFO.FREE)!.blurb}
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
                      {orgPlan !== 'BUSINESS' && (
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
              ) : orgPlan === 'FREE' ? (
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
                        (PLAN_INFO[orgPlan] ?? PLAN_INFO.FREE)!.badge
                      }`}
                    >
                      Plan {(PLAN_INFO[orgPlan] ?? PLAN_INFO.FREE)!.label}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Forfait attribué manuellement — aucun abonnement en ligne actif.
                    </p>
                    {orgPlan !== 'BUSINESS' && (
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

      {/* Déconnexion — fixed at the bottom of the viewport, always
          reachable without scrolling through the whole page (the content
          above can grow, e.g. a large team list). `lg:left-56` clears the
          static Sidebar column (w-56); below `lg:` the Sidebar is off-canvas
          so the bar spans the full width. The matching `pb-28` on the
          scrollable content above keeps this from covering the last
          section. */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-56 z-20 bg-background border-t border-border p-4 lg:px-6">
        <div className="w-full max-w-2xl lg:mx-auto">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-center"
            onClick={() => setLogoutModalOpen(true)}
          >
            <Icon i="log-out" size={14} />
            Déconnexion
          </Button>
        </div>
      </div>

      <LogoutConfirmModal
        open={logoutModalOpen}
        onCancel={() => setLogoutModalOpen(false)}
        onConfirm={() => void confirmLogout()}
        userEmail={user.email}
        userLabel={`${fullName} • ${role}`}
        confirming={loggingOut}
      />
      <ChangePasswordModal open={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} />
      <EditProfileModal open={editProfileOpen} onClose={() => setEditProfileOpen(false)} />
      {organizationId && (
        <TeamManagementModal
          organizationId={organizationId}
          open={teamModalOpen}
          onClose={() => setTeamModalOpen(false)}
          initialView={teamModalView}
        />
      )}
      <UpgradeSubscriptionModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        availableProviders={availableProviders}
        defaultPlan={orgPlan === 'FREE' ? 'PRO' : 'BUSINESS'}
      />
    </div>
  );
}
