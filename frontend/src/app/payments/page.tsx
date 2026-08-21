// Ported from Banani PaymentsManagement. Unlike every other list page's
// create-success feedback (a transient real toast), `AfterCancellation`
// here keeps its own persistent, manually-dismissible banner — Banani's
// own mock shows an explicit "x" close affordance, which the auto-timeout
// ToastContext doesn't offer, so the inline banner is the more faithful
// translation for this one designed state. See phase-7-payments.md
// structure map item 1.
//
// 2026-08-18 audit fix: the row "..." grew a real "Marquer comme payé /
// en attente" action (see PaymentRowMenu) — a Virement bancaire/Chèque
// payment is created `En attente` and previously had no way to ever flip
// to `Payé` once it actually cleared.
'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useRefetchOnFocus } from '@/lib/useRefetchOnFocus';
import Sidebar from '@/components/layout/Sidebar';
import { SkeletonPaymentRow } from '@/components/ui/Skeleton';
import PaymentRow, {
  type PaymentStatus,
  type PaymentMethod,
} from '@/components/payments/PaymentRow';
import PageHeader from '@/components/ui/PageHeader';
import FilterButton from '@/components/ui/FilterButton';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import AnimatedNumber from '@/components/ui/AnimatedNumber';

interface PaymentListItem {
  id: string;
  reference: string;
  invoiceReference: string;
  client: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  paymentDate: string;
  createdAt: string;
}

interface Stats {
  toCollect: { amount: number; count: number };
  paidThisMonth: { amount: number; count: number };
  recoveryRatePct: number;
  overdueInvoices: number;
}

type StatusFilter = 'all' | PaymentStatus;

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'Payé', label: 'Payés' },
  { key: 'En attente', label: 'En attente' },
];

function formatAmount(n: number): string {
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

function PaymentsListBody() {
  const user = useUser();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const cancelled = searchParams.get('cancelled') === '1';

  const [items, setItems] = useState<PaymentListItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({ total: 0 });
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [showCancelled, setShowCancelled] = useState(cancelled);
  const loadSeq = useRef(0);

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
        items: PaymentListItem[];
        counts: Record<string, number>;
        stats: Stats;
      }>(`/api/payments?${params.toString()}`);
      if (loadSeq.current !== seq) return; // a newer load() superseded this one
      setItems(res.items);
      setCounts(res.counts);
      setStats(res.stats);
      setError(null);
    } catch (err) {
      if (loadSeq.current !== seq) return;
      // Audit fix (2026-08-17): no catch at all previously — a failed
      // fetch silently rendered "Aucun paiement" as if the list were
      // genuinely empty.
      setError(err instanceof ApiError ? err.message : 'Impossible de charger les paiements.');
    } finally {
      if (loadSeq.current === seq) setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, qDebounced, status]);

  // Audit request (2026-08-18): keep an already-open list current without
  // needing a manual reload — silently re-fetch when the tab regains focus.
  useRefetchOnFocus(() => {
    if (user) void load();
  });

  if (!user) return null;

  // 2026-08-18 audit fix: "Marquer comme payé"/"...en attente" from
  // PaymentRowMenu. Optimistic row flip for instant feedback, then a
  // silent full reload to reconcile `counts`/`stats` — those involve
  // month-scoped aggregates and a recovery-rate ratio computed server-side
  // that aren't worth re-deriving client-side for what's a rare action.
  async function handleChangeStatus(id: string, nextStatus: PaymentStatus) {
    const previous = items.find((p) => p.id === id)?.status;
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, status: nextStatus } : p)));
    try {
      await api(`/api/payments/${id}`, { method: 'PATCH', body: { status: nextStatus } });
      toast(
        nextStatus === 'Payé' ? 'Paiement marqué comme payé.' : 'Paiement marqué comme en attente.',
        'success',
      );
    } catch (err) {
      if (previous) {
        setItems((prev) => prev.map((p) => (p.id === id ? { ...p, status: previous } : p)));
      }
      toast(err instanceof ApiError ? err.message : 'Erreur inconnue.', 'error');
    } finally {
      void load();
    }
  }

  return (
    <div className="flex bg-background min-h-screen">
      <Sidebar active="payments" />

      <div className="flex flex-col flex-1 min-w-0">
        <PageHeader
          eyebrow="Gestion financière"
          title="Paiements"
          action={
            <Link href="/payments/new">
              <Button variant="accent">
                <Icon i="plus" size={14} />
                Enregistrer un paiement
              </Button>
            </Link>
          }
        />

        <div className="flex flex-col gap-5 p-6">
          {showCancelled && (
            <div className="flex items-center gap-3 bg-muted/10 border border-muted rounded-md px-4 py-3">
              <Icon i="info" size={14} className="text-muted-foreground shrink-0" />
              <p className="text-sm text-muted-foreground">
                L&apos;enregistrement du paiement a été annulé.
              </p>
              <button
                type="button"
                onClick={() => setShowCancelled(false)}
                className="ml-auto text-xs text-muted-foreground hover:text-foreground"
              >
                <Icon i="x" size={14} />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-surface border border-border rounded-md p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">
                À encaisser
              </div>
              <div className="text-2xl font-bold font-headings text-accent mb-1">
                {stats ? (
                  <AnimatedNumber value={stats.toCollect.amount} format={formatAmount} />
                ) : (
                  '—'
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {stats ? `${stats.toCollect.count} paiement(s) en attente` : ''}
              </div>
            </div>
            <div className="bg-surface border border-border rounded-md p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">
                Payés ce mois
              </div>
              <div className="text-2xl font-bold font-headings text-success mb-1">
                {stats ? (
                  <AnimatedNumber value={stats.paidThisMonth.amount} format={formatAmount} />
                ) : (
                  '—'
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {stats ? `${stats.paidThisMonth.count} paiement(s) reçu(s)` : ''}
              </div>
            </div>
            <div className="bg-surface border border-border rounded-md p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">
                Taux de recouvrement
              </div>
              <div className="text-2xl font-bold font-headings text-primary mb-1">
                {stats ? (
                  <AnimatedNumber
                    value={stats.recoveryRatePct}
                    format={(n) => `${Math.round(n)}%`}
                  />
                ) : (
                  '—'
                )}
              </div>
              <div className="text-xs text-muted-foreground">Payé / (Payé + en attente)</div>
            </div>
            <div className="bg-surface border border-border rounded-md p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">
                Retards de paiement
              </div>
              <div className="text-2xl font-bold font-headings text-warning mb-1">
                {stats ? <AnimatedNumber value={stats.overdueInvoices} /> : '—'}
              </div>
              <div className="text-xs text-muted-foreground">&gt; 30 jours d&apos;écart</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 bg-surface border border-border rounded-md p-4">
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
                placeholder="Chercher par client, facture, paiement..."
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

          <div className="bg-surface border border-border rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <div className="flex items-center gap-4 px-5 py-3 border-b border-border bg-background shrink-0 min-w-[900px]">
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground w-20 shrink-0">
                  Paiement
                </div>
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground w-20 shrink-0">
                  Facture
                </div>
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground flex-1">
                  Client
                </div>
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground w-32 text-right shrink-0">
                  Montant
                </div>
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground w-28 shrink-0">
                  Méthode
                </div>
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground w-24 shrink-0">
                  Date
                </div>
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground w-24 shrink-0">
                  Statut
                </div>
                <div className="w-8 shrink-0" />
              </div>

              <div className="min-w-[900px]">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => <SkeletonPaymentRow key={i} />)
                ) : error ? (
                  <p role="alert" className="text-sm text-warning p-5">
                    {error}
                  </p>
                ) : items.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-5">
                    Aucun paiement pour l&apos;instant.
                  </p>
                ) : (
                  items.map((row) => (
                    <PaymentRow
                      key={row.id}
                      reference={row.reference}
                      invoiceReference={row.invoiceReference}
                      client={row.client}
                      amount={formatAmount(row.amount)}
                      method={row.method}
                      date={new Date(row.paymentDate).toLocaleDateString('fr-FR')}
                      status={row.status}
                      onChangeStatus={(next) => void handleChangeStatus(row.id, next)}
                    />
                  ))
                )}
              </div>
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-background shrink-0">
              <span className="text-xs text-muted-foreground">
                Affichage {items.length} sur {counts.total ?? 0} paiements
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense fallback={null}>
      <PaymentsListBody />
    </Suspense>
  );
}
