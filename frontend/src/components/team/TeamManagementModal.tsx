'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import Modal from '@/components/ui/Modal';
import Field from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import UserAvatar from '@/components/ui/UserAvatar';
import { SkeletonMemberRow } from '@/components/ui/Skeleton';

// Multi-view modal covering Banani's TeamManagementModal (list) →
// AddTeamMemberModal (add) → TeamMemberInvitationSent (sent), one
// component with internal view state rather than three separate modals —
// same pattern as /login's combined login+recovery sections.

type OrgRole = 'OWNER' | 'ADMIN' | 'MEMBER';

interface TeamMember {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: OrgRole;
  jobTitle: string | null;
  isYou: boolean;
}

interface PendingInvite {
  id: string;
  email: string;
  name: string;
  jobTitle: string;
}

const JOB_TITLES = ['Administrateur', 'Mécanicien', 'Comptable'] as const;
type JobTitle = (typeof JOB_TITLES)[number];

const JOB_TITLE_ICON: Record<string, string> = {
  Gérant: 'crown',
  Administrateur: 'shield',
  Mécanicien: 'wrench',
  Comptable: 'calculator',
};

const JOB_TITLE_DESCRIPTIONS: Record<JobTitle, string> = {
  Administrateur: 'Accès complet',
  Mécanicien: 'Gestion des interventions',
  Comptable: 'Gestion financière',
};

export interface TeamManagementModalProps {
  organizationId: string;
  open: boolean;
  onClose: () => void;
  /** Skip straight to the invite form (Banani: clicking "Ajouter" from the
   * profile panel opens AddTeamMemberModal directly). */
  initialView?: 'list' | 'add';
}

export default function TeamManagementModal({
  organizationId,
  open,
  onClose,
  initialView = 'list',
}: TeamManagementModalProps) {
  const { toast } = useToast();
  const [view, setView] = useState<'list' | 'add' | 'sent' | 'remove'>(initialView);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);

  // Audit fix (2026-08-18): the row "..." button rendered with a hover
  // state and aria-label but had no onClick at all — clicking it did
  // nothing. Only one action exists behind it (remove from team), so this
  // goes straight to a confirm view rather than an intermediate dropdown —
  // same call already made for the vehicle-row "..." (see STATUS.md).
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [jobTitle, setJobTitle] = useState<JobTitle>('Mécanicien');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastSent, setLastSent] = useState<{
    name: string;
    email: string;
    jobTitle: string;
  } | null>(null);

  async function loadRoster() {
    setLoading(true);
    try {
      const res = await api<{ members: TeamMember[]; invites: PendingInvite[] }>(
        `/api/organizations/${organizationId}/members`,
      );
      setMembers(res.members);
      setInvites(res.invites);
    } catch {
      // Roster stays empty; the list view itself shows an implicit empty
      // state rather than a dedicated error banner (low-stakes read).
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      setView(initialView);
      setRemoveTarget(null);
      setRemoveError(null);
      void loadRoster();
    }
    // Deliberately keyed on [open, organizationId] only — initialView and
    // loadRoster are stable enough for a modal-open trigger.
  }, [open, organizationId]);

  async function handleRemoveConfirm() {
    if (!removeTarget) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      await api(`/api/organizations/${organizationId}/members/${removeTarget.id}`, {
        method: 'DELETE',
      });
      setMembers((prev) => prev.filter((m) => m.id !== removeTarget.id));
      toast(`${removeTarget.name ?? removeTarget.email} a été retiré(e) de l'équipe.`, 'success');
      setRemoveTarget(null);
      setView('list');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CANNOT_REMOVE_OWNER') {
        setRemoveError("Le gérant de l'atelier ne peut pas être retiré.");
      } else if (err instanceof ApiError && err.code === 'CANNOT_REMOVE_SELF') {
        setRemoveError('Vous ne pouvez pas vous retirer vous-même.');
      } else {
        setRemoveError(err instanceof ApiError ? err.message : 'Erreur inconnue.');
      }
    } finally {
      setRemoving(false);
    }
  }

  async function onInviteSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await api(`/api/organizations/${organizationId}/invite`, {
        method: 'POST',
        body: { name, email, jobTitle },
      });
      setLastSent({ name, email, jobTitle });
      setView('sent');
      setName('');
      setEmail('');
      setJobTitle('Mécanicien');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_ALREADY_REGISTERED') {
        setFormError('Cet email a déjà un compte MekaSoft.');
      } else if (err instanceof ApiError && err.code === 'INVITE_ALREADY_PENDING') {
        setFormError('Une invitation est déjà en attente pour cet email.');
      } else {
        setFormError(err instanceof ApiError ? err.message : 'Erreur inconnue.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const activeCount = members.length;
  const pendingCount = invites.length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth={view === 'add' || view === 'sent' || view === 'remove' ? 'md' : '2xl'}
    >
      {view === 'list' && (
        <div>
          <div className="flex items-center gap-3 mb-6 pb-6 border-b border-border">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10">
              <Icon i="users" size={20} className="text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold font-headings text-foreground">
                Gérer l&apos;équipe
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Administrez les membres de votre équipe
              </p>
            </div>
          </div>

          <div className="mb-6">
            <Button variant="primary" onClick={() => setView('add')}>
              <Icon i="user-plus" size={14} />
              Ajouter un membre
            </Button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonMemberRow key={i} />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {members.map((m) => (
                <div
                  key={m.id}
                  className={`flex items-center justify-between p-4 rounded-lg border border-border ${m.role === 'OWNER' ? 'bg-muted/20' : ''}`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <UserAvatar name={m.name ?? m.email} className="w-10 h-10 rounded-full" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {m.name ?? m.email}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary/10 border border-primary/20">
                      <Icon
                        i={JOB_TITLE_ICON[m.jobTitle ?? ''] ?? 'user'}
                        size={12}
                        className="text-primary"
                      />
                      <span className="text-xs font-medium text-primary">
                        {m.jobTitle ?? (m.role === 'OWNER' ? 'Gérant' : m.role)}
                      </span>
                    </div>
                    {m.isYou && <span className="text-xs text-muted-foreground">(Vous)</span>}
                    {!m.isYou && m.role !== 'OWNER' && (
                      <button
                        type="button"
                        onClick={() => {
                          setRemoveTarget(m);
                          setRemoveError(null);
                          setView('remove');
                        }}
                        className="p-1.5 rounded-md hover:bg-muted/5"
                        aria-label="Plus d'options"
                      >
                        <Icon i="ellipsis" size={14} className="text-muted-foreground" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {invites.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-border bg-primary/5"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-muted/30 flex items-center justify-center shrink-0">
                      <Icon i="user" size={16} className="text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{inv.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{inv.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary/20 border border-primary/30 shrink-0">
                    <Icon i="send" size={12} className="text-primary" />
                    <span className="text-xs font-medium text-primary">Invitation envoyée</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-border">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">{activeCount + pendingCount}</p>
                <p className="text-xs text-muted-foreground mt-1">Total</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-success">{activeCount}</p>
                <p className="text-xs text-muted-foreground mt-1">Actifs</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-muted-foreground">{pendingCount}</p>
                <p className="text-xs text-muted-foreground mt-1">En attente</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-6 border-t border-border mt-6">
            <Button variant="outline" onClick={onClose} className="flex-1 justify-center">
              Fermer
            </Button>
          </div>
        </div>
      )}

      {view === 'add' && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10">
              <Icon i="user-plus" size={20} className="text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold font-headings text-foreground">Ajouter un membre</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Inviter quelqu&apos;un à votre équipe
              </p>
            </div>
          </div>

          <form onSubmit={onInviteSubmit} className="space-y-4">
            <Field
              label="Nom complet"
              name="name"
              required
              value={name}
              onChange={setName}
              placeholder="Ex: Jean Dupont"
            />
            <Field
              label="Email"
              name="email"
              type="email"
              required
              value={email}
              onChange={setEmail}
              placeholder="Ex: jean.dupont@example.com"
            />
            <Field
              label="Rôle"
              name="jobTitle"
              type="select"
              required
              value={jobTitle}
              onChange={(v) => setJobTitle(v as JobTitle)}
              options={JOB_TITLES.map((t) => ({ value: t, label: t }))}
            />

            <div className="bg-background rounded-md p-3 border border-border">
              <p className="text-xs font-medium text-foreground mb-2">Rôles disponibles :</p>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                {JOB_TITLES.map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <Icon
                      i="check"
                      size={12}
                      className="text-muted-foreground mt-0.5 flex-shrink-0"
                    />
                    <div>
                      <p className="font-medium text-foreground">{t}</p>
                      <p className="text-xs">{JOB_TITLE_DESCRIPTIONS[t]}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-primary/10 border border-primary/20 rounded-md px-3 py-2">
              <div className="flex gap-2 text-xs">
                <Icon i="info" size={12} className="text-primary flex-shrink-0 mt-0.5" />
                <p className="text-primary">
                  Un email d&apos;invitation sera envoyé au membre pour lui demander de rejoindre
                  votre équipe.
                </p>
              </div>
            </div>

            {formError && (
              <p role="alert" className="text-xs text-warning">
                {formError}
              </p>
            )}

            <div className="flex flex-col gap-3 pt-6 border-t border-border">
              <Button type="submit" variant="primary" disabled={submitting}>
                <Icon i="check" size={14} />
                {submitting ? 'Envoi…' : "Envoyer l'invitation"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setView('list')}>
                Annuler
              </Button>
            </div>
          </form>
        </div>
      )}

      {view === 'sent' && lastSent && (
        <div>
          <div className="flex justify-center mb-6">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-success/10">
              <Icon i="circle-check" size={32} className="text-success" />
            </div>
          </div>

          <div className="text-center mb-6">
            <h2 className="text-lg font-bold font-headings text-foreground mb-2">
              Invitation envoyée
            </h2>
            <p className="text-xs text-muted-foreground">
              Votre invitation a été envoyée avec succès
            </p>
          </div>

          <div className="bg-background rounded-md p-4 border border-border mb-6 space-y-3">
            <div className="flex items-start gap-3">
              <Icon i="user" size={14} className="text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-muted-foreground">Nom</p>
                <p className="text-sm text-foreground font-medium">{lastSent.name}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Icon i="mail" size={14} className="text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-muted-foreground">Email</p>
                <p className="text-sm text-foreground font-medium">{lastSent.email}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Icon
                i="briefcase"
                size={14}
                className="text-muted-foreground mt-0.5 flex-shrink-0"
              />
              <div>
                <p className="text-xs font-medium text-muted-foreground">Rôle</p>
                <p className="text-sm text-foreground font-medium">{lastSent.jobTitle}</p>
              </div>
            </div>
          </div>

          <div className="bg-primary/10 border border-primary/20 rounded-md px-3 py-2 mb-6">
            <div className="flex gap-2 text-xs">
              <Icon i="info" size={12} className="text-primary flex-shrink-0 mt-0.5" />
              <p className="text-primary">
                Un email d&apos;invitation a été envoyé à {lastSent.email}. Il devra confirmer son
                adresse email pour rejoindre votre équipe.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              variant="primary"
              onClick={() => {
                setView('list');
                void loadRoster();
              }}
            >
              <Icon i="arrow-right" size={14} />
              Retour à la gestion d&apos;équipe
            </Button>
            <Button variant="outline" onClick={() => setView('add')}>
              Ajouter un autre membre
            </Button>
          </div>
        </div>
      )}

      {view === 'remove' && removeTarget && (
        <div>
          <div className="flex justify-center mb-6">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
              <Icon i="user-x" size={32} className="text-destructive" />
            </div>
          </div>

          <div className="text-center mb-6">
            <h2 className="text-lg font-bold font-headings text-foreground mb-2">
              Retirer ce membre ?
            </h2>
            <p className="text-xs text-muted-foreground">
              <strong>{removeTarget.name ?? removeTarget.email}</strong> perdra immédiatement
              l&apos;accès à cet atelier.
            </p>
          </div>

          {removeError && (
            <p role="alert" className="text-xs text-warning text-center mb-4">
              {removeError}
            </p>
          )}

          <div className="flex flex-col gap-3">
            <Button variant="destructive" onClick={handleRemoveConfirm} disabled={removing}>
              <Icon i="user-x" size={14} />
              {removing ? 'Retrait…' : "Retirer de l'équipe"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setRemoveTarget(null);
                setView('list');
              }}
              disabled={removing}
            >
              Annuler
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
