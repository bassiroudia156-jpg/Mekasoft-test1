// Ported from Banani InvoiceDetailsFromEmail — embeds the shared
// InvoiceDocument preview + a 2-entry history timeline (created/
// email-sent) + status/client/financial-summary cards (structure map
// item 3, phase-6-invoices.md).
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useMobileSidebar } from '@/contexts/MobileSidebarContext';
import { useRefetchOnFocus } from '@/lib/useRefetchOnFocus';
import { useCallerOrganization } from '@/lib/useCallerOrganization';
import Sidebar from '@/components/layout/Sidebar';
import Badge, { type BadgeTone } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import RadioCard from '@/components/ui/RadioCard';
import Icon from '@/components/ui/Icon';
import InvoiceDocument from '@/components/invoices/InvoiceDocument';
import ResendInvoiceModal from '@/components/invoices/ResendInvoiceModal';
import { type InvoiceStatus } from '@/components/invoices/InvoiceRow';

interface InvoiceDetail {
  id: string;
  reference: string;
  status: InvoiceStatus;
  description: string;
  subtotal: number;
  taxRatePct: number;
  taxAmount: number;
  amount: number;
  paymentTerms: string;
  issueDate: string;
  dueDate: string;
  notes: string | null;
  emailSentAt: string | null;
  emailSentTo: string | null;
  createdAt: string;
  client: { id: string; name: string; phone: string; email: string | null };
  intervention: { id: string; reference: string };
  organization: { name: string; phone: string | null; city: string | null };
}

const STATUS_TONE: Record<InvoiceStatus, BadgeTone> = {
  Émise: 'primary',
  Payée: 'success',
  'En attente': 'warning',
};

const STATUS_OPTIONS: InvoiceStatus[] = ['Émise', 'Payée', 'En attente'];

// Standard `wa.me` share-intent link — opens WhatsApp with the message
// pre-filled and lets the user pick a recipient themselves (no WhatsApp
// Business API integration, no public/unauthenticated invoice link to
// build and secure — the PDF stays behind the same auth as everything
// else; the invoice's own numbers are enough context to share).
function whatsappShareUrl(invoice: InvoiceDetail): string {
  const lines = [
    `Facture ${invoice.reference} — ${invoice.organization.name}`,
    `Client : ${invoice.client.name}`,
    `Montant : ${invoice.amount.toLocaleString('fr-FR')} FCFA`,
    `Statut : ${invoice.status}`,
    `Échéance : ${new Date(invoice.dueDate).toLocaleDateString('fr-FR')}`,
  ];
  return `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;
}

export default function InvoiceDetailPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const { toggle } = useMobileSidebar();
  const params = useParams<{ id: string }>();
  const { plan } = useCallerOrganization(!!user);
  const canShareWhatsapp = plan === 'PRO' || plan === 'BUSINESS';

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<InvoiceStatus | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [resendOpen, setResendOpen] = useState(false);

  async function load() {
    try {
      const res = await api<{ invoice: InvoiceDetail }>(`/api/invoices/${params.id}`);
      setInvoice(res.invoice);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404 ? 'Facture introuvable.' : 'Erreur inconnue.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, params.id]);

  // Audit request (2026-08-18): keep this page current without a manual
  // reload — silently re-fetch when the tab regains focus.
  useRefetchOnFocus(() => {
    if (user) void load();
  });

  if (!user) return null;

  async function changeStatus(status: InvoiceStatus) {
    if (!invoice) return;
    const previous = invoice;
    setSavingStatus(true);
    // Optimistic (audit request, 2026-08-18) — flip the status locally
    // right away; roll back + toast if the PATCH actually fails.
    setInvoice({ ...previous, status });
    setStatusModalOpen(false);
    try {
      await api(`/api/invoices/${params.id}`, { method: 'PATCH', body: { status } });
      toast('Statut mis à jour.', 'success');
    } catch (err) {
      setInvoice(previous);
      toast(err instanceof ApiError ? err.message : 'Erreur inconnue.', 'error');
    } finally {
      setSavingStatus(false);
    }
  }

  return (
    <div className="flex bg-background min-h-screen">
      <Sidebar active="invoices" />

      <div className="flex flex-col flex-1">
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
              onClick={() => router.push('/invoices')}
              className="text-muted-foreground text-sm flex items-center gap-1"
            >
              <Icon i="chevron-left" size={14} />
              Retour
            </button>
            <span className="text-muted-foreground">/</span>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-widest">
                Détail de la facture
              </div>
              <div className="text-lg font-bold font-headings text-foreground">
                {invoice ? `${invoice.reference} · ${invoice.client.name}` : '…'}
              </div>
            </div>
          </div>
          {invoice && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setResendOpen(true)}
                className="text-primary text-sm font-medium flex items-center gap-1"
              >
                <Icon i="send" size={14} />
                Renvoyer
              </button>
              <Link
                href={`/invoices/${invoice.id}/print`}
                className="text-primary text-sm font-medium flex items-center gap-1"
              >
                <Icon i="printer" size={14} />
                Imprimer
              </Link>
              <a
                href={`/api/invoices/${invoice.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="text-primary text-sm font-medium flex items-center gap-1"
              >
                <Icon i="download" size={14} />
                Télécharger
              </a>
              {canShareWhatsapp ? (
                <a
                  href={whatsappShareUrl(invoice)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-success text-sm font-medium flex items-center gap-1"
                >
                  <Icon i="message-circle" size={14} />
                  WhatsApp
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    toast('Le partage WhatsApp est réservé aux plans Pro et Business.', 'info')
                  }
                  className="text-muted-foreground text-sm font-medium flex items-center gap-1"
                >
                  <Icon i="lock" size={14} />
                  WhatsApp
                </button>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground p-6">Chargement…</p>
        ) : error ? (
          <p className="text-sm text-warning p-6">{error}</p>
        ) : (
          invoice && (
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-5xl mx-auto p-6 flex flex-col gap-6">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <Badge tone={STATUS_TONE[invoice.status]}>{invoice.status}</Badge>
                    <span className="text-xs text-muted-foreground">
                      Émise le {new Date(invoice.issueDate).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPendingStatus(invoice.status);
                      setStatusModalOpen(true);
                    }}
                  >
                    Modifier le statut
                  </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 flex flex-col gap-6 min-w-0">
                    <div className="bg-muted/30 rounded-md p-4 sm:p-6 flex justify-center overflow-x-auto">
                      <InvoiceDocument
                        data={{
                          reference: invoice.reference,
                          issueDate: invoice.issueDate,
                          dueDate: invoice.dueDate,
                          paymentTerms: invoice.paymentTerms,
                          organization: invoice.organization,
                          client: invoice.client,
                          description: invoice.description,
                          subtotal: invoice.subtotal,
                          taxRatePct: invoice.taxRatePct,
                          taxAmount: invoice.taxAmount,
                          amount: invoice.amount,
                          notes: invoice.notes,
                        }}
                      />
                    </div>

                    <div className="bg-surface border border-border rounded-md p-5">
                      <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-4">
                        Historique
                      </div>
                      <div className="flex flex-col gap-4">
                        <div className="flex items-start gap-3">
                          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 shrink-0 mt-0.5">
                            <Icon i="file-text" size={14} className="text-primary" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-foreground">Facture créée</div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(invoice.createdAt).toLocaleString('fr-FR')} · Intervention{' '}
                              {invoice.intervention.reference}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <div
                            className={`flex items-center justify-center w-7 h-7 rounded-full shrink-0 mt-0.5 ${
                              invoice.emailSentAt ? 'bg-success/10' : 'bg-muted'
                            }`}
                          >
                            <Icon
                              i={invoice.emailSentAt ? 'send' : 'clock'}
                              size={14}
                              className={
                                invoice.emailSentAt ? 'text-success' : 'text-muted-foreground'
                              }
                            />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-foreground">
                              {invoice.emailSentAt ? 'Email envoyé' : 'Email en attente d’envoi'}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {invoice.emailSentAt
                                ? `${new Date(invoice.emailSentAt).toLocaleString('fr-FR')} · à ${invoice.emailSentTo}`
                                : 'Sera envoyé automatiquement, ou via "Renvoyer" ci-dessus.'}
                            </div>
                          </div>
                        </div>
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
                          <span className="text-muted-foreground">Sous-total HT</span>
                          <span className="font-medium text-foreground">
                            {invoice.subtotal.toLocaleString('fr-FR')}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">TVA {invoice.taxRatePct}%</span>
                          <span className="font-medium text-foreground">
                            {invoice.taxAmount.toLocaleString('fr-FR')}
                          </span>
                        </div>
                        <div className="border-t border-primary/10 pt-2.5 flex justify-between items-center">
                          <span className="font-medium text-foreground">Total TTC</span>
                          <span className="text-lg font-bold text-primary">
                            {invoice.amount.toLocaleString('fr-FR')}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">FCFA</div>
                      </div>
                      {invoice.status !== 'Payée' && (
                        <Link href={`/payments/new?invoiceId=${invoice.id}`}>
                          <Button variant="accent" size="sm" className="w-full justify-center mt-4">
                            <Icon i="banknote" size={14} />
                            Enregistrer un paiement
                          </Button>
                        </Link>
                      )}
                    </div>

                    <div className="bg-surface border border-border rounded-md p-5">
                      <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
                        Client
                      </div>
                      <div className="text-sm font-medium text-foreground">
                        {invoice.client.name}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {invoice.client.phone}
                      </div>
                      {invoice.client.email && (
                        <div className="text-xs text-muted-foreground">{invoice.client.email}</div>
                      )}
                      <Link
                        href={`/clients/${invoice.client.id}`}
                        className="text-xs text-primary font-medium mt-3 inline-block"
                      >
                        Voir le profil client →
                      </Link>
                    </div>

                    <div className="bg-surface border border-border rounded-md p-5">
                      <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
                        Conditions
                      </div>
                      <div className="text-xs text-muted-foreground">Paiement</div>
                      <div className="text-sm font-medium text-foreground mb-2">
                        {invoice.paymentTerms}
                      </div>
                      <div className="text-xs text-muted-foreground">Échéance</div>
                      <div className="text-sm font-medium text-foreground">
                        {new Date(invoice.dueDate).toLocaleDateString('fr-FR')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        )}
      </div>

      <Modal
        open={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        title="Modifier le statut"
        icon="file-text"
        maxWidth="md"
      >
        <div className="flex flex-col gap-3">
          {STATUS_OPTIONS.map((s) => (
            <RadioCard
              key={s}
              label={s}
              selected={pendingStatus === s}
              onClick={() => setPendingStatus(s)}
            />
          ))}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setStatusModalOpen(false)}
              disabled={savingStatus}
              className="flex-1 justify-center"
            >
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={() => pendingStatus && void changeStatus(pendingStatus)}
              disabled={savingStatus || !pendingStatus}
              className="flex-1 justify-center"
            >
              {savingStatus ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </Modal>

      {invoice && (
        <ResendInvoiceModal
          invoiceId={invoice.id}
          invoiceReference={invoice.reference}
          clientEmail={invoice.client.email}
          open={resendOpen}
          onClose={() => setResendOpen(false)}
          onSent={() => void load()}
        />
      )}
    </div>
  );
}
