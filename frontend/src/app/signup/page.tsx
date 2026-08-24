// No Banani mockup exists for signup (the flow only designs login/recovery/
// logout — team members join via invitation, Phase 3). Restyled with the
// same AuthBrandPanel shell as /login for visual consistency; the API
// contract is unchanged from the existing reference implementation
// (examples/frontend-pages/signup.tsx): enumeration-resistant, no cookies
// issued here — verification happens on /verify-email.
'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import AuthBrandPanel from '@/components/auth/AuthBrandPanel';
import GoogleIcon from '@/components/auth/GoogleIcon';
import Turnstile from '@/components/auth/Turnstile';
import Field from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';

const GOOGLE_SIGNIN_HREF = '/api/auth/oauth/google/start?next=/dashboard';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Security audit fix (2026-08-24, control #12) — undefined when Turnstile
  // isn't configured (Turnstile renders nothing in that case), which the
  // server treats as inert too. See lib/server/security/turnstile.ts.
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>(undefined);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/signup', {
        method: 'POST',
        body: { email, password, ...(turnstileToken ? { turnstileToken } : {}) },
      });
      router.push(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur inconnue.');
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
              Créer un compte
            </div>
            <h2 className="text-2xl font-bold font-headings text-foreground">
              Démarrez avec MekaSoft
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
              label="Mot de passe"
              name="password"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••••"
              helper="8 caractères minimum."
            />
            <Turnstile onVerify={setTurnstileToken} />
            {error && (
              <p role="alert" className="text-xs text-warning">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" disabled={submitting} className="w-full">
              <Icon i="user-plus" size={14} />
              {submitting ? 'Création…' : 'Créer mon compte'}
            </Button>
          </form>

          <div className="flex items-center gap-3 my-5 text-xs uppercase tracking-widest text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            ou
            <span className="h-px flex-1 bg-border" />
          </div>

          <a
            href={GOOGLE_SIGNIN_HREF}
            className="flex items-center justify-center gap-2 w-full border border-border rounded-md px-4 py-3 text-sm font-medium text-foreground hover:bg-input"
          >
            <GoogleIcon />
            Continuer avec Google
          </a>

          <p className="text-xs text-muted-foreground text-center mt-6">
            Déjà un compte ?{' '}
            <Link href="/login" className="text-primary font-medium">
              Se connecter
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
