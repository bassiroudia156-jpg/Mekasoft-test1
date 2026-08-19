// Public return/poll landing for the anonymous checkout flow (2026-08-19) —
// the `successUrl` built by POST /api/subscriptions/anonymous-checkout
// points here with `?intent=<AnonymousSubscriptionIntent.id>`. Mirrors
// /subscriptions/return's poll shape closely, but public (no useUser() gate
// — there is no account yet for a brand-new subscriber) and read-only: it
// never triggers fulfillment itself (see anonymous-checkout/verify/route.ts's
// file comment for why — only the webhook creates accounts). If the webhook
// hasn't landed yet, this just shows `timeout` with a manual retry, same as
// the authenticated return page.
'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import Icon from '@/components/ui/Icon';
import Button from '@/components/ui/Button';

type PollState = 'checking' | 'succeeded' | 'failed' | 'timeout' | 'missing_intent';

interface VerifyResult {
  status: 'SUCCEEDED' | 'FAILED' | 'PENDING';
  plan: string;
  provider: string;
  email: string;
  isNewAccount: boolean;
}

const POLL_INTERVAL_MS = 2500;
const MAX_ATTEMPTS = 20; // ~50s, same generosity as /subscriptions/return

const PLAN_LABEL: Record<string, string> = { PRO: 'Pro', BUSINESS: 'Business' };

function WelcomeBody() {
  const params = useSearchParams();
  const intentId = params.get('intent');
  const [state, setState] = useState<PollState>(intentId ? 'checking' : 'missing_intent');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pollGeneration, setPollGeneration] = useState(0);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!intentId) return;
    cancelledRef.current = false;

    async function poll(attemptNumber: number) {
      try {
        const res = await api<VerifyResult>('/api/subscriptions/anonymous-checkout/verify', {
          method: 'POST',
          body: { intentId },
        });
        if (cancelledRef.current) return;
        setResult(res);
        if (res.status === 'SUCCEEDED') {
          setState('succeeded');
          return;
        }
        if (res.status === 'FAILED') {
          setState('failed');
          return;
        }
        if (attemptNumber >= MAX_ATTEMPTS) {
          setState('timeout');
          return;
        }
        setAttempt(attemptNumber + 1);
        setTimeout(() => {
          if (!cancelledRef.current) void poll(attemptNumber + 1);
        }, POLL_INTERVAL_MS);
      } catch (err) {
        if (cancelledRef.current) return;
        if (err instanceof ApiError && err.status === 404) {
          setState('missing_intent');
          return;
        }
        if (attemptNumber >= MAX_ATTEMPTS) {
          setState('timeout');
          return;
        }
        setAttempt(attemptNumber + 1);
        setTimeout(() => {
          if (!cancelledRef.current) void poll(attemptNumber + 1);
        }, POLL_INTERVAL_MS);
      }
    }

    void poll(0);
    return () => {
      cancelledRef.current = true;
    };
    // `attempt` intentionally excluded — same reasoning as
    // /subscriptions/return/page.tsx's poll effect.
  }, [intentId, pollGeneration]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <div className="w-full max-w-sm text-center">
        {state === 'checking' && (
          <>
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Icon i="loader-circle" size={26} className="animate-spin text-primary" />
            </div>
            <h1 className="text-xl font-bold font-headings text-foreground mb-2">
              Vérification du paiement…
            </h1>
            <p className="text-sm text-muted-foreground">
              Ça ne devrait prendre que quelques secondes.
              {attempt > 4
                ? ' Le paiement mobile money peut parfois prendre un peu plus longtemps.'
                : ''}
            </p>
          </>
        )}

        {state === 'succeeded' && (
          <>
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
              <Icon i="check-circle" size={26} className="text-success" />
            </div>
            <h1 className="text-xl font-bold font-headings text-foreground mb-2">
              Abonnement {PLAN_LABEL[result?.plan ?? ''] ?? result?.plan} activé !
            </h1>
            {result?.isNewAccount ? (
              <>
                <p className="text-sm text-muted-foreground mb-6">
                  Votre compte MekaSoft vient d&apos;être créé. Il ne reste qu&apos;une étape :
                  ouvrez l&apos;email envoyé à{' '}
                  <strong className="text-foreground">{result.email}</strong> pour définir votre mot
                  de passe et accéder à votre espace.
                </p>
                <Link href="/login">
                  <Button variant="outline" className="w-full">
                    J&apos;ai défini mon mot de passe — Se connecter
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-6">
                  Connectez-vous avec votre compte existant pour y accéder.
                </p>
                <Link href="/login">
                  <Button variant="primary" className="w-full">
                    <Icon i="arrow-right" size={16} />
                    Se connecter
                  </Button>
                </Link>
              </>
            )}
          </>
        )}

        {state === 'failed' && (
          <>
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <Icon i="x" size={26} className="text-destructive" />
            </div>
            <h1 className="text-xl font-bold font-headings text-foreground mb-2">
              Le paiement a échoué
            </h1>
            <p className="text-sm text-muted-foreground mb-8">
              Votre paiement n&apos;a pas abouti. Aucun montant ne devrait avoir été débité —
              réessayez.
            </p>
            <Link href="/#tarifs">
              <Button variant="outline" className="w-full">
                Retour aux forfaits
              </Button>
            </Link>
          </>
        )}

        {state === 'timeout' && (
          <>
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-warning/10">
              <Icon i="clock" size={26} className="text-warning" />
            </div>
            <h1 className="text-xl font-bold font-headings text-foreground mb-2">
              Toujours en attente
            </h1>
            <p className="text-sm text-muted-foreground mb-8">
              Si le paiement a bien été effectué, votre compte sera créé automatiquement dès sa
              confirmation par le fournisseur — sinon, réessayez.
            </p>
            <div className="flex flex-col gap-3">
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  setState('checking');
                  setAttempt(0);
                  setPollGeneration((g) => g + 1);
                }}
              >
                Vérifier à nouveau
              </Button>
              <Link href="/#tarifs" className="text-sm text-muted-foreground">
                Retour aux forfaits
              </Link>
            </div>
          </>
        )}

        {state === 'missing_intent' && (
          <>
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Icon i="triangle-alert" size={26} className="text-muted-foreground" />
            </div>
            <h1 className="text-xl font-bold font-headings text-foreground mb-2">
              Référence de paiement introuvable
            </h1>
            <p className="text-sm text-muted-foreground mb-8">
              Le lien utilisé est incomplet ou invalide.
            </p>
            <Link href="/#tarifs">
              <Button variant="outline" className="w-full">
                Retour aux forfaits
              </Button>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function AnonymousWelcomePage() {
  return (
    <Suspense fallback={null}>
      <WelcomeBody />
    </Suspense>
  );
}
