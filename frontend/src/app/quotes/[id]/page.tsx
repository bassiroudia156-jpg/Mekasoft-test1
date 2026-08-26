// Phase C item #8 (2026-08-25) — quote detail page. Layout mirrors
// invoices/[id]/page.tsx (document + history timeline on the left, a
// financial summary card on the right) since a Quote and an Invoice share
// the same "one document, one lifecycle" shape. Actions in the header swap
// by status: DRAFT gets "Envoyer au client", SENT gets staff accept/reject
// + a copy-link action for the public respond page
// (/quotes/respond/[token]), ACCEPTED gets "Convertir en intervention"
// (only while it has none yet — a quote created FROM an intervention
// already does).
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useMobileSidebar } from '@/contexts/MobileSidebarContext';
import { useRefetchOnFocus } from '@/lib/useRefetchOnFocus';
import { sharePdfViaWhatsApp } from '@/lib/whatsappShare';
import Sidebar from '@/components/layout/Sidebar';
import Badge, { type BadgeTone } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import { SkeletonDocument } from '@/components/ui/Skeleton';
import { QUOTE_STATUS_LABEL, type QuoteStatus } from '@/components/quotes/QuoteRow';

interface QuotePart {
  id: string;
  name: string;
  supplier: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

interface QuoteDetail {
  id: string;
  reference: string;
  status: QuoteStatus;
  work: string;
  notes: string | null;
  laborAmount: number;
  partsAmount: number;
  taxRatePct: number;
  taxAmount: number;
  subtotal: number;
  amount: number;
  token: string;
  validUntil: string;
  sentAt: string | null;
  respondedAt: string | null;
  respondedByName: string | null;
  interventionId: string | null;
  createdAt: string;
  client: { id: string; name: string; phone: string };
  vehicle: {
    id: string;
    brand: string;
    model: string;
    year: number | null;
    registration: string;
    mileage: number | null;
  };
  parts: QuotePart[];
}

const STATUS_TONE: Record<QuoteStatus, BadgeTone> = {
  DRAFT: 'muted',
  SENT: 'primary',
  ACCEPTED: 'success',
  REJECTED: 'accent',
  EXPIRED: 'muted',
};

function formatFCFA(n: number): string {
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

export default function QuoteDetailPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const { toggle } = useMobileSidebar();
  const params = useParams<{ id: string }>();

  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [responding, setResponding] = useState(false);
  const [converting, setConverting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [respondModal, setRespondModal] = useState<'accept' | 'reject' | null>(null);

  async function load() {
    try {
      const res = await api<{ quote: QuoteDetail }>(`/api/quotes/${params.id}`);
      setQuote(res.quote);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404 ? 'Devis introuvable.' : 'Erreur inconnue.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, params.id]);

  useRefetchOnFocus(() => {
    if (user) void load();
  });

  if (!user) return null;

  const respondUrl =
    quote && typeof window !== 'undefined'
      ? `${window.location.origin}/quotes/respond/${quote.token}`
      : '';

  async function copyRespondLink() {
    try {
      await navigator.clipboard.writeText(respondUrl);
      toast('Lien copié.', 'success');
    } catch {
      toast('Impossible de copier le lien.', 'error');
    }
  }

  async function sendToClient() {
    if (!quote) return;
    setSending(true);
    try {
      await api(`/api/quotes/${quote.id}/send`, { method: 'POST' });
      toast('Devis envoyé au client.', 'success');
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur inconnue.', 'error');
    } finally {
      setSending(false);
    }
  }

  async function respond(action: 'accept' | 'reject') {
    if (!quote) return;
    setResponding(true);
    try {
      await api(`/api/quotes/${quote.id}/respond`, { method: 'POST', body: { action } });
      toast(action === 'accept' ? 'Devis accepté.' : 'Devis refusé.', 'success');
      setRespondModal(null);
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur inconnue.', 'error');
    } finally {
      setResponding(false);
    }
  }

  async function convert() {
    if (!quote) return;
    setConverting(true);
    try {
      const res = await api<{ intervention: { id: string } }>(`/api/quotes/${quote.id}/convert`, {
        method: 'POST',
      });
      toast('Intervention créée.', 'success');
      router.push(`/interventions/${res.intervention.id}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur inconnue.', 'error');
    } finally {
      setConverting(false);
    }
  }

  async function shareViaWhatsApp() {
    if (!quote) return;
    setSharing(true);
    try {
      const result = await sharePdfViaWhatsApp({
        pdfUrl: `/api/quotes/${quote.id}/pdf`,
        filename: `Devis-${quote.reference}.pdf`,
        phone: quote.client.phone,
        text: `Bonjour ${quote.client.name}, voici votre devis ${quote.reference} (${formatFCFA(quote.amount)}).`,
      });
      if (result === 'error') {
        toast('Impossible de récupérer le PDF pour le moment.', 'error');
      }
    } finally {
      setSharing(false);
    }
  }

  const expired = quote
    ? quote.validUntil && new Date(quote.validUntil).getTime() < Date.now()
    : false;

  return (
    <div className="flex bg-background min-h-screen">
      <Sidebar active="quotes" />

      <div className="flex flex-col flex-1 min-w-0">
        <div className="bg-surface border-b border-border px-4 py-4 lg:px-6 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggle}
              aria-label="Ouvrir le menu"
              className="lg:hidden w-9 h-9 flex items-center justify-center rounded-sm border border-border text-foreground shrink-0"
            >
              <Icon i="menu" size={18} />
            </button>
            <button
              type="button"
              onClick={() => router.push('/quotes')}
              className="text-muted-foreground text-sm flex items-center gap-1"
            >
              <Icon i="chevron-left" size={14} />
              Retour
            </button>
            <span className="text-muted-foreground">/</span>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-widest">
                Détail du devis
              </div>
              <div className="text-lg font-bold font-headings text-foreground">
                {quote ? `${quote.reference} · ${quote.client.name}` : '…'}
              </div>
            </div>
          </div>
          {quote && (
            <div className="flex items-center gap-2 flex-wrap">
              {quote.status === 'DRAFT' && (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={sending}
                  onClick={() => void sendToClient()}
                >
                  <Icon i="send" size={14} />
                  {sending ? 'Envoi…' : 'Envoyer au client'}
                </Button>
              )}
              {quote.status === 'SENT' && !expired && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={responding}
                    onClick={() => setRespondModal('reject')}
                  >
                    <Icon i="x" size={14} />
                    Refusé par le client
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={responding}
                    onClick={() => setRespondModal('accept')}
                  >
                    <Icon i="circle-check" size={14} />
                    Accepté par le client
                  </Button>
                </>
              )}
              {quote.status === 'ACCEPTED' && !quote.interventionId && (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={converting}
                  onClick={() => void convert()}
                >
                  <Icon i="wrench" size={14} />
                  {converting ? 'Conversion…' : 'Convertir en intervention'}
                </Button>
              )}
              {quote.interventionId && (
                <Link
                  href={`/interventions/${quote.interventionId}`}
                  className="text-primary text-sm font-medium flex items-center gap-1"
                >
                  <Icon i="wrench" size={14} />
                  Voir l&apos;intervention
                </Link>
              )}
              {(quote.status === 'SENT' || quote.status === 'ACCEPTED') && (
                <button
                  type="button"
                  onClick={() => void copyRespondLink()}
                  className="text-primary text-sm font-medium flex items-center gap-1"
                >
                  <Icon i="link" size={14} />
                  Copier le lien
                </button>
              )}
              <a
                href={`/api/quotes/${quote.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="text-primary text-sm font-medium flex items-center gap-1"
              >
                <Icon i="download" size={14} />
                Télécharger
              </a>
              <button
                type="button"
                onClick={() => void shareViaWhatsApp()}
                disabled={sharing}
                className="text-primary text-sm font-medium flex items-center gap-1 disabled:opacity-50"
              >
                <Icon i="share-2" size={14} />
                {sharing ? 'Partage…' : 'Partager'}
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex-1 overflow-y-auto">
            <SkeletonDocument />
          </div>
        ) : error ? (
          <p className="text-sm text-warning p-6">{error}</p>
        ) : (
          quote && (
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-5xl mx-auto p-6 flex flex-col gap-6">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <Badge tone={STATUS_TONE[quote.status]}>
                      {QUOTE_STATUS_LABEL[quote.status]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Émis le {new Date(quote.createdAt).toLocaleDateString('fr-FR')} · Valable
                      jusqu&apos;au {new Date(quote.validUntil).toLocaleDateString('fr-FR')}
                      {expired && quote.status === 'SENT' ? ' (expiré)' : ''}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 flex flex-col gap-6 min-w-0">
                    <div className="bg-surface border border-border rounded-md p-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                        <div>
                          <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
                            Client
                          </div>
                          <div className="text-sm font-bold text-foreground">
                            {quote.client.name}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {quote.client.phone}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
                            Véhicule
                          </div>
                          <div className="text-sm font-bold text-foreground">
                            {quote.vehicle.brand} {quote.vehicle.model}
                            {quote.vehicle.year ? ` ${quote.vehicle.year}` : ''}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Plaque : {quote.vehicle.registration}
                            {quote.vehicle.mileage
                              ? ` · ${quote.vehicle.mileage.toLocaleString('fr-FR')} km`
                              : ''}
                          </div>
                        </div>
                      </div>

                      <div className="mb-6">
                        <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
                          Travaux
                        </div>
                        <div className="text-sm text-foreground bg-input rounded-md px-4 py-3">
                          {quote.work}
                        </div>
                      </div>

                      {quote.parts.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs min-w-[500px]">
                            <thead>
                              <tr className="border-b border-border text-muted-foreground">
                                <th className="text-left py-2 font-medium">Désignation</th>
                                <th className="text-center py-2 font-medium">Qté</th>
                                <th className="text-right py-2 font-medium">P.U. (FCFA)</th>
                                <th className="text-right py-2 font-medium">Total (FCFA)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {quote.parts.map((p) => (
                                <tr
                                  key={p.id}
                                  className="border-b border-border/50 last:border-b-0"
                                >
                                  <td className="py-2.5 text-foreground font-medium">{p.name}</td>
                                  <td className="py-2.5 text-center text-muted-foreground">
                                    {p.quantity} {p.unit}
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
                    </div>

                    <div className="bg-surface border border-border rounded-md p-5">
                      <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-4">
                        Historique
                      </div>
                      <div className="flex flex-col gap-4">
                        <div className="flex items-start gap-3">
                          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 shrink-0 mt-0.5">
                            <Icon i="file-check" size={14} className="text-primary" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-foreground">Devis créé</div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(quote.createdAt).toLocaleString('fr-FR')}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <div
                            className={`flex items-center justify-center w-7 h-7 rounded-full shrink-0 mt-0.5 ${
                              quote.sentAt ? 'bg-success/10' : 'bg-muted'
                            }`}
                          >
                            <Icon
                              i={quote.sentAt ? 'send' : 'clock'}
                              size={14}
                              className={quote.sentAt ? 'text-success' : 'text-muted-foreground'}
                            />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-foreground">
                              {quote.sentAt ? 'Envoyé au client' : 'Pas encore envoyé'}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {quote.sentAt
                                ? new Date(quote.sentAt).toLocaleString('fr-FR')
                                : 'Utilisez "Envoyer au client" ci-dessus.'}
                            </div>
                          </div>
                        </div>
                        {quote.respondedAt && (
                          <div className="flex items-start gap-3">
                            <div
                              className={`flex items-center justify-center w-7 h-7 rounded-full shrink-0 mt-0.5 ${
                                quote.status === 'ACCEPTED' ? 'bg-success/10' : 'bg-accent/10'
                              }`}
                            >
                              <Icon
                                i={quote.status === 'ACCEPTED' ? 'circle-check' : 'x'}
                                size={14}
                                className={
                                  quote.status === 'ACCEPTED' ? 'text-success' : 'text-accent'
                                }
                              />
                            </div>
                            <div>
                              <div className="text-sm font-medium text-foreground">
                                {quote.status === 'ACCEPTED' ? 'Accepté' : 'Refusé'}
                                {quote.respondedByName ? ` · ${quote.respondedByName}` : ''}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(quote.respondedAt).toLocaleString('fr-FR')}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4">
                    <div className="bg-primary/5 border border-primary/10 rounded-md p-5">
                      <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-4">
                        Résumé financier
                      </div>
                      <div className="space-y-2.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">Main-d&apos;œuvre</span>
                          <span className="font-medium text-foreground">
                            {quote.laborAmount.toLocaleString('fr-FR')}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">Pièces</span>
                          <span className="font-medium text-foreground">
                            {quote.partsAmount.toLocaleString('fr-FR')}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs border-t border-primary/10 pt-2.5">
                          <span className="text-muted-foreground">Sous-total HT</span>
                          <span className="font-medium text-foreground">
                            {quote.subtotal.toLocaleString('fr-FR')}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">TVA {quote.taxRatePct}%</span>
                          <span className="font-medium text-foreground">
                            {quote.taxAmount.toLocaleString('fr-FR')}
                          </span>
                        </div>
                        <div className="flex justify-between items-center border-t border-primary/10 pt-2.5">
                          <span className="font-medium text-foreground">Total TTC</span>
                          <span className="text-lg font-bold text-primary">
                            {formatFCFA(quote.amount)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {quote.notes && (
                      <div className="bg-surface border border-border rounded-md p-5">
                        <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
                          Notes internes
                        </div>
                        <p className="text-sm text-foreground whitespace-pre-wrap">{quote.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        )}
      </div>

      <Modal
        open={respondModal !== null}
        onClose={() => setRespondModal(null)}
        title={respondModal === 'accept' ? 'Marquer comme accepté ?' : 'Marquer comme refusé ?'}
        icon={respondModal === 'accept' ? 'circle-check' : 'x'}
      >
        <p className="text-sm text-muted-foreground mb-6">
          À utiliser quand le client a répondu par téléphone ou en personne plutôt qu&apos;en
          cliquant sur le lien du devis.
        </p>
        <div className="flex gap-3">
          <Button
            variant={respondModal === 'accept' ? 'primary' : 'destructive'}
            disabled={responding}
            className="flex-1 justify-center"
            onClick={() => respondModal && void respond(respondModal)}
          >
            {responding ? 'Enregistrement…' : 'Confirmer'}
          </Button>
          <Button
            variant="outline"
            disabled={responding}
            className="flex-1 justify-center"
            onClick={() => setRespondModal(null)}
          >
            Annuler
          </Button>
        </div>
      </Modal>
    </div>
  );
}
