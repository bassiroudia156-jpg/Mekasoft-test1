'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth, useUser } from '@/contexts/AuthContext';
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

interface TeamMemberSummary {
  name: string;
  jobTitle: string | null;
  role: string;
}

// Full-page "Mon profil" (2026-08-19, per user feedback) — replaces the
// ManagerProfilePanel right-side slide-over that used to open from the
// Sidebar's bottom account block on every authenticated page. Content is
// ported 1:1 from that panel, plus the "Compte Google" row that used to
// live in Settings' own Sécurité section: Settings' Compte/Sécurité
// sections were retired the same day (see settings/page.tsx) since they
// duplicated this page — all personal-account info now lives only here,
// Settings keeps only atelier/business-level content.
export default function ProfilePage() {
  const user = useUser();
  const { logout } = useAuth();
  const router = useRouter();
  const { organizationId } = useCallerOrganization(!!user);

  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);

  const [team, setTeam] = useState<TeamMemberSummary[]>([]);
  const [teamCount, setTeamCount] = useState(0);
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [teamModalView, setTeamModalView] = useState<'list' | 'add'>('list');

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

  if (!user) return null;

  const [firstName, lastName] = (() => {
    const n = (user.name ?? '').trim();
    if (!n) return ['', ''];
    const i = n.indexOf(' ');
    return i === -1 ? [n, ''] : [n.slice(0, i), n.slice(i + 1)];
  })();
  const fullName = user.name ?? user.email;
  const role = orgRoleLabel(user.orgRole, user.jobTitle);
  const googleLinked = user.linkedProviders.includes('google');

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

        <div className="flex-1 w-full p-6 flex flex-col gap-6 max-w-2xl lg:mx-auto">
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

          {/* Déconnexion */}
          <Button
            type="button"
            variant="outline"
            className="justify-center"
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
    </div>
  );
}
