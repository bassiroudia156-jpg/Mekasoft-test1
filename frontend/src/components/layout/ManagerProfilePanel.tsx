'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { orgRoleLabel } from '@/lib/roleLabel';
import Icon from '@/components/ui/Icon';
import UserAvatar from '@/components/ui/UserAvatar';
import SlideOver from '@/components/ui/SlideOver';
import LogoutConfirmModal from '@/components/auth/LogoutConfirmModal';
import TeamManagementModal from '@/components/team/TeamManagementModal';
import ChangePasswordModal from '@/components/account/ChangePasswordModal';
import EditProfileModal from '@/components/account/EditProfileModal';

interface TeamMemberSummary {
  name: string;
  jobTitle: string | null;
  role: string;
}

// Phase 8: identity fields (firstName/lastName/email/phone/role) used to be
// hardcoded default props ('Moussa Diallo', …) that no caller in the app
// ever overrode, and onChangePassword/onEditField were external callbacks
// nothing ever supplied — every edit affordance was a no-op. Now self-derived
// from useAuth() and wired to internally-managed modals, matching the
// existing LogoutConfirmModal/TeamManagementModal pattern below.
export interface ManagerProfilePanelProps {
  open: boolean;
  onClose: () => void;
  /** Null/undefined while the caller has no organization yet (Phase 2's
   * org-less dashboard state) — the "Ma team" section hides itself rather
   * than fetching a 404. */
  organizationId?: string | null;
}

export default function ManagerProfilePanel({
  open,
  onClose,
  organizationId,
}: ManagerProfilePanelProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);

  const [team, setTeam] = useState<TeamMemberSummary[]>([]);
  const [teamCount, setTeamCount] = useState(0);
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [teamModalView, setTeamModalView] = useState<'list' | 'add'>('list');

  useEffect(() => {
    if (!open || !organizationId) return;
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
        // Leave the section empty rather than erroring a slide-over panel.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, organizationId]);

  if (!user) return null;

  const [firstName, lastName] = (() => {
    const n = (user.name ?? '').trim();
    if (!n) return ['', ''];
    const i = n.indexOf(' ');
    return i === -1 ? [n, ''] : [n.slice(0, i), n.slice(i + 1)];
  })();
  const fullName = user.name ?? user.email;
  const role = orgRoleLabel(user.orgRole, user.jobTitle);

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
    <SlideOver open={open} onClose={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-border sticky top-0 bg-surface">
        <h2 className="text-lg font-bold font-headings text-foreground">Mon profil</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="p-1 text-muted-foreground"
        >
          <Icon i="x" size={16} />
        </button>
      </div>

      <div className="p-6 flex flex-col gap-6">
        {/* Profile header */}
        <div className="flex flex-col items-center text-center">
          <UserAvatar
            name={fullName}
            src={user.avatarUrl}
            className="w-20 h-20 rounded-lg mb-3 text-xl"
          />
          <h3 className="text-lg font-bold font-headings text-foreground">{fullName}</h3>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">{role}</p>
        </div>

        {/* Infos personnelles */}
        <div className="flex flex-col gap-4 pb-6 border-b border-border">
          <h4 className="text-sm font-bold font-headings text-foreground uppercase tracking-widest">
            Informations personnelles
          </h4>

          <div className="flex flex-col gap-2">
            <label className="text-xs text-muted-foreground uppercase tracking-widest">
              Prénom
            </label>
            <div className="border border-border rounded-md px-3 py-2 bg-input text-foreground text-sm">
              {firstName || '—'}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs text-muted-foreground uppercase tracking-widest">Nom</label>
            <button
              type="button"
              onClick={() => setEditProfileOpen(true)}
              className="border border-border rounded-md px-3 py-2 bg-input text-foreground text-sm flex items-center justify-between text-left"
            >
              {lastName || '—'}
              <Icon i="pencil" size={14} className="text-muted-foreground" />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs text-muted-foreground uppercase tracking-widest">Email</label>
            <div className="border border-border rounded-md px-3 py-2 bg-input text-foreground text-sm">
              {user.email}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs text-muted-foreground uppercase tracking-widest">
              Téléphone
            </label>
            <button
              type="button"
              onClick={() => setEditProfileOpen(true)}
              className="border border-border rounded-md px-3 py-2 bg-input text-foreground text-sm flex items-center justify-between text-left"
            >
              {user.phone || '—'}
              <Icon i="pencil" size={14} className="text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Sécurité */}
        <div className="flex flex-col gap-4 pb-6 border-b border-border">
          <h4 className="text-sm font-bold font-headings text-foreground uppercase tracking-widest">
            Sécurité
          </h4>

          <button
            type="button"
            onClick={() => setChangePasswordOpen(true)}
            className="w-full flex items-center gap-2 px-4 py-2.5 rounded-md border border-border bg-background text-foreground text-sm font-medium"
          >
            <Icon i="lock" size={14} />
            {user.hasPassword ? 'Changer le mot de passe' : 'Définir un mot de passe'}
          </button>
        </div>

        {/* Ma team */}
        {organizationId && (
          <div className="flex flex-col gap-4 pb-6 border-b border-border">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold font-headings text-foreground uppercase tracking-widest">
                Ma team
              </h4>
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
                  className="flex items-center gap-3 px-3 py-2 rounded-md bg-background border border-border"
                >
                  <UserAvatar name={member.name} className="w-8 h-8 rounded" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{member.name}</p>
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
              className="text-xs text-muted-foreground text-left"
            >
              {teamCount} membre{teamCount > 1 ? 's' : ''} dans votre équipe ·{' '}
              <span className="text-primary font-medium">Voir tout</span>
            </button>
          </div>
        )}

        {/* Actions */}
        <button
          type="button"
          onClick={() => setLogoutModalOpen(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border border-border bg-background text-foreground text-sm font-medium"
        >
          <Icon i="log-out" size={14} />
          Déconnexion
        </button>
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
    </SlideOver>
  );
}
