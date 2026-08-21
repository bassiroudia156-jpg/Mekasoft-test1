// Ported from Banani InvoicesList, with AfterCreation/AfterEmailSent
// collapsing into the real ToastContext (not Banani's bespoke inline
// banners) and ContextMenu becoming a real InvoiceRowMenu dropdown —
// see phase-6-invoices.md structure map item 1.
'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useRefetchOnFocus } from '@/lib/useRefetchOnFocus';
import Sidebar from '@/components/layout/Sidebar';
import InvoiceRow, { type InvoiceStatus } from '@/components/invoices/InvoiceRow';
import ResendInvoiceModal from '@/components/invoices/ResendInvoiceModal';
import { SkeletonInvoiceRow } from '@/components/ui/Skeleton';
import PageHeader from '@/components/ui/PageHeader';
import FilterButton from '@/components/ui/FilterButton';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import AnimatedNumber from '@/components/ui/AnimatedNumber';

interface InvoiceListItem {
  id: string;
  reference: string;
  client: string;
  description: string;
  amount: number;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  createdAt: string;
  emailSentAt: string | null;
}

type StatusFilter = 'all' | InvoiceStatus;

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Toutes' },
  { key: 'Émise', label: 'Émise' },
  { key: 'En attente', label: 'En attente' },
  { key: 'Payée', label: 'Payée' },
];

function formatAmount(n: number): string {
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

function InvoicesListBody() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const createdId = searchParams.get('created');

  const [items, setItems] = useState<InvoiceListItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({ total: 0 });
  const [totalAmount, setTotalAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const loadSeq = useRef(0);

  const [deleteTarget, setDeleteTarget] = useState<InvoiceListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [resendTarget, setResendTarget] = useState<InvoiceListItem | null>(null);

  // 2026-08-18 audit fix: this search box fired an immediate request on
  // every keystroke, with no protection against out-of-order responses —
  // a slower response to an earlier keystroke could land after a faster
  // one for a later keystroke and silently show results that don't match
  // what's actually typed. Debouncing `q` into `qDebounced` cuts the
  // request volume; `loadSeq` below closes the race regardless of timing.
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q]);

  async function load() {
    const seq = ++loadSeq.current;
    setLoading(true);
    const params = new URLSearchParams();
    if (qDebounced) params.set('q', qDebounced);
    if (status !== 'all') params.set('status', status);
    try {
      const res = await api<{
        items: InvoiceListItem[];
        counts: Record<string, number>;
        totalAmount: number;
      }>(`/api/invoices?${params.toString()}`);
      if (loadSeq.current !== seq) return; // a newer load() superseded this one
      setItems(res.items);
      setCounts(res.counts);
      setTotalAmount(res.totalAmount);
      setError(null);
    } catch (err) {
      if (loadSeq.current !== seq) return;
      // Audit fix (2026-08-17): no catch at all previously — a failed fetch
      // silently rendered "Aucune facture" as if the list were genuinely
      // empty.
      setError(err instanceof ApiError ? err.message : 'Impossible de charger les factures.');
    } finally {
      if (loadSeq.current === seq) setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, qDebounced, status]);

  useEffect(() => {
    if (createdId) toast('Facture créée et envoyée au client.', 'success');
  }, [createdId, toast]);

  // Audit request (2026-08-18): keep an already-open list current without
  // needing a manual reload — silently re-fetch when the tab regains focus.
  useRefetchOnFocus(() => {
    if (user) void load();
  });

  if (!user) return null;

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleting(true);
    // Optimistic removal (audit request, 2026-08-18) — same pattern as
    // vehicles/page.tsx: drop the row immediately, roll back via a full
    // reload if the DELETE actually fails.
    setItems((prev) => prev.filter((i) => i.id !== target.id));
    setCounts((prev) => ({
      ...prev,
      total: (prev.total ?? 0) - 1,
      [target.status]: (prev[target.status] ?? 0) - 1,
    }));
    setTotalAmount((prev) => prev - target.amount);
    setDeleteTarget(null);
    try {
      await api(`/api/invoices/${target.id}`, { method: 'DELETE' });
      toast(`Facture ${target.reference} supprimée.`, 'success');
    } catch (err) {
      await load();
      toast(err instanceof ApiError ? err.message : 'Erreur inconnue.', 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex bg-background min-h-screen">
      <Sidebar active="invoices" />

      <div className="flex flex-col flex-1 min-w-0">
        <PageHeader
          eyebrow="Factures"
          title="Toutes les factures"
          action={
            <Link href="/invoices/new">
              <Button variant="accent">
                <Icon i="plus" size={14} />
                Nouvelle facture
              </Button>
            </Link>
          }
        />

        <div className="bg-surface border-b border-border px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Icon
                i="search"
                size={14}
                className="text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2"
              />
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Chercher client, référence…"
                className="w-full pl-10 pr-3 py-2 border border-border bg-input rounded-md text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <Icon i="list-filter" size={14} className="text-muted-foreground" />
            <div className="flex gap-2 flex-wrap">
              {STATUS_FILTERS.map((f) => (
                <FilterButton
                  key={f.key}
                  label={f.label}
                  active={status === f.key}
                  count={f.key === 'all' ? (counts.total ?? 0) : (counts[f.key] ?? 0)}
                  onClick={() => setStatus(f.key)}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-6 text-xs border-l border-border pl-4">
            <div>
              <span className="text-muted-foreground">Total</span>
              <div className="font-bold text-foreground text-base">
                <AnimatedNumber value={counts.total ?? 0} />
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Montant</span>
              <div className="font-bold text-foreground text-base">
                <AnimatedNumber value={totalAmount} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col">
          <div className="bg-surface border border-border rounded-md overflow-hidden m-4 lg:m-6 flex flex-col flex-1">
            <div className="overflow-x-auto">
              <div className="flex items-center gap-4 px-5 py-3 border-b border-border bg-background shrink-0 min-w-[880px]">
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground w-24 shrink-0">
                  N°
                </div>
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground flex-1">
                  Client
                </div>
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground w-28 shrink-0">
                  Date
                </div>
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground w-32 text-right shrink-0">
                  Montant
                </div>
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground w-24 shrink-0">
                  Statut
                </div>
                <div className="w-14 shrink-0" />
                <div className="w-8 shrink-0" />
              </div>

              <div className="flex-1 min-w-[880px]">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => <SkeletonInvoiceRow key={i} />)
                ) : error ? (
                  <p role="alert" className="text-sm text-warning p-5">
                    {error}
                  </p>
                ) : items.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-5">
                    Aucune facture pour l&apos;instant.
                  </p>
                ) : (
                  items.map((row) => (
                    <div key={row.id} className={row.id === createdId ? 'bg-success/5' : undefined}>
                      <InvoiceRow
                        reference={row.reference}
                        client={row.client}
                        description={row.description}
                        date={new Date(row.createdAt).toLocaleDateString('fr-FR')}
                        amount={formatAmount(row.amount)}
                        status={row.status}
                        onView={() => router.push(`/invoices/${row.id}`)}
                        onDownloadPdf={() => window.open(`/api/invoices/${row.id}/pdf`, '_blank')}
                        onPrint={() => router.push(`/invoices/${row.id}/print`)}
                        onResend={() => setResendTarget(row)}
                        onDelete={() => setDeleteTarget(row)}
                      />
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-background shrink-0">
              <span className="text-xs text-muted-foreground">
                Affichage {items.length} sur {counts.total ?? 0} factures
              </span>
            </div>
          </div>
        </div>
      </div>

      {resendTarget && (
        <ResendInvoiceModal
          invoiceId={resendTarget.id}
          invoiceReference={resendTarget.reference}
          clientEmail={null}
          open={!!resendTarget}
          onClose={() => setResendTarget(null)}
          onSent={() => void load()}
        />
      )}

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="md">
        {deleteTarget && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-destructive/10">
                <Icon i="triangle-alert" size={20} className="text-destructive" />
              </div>
              <div className="text-base font-bold font-headings text-foreground">
                Supprimer la facture ?
              </div>
            </div>

            <div className="bg-destructive/5 border border-destructive/20 rounded-md px-4 py-3">
              <p className="text-sm text-foreground">
                Vous êtes sur le point de supprimer
                <br />
                <span className="font-bold">
                  {deleteTarget.reference} · {deleteTarget.client}
                </span>
              </p>
            </div>

            <div className="text-xs text-muted-foreground">
              Cette action ne peut pas être annulée.
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 justify-center"
              >
                Annuler
              </Button>
              <Button
                variant="destructive"
                onClick={() => void confirmDelete()}
                disabled={deleting}
                className="flex-1 justify-center"
              >
                {deleting ? 'Suppression…' : 'Supprimer'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function InvoicesPage() {
  return (
    <Suspense fallback={null}>
      <InvoicesListBody />
    </Suspense>
  );
}
