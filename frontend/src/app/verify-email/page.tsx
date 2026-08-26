// No Banani mockup exists for this screen — same AuthBrandPanel shell as
// /login and /signup for consistency. API contract unchanged from
// examples/frontend-pages/verify-email.tsx: reads ?email=&?code= (the
// emailed link pre-fills both and auto-submits), 8-char Crockford code is
// also manually typeable as a fallback.
'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError, storeCsrfToken } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import AuthBrandPanel from '@/components/auth/AuthBrandPanel';
import Field from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';

function VerifyEmailBody() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useAuth();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState(params.get('code') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const qEmail = params.get('email');
    const qCode = params.get('code');
    if (qEmail && qCode) {
      void verify(qEmail, qCode);
    }
    // Run once on mount only — `verify` is stable enough for this one-shot
    // auto-submit and the project's eslint config doesn't wire up the
    // react-hooks plugin (no exhaustive-deps rule to satisfy/suppress).
  }, []);

  async function verify(emailValue: string, codeValue: string) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ csrfToken?: string }>('/api/auth/verify-email', {
        method: 'POST',
        body: { email: emailValue, code: codeValue },
      });
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      await refresh();
      // First-time verification → straight to the onboarding wizard, not
      // the empty dashboard. Returning users (/login) still land on
      // /dashboard, which shows the "configure your garage" banner for
      // anyone who used "Passer pour l'instant" here.
      router.push('/onboarding');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur inconnue.');
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void verify(email, code);
  }

  return (
    <div className="flex flex-col lg:flex-row bg-background min-h-screen">
      <AuthBrandPanel />

      <div className="flex flex-col justify-center w-full lg:w-1/2 bg-background px-6 lg:px-14 py-10">
        <div className="max-w-sm w-full mx-auto">
          <div className="mb-8">
            <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">
              Vérification
            </div>
            <h2 className="text-2xl font-bold font-headings text-foreground">
              Confirmez votre email
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              Nous avons envoyé un code à 8 caractères à votre adresse. Il expire dans 10 minutes.
            </p>
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
              label="Code de vérification"
              name="code"
              type="text"
              required
              value={code}
              onChange={(v) => setCode(v.toUpperCase())}
              placeholder="XXXXXXXX"
              helper="8 caractères — copié depuis l'email reçu."
            />
            {error && (
              <p role="alert" className="text-xs text-warning">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" disabled={submitting} className="w-full">
              <Icon i="circle-check" size={14} />
              {submitting ? 'Vérification…' : 'Vérifier mon email'}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-6">
            Pas reçu de code ?{' '}
            <Link href="/signup" className="text-primary font-medium">
              Recommencer l&apos;inscription
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailBody />
    </Suspense>
  );
}
