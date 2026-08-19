// Ported from Banani PrintDevis + PrintDevisDownloaded + PrintSent — one
// page, since both "success" screens are the identical document with a
// toast banner layered on top.
//
// "Lancer l'impression" and "Télécharger PDF" both call window.print()
// (browser-native — offers "Save as PDF" as a destination). Real
// server-side PDF generation (@react-pdf/renderer) is scoped to Phase 6
// per IMPLEMENTATION-PLAN.md; faking a "PDF téléchargé avec succès" toast
// here would assert an outcome we can't actually observe (print vs.
// save-as-PDF vs. cancel look identical to the page), so instead this
// listens for the standard `afterprint` event and shows a neutral
// confirmation once the print dialog closes.
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

interface DevisData {
  reference: string;
  createdAt: string;
  client: { name: string; phone: string };
  vehicle: {
    brand: string;
    model: string;
    year: number | null;
    registration: string;
    mileage: number | null;
  };
  work: string;
  parts: { name: string; quantity: number; unitPrice: number; total: number }[];
  laborAmount: number;
  partsAmount: number;
  taxRatePct: number;
  taxAmount: number;
  subtotal: number;
  amount: number;
}

export default function InterventionDevisPage() {
  const user = useUser();
  const { toast } = useToast();
  const { toggle } = useMobileSidebar();
  const params = useParams<{ id: string }>();

  const [data, setData] = useState<DevisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ intervention: DevisData }>(`/api/interventions/${params.id}`);
        if (!cancelled) setData(res.intervention);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError && err.status === 404
              ? 'Intervention introuvable.'
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
        <Sidebar active="interventions" />
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
                Imprimer le devis
              </div>
              <div className="text-lg font-bold font-headings text-foreground">
                {data ? `${data.reference} · Aperçu avant impression` : '…'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Icon i="download" size={14} />
              Télécharger PDF
            </Button>
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
              <div className="print-document bg-background border border-border rounded-md w-full max-w-[720px] overflow-x-auto">
                <div className="border-b border-border px-10 py-8 flex items-start justify-between flex-wrap gap-4">
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
                    <div className="text-base font-bold text-foreground">MekaSoft Garage</div>
                    <div className="text-xs text-muted-foreground mt-1">Dakar, Sénégal</div>
                  </div>
                </div>

                <div className="px-10 py-6 grid grid-cols-1 sm:grid-cols-2 gap-8 border-b border-border">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
                      Client
                    </div>
                    <div className="text-sm font-bold text-foreground">{data.client.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">{data.client.phone}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
                      Véhicule
                    </div>
                    <div className="text-sm font-bold text-foreground">
                      {data.vehicle.brand} {data.vehicle.model}
                      {data.vehicle.year ? ` ${data.vehicle.year}` : ''}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Plaque : {data.vehicle.registration}
                      {data.vehicle.mileage
                        ? ` · ${data.vehicle.mileage.toLocaleString('fr-FR')} km`
                        : ''}
                    </div>
                  </div>
                </div>

                <div className="px-10 py-6 border-b border-border">
                  <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
                    Travaux à effectuer
                  </div>
                  <div className="text-sm text-foreground bg-input rounded-md px-4 py-3">
                    {data.work}
                  </div>
                </div>

                {data.parts.length > 0 && (
                  <div className="px-10 py-6 border-b border-border">
                    <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-4">
                      Pièces de rechange
                    </div>
                    <table className="w-full text-xs">
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

                <div className="px-10 py-6 border-b border-border">
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
                      <span className="text-muted-foreground">Pièces détachées</span>
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
                      <span className="text-foreground">
                        {data.amount.toLocaleString('fr-FR')} FCFA
                      </span>
                    </div>
                  </div>
                </div>

                <div className="px-10 py-8">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
                        Validité du devis
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Ce devis est valable 30 jours à compter de sa date d&apos;émission.
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-8">
                        Signature client
                      </div>
                      <div className="border-b border-border w-48" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
