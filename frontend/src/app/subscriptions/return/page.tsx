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
//
// The `succeeded` state's richer layout (plan/renewal details, included
// features, order info, receipt download) is modeled on Banani's
// "Upgrade Confirmation" screen (83o75a2tYyMD/screens/UpgradeConfirmation.jsx)
// — see .planning/banani/subscription-confirmation-page.md. The other 4
// states have no Banani source (designed here, per the skill's own
// allowance for states a mockup never ships).
'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';

type PollState = 'checking' | 'succeeded' | 'failed' | 'timeout' | 'missing_payment';

interface VerifyDetails {
  plan: string;
  provider: string;
  amount: number;
  currency: string;
  currentPeriodEnd: string | null;
}

const POLL_INTERVAL_MS = 2500;
const MAX_ATTEMPTS = 20; // ~50s — generous for a redirect + webhook race

const PLAN_LABEL: Record<string, string> = { PRO: 'Pro', BUSINESS: 'Business' };
const PROVIDER_LABEL: Record<string, string> = {
  STRIPE: 'Carte bancaire (Stripe)',
  MONEROO: 'Mobile Money (Moneroo)',
  CHARIOW: 'Mobile Money (Chariow)',
};
const PLAN_FEATURES: Record<string, string[]> = {
  PRO: [
    'Clients, véhicules et interventions illimités',
    'Partage de factures sur WhatsApp',
    'Logo du garage sur les factures',
  ],
  BUSINESS: [
    'Tout Pro',
    "Jusqu'à 5 utilisateurs avec rôles",
    "Rapport d'activité mensuel (PDF)",
    'Export de données (CSV)',
  ],
};

function formatOrderNumber(paymentId: string): string {
  return `SP-${paymentId.slice(-8).toUpperCase()}`;
}

function ReturnBody() {
  const user = useUser();
  const params = useSearchParams();
  const paymentId = params.get('payment');
  const [state, setState] = useState<PollState>(paymentId ? 'checking' : 'missing_payment');
  const [details, setDetails] = useState<VerifyDetails | null>(null);
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
        const res = await api<{ status: 'SUCCEEDED' | 'FAILED' | 'PENDING' } & VerifyDetails>(
          '/api/subscriptions/verify',
          { method: 'POST', body: { paymentId } },
        );
        if (cancelledRef.current) return;
        setDetails({
          plan: res.plan,
          provider: res.provider,
          amount: res.amount,
          currency: res.currency,
          currentPeriodEnd: res.currentPeriodEnd ?? null,
        });
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

  const cardMaxWidth = state === 'succeeded' ? 'max-w-lg' : 'max-w-sm';

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <div className={`w-full ${cardMaxWidth} text-center`}>
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
            {/* Success banner */}
            <div className="bg-success/10 border border-success rounded-md p-5 flex items-center gap-4 text-left mb-6">
              <Icon i="check-circle" size={24} className="text-success flex-shrink-0" />
              <div>
                <div className="font-semibold text-success text-sm">Abonnement activé !</div>
                <p className="text-xs text-success/80">
                  Bienvenue sur le forfait {PLAN_LABEL[details?.plan ?? ''] ?? details?.plan}.
                  Toutes vos nouvelles fonctionnalités sont accessibles dès maintenant.
                </p>
              </div>
            </div>

            <h1 className="text-2xl font-bold font-headings text-foreground mb-2">
              Merci pour votre achat !
            </h1>
            <p className="text-sm text-muted-foreground mb-6">
              Votre forfait {PLAN_LABEL[details?.plan ?? ''] ?? details?.plan} est maintenant actif.
            </p>

            {/* Plan details card */}
            <div className="bg-surface border border-primary rounded-lg p-6 text-left mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
                    Forfait actif
                  </div>
                  <h2 className="text-xl font-bold font-headings text-foreground mb-3">
                    {PLAN_LABEL[details?.plan ?? ''] ?? details?.plan}
                  </h2>
                  <div className="flex flex-col gap-3">
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
                        Tarif mensuel
                      </div>
                      <div className="text-lg font-bold text-foreground">
                        {details
                          ? `${details.amount.toLocaleString('fr-FR')} ${details.currency}`
                          : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
                        {details?.provider === 'STRIPE'
                          ? 'Prochain renouvellement'
                          : 'Renouvellement'}
                      </div>
                      <div className="text-sm text-foreground">
                        {details?.provider === 'STRIPE'
                          ? details.currentPeriodEnd
                            ? new Date(details.currentPeriodEnd).toLocaleDateString('fr-FR', {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                              })
                            : 'Automatique'
                          : 'Manuel — un rappel vous sera envoyé avant expiration'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
                        Statut
                      </div>
                      <div className="flex items-center gap-2">
                        <Icon i="check-circle" size={14} className="text-success" />
                        <span className="text-sm font-medium text-success">Actif</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mb-3">
                    Inclus
                  </div>
                  <div className="flex flex-col gap-2">
                    {(PLAN_FEATURES[details?.plan ?? ''] ?? []).map((f) => (
                      <div key={f} className="flex items-start gap-2">
                        <Icon i="check" size={14} className="text-primary mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-foreground">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-border my-6" />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
                    N° de commande
                  </div>
                  <div className="font-medium text-foreground text-sm">
                    {paymentId ? formatOrderNumber(paymentId) : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
                    Date d&apos;activation
                  </div>
                  <div className="font-medium text-foreground text-sm">
                    {new Date().toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
                    Moyen de paiement
                  </div>
                  <div className="font-medium text-foreground text-sm">
                    {details ? (PROVIDER_LABEL[details.provider] ?? details.provider) : '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* What's next */}
            <div className="bg-secondary rounded-lg p-6 text-left mb-6">
              <h3 className="font-semibold text-secondary-foreground mb-4 text-sm">
                À faire maintenant
              </h3>
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-secondary-foreground text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                    1
                  </div>
                  <div>
                    <Link
                      href="/settings/shop"
                      className="text-sm font-medium text-secondary-foreground hover:underline"
                    >
                      Ajoutez le logo de votre atelier
                    </Link>
                    <p className="text-xs text-secondary-foreground/70">
                      Il apparaîtra sur toutes vos factures PDF.
                    </p>
                  </div>
                </div>
                {details?.plan === 'BUSINESS' && (
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-secondary-foreground text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                      2
                    </div>
                    <div>
                      <div className="text-sm font-medium text-secondary-foreground">
                        Invitez votre équipe
                      </div>
                      <p className="text-xs text-secondary-foreground/70">
                        Ouvrez votre profil (icône en bas de la barre latérale) pour ajouter
                        jusqu&apos;à 5 membres.
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-secondary-foreground text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {details?.plan === 'BUSINESS' ? 3 : 2}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-secondary-foreground">
                      Partagez vos factures sur WhatsApp
                    </div>
                    <p className="text-xs text-secondary-foreground/70">
                      Le bouton de partage est disponible sur chaque facture.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/dashboard" className="flex-1">
                <Button type="button" variant="primary" className="w-full">
                  <Icon i="arrow-right" size={16} />
                  Aller au tableau de bord
                </Button>
              </Link>
              {paymentId && (
                <a
                  href={`/api/subscriptions/${paymentId}/receipt/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-2 border border-border text-foreground font-medium py-2.5 rounded-md text-sm hover:bg-input"
                >
                  <Icon i="download" size={14} />
                  Télécharger le reçu
                </a>
              )}
            </div>
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
            <Link href="/profile">
              <Button variant="outline" className="w-full">
                Retour à mon profil
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
              <Link href="/profile" className="text-sm text-muted-foreground">
                Retour à mon profil
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
              Ce lien de retour est invalide ou a expiré. Retournez à votre profil pour réessayer.
            </p>
            <Link href="/profile">
              <Button variant="primary" className="w-full">
                Retour à mon profil
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
