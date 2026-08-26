// /auth/error — landing page for OAuth callback failures.
//
// The callback (frontend/src/app/api/auth/oauth/google/callback/route.ts)
// builds redirects via `redirectToAuthError(code)` in
// frontend/src/lib/server/oauth/error-redirect.ts. That helper hard-codes
// `/auth/error?code=<CODE>` with five UPPERCASE codes (D-06 contract):
//   GOOGLE_EMAIL_NOT_VERIFIED
//   OAUTH_STATE_MISMATCH
//   OAUTH_CODE_EXCHANGE_FAILED
//   OAUTH_PROVIDER_DISABLED
//   OAUTH_GENERIC
//
// Unknown / missing codes fall back to a generic message.
//
// Audit fix (2026-08-17): originally styled with raw Tailwind gray/black
// (bg-black, text-gray-700, text-gray-400) instead of the MekaSoft design
// tokens every other page uses — restyled to match the AuthBrandPanel shell
// shared by /login, /forgot-password, /reset-password.
'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AuthBrandPanel from '@/components/auth/AuthBrandPanel';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';

const ERROR_MESSAGES: Record<string, string> = {
  GOOGLE_EMAIL_NOT_VERIFIED:
    "Votre adresse Google n'est pas vérifiée. Vérifiez-la sur votre compte Google, puis réessayez.",
  OAUTH_STATE_MISMATCH:
    'La connexion a été interrompue (vérification de sécurité). Cela peut arriver si la page Google est restée ouverte trop longtemps — réessayez.',
  OAUTH_CODE_EXCHANGE_FAILED: 'Google a refusé la connexion. Réessayez dans un instant.',
  OAUTH_PROVIDER_DISABLED:
    'La connexion via Google n’est pas activée sur ce serveur. Contactez le support.',
  OAUTH_GENERIC: 'Une erreur inattendue est survenue pendant la connexion. Réessayez.',
};

function AuthErrorBody() {
  const params = useSearchParams();
  const code = params.get('code') ?? params.get('error') ?? '';
  const normalized = code.toUpperCase();
  const message =
    ERROR_MESSAGES[normalized] ??
    'Une erreur inconnue est survenue pendant la connexion. Réessayez.';

  return (
    <div className="flex flex-col lg:flex-row bg-background min-h-screen">
      <AuthBrandPanel />

      <div className="flex flex-col justify-center w-full lg:w-1/2 bg-background px-6 lg:px-14 py-10">
        <div className="max-w-sm w-full mx-auto">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10 mb-6">
            <Icon i="triangle-alert" size={22} className="text-destructive" />
          </div>

          <div className="mb-6">
            <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">
              Connexion
            </div>
            <h1 className="text-2xl font-bold font-headings text-foreground">Échec de connexion</h1>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed mb-2">{message}</p>
          {code && <p className="font-mono text-xs text-muted-foreground/70 mb-6">code: {code}</p>}

          <div className="flex flex-col gap-3 mt-6">
            <Link href="/login">
              <Button variant="primary" className="w-full">
                Retour à la connexion
              </Button>
            </Link>
            <Link href="/" className="text-center text-sm text-muted-foreground">
              Accueil
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={null}>
      <AuthErrorBody />
    </Suspense>
  );
}
