// Ported from Banani Dashboard.jsx (populated) + DashboardAfterOnboarding.jsx
// (empty-data variant) — collapsed into ONE real, data-driven page rather
// than two routes: the empty-data variant IS what real data naturally looks
// like before any intervention exists (see
// .planning/banani/dashboard-real-data.md decision #1). This replaces the
// permanent DashboardFirstLaunch placeholder shipped in Phase 2 (comment
// said "stays empty-state until Phase 4/5 ship real data" — Phases 4-8
// shipped, this page never got wired to consume it, until now).
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useRefetchOnFocus } from '@/lib/useRefetchOnFocus';
import { formatInterventionDate } from '@/lib/format-intervention-date';
import { formatCompactAmount } from '@/lib/format-compact-fcfa';
import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import StatCard from '@/components/dashboard/StatCard';
import RevenueChart from '@/components/dashboard/RevenueChart';
import QuickActions from '@/components/dashboard/QuickActions';
import ExportMenu from '@/components/dashboard/ExportMenu';
import InterventionRow, {
  type InterventionStatus,
} from '@/components/interventions/InterventionRow';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import Field from '@/components/ui/Field';
import FilterButton from '@/components/ui/FilterButton';
import SearchSelect, { type SearchSelectOption } from '@/components/ui/SearchSelect';

interface OrgSummary {
  id: string;
  slug: string;
  name: string;
  plan: string;
}

interface RecentIntervention {
  id: string;
  reference: string;
  client: string;
  vehicle: string;
  work: string;
  createdAt: string;
  amount: number;
  status: InterventionStatus;
}

interface DashboardStats {
  inProgress: number;
  unpaid: number;
  completedThisMonth: number;
  revenueThisMonth: number;
  totalInterventions: number;
  recentInterventions: RecentIntervention[];
  revenueChart: {
    total: number;
    trendPct: number | null;
    bars: { day: string; value: number; amount: number }[];
  };
}

type StatusFilter = 'all' | InterventionStatus;

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'En cours', label: 'En cours' },
  { key: 'Non payé', label: 'Non payé' },
  { key: 'Terminé', label: 'Terminé' },
  { key: 'En attente', label: 'En attente' },
];

export default function DashboardPage() {
  const user = useUser();
  const router = useRouter();

  const [checkingOrg, setCheckingOrg] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [orgPlan, setOrgPlan] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  // Intervention table filters — render as a filter bar above the table.
  // All are independent, AND-combined filters against /api/interventions
  // (see that route's header comment for the clientId/vehicleId/dateFrom/
  // dateTo params). The free-text `q` search that used to live in TopBar
  // was retired 2026-08-19 — that slot is now ExportMenu (see TopBar call
  // below) — client/vehicle name search still works via the SearchSelect
  // filters right below.
  const [status, setStatus] = useState<StatusFilter>('all');
  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState<string | null>(null);
  const [clientQuery, setClientQuery] = useState('');
  const [clientOptions, setClientOptions] = useState<SearchSelectOption[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [vehicleName, setVehicleName] = useState<string | null>(null);
  const [vehicleQuery, setVehicleQuery] = useState('');
  const [vehicleOptions, setVehicleOptions] = useState<SearchSelectOption[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [listItems, setListItems] = useState<RecentIntervention[]>([]);
  const [listCounts, setListCounts] = useState<Record<string, number>>({ total: 0 });
  const [listLoading, setListLoading] = useState(true);
  // Audit request (2026-08-18): keep the dashboard current without a manual
  // reload — bumped on window/tab focus, drives both the stats effect and
  // the filtered intervention list effect below.
  const [refreshTick, setRefreshTick] = useState(0);
  useRefetchOnFocus(() => setRefreshTick((t) => t + 1));

  const filtersActive = status !== 'all' || !!clientId || !!vehicleId || !!dateFrom || !!dateTo;

  function resetFilters() {
    setStatus('all');
    setClientId('');
    setClientName(null);
    setVehicleId('');
    setVehicleName(null);
    setDateFrom('');
    setDateTo('');
  }

  function handleSelectClient(opt: SearchSelectOption) {
    setClientId(opt.id);
    setClientName(opt.label);
    setClientQuery('');
    // A vehicle chosen while a different (or no) client was selected may not
    // belong to the newly-picked client — clear it, same as the intervention
    // creation form does on client change.
    setVehicleId('');
    setVehicleName(null);
    setVehicleQuery('');
  }

  function handleSelectVehicle(opt: SearchSelectOption) {
    setVehicleId(opt.id);
    setVehicleName(opt.label);
    setVehicleQuery('');
  }

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ organizations: OrgSummary[] }>('/api/organizations');
        // V1 is single-org-per-user (see Phase 2) — the first membership is
        // the only one that matters.
        if (!cancelled) {
          setOrganizationId(res.organizations[0]?.id ?? null);
          setOrgPlan(res.organizations[0]?.plan ?? null);
        }
      } catch {
        // Network hiccup — default to not showing the banner rather than
        // nagging a user who likely does have an org.
      }
      if (!cancelled) setCheckingOrg(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!organizationId) {
      setLoadingStats(false);
      return;
    }
    let cancelled = false;
    setLoadingStats(true);
    (async () => {
      try {
        const res = await api<DashboardStats>('/api/dashboard/stats');
        if (!cancelled) {
          setStats(res);
          setStatsError(null);
        }
      } catch (err) {
        // Audit fix (2026-08-17): no catch at all previously — a failed
        // fetch silently left the KPI cards showing "0"/"—" as if the
        // garage genuinely had no activity, instead of reporting the real
        // failure.
        if (!cancelled) {
          setStatsError(
            err instanceof ApiError ? err.message : 'Impossible de charger les statistiques.',
          );
        }
      } finally {
        if (!cancelled) setLoadingStats(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, refreshTick]);

  // Client filter — same "menu roulant" combobox as /interventions/new:
  // focusing with nothing typed shows a default browsable list.
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ limit: '20' });
        const qq = clientQuery.trim();
        if (qq) params.set('q', qq);
        const res = await api<{ items: { id: string; name: string; phone: string }[] }>(
          `/api/clients?${params.toString()}`,
        );
        if (!cancelled) {
          setClientOptions(res.items.map((c) => ({ id: c.id, label: c.name, sublabel: c.phone })));
        }
      } catch {
        if (!cancelled) setClientOptions([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [clientQuery, organizationId]);

  // Vehicle filter — scoped to the selected client's vehicles once one is
  // picked (same cascade as the intervention creation form), otherwise a
  // global org-wide vehicle search.
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const vq = vehicleQuery.trim();
        if (clientId) {
          const res = await api<{
            client: {
              vehicles: { id: string; brand: string; model: string; registration: string }[];
            };
          }>(`/api/clients/${clientId}`);
          if (cancelled) return;
          const filtered = res.client.vehicles.filter((v) =>
            vq
              ? `${v.brand} ${v.model} ${v.registration}`.toLowerCase().includes(vq.toLowerCase())
              : true,
          );
          setVehicleOptions(
            filtered.map((v) => ({
              id: v.id,
              label: `${v.brand} ${v.model}`,
              sublabel: v.registration,
            })),
          );
        } else {
          const params = new URLSearchParams({ limit: '20' });
          if (vq) params.set('q', vq);
          const res = await api<{
            items: { id: string; brand: string; model: string; registration: string }[];
          }>(`/api/vehicles?${params.toString()}`);
          if (!cancelled) {
            setVehicleOptions(
              res.items.map((v) => ({
                id: v.id,
                label: `${v.brand} ${v.model}`,
                sublabel: v.registration,
              })),
            );
          }
        }
      } catch {
        if (!cancelled) setVehicleOptions([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [vehicleQuery, clientId, organizationId]);

  // The filterable intervention table itself — independent from
  // /api/dashboard/stats (which still drives the KPI cards + chart above).
  // Debounced so typing in the TopBar search doesn't fire a request per
  // keystroke.
  useEffect(() => {
    if (!organizationId) {
      setListLoading(false);
      return;
    }
    let cancelled = false;
    setListLoading(true);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ limit: '10' });
        if (status !== 'all') params.set('status', status);
        if (clientId) params.set('clientId', clientId);
        if (vehicleId) params.set('vehicleId', vehicleId);
        if (dateFrom) params.set('dateFrom', dateFrom);
        if (dateTo) params.set('dateTo', dateTo);
        const res = await api<{
          items: RecentIntervention[];
          counts: Record<string, number>;
        }>(`/api/interventions?${params.toString()}`);
        if (!cancelled) {
          setListItems(res.items);
          setListCounts(res.counts);
        }
      } catch {
        if (!cancelled) {
          setListItems([]);
        }
      } finally {
        if (!cancelled) setListLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [organizationId, status, clientId, vehicleId, dateFrom, dateTo, refreshTick]);

  if (!user) return null;

  const hasData = (stats?.totalInterventions ?? 0) > 0;
  const showWelcome = !!organizationId && !loadingStats && !hasData && !welcomeDismissed;
  const noFilterResults = filtersActive && !listLoading && listItems.length === 0;

  return (
    <div className="flex bg-background min-h-screen">
      <Sidebar active="dashboard" />

      {/* min-w-0 is load-bearing: without it, this flex item's default
          min-width:auto floors its size at its widest uncontained
          descendant's min-content — even one that's correctly wrapped in
          its own overflow-x-auto (e.g. the intervention table below) — so
          the whole column (and everything in it) renders past the viewport
          instead of letting that table scroll internally. Classic flexbox
          "overflow-x-auto doesn't work inside a flex child" gotcha. */}
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar
          onNewIntervention={() => router.push('/interventions/new')}
          showUpgrade={!!organizationId && !!orgPlan && orgPlan !== 'BUSINESS'}
          rightSlot={<ExportMenu plan={orgPlan} />}
        />

        {!checkingOrg && !organizationId && !bannerDismissed && (
          <div className="mx-6 mt-5 bg-secondary border border-secondary-foreground/20 rounded-md px-5 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Icon i="info" size={16} className="text-secondary-foreground flex-shrink-0" />
              <span className="text-sm text-secondary-foreground">
                Vous pouvez configurer votre garage à tout moment.
              </span>
              <button
                type="button"
                onClick={() => router.push('/onboarding')}
                className="text-sm font-semibold text-primary"
              >
                Configurer mon garage
              </button>
            </div>
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              aria-label="Fermer"
              className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground shrink-0"
            >
              <Icon i="x" size={14} />
            </button>
          </div>
        )}

        {showWelcome && (
          <div className="mx-6 mt-5 bg-secondary border border-secondary-foreground/20 rounded-md px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Icon
                i="circle-check"
                size={18}
                className="text-secondary-foreground flex-shrink-0"
              />
              <div>
                <div className="text-sm font-semibold text-secondary-foreground">
                  Bienvenue dans MekaSoft !
                </div>
                <div className="text-xs text-secondary-foreground/70">
                  Votre garage est prêt. Commencez par ajouter un client.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setWelcomeDismissed(true)}
              aria-label="Fermer"
              className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground shrink-0"
            >
              <Icon i="x" size={14} />
            </button>
          </div>
        )}

        <div className="flex flex-col gap-5 p-6">
          {statsError && (
            <p
              role="alert"
              className="text-sm text-warning bg-warning/10 border border-warning/20 rounded-md px-4 py-3"
            >
              {statsError}
            </p>
          )}

          {/* KPI Row */}
          <div className="flex flex-col sm:flex-row gap-4">
            <StatCard
              label="En cours"
              value={organizationId ? (stats?.inProgress ?? 0) : 0}
              sub="interventions actives"
              status="warning"
              icon="wrench"
            />
            <StatCard
              label="Non payé"
              value={organizationId ? (stats?.unpaid ?? 0) : 0}
              sub="à encaisser"
              status="accent"
              icon="banknote"
            />
            <StatCard
              label="Terminé ce mois"
              value={organizationId ? (stats?.completedThisMonth ?? 0) : 0}
              sub="interventions clôturées"
              status="success"
              icon="circle-check"
            />
            <StatCard
              label="Recettes du mois"
              value={organizationId && hasData ? (stats?.revenueThisMonth ?? 0) : '—'}
              sub="FCFA encaissés"
              status="default"
              icon="trending-up"
            />
          </div>

          {/* Middle row: chart + quick actions */}
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <RevenueChart
                total={stats?.revenueChart.total ?? 0}
                bars={
                  organizationId
                    ? (stats?.revenueChart.bars ?? []).map((b) => ({
                        day: b.day,
                        value: b.value,
                        amount: formatCompactAmount(b.amount),
                      }))
                    : []
                }
                {...(stats?.revenueChart.trendPct != null
                  ? {
                      trendLabel: `${stats.revenueChart.trendPct >= 0 ? '+' : ''}${stats.revenueChart.trendPct}% vs sem. passée`,
                    }
                  : {})}
              />
            </div>
            <div className="w-full lg:w-56">
              <QuickActions
                actions={[
                  {
                    icon: 'circle-plus',
                    label: 'Nouveau client',
                    onClick: () => router.push('/clients/new'),
                  },
                  {
                    icon: 'car',
                    label: 'Nouveau véhicule',
                    onClick: () => router.push('/vehicles/new'),
                  },
                ]}
              />
            </div>
          </div>

          {!organizationId || !hasData ? (
            /* Empty state — no interventions yet (or no garage yet) */
            <div className="bg-surface border border-border rounded-md p-12 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mb-5">
                <Icon i="inbox" size={28} className="text-primary" />
              </div>
              <h3 className="text-lg font-bold font-headings text-foreground mb-2">
                Aucune intervention pour le moment
              </h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-xs">
                Une fois que vous ajouterez vos premiers clients et véhicules, vous verrez les
                interventions ici.
              </p>
              <Button variant="accent" onClick={() => router.push('/clients/new')}>
                <Icon i="user-plus" size={14} />
                Ajouter un client
              </Button>
            </div>
          ) : (
            /* Intervention table — preview of the 10 most recent matching
               the active filters below; full unfiltered browsing + cursor
               pagination lives at /interventions. */
            <div className="bg-surface border border-border rounded-md overflow-hidden">
              {/* Filter bar — status chips + client/véhicule/date, all
                  AND-combined against /api/interventions. */}
              <div className="flex flex-wrap items-end gap-3 px-5 py-3 border-b border-border bg-background">
                <div className="flex flex-wrap gap-2">
                  {STATUS_FILTERS.map((f) => (
                    <FilterButton
                      key={f.key}
                      label={f.label}
                      active={status === f.key}
                      count={f.key === 'all' ? (listCounts.total ?? 0) : (listCounts[f.key] ?? 0)}
                      onClick={() => setStatus(f.key)}
                    />
                  ))}
                </div>
                <div className="w-44">
                  <SearchSelect
                    label=""
                    name="dashboardClientFilter"
                    placeholder="Filtrer par client…"
                    query={clientQuery}
                    onQueryChange={setClientQuery}
                    options={clientOptions}
                    selectedLabel={clientName}
                    onSelect={handleSelectClient}
                    onClear={() => {
                      setClientId('');
                      setClientName(null);
                    }}
                  />
                </div>
                <div className="w-44">
                  <SearchSelect
                    label=""
                    name="dashboardVehicleFilter"
                    placeholder="Filtrer par véhicule…"
                    query={vehicleQuery}
                    onQueryChange={setVehicleQuery}
                    options={vehicleOptions}
                    selectedLabel={vehicleName}
                    onSelect={handleSelectVehicle}
                    onClear={() => {
                      setVehicleId('');
                      setVehicleName(null);
                    }}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <div className="w-36">
                    <Field
                      label="Du"
                      name="dashboardDateFrom"
                      type="date"
                      value={dateFrom}
                      onChange={setDateFrom}
                      max={dateTo || undefined}
                    />
                  </div>
                  <div className="w-36">
                    <Field
                      label="Au"
                      name="dashboardDateTo"
                      type="date"
                      value={dateTo}
                      onChange={setDateTo}
                      min={dateFrom || undefined}
                    />
                  </div>
                </div>
                {filtersActive && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-xs text-primary font-medium flex items-center gap-1 pb-2"
                  >
                    <Icon i="x" size={12} />
                    Réinitialiser les filtres
                  </button>
                )}
              </div>

              {/* 2026-08-18 mobile-overflow fix: this preview table's header
                  used fixed-width shrink-0 columns (w-16/w-36/w-32/w-28/w-14)
                  in a non-wrapping flex row with no scroll container of its
                  own — below ~860px its min-content width forced the whole
                  page wider than the viewport, dragging the KPI cards and
                  filter bar along with it (they were already responsive,
                  just riding on a body that had become horizontally
                  scrollable). Every other list page already wraps its table
                  in its own `overflow-x-auto` (see vehicles/page.tsx) so a
                  narrow table scrolls internally instead of widening the
                  page — this one never got that treatment. */}
              <div className="overflow-x-auto">
                <div className="flex items-center gap-4 px-5 py-3 border-b border-border bg-background min-w-[900px]">
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

                <div className="min-w-[900px]">
                  {listLoading ? (
                    <p className="text-sm text-muted-foreground p-5">Chargement…</p>
                  ) : noFilterResults ? (
                    <div className="p-8 text-center">
                      <p className="text-sm text-muted-foreground mb-3">
                        Aucun résultat pour ces filtres.
                      </p>
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="text-sm text-primary font-medium"
                      >
                        Réinitialiser les filtres
                      </button>
                    </div>
                  ) : (
                    listItems.map((row) => (
                      <InterventionRow
                        key={row.id}
                        id={row.reference}
                        client={row.client}
                        vehicle={row.vehicle}
                        work={row.work}
                        date={formatInterventionDate(row.createdAt)}
                        amount={`${row.amount.toLocaleString('fr-FR')} FCFA`}
                        status={row.status}
                        onView={() => router.push(`/interventions/${row.id}`)}
                      />
                    ))
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-background">
                <span className="text-xs text-muted-foreground">
                  Affichage {listItems.length} sur {listCounts.total ?? 0} interventions
                </span>
                <button
                  type="button"
                  onClick={() => router.push('/interventions')}
                  className="text-xs text-primary font-medium"
                >
                  Voir toutes les interventions →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
