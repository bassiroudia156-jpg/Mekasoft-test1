// Ported from Banani InvoicePrintPreview + InvoicePrintFromList (identical
// screens) — "Lancer l'impression" still calls window.print() (browser-
// native, offers "Save as PDF"), but "Télécharger PDF" now opens the real
// `/api/invoices/[id]/pdf` route instead of faking it via window.print()
// the way Phase 5's devis page had to (decision #1, phase-6-invoices.md —
// @react-pdf/renderer finally lands this phase).
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useMobileSidebar } from '@/contexts/MobileSidebarContext';
import Sidebar from '@/components/layout/Sidebar';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import InvoiceDocument, { type InvoiceDocumentData } from '@/components/invoices/InvoiceDocument';

export default function InvoicePrintPage() {
  const user = useUser();
  const { toast } = useToast();
  const { toggle } = useMobileSidebar();
  const params = useParams<{ id: string }>();

  const [data, setData] = useState<InvoiceDocumentData | null>(null);
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ invoice: InvoiceDocumentData & { reference: string } }>(
          `/api/invoices/${params.id}`,
        );
        if (!cancelled) {
          setData(res.invoice);
          setReference(res.invoice.reference);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError && err.status === 404
              ? 'Facture introuvable.'
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
  }, [user, params.id]);

  useEffect(() => {
    function handleAfterPrint() {
      toast('Impression terminée.', 'info');
    }
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, [toast]);

  if (!user) return null;

  return (
    <div className="flex bg-background min-h-screen">
      <div className="print-hide">
        <Sidebar active="invoices" />
      </div>

      <div className="flex flex-col flex-1 min-w-0">
        <div className="print-hide bg-surface border-b border-border px-4 py-4 lg:px-6 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggle}
              aria-label="Ouvrir le menu"
              className="lg:hidden w-9 h-9 flex items-center justify-center rounded-sm border border-border text-foreground shrink-0"
            >
              <Icon i="menu" size={18} />
            </button>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-widest">
                Imprimer la facture
              </div>
              <div className="text-lg font-bold font-headings text-foreground">
                {reference ? `${reference} · Aperçu avant impression` : '…'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href={`/api/invoices/${params.id}/pdf`} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm">
                <Icon i="download" size={14} />
                Télécharger PDF
              </Button>
            </a>
            <Button variant="primary" size="sm" onClick={() => window.print()}>
              <Icon i="printer" size={14} />
              Lancer l&apos;impression
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="print-hide text-sm text-muted-foreground p-6">Chargement…</p>
        ) : error ? (
          <p className="print-hide text-sm text-warning p-6">{error}</p>
        ) : (
          data && (
            <div className="flex-1 overflow-y-auto bg-muted/30 flex items-start justify-center py-8 px-4">
              <InvoiceDocument data={data} />
            </div>
          )
        )}
      </div>
    </div>
  );
}
