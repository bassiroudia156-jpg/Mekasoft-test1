// No dedicated Banani mockup for the reset form itself — the flow only
// designed the "link sent" confirmation (see RecoverySentPanel). Same
// AuthBrandPanel shell for consistency. Reads ?email=&?code= from the
// emailed link (see PasswordRecoveryLinkSent copy: "cliquez sur le lien").
// On success, redirects to /login?reset=ok — no auto-login, since password
// reset bumps tokenVersion to invalidate any stolen sessions.
'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import AuthBrandPanel from '@/components/auth/AuthBrandPanel';
import Field from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';

function ResetPasswordBody() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState(params.get('code') ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/reset-password', { method: 'POST', body: { email, code, newPassword } });
      router.push('/login?reset=ok');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TOO_MANY_RESET_ATTEMPTS') {
        setError('Trop de tentatives. Attendez 10 minutes et réessayez.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Erreur inconnue.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col lg:flex-row bg-background min-h-screen">
      <AuthBrandPanel />

      <div className="flex flex-col justify-center w-full lg:w-1/2 bg-background px-6 lg:px-14 py-10">
        <div className="max-w-sm w-full mx-auto">
          <div className="mb-8">
            <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">
              Récupération
            </div>
            <h2 className="text-2xl font-bold font-headings text-foreground">
              Créez un nouveau mot de passe
            </h2>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field
              label="Adresse email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={setEmail}
              placeholder="votre@email.com"
            />
            <Field
              label="Code de réinitialisation"
              name="code"
              type="text"
              required
              value={code}
              onChange={(v) => setCode(v.toUpperCase())}
              placeholder="XXXXXXXX"
              helper="8 caractères — copié depuis l'email reçu."
            />
            <Field
              label="Nouveau mot de passe"
              name="newPassword"
              type="password"
              required
              autoComplete="new-password"
              value={newPassword}
              onChange={setNewPassword}
              placeholder="••••••••••"
              helper="8 caractères minimum."
            />
            {error && (
              <p role="alert" className="text-xs text-warning">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" disabled={submitting} className="w-full">
              <Icon i="lock" size={14} />
              {submitting ? 'Réinitialisation…' : 'Réinitialiser le mot de passe'}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-6">
            <Link href="/login" className="text-primary font-medium">
              Retour à la connexion
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordBody />
    </Suspense>
  );
}
