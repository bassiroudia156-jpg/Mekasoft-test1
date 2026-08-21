// Ported from Banani InterventionsList — canonical layout for the
// interventions list (AllInterventions/InterventionsDashboard were
// resolved into this one page + filters during the original planning
// pass, matching how Clients/Vehicles/Invoices lists already work).
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useRefetchOnFocus } from '@/lib/useRefetchOnFocus';
import { formatInterventionDate } from '@/lib/format-intervention-date';
import Sidebar from '@/components/layout/Sidebar';
import { SkeletonInterventionRow } from '@/components/ui/Skeleton';
import InterventionRow, {
  type InterventionStatus,
} from '@/components/interventions/InterventionRow';
import PageHeader from '@/components/ui/PageHeader';
import FilterButton from '@/components/ui/FilterButton';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import AnimatedNumber from '@/components/ui/AnimatedNumber';

interface InterventionListItem {
  id: string;
  reference: string;
  client: string;
  vehicle: string;
  work: string;
  createdAt: string;
  amount: number;
  status: InterventionStatus;
}

type StatusFilter = 'all' | InterventionStatus;

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'En cours', label: 'En cours' },
  { key: 'Non payé', label: 'Non payé' },
  { key: 'Terminé', label: 'Terminé' },
  { key: 'En attente', label: 'En attente' },
];

function formatAmount(n: number): string {
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

export default function InterventionsPage() {
  const user = useUser();
  const router = useRouter();

  const [items, setItems] = useState<InterventionListItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({ total: 0 });
  const [totalAmount, setTotalAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [refreshTick, setRefreshTick] = useState(0);

  // 2026-08-18 audit fix: this search box fired an immediate request on
  // every keystroke — the effect below is already race-safe (its own
  // `cancelled` flag ignores a stale response), but debouncing still cuts
  // the request volume down to one per pause in typing instead of one per
  // character.
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const params = new URLSearchParams();
      if (qDebounced) params.set('q', qDebounced);
      if (status !== 'all') params.set('status', status);
      try {
        const res = await api<{
          items: InterventionListItem[];
          counts: Record<string, number>;
          totalAmount: number;
        }>(`/api/interventions?${params.toString()}`);
        if (!cancelled) {
          setItems(res.items);
          setCounts(res.counts);
          setTotalAmount(res.totalAmount);
          setError(null);
        }
      } catch (err) {
        // Audit fix (2026-08-17): no catch at all previously — a failed
        // fetch silently rendered "Aucune intervention" as if the list were
        // genuinely empty.
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : 'Impossible de charger les interventions.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, qDebounced, status, refreshTick]);

  // Audit request (2026-08-18): keep an already-open list current without
  // needing a manual reload — silently re-fetch when the tab regains focus.
  useRefetchOnFocus(() => setRefreshTick((t) => t + 1));

  if (!user) return null;

  return (
    <div className="flex bg-background min-h-screen">
      <Sidebar active="interventions" />

      <div className="flex flex-col flex-1 min-w-0">
        <PageHeader
          eyebrow="Interventions"
          title="Toutes les interventions"
          action={
            <Link href="/interventions/new">
              <Button variant="accent">
                <Icon i="plus" size={14} />
                Nouvelle intervention
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
              <div className="flex items-center gap-4 px-5 py-3 border-b border-border bg-background shrink-0 min-w-[900px]">
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground w-16 shrink-0">
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
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground w-28 shrink-0">
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
                    Aucune intervention pour l&apos;instant.
                  </p>
                ) : (
                  items.map((row) => (
                    <InterventionRow
                      key={row.id}
                      id={row.reference}
                      client={row.client}
                      vehicle={row.vehicle}
                      work={row.work}
                      date={formatInterventionDate(row.createdAt)}
                      amount={formatAmount(row.amount)}
                      status={row.status}
                      onView={() => router.push(`/interventions/${row.id}`)}
                    />
                  ))
                )}
              </div>
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-background shrink-0">
              <span className="text-xs text-muted-foreground">
                Affichage {items.length} sur {counts.total ?? 0} interventions
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
