// Return/poll landing for hosted subscription checkouts (Stripe/Moneroo/
// Chariow) — the `successUrl` built by POST /api/subscriptions/checkout
// (frontend/src/app/api/subscriptions/checkout/route.ts) points here with
// `?payment=<SubscriptionPayment.id>`.
//
// Per the verify route's own comment (Chariow.md §8's "3 chemins de
// crédit"): the webhook is usually faster than this redirect, so on load
// the payment may already be SUCCEEDED. This page never trusts the
// `successUrl` redirect itself — it polls POST /api/subscriptions/verify,
// which always re-queries the provider (or short-circuits if the webhook
// already credited the row) before reporting a final status.
'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';

type PollState = 'checking' | 'succeeded' | 'failed' | 'timeout' | 'missing_payment';

const POLL_INTERVAL_MS = 2500;
const MAX_ATTEMPTS = 20; // ~50s — generous for a redirect + webhook race

function ReturnBody() {
  const user = useUser();
  const params = useSearchParams();
  const paymentId = params.get('payment');
  const [state, setState] = useState<PollState>(paymentId ? 'checking' : 'missing_payment');
  const [attempt, setAttempt] = useState(0);
  // Bumped by the "Vérifier à nouveau" retry button to re-trigger the poll
  // effect below (attempt alone doesn't, since the effect only depends on
  // user/paymentId/pollGeneration — see the eslint-disable note below).
  const [pollGeneration, setPollGeneration] = useState(0);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!user || !paymentId) return;
    cancelledRef.current = false;

    async function poll(attemptNumber: number) {
      try {
        const res = await api<{ status: 'SUCCEEDED' | 'FAILED' | 'PENDING' }>(
          '/api/subscriptions/verify',
          { method: 'POST', body: { paymentId } },
        );
        if (cancelledRef.current) return;
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
          setState('missing_payment');
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
    // `attempt` is intentionally excluded — it's updated BY this effect's
    // own poll loop and including it would restart the loop on every tick.
    // The project's eslint config doesn't wire up the react-hooks plugin,
    // so there's no exhaustive-deps rule to satisfy/suppress here.
  }, [user, paymentId, pollGeneration]);

  if (!user) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
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
              <Icon i="check" size={26} className="text-success" />
            </div>
            <h1 className="text-xl font-bold font-headings text-foreground mb-2">
              Abonnement activé !
            </h1>
            <p className="text-sm text-muted-foreground mb-8">
              Votre paiement a été confirmé. Votre plan est actif dès maintenant.
            </p>
            <Link href="/settings">
              <Button variant="primary" className="w-full">
                Retour aux paramètres
              </Button>
            </Link>
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
            <Link href="/settings">
              <Button variant="outline" className="w-full">
                Retour aux paramètres
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
              Si le paiement a bien été effectué, votre plan sera activé automatiquement dès sa
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
              <Link href="/settings" className="text-sm text-muted-foreground">
                Retour aux paramètres
              </Link>
            </div>
          </>
        )}

        {state === 'missing_payment' && (
          <>
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Icon i="triangle-alert" size={26} className="text-muted-foreground" />
            </div>
            <h1 className="text-xl font-bold font-headings text-foreground mb-2">
              Référence de paiement introuvable
            </h1>
            <p className="text-sm text-muted-foreground mb-8">
              Ce lien de retour est invalide ou a expiré. Retournez aux paramètres pour réessayer.
            </p>
            <Link href="/settings">
              <Button variant="primary" className="w-full">
                Retour aux paramètres
              </Button>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function SubscriptionReturnPage() {
  return (
    <Suspense fallback={null}>
      <ReturnBody />
    </Suspense>
  );
}
