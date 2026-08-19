// Ported from Banani ClientsList(Navigated) — note no <TopBar/> on this
// screen, it has its own header (see PageHeader).
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useCallerOrganization } from '@/lib/useCallerOrganization';
import { useRefetchOnFocus } from '@/lib/useRefetchOnFocus';
import Sidebar from '@/components/layout/Sidebar';
import ManagerProfilePanel from '@/components/layout/ManagerProfilePanel';
import ClientRow from '@/components/clients/ClientRow';
import PageHeader from '@/components/ui/PageHeader';
import FilterButton from '@/components/ui/FilterButton';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import AnimatedNumber from '@/components/ui/AnimatedNumber';

interface ClientListItem {
  id: string;
  type: 'INDIVIDUAL' | 'COMPANY';
  name: string;
  phone: string;
  email: string | null;
  status: 'actif' | 'inactif';
  vehicles: number;
}

type StatusFilter = 'all' | 'actif' | 'inactif';

export default function ClientsPage() {
  const user = useUser();
  const router = useRouter();
  const { organizationId } = useCallerOrganization(!!user);
  const [profileOpen, setProfileOpen] = useState(false);

  const [items, setItems] = useState<ClientListItem[]>([]);
  const [counts, setCounts] = useState({ total: 0, actif: 0, inactif: 0 });
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
        const res = await api<{ items: ClientListItem[]; counts: typeof counts }>(
          `/api/clients?${params.toString()}`,
        );
        if (!cancelled) {
          setItems(res.items);
          setCounts(res.counts);
          setError(null);
        }
      } catch (err) {
        // Audit fix (2026-08-17): this used to have no catch at all — a
        // failed fetch (network hiccup, expired session) silently left
        // `items` at its initial empty array, rendering "Aucun client pour
        // l'instant" as if the list were genuinely empty rather than
        // reporting the real failure.
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Impossible de charger les clients.');
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
      <Sidebar active="clients" onProfileClick={() => setProfileOpen(true)} />

      <div className="flex flex-col flex-1">
        <PageHeader
          eyebrow="Clients"
          title="Annuaire des clients"
          action={
            <Link href="/clients/new">
              <Button variant="accent">
                <Icon i="plus" size={14} />
                Nouveau client
              </Button>
            </Link>
          }
        />

        {/* Filters + Stats */}
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
                placeholder="Chercher client, téléphone…"
                className="w-full pl-10 pr-3 py-2 border border-border bg-input rounded-md text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <Icon i="list-filter" size={14} className="text-muted-foreground" />
            <div className="flex gap-2">
              <FilterButton
                label="Tous"
                active={status === 'all'}
                count={counts.total}
                onClick={() => setStatus('all')}
              />
              <FilterButton
                label="Actifs"
                active={status === 'actif'}
                count={counts.actif}
                onClick={() => setStatus('actif')}
              />
              <FilterButton
                label="Inactifs"
                active={status === 'inactif'}
                count={counts.inactif}
                onClick={() => setStatus('inactif')}
              />
            </div>
          </div>
          <div className="flex items-center gap-6 text-xs border-l border-border pl-4">
            <div>
              <span className="text-muted-foreground">Total</span>
              <div className="font-bold text-foreground text-base">
                <AnimatedNumber value={counts.total} />
              </div>
            </div>
          </div>
        </div>

        {/* Clients table */}
        <div className="flex-1 flex flex-col">
          <div className="bg-surface border border-border rounded-md overflow-hidden m-4 lg:m-6 flex flex-col flex-1">
            <div className="overflow-x-auto">
              <div className="flex items-center gap-4 px-5 py-3 border-b border-border bg-background shrink-0 min-w-[820px]">
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground flex-1">
                  Nom et contact
                </div>
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground w-40">
                  Email
                </div>
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground w-20 text-center">
                  Véhicules
                </div>
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground w-28 text-right">
                  Total dépensé
                </div>
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground w-24 text-right">
                  Dernière visite
                </div>
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground w-20">
                  Statut
                </div>
                <div className="w-14 shrink-0" />
              </div>

              <div className="flex-1 min-w-[820px]">
                {loading ? (
                  <p className="text-sm text-muted-foreground p-5">Chargement…</p>
                ) : error ? (
                  <p role="alert" className="text-sm text-warning p-5">
                    {error}
                  </p>
                ) : items.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-5">
                    Aucun client pour l&apos;instant.
                  </p>
                ) : (
                  items.map((c) => (
                    <ClientRow
                      key={c.id}
                      name={c.name}
                      phone={c.phone}
                      email={c.email ?? '—'}
                      vehicles={c.vehicles}
                      totalSpent="—"
                      lastVisit="—"
                      status={c.status}
                      onView={() => router.push(`/clients/${c.id}`)}
                    />
                  ))
                )}
              </div>
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-background shrink-0">
              <span className="text-xs text-muted-foreground">
                Affichage {items.length} sur {counts.total} clients
              </span>
            </div>
          </div>
        </div>
      </div>

      <ManagerProfilePanel
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        organizationId={organizationId}
      />
    </div>
  );
}
