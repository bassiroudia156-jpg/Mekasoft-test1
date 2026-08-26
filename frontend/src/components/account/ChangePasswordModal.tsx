'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import Modal from '@/components/ui/Modal';
import Field from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';

// Ported from Banani ChangePasswordModal → PasswordChangedConfirmation.
// Branches on user.hasPassword: OAuth-only accounts (no current password)
// go through POST /api/auth/set-password instead of PUT /api/auth/change-password
// — this collapses the pre-Banani /settings page's set/change branching into
// the modal rather than losing it in the rewrite.
//
// Copy deviates from Banani's literal text on purpose: the real backend
// re-issues cookies for the CURRENT session (only OTHER sessions die on
// their next request), so "Vous serez déconnecté" / "Se reconnecter" would
// be false here. See phase-8-settings.md Decision 3.
export interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
}

const ERROR_MAP: Record<string, string> = {
  INVALID_CREDENTIALS: 'Mot de passe actuel incorrect.',
  PASSWORD_BANNED: 'Ce mot de passe est trop courant.',
  PASSWORD_TOO_SHORT: 'Mot de passe trop court.',
  PASSWORD_PWNED: 'Ce mot de passe a fuité — choisis-en un autre.',
  PASSWORD_ALREADY_SET: 'Un mot de passe est déjà défini.',
  LOCKED_OUT: 'Trop de tentatives — réessaie dans quelques minutes.',
  VALIDATION_FAILED: 'Champs invalides.',
};

export default function ChangePasswordModal({ open, onClose }: ChangePasswordModalProps) {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const hasPassword = user?.hasPassword ?? false;

  const [view, setView] = useState<'form' | 'confirmation'>('form');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [changedAt, setChangedAt] = useState<string | null>(null);

  function reset() {
    setView('form');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }

    setSubmitting(true);
    try {
      if (hasPassword) {
        await api('/api/auth/change-password', {
          method: 'PUT',
          body: { currentPassword, newPassword },
        });
      } else {
        await api('/api/auth/set-password', { method: 'POST', body: { newPassword } });
      }
      await refresh();
      setChangedAt(
        new Date().toLocaleString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
      setView('confirmation');
    } catch (err) {
      setError(err instanceof ApiError ? (ERROR_MAP[err.code] ?? err.message) : 'Erreur réseau.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={
        view === 'form'
          ? hasPassword
            ? 'Changer le mot de passe'
            : 'Définir un mot de passe'
          : undefined
      }
      icon="lock"
      maxWidth="md"
    >
      {view === 'form' ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {hasPassword && (
            <Field
              label="Mot de passe actuel"
              name="currentPassword"
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={setCurrentPassword}
            />
          )}
          <Field
            label="Nouveau mot de passe"
            name="newPassword"
            type="password"
            required
            autoComplete="new-password"
            value={newPassword}
            onChange={setNewPassword}
          />
          <Field
            label="Confirmer le nouveau mot de passe"
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
          />

          <div className="bg-background rounded-md p-3 border border-border">
            <p className="text-xs font-medium text-foreground mb-2">Exigences :</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <Icon i="check" size={12} />
                10 caractères minimum
              </li>
              <li className="flex items-center gap-2">
                <Icon i="check" size={12} />
                Évitez les mots de passe trop courants
              </li>
            </ul>
          </div>

          <div className="bg-warning/10 border border-warning/20 rounded-md px-3 py-2">
            <div className="flex gap-2 text-xs">
              <Icon i="info" size={12} className="text-warning flex-shrink-0 mt-0.5" />
              <p className="text-warning">
                Vos autres sessions actives seront déconnectées — vous resterez connecté ici.
              </p>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-xs text-warning">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-3 pt-6 border-t border-border">
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Mise à jour…' : 'Mettre à jour le mot de passe'}
            </Button>
            <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
              Annuler
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <div className="flex justify-center mb-6">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-success/10">
              <Icon i="circle-check" size={32} className="text-success" />
            </div>
          </div>

          <div className="text-center mb-6">
            <h2 className="text-lg font-bold font-headings text-foreground mb-2">
              Mot de passe mis à jour
            </h2>
            {changedAt && <p className="text-xs text-muted-foreground">Changé le {changedAt}</p>}
          </div>

          <div className="bg-background rounded-md p-4 border border-border mb-6">
            <div className="flex items-start gap-2">
              <Icon i="shield-check" size={14} className="text-success mt-0.5 flex-shrink-0" />
              <p className="text-xs text-muted-foreground">
                Sessions actives fermées — vos autres appareils devront se reconnecter. Vous restez
                connecté ici.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              variant="primary"
              onClick={() => {
                handleClose();
                router.push('/dashboard');
              }}
            >
              Retour au tableau de bord
            </Button>
            <Button variant="outline" onClick={handleClose}>
              Fermer
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
