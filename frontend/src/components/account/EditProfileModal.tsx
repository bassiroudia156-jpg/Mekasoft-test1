'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { uploadFile } from '@/lib/uploadFile';
import { useAuth } from '@/contexts/AuthContext';
import { orgRoleLabel } from '@/lib/roleLabel';
import Modal from '@/components/ui/Modal';
import Field from '@/components/ui/Field';
import PhoneField from '@/components/ui/PhoneField';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import UserAvatar from '@/components/ui/UserAvatar';

// Ported from Banani EditProfileModal → EditProfileModal_next1 ("Profile
// Updated Confirmation"). Prénom/Nom is a display split over the single
// User.name column (join on submit, split on load by first space — see
// phase-8-settings.md Decision 12). Email is read-only (no re-verification
// flow exists); Rôle is read-only (derived, not a User column at all).
export interface EditProfileModalProps {
  open: boolean;
  onClose: () => void;
}

function splitName(name: string | null): [string, string] {
  if (!name) return ['', ''];
  const trimmed = name.trim();
  const i = trimmed.indexOf(' ');
  if (i === -1) return [trimmed, ''];
  return [trimmed.slice(0, i), trimmed.slice(i + 1)];
}

export default function EditProfileModal({ open, onClose }: EditProfileModalProps) {
  const { user, refresh } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [view, setView] = useState<'form' | 'confirmation'>('form');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [changedFields, setChangedFields] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !user) return;
    const [f, l] = splitName(user.name);
    setFirstName(f);
    setLastName(l);
    setPhone(user.phone ?? '');
    setAvatarUrl(user.avatarUrl);
    setView('form');
    setError(null);
  }, [open, user]);

  if (!user) return null;

  const role = orgRoleLabel(user.orgRole, user.jobTitle);

  async function onPickPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadFile(file);
      setAvatarUrl(uploaded.url);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'FILE_TOO_LARGE'
          ? 'Photo trop volumineuse.'
          : err instanceof ApiError && err.code === 'INVALID_MIME'
            ? 'Format de photo non pris en charge.'
            : 'Échec du téléversement de la photo.',
      );
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setSubmitting(true);

    const nextName = `${firstName} ${lastName}`.trim();
    const changed: string[] = [];
    if (nextName !== (user.name ?? '')) changed.push('Informations personnelles');
    if (phone !== (user.phone ?? '')) changed.push('Numéro de téléphone');
    if (avatarUrl !== user.avatarUrl) changed.push('Photo de profil');

    try {
      await api('/api/auth/me', {
        method: 'PATCH',
        body: {
          name: nextName || undefined,
          phone: phone || null,
          avatarUrl: avatarUrl,
        },
      });
      await refresh();
      setChangedFields(changed);
      setSavedAt(
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
      setError(
        err instanceof ApiError && err.code === 'INVALID_BODY'
          ? 'Vérifiez le format des champs (téléphone au format +221771234567).'
          : err instanceof ApiError && err.code === 'PHONE_ALREADY_IN_USE'
            ? 'Ce numéro de téléphone est déjà utilisé par un autre compte.'
            : err instanceof ApiError
              ? err.message
              : 'Erreur réseau.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  const displayName = `${firstName} ${lastName}`.trim() || user.email;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={view === 'form' ? 'Modifier le profil' : undefined}
      icon="user"
      maxWidth="md"
    >
      {view === 'form' ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex items-center gap-4 pb-4 border-b border-border">
            <UserAvatar
              name={displayName}
              src={avatarUrl}
              className="w-16 h-16 rounded-lg text-lg"
            />
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => void onPickPhoto(e)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Icon i="camera" size={12} />
                  {uploading ? 'Envoi…' : 'Changer la photo'}
                </Button>
                {avatarUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setAvatarUrl(null)}
                  >
                    Supprimer
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">JPEG, PNG ou WebP</p>
            </div>
          </div>

          <Field
            label="Prénom"
            name="firstName"
            required
            value={firstName}
            onChange={setFirstName}
          />
          <Field label="Nom" name="lastName" value={lastName} onChange={setLastName} />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Email</label>
            <div className="border border-border rounded-md px-3 py-2 bg-input text-sm text-muted-foreground">
              {user.email}
            </div>
          </div>

          <PhoneField label="Téléphone" name="phone" value={phone} onChange={setPhone} />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Rôle</label>
            <div className="border border-border rounded-md px-3 py-2 bg-input text-sm text-muted-foreground">
              {role} • Non modifiable
            </div>
          </div>

          <div className="bg-primary/10 border border-primary/20 rounded-md px-3 py-2">
            <div className="flex gap-2 text-xs">
              <Icon i="info" size={12} className="text-primary flex-shrink-0 mt-0.5" />
              <p className="text-primary">
                L&apos;email et le rôle ne sont pas modifiables depuis cet écran.
              </p>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-xs text-warning">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-3 pt-6 border-t border-border">
            <Button type="submit" variant="primary" disabled={submitting || uploading}>
              {submitting ? 'Enregistrement…' : 'Enregistrer les modifications'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
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
              Modifications enregistrées
            </h2>
            {changedFields.length > 0 && (
              <ul className="text-xs text-muted-foreground">
                {changedFields.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-background rounded-md p-4 border border-border mb-6 flex items-center gap-3">
            <UserAvatar name={displayName} src={avatarUrl} className="w-12 h-12 rounded-lg" />
            <div>
              <p className="text-sm font-medium text-foreground">{displayName}</p>
              <p className="text-xs text-muted-foreground">
                {role} • {user.email}
              </p>
              {savedAt && (
                <p className="text-xs text-muted-foreground mt-1">Mis à jour le {savedAt}</p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button variant="primary" onClick={onClose}>
              Retour au tableau de bord
            </Button>
            <Button variant="outline" onClick={() => setView('form')}>
              Modifier à nouveau
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
