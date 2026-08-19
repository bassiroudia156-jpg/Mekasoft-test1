// Login page — ported from Banani's LoginWithRecovery(_next1). Password
// recovery used to live inline on this same page (combined-page design,
// see .planning/banani/IMPLEMENTATION-PLAN.md's original Phase 1
// decisions) — split out to its own /forgot-password route per explicit
// user request (2026-08-17): "Mot de passe oublié ?" now navigates away
// instead of expanding inline.
'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError, storeCsrfToken } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import AuthBrandPanel from '@/components/auth/AuthBrandPanel';
import SuccessBanner from '@/components/auth/SuccessBanner';
import GoogleIcon from '@/components/auth/GoogleIcon';
import Field from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';

// Top-level navigation (not fetch) — browser carries cookies + receives
// Set-Cookie from the OAuth callback redirect. Same-origin route, relative
// URL is enough.
const GOOGLE_SIGNIN_HREF = '/api/auth/oauth/google/start?next=/dashboard';

const BANNER_MESSAGES: Record<string, string> = {
  reset: 'Mot de passe changé avec succès. Utilisez votre nouveau mot de passe.',
  logged_out: 'Vous avez été déconnecté avec succès.',
};

function LoginPageBody() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useAuth();

  const bannerKey =
    params.get('reset') === 'ok' ? 'reset' : params.get('logged_out') === '1' ? 'logged_out' : null;
  const bannerMessage = bannerKey ? BANNER_MESSAGES[bannerKey] : null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  async function onLoginSubmit(e: FormEvent) {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError(null);
    try {
      const res = await api<{ csrfToken?: string }>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      await refresh();
      router.push('/dashboard');
    } catch (err) {
      setLoginError(err instanceof ApiError ? err.message : 'Erreur inconnue.');
    } finally {
      setLoggingIn(false);
    }
  }

  return (
    <div className="flex flex-col lg:flex-row bg-background min-h-screen">
      <AuthBrandPanel />

      <div className="flex flex-col justify-center w-full lg:w-1/2 bg-background px-6 lg:px-14 py-10">
        <div className="max-w-sm w-full mx-auto">
          <div className="mb-8">
            <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">
              Connexion
            </div>
            <h2 className="text-2xl font-bold font-headings text-foreground">
              Accéder à mon espace
            </h2>
          </div>

          {bannerMessage && <SuccessBanner message={bannerMessage} />}

          <form onSubmit={onLoginSubmit} className="flex flex-col gap-4">
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
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••••"
            />
            <div className="flex justify-end -mt-2">
              <Link href="/forgot-password" className="text-xs text-primary font-medium">
                Mot de passe oublié ?
              </Link>
            </div>
            {loginError && (
              <p role="alert" className="text-xs text-warning">
                {loginError}
              </p>
            )}
            <Button type="submit" variant="primary" disabled={loggingIn} className="w-full">
              <Icon i="log-in" size={14} />
              {loggingIn ? 'Connexion…' : 'Se connecter'}
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
            Pas encore de compte ?{' '}
            <Link href="/signup" className="text-primary font-medium">
              Créer un compte
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

// useSearchParams() requires a Suspense boundary under the App Router.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageBody />
    </Suspense>
  );
}
