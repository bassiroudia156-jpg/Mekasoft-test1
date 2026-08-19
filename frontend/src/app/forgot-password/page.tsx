// Standalone password-recovery page — ported from Banani's
// PasswordRecoveryLinkSent(+_next1)/PasswordRecoveryLinkResent, previously
// folded inline into /login (see IMPLEMENTATION-PLAN.md's original Phase 1
// decisions). Split out per explicit user request (2026-08-17): /login's
// "Mot de passe oublié ?" now navigates here instead of expanding an
// inline section on the same page. Same AuthBrandPanel shell + single-
// column layout as /reset-password for consistency.
'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import AuthBrandPanel from '@/components/auth/AuthBrandPanel';
import RecoverySentPanel from '@/components/auth/RecoverySentPanel';
import Field from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(isResend: boolean) {
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/forgot-password', { method: 'POST', body: { email } });
      setSubmitted(true);
      if (isResend) setResent(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TOO_MANY_RESET_REQUESTS') {
        setError('Trop de demandes pour cet email. Réessayez dans une heure.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Erreur inconnue.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit(false);
  }

  return (
    <div className="flex flex-col lg:flex-row bg-background min-h-screen">
      <AuthBrandPanel />

      <div className="flex flex-col justify-center w-full lg:w-1/2 bg-background px-6 lg:px-14 py-10">
        <div className="max-w-sm w-full mx-auto">
          {submitted ? (
            <RecoverySentPanel
              email={email}
              resent={resent}
              resending={submitting}
              onResend={() => void submit(true)}
            />
          ) : (
            <>
              <div className="mb-8">
                <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">
                  Mot de passe oublié ?
                </div>
                <h2 className="text-2xl font-bold font-headings text-foreground">
                  Récupérer l&apos;accès
                </h2>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                Entrez votre adresse email et nous vous enverrons un lien pour réinitialiser votre
                mot de passe.
              </p>

              <form onSubmit={onSubmit} className="flex flex-col gap-4">
                <Field
                  label="Adresse email de récupération"
                  name="recoveryEmail"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="votre@email.com"
                />
                {error && (
                  <p role="alert" className="text-xs text-warning">
                    {error}
                  </p>
                )}
                <Button type="submit" variant="primary" disabled={submitting} className="w-full">
                  <Icon i="send" size={14} />
                  {submitting ? 'Envoi…' : 'Envoyer le lien de réinitialisation'}
                </Button>
              </form>

              <div className="flex items-start gap-2 mt-4">
                <Icon i="info" size={12} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  Le lien expirera après un court délai. Vérifiez également vos spams.
                </p>
              </div>
            </>
          )}

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
