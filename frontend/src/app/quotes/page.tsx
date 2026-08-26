// Phase C item #8 (2026-08-25) — quote list page, mirrors
// interventions/page.tsx's structure exactly (search + status filter chips +
// cursor pagination + counts/amount header). See prisma/schema.prisma's
// Quote model comment and api/quotes/route.ts for the backend design.
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useRefetchOnFocus } from '@/lib/useRefetchOnFocus';
import Sidebar from '@/components/layout/Sidebar';
import { SkeletonInterventionRow } from '@/components/ui/Skeleton';
import QuoteRow, { type QuoteStatus, QUOTE_STATUS_LABEL } from '@/components/quotes/QuoteRow';
import PageHeader from '@/components/ui/PageHeader';
import FilterButton from '@/components/ui/FilterButton';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import AnimatedNumber from '@/components/ui/AnimatedNumber';

interface QuoteListItem {
  id: string;
  reference: string;
  client: string;
  vehicle: string;
  work: string;
  amount: number;
  status: QuoteStatus;
  validUntil: string;
  createdAt: string;
  converted: boolean;
}

type StatusFilter = 'all' | QuoteStatus;

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Tous' },
  ...(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'] as QuoteStatus[]).map((s) => ({
    key: s,
    label: QUOTE_STATUS_LABEL[s],
  })),
];

function formatAmount(n: number): string {
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR');
}

export default function QuotesPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();

  const [items, setItems] = useState<QuoteListItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({ total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [refreshTick, setRefreshTick] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const nextCursorRef = useRef<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    setNextCursor(null);
    nextCursorRef.current = null;
    (async () => {
      const params = new URLSearchParams();
      if (qDebounced) params.set('q', qDebounced);
      if (status !== 'all') params.set('status', status);
      try {
        const res = await api<{
          items: QuoteListItem[];
          counts: Record<string, number>;
          nextCursor: string | null;
        }>(`/api/quotes?${params.toString()}`);
        if (!cancelled) {
          setItems(res.items);
          setCounts(res.counts);
          setNextCursor(res.nextCursor);
          nextCursorRef.current = res.nextCursor;
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Impossible de charger les devis.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, qDebounced, status, refreshTick]);

  useRefetchOnFocus(() => setRefreshTick((t) => t + 1));

  async function loadMore() {
    if (!nextCursorRef.current || loadingMore) return;
    setLoadingMore(true);
    const params = new URLSearchParams();
    if (qDebounced) params.set('q', qDebounced);
    if (status !== 'all') params.set('status', status);
    params.set('cursor', nextCursorRef.current);
    try {
      const res = await api<{
        items: QuoteListItem[];
        counts: Record<string, number>;
        nextCursor: string | null;
      }>(`/api/quotes?${params.toString()}`);
      setItems((prev) => [...prev, ...res.items]);
      setNextCursor(res.nextCursor);
      nextCursorRef.current = res.nextCursor;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Impossible de charger la suite.', 'error');
    } finally {
      setLoadingMore(false);
    }
  }

  if (!user) return null;

  return (
    <div className="flex bg-background min-h-screen">
      <Sidebar active="quotes" />

      <div className="flex flex-col flex-1 min-w-0">
        <PageHeader
          eyebrow="Devis"
          title="Tous les devis"
          action={
            <Link href="/quotes/new">
              <Button variant="accent">
                <Icon i="plus" size={14} />
                Nouveau devis
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
                placeholder="Chercher client, véhicule, travaux…"
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
          </div>
        </div>

        <div className="flex-1 flex flex-col">
          <div className="bg-surface border border-border rounded-md overflow-hidden m-4 lg:m-6 flex flex-col flex-1">
            <div className="overflow-x-auto">
              <div className="flex items-center gap-4 px-5 py-3 border-b border-border bg-background shrink-0 min-w-[900px]">
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground w-24 shrink-0">
                  N°
                </div>
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground flex-1">
                  Client / Véhicule
                </div>
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground flex-1">
                  Travaux
                </div>
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground w-36 shrink-0">
                  Date
                </div>
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground w-32 text-right shrink-0">
                  Montant
                </div>
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground w-36 shrink-0">
                  Statut
                </div>
                <div className="w-14 shrink-0" />
              </div>

              <div className="flex-1 min-w-[900px]">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => <SkeletonInterventionRow key={i} />)
                ) : error ? (
                  <p role="alert" className="text-sm text-warning p-5">
                    {error}
                  </p>
                ) : items.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-5">
                    Aucun devis pour l&apos;instant.
                  </p>
                ) : (
                  items.map((row) => (
                    <QuoteRow
                      key={row.id}
                      id={row.reference}
                      client={row.client}
                      vehicle={row.vehicle}
                      work={row.work}
                      date={formatDate(row.createdAt)}
                      amount={formatAmount(row.amount)}
                      status={row.status}
                      converted={row.converted}
                      onView={() => router.push(`/quotes/${row.id}`)}
                    />
                  ))
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border bg-background shrink-0">
              <span className="text-xs text-muted-foreground">
                Affichage {items.length} sur {counts.total ?? 0} devis
              </span>
              {nextCursor && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                >
                  {loadingMore ? 'Chargement…' : 'Charger plus'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
