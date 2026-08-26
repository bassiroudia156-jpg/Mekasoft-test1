// Phase C item #8 (2026-08-25) — public, no-account devis respond page.
// Powers the link sent by email (see lib/server/quotes/email-templates.ts)
// and the "Copier le lien" action on the staff detail page
// (/quotes/[id]). Consumes GET/POST /api/quotes/respond/[token] — no
// Sidebar, no useUser()/auth gate, the 32-byte token IS the auth. Document
// layout mirrors interventions/[id]/devis/page.tsx's print preview (same
// data shape), with Accept/Reject buttons replacing the print controls.
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import BrandLogo from '@/components/ui/BrandLogo';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import { SkeletonDocument } from '@/components/ui/Skeleton';

interface RespondQuote {
  reference: string;
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  organizationName: string;
  clientName: string;
  vehicle: string;
  work: string;
  laborAmount: number;
  partsAmount: number;
  taxRatePct: number;
  taxAmount: number;
  subtotal: number;
  amount: number;
  validUntil: string;
  respondedAt: string | null;
  createdAt: string;
  parts: { name: string; quantity: number; unit: string; unitPrice: number; total: number }[];
}

function formatFCFA(n: number): string {
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

export default function QuoteRespondPage() {
  const params = useParams<{ token: string }>();
  const [data, setData] = useState<RespondQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<'accept' | 'reject' | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ quote: RespondQuote }>(`/api/quotes/respond/${params.token}`);
        if (!cancelled) setData(res.quote);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError && err.status === 404
              ? 'Ce devis est introuvable ou le lien est invalide.'
              : 'Erreur inconnue.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.token]);

  async function respond(action: 'accept' | 'reject') {
    setSubmitting(action);
    setSubmitError(null);
    try {
      await api(`/api/quotes/respond/${params.token}`, { method: 'POST', body: { action } });
      setData((prev) =>
        prev ? { ...prev, status: action === 'accept' ? 'ACCEPTED' : 'REJECTED' } : prev,
      );
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Erreur inconnue.');
    } finally {
      setSubmitting(null);
    }
  }

  const expired = data ? new Date(data.validUntil).getTime() < Date.now() : false;
  const respondable = data ? data.status === 'SENT' && !expired : false;

  return (
    <div className="bg-background min-h-screen flex flex-col">
      <div className="border-b border-border bg-background px-4 py-3 lg:px-12 lg:py-4 flex items-center justify-center">
        <BrandLogo variant="light" className="h-12 lg:h-14 w-auto" />
      </div>

      <div className="flex-1 flex items-start justify-center py-8 px-4">
        {loading ? (
          <div className="w-full max-w-[720px]">
            <SkeletonDocument />
          </div>
        ) : error ? (
          <div className="max-w-md text-center py-16">
            <Icon i="file-x" size={40} className="text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-warning">{error}</p>
          </div>
        ) : (
          data && (
            <div className="w-full max-w-[720px] flex flex-col gap-4">
              {!respondable && (
                <div
                  className={`rounded-md px-4 py-3 text-sm font-medium flex items-center gap-2 ${
                    data.status === 'ACCEPTED'
                      ? 'bg-success/10 text-success'
                      : data.status === 'REJECTED'
                        ? 'bg-accent/10 text-accent'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <Icon
                    i={
                      data.status === 'ACCEPTED'
                        ? 'circle-check'
                        : data.status === 'REJECTED'
                          ? 'x'
                          : 'clock'
                    }
                    size={16}
                  />
                  {data.status === 'ACCEPTED' && 'Vous avez déjà accepté ce devis.'}
                  {data.status === 'REJECTED' && 'Vous avez déjà refusé ce devis.'}
                  {data.status === 'DRAFT' && "Ce devis n'a pas encore été envoyé."}
                  {(data.status === 'EXPIRED' || (data.status === 'SENT' && expired)) &&
                    'Ce devis a expiré. Contactez le garage pour une nouvelle proposition.'}
                </div>
              )}

              <div className="bg-surface border border-border rounded-md w-full overflow-x-auto">
                <div className="border-b border-border px-6 sm:px-10 py-8 flex items-start justify-between flex-wrap gap-4">
                  <div>
                    <div className="text-2xl font-bold font-headings text-foreground mb-1">
                      DEVIS DE RÉPARATION
                    </div>
                    <div className="text-xs text-muted-foreground">
                      N° {data.reference} · Émis le{' '}
                      {new Date(data.createdAt).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold text-foreground">
                      {data.organizationName}
                    </div>
                  </div>
                </div>

                <div className="px-6 sm:px-10 py-6 grid grid-cols-1 sm:grid-cols-2 gap-8 border-b border-border">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
                      Client
                    </div>
                    <div className="text-sm font-bold text-foreground">{data.clientName}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
                      Véhicule
                    </div>
                    <div className="text-sm font-bold text-foreground">{data.vehicle}</div>
                  </div>
                </div>

                <div className="px-6 sm:px-10 py-6 border-b border-border">
                  <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
                    Travaux à effectuer
                  </div>
                  <div className="text-sm text-foreground bg-input rounded-md px-4 py-3">
                    {data.work}
                  </div>
                </div>

                {data.parts.length > 0 && (
                  <div className="px-6 sm:px-10 py-6 border-b border-border overflow-x-auto">
                    <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-4">
                      Pièces de rechange
                    </div>
                    <table className="w-full text-xs min-w-[420px]">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="text-left py-2 font-medium">Désignation</th>
                          <th className="text-center py-2 font-medium">Qté</th>
                          <th className="text-right py-2 font-medium">P.U. (FCFA)</th>
                          <th className="text-right py-2 font-medium">Total (FCFA)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.parts.map((p, idx) => (
                          <tr key={idx} className="border-b border-border/50 last:border-b-0">
                            <td className="py-2.5 text-foreground font-medium">{p.name}</td>
                            <td className="py-2.5 text-center text-muted-foreground">
                              {p.quantity}
                            </td>
                            <td className="py-2.5 text-right text-muted-foreground">
                              {p.unitPrice.toLocaleString('fr-FR')}
                            </td>
                            <td className="py-2.5 text-right font-bold text-foreground">
                              {p.total.toLocaleString('fr-FR')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="px-6 sm:px-10 py-6">
                  <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-4">
                    Récapitulatif
                  </div>
                  <div className="space-y-2 w-full sm:w-72 sm:ml-auto">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Main-d&apos;œuvre</span>
                      <span className="text-foreground">
                        {data.laborAmount.toLocaleString('fr-FR')} FCFA
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Pièces</span>
                      <span className="text-foreground">
                        {data.partsAmount.toLocaleString('fr-FR')} FCFA
                      </span>
                    </div>
                    <div className="flex justify-between text-xs border-t border-border pt-2">
                      <span className="text-muted-foreground">Sous-total HT</span>
                      <span className="text-foreground">
                        {data.subtotal.toLocaleString('fr-FR')} FCFA
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">TVA {data.taxRatePct}%</span>
                      <span className="text-foreground">
                        {data.taxAmount.toLocaleString('fr-FR')} FCFA
                      </span>
                    </div>
                    <div className="flex justify-between text-sm font-bold border-t border-foreground pt-2">
                      <span className="text-foreground">TOTAL TTC</span>
                      <span className="text-foreground">{formatFCFA(data.amount)}</span>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-4">
                    Valable jusqu&apos;au {new Date(data.validUntil).toLocaleDateString('fr-FR')}
                  </div>
                </div>
              </div>

              {respondable && (
                <div className="bg-surface border border-border rounded-md p-5 sm:p-6">
                  <p className="text-sm text-foreground mb-4">
                    Merci de confirmer si vous acceptez ce devis. Le garage sera notifié
                    immédiatement de votre réponse.
                  </p>
                  {submitError && (
                    <p role="alert" className="text-sm text-warning mb-4">
                      {submitError}
                    </p>
                  )}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      variant="primary"
                      disabled={submitting !== null}
                      className="flex-1 justify-center"
                      onClick={() => void respond('accept')}
                    >
                      <Icon i="circle-check" size={16} />
                      {submitting === 'accept' ? 'Envoi…' : "J'accepte ce devis"}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={submitting !== null}
                      className="flex-1 justify-center"
                      onClick={() => void respond('reject')}
                    >
                      <Icon i="x" size={16} />
                      {submitting === 'reject' ? 'Envoi…' : 'Je refuse'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
