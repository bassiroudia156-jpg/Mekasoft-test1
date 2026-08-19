// No Banani mockup for this screen — the flow only designs the invite-sent
// confirmation (TeamMemberInvitationSent), not the invitee's acceptance
// form. Same AuthBrandPanel shell as the rest of the auth flow.
'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import AuthBrandPanel from '@/components/auth/AuthBrandPanel';
import Field from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';

interface InvitePreview {
  organizationName: string;
  email: string;
  name: string;
  jobTitle: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  INVITE_NOT_FOUND: "Ce lien d'invitation est invalide.",
  INVITE_ALREADY_USED: 'Cette invitation a déjà été utilisée.',
  INVITE_EXPIRED: 'Cette invitation a expiré. Demandez à votre gérant de vous en renvoyer une.',
};

function AcceptInviteBody() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useAuth();
  const token = params.get('token') ?? '';

  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError("Lien d'invitation manquant.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api<InvitePreview>(`/api/invites/${encodeURIComponent(token)}`);
        if (!cancelled) setPreview(res);
      } catch (err) {
        if (!cancelled) {
          const code = err instanceof ApiError ? err.code : '';
          setLoadError(ERROR_MESSAGES[code] ?? "Ce lien d'invitation est invalide.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      await api(`/api/invites/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        body: { password },
      });
      await refresh();
      router.push('/dashboard');
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Erreur inconnue.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col lg:flex-row bg-background min-h-screen">
      <AuthBrandPanel />

      <div className="flex flex-col justify-center w-full lg:w-1/2 bg-background px-6 lg:px-14 py-10">
        <div className="max-w-sm w-full mx-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground">Vérification de l&apos;invitation…</p>
          ) : loadError ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-warning/10">
                <Icon i="info" size={20} className="text-warning" />
              </div>
              <h1 className="text-xl font-bold font-headings text-foreground">
                Invitation indisponible
              </h1>
              <p className="text-sm text-muted-foreground">{loadError}</p>
            </div>
          ) : (
            preview && (
              <>
                <div className="mb-8">
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">
                    Invitation
                  </div>
                  <h1 className="text-2xl font-bold font-headings text-foreground mb-2">
                    Rejoindre {preview.organizationName}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {preview.name} · {preview.email} · {preview.jobTitle}
                  </p>
                </div>

                <form onSubmit={onSubmit} className="flex flex-col gap-4">
                  <Field
                    label="Choisissez un mot de passe"
                    name="password"
                    type="password"
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={setPassword}
                    placeholder="••••••••••"
                    helper="8 caractères minimum."
                  />
                  {submitError && (
                    <p role="alert" className="text-xs text-warning">
                      {submitError}
                    </p>
                  )}
                  <Button type="submit" variant="primary" disabled={submitting} className="w-full">
                    <Icon i="check" size={14} />
                    {submitting ? 'Création du compte…' : "Rejoindre l'équipe"}
                  </Button>
                </form>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteBody />
    </Suspense>
  );
}
