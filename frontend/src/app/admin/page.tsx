'use client';

// /admin — Banani "Admin Dashboard — Vue d'ensemble" screen, pixel source:
// flow "Tableau Atelier" (see .planning/banani/admin-dashboard.md). Real
// data throughout (GET /api/admin/dashboard) — the Banani mockup's
// placeholder figures ("12 450", "$22,430"...) are NOT reproduced.
// Skeleton loaders (2026-08-20 explicit requirement) replace every element
// while the fetch is in flight, instead of a spinner.
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import AdminTopBar from '@/components/admin/AdminTopBar';
import StatCard from '@/components/dashboard/StatCard';
import { SkeletonStatCard, Skeleton } from '@/components/ui/Skeleton';
import Icon from '@/components/ui/Icon';

interface DashboardData {
  kpis: {
    totalUsers: number;
    activeUsers: number;
    mrrFcfa: number;
    premiumOrgCount: number;
    premiumSharePct: number;
  };
  revenueChart: { bars: { day: string; value: number; amount: number }[]; totalFcfa: number };
  recentPayments: {
    id: string;
    organizationName: string;
    plan: string;
    provider: string;
    amount: number;
    status: string;
    createdAt: string;
  }[];
}

const STATUS_BADGE: Record<string, string> = {
  SUCCEEDED: 'bg-success/15 text-success',
  PENDING: 'bg-warning/20 text-warning',
  FAILED: 'bg-destructive/15 text-destructive',
};
const STATUS_LABEL: Record<string, string> = {
  SUCCEEDED: 'Réussi',
  PENDING: 'En attente',
  FAILED: 'Échoué',
};

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<DashboardData>('/api/admin/dashboard')
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setError('Impossible de charger le tableau de bord.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <AdminTopBar title="Vue d'ensemble" subtitle="Performances de la plateforme MekaSoft" />
      <div className="flex flex-col gap-6 p-6">
        {error && (
          <div className="bg-destructive/10 border border-destructive text-destructive text-sm rounded-md p-4">
            {error}
          </div>
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {!data ? (
            <>
              <SkeletonStatCard />
              <SkeletonStatCard />
              <SkeletonStatCard />
              <SkeletonStatCard />
            </>
          ) : (
            <>
              <StatCard
                label="Utilisateurs total"
                value={data.kpis.totalUsers}
                sub="Comptes créés"
                icon="users"
              />
              <StatCard
                label="MRR (revenus mensuels)"
                value={data.kpis.mrrFcfa}
                format={(n) => `${n.toLocaleString('fr-FR')} FCFA`}
                sub={`${data.kpis.premiumOrgCount} garage(s) Premium`}
                icon="trending-up"
                status="success"
              />
              <StatCard
                label="Garages Premium"
                value={data.kpis.premiumOrgCount}
                sub={`${data.kpis.premiumSharePct}% des garages`}
                icon="star"
                status="accent"
              />
              <StatCard
                label="Utilisateurs actifs (24h)"
                value={data.kpis.activeUsers}
                sub="Connectés dans les dernières 24h"
                icon="activity"
              />
            </>
          )}
        </div>

        {/* Revenue chart */}
        <div className="bg-surface border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-bold text-foreground">
              Revenus des paiements réussis (7 jours)
            </h3>
            {data && (
              <span className="text-xs text-muted-foreground">
                Total : {data.revenueChart.totalFcfa.toLocaleString('fr-FR')} FCFA
              </span>
            )}
          </div>
          {!data ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <div className="flex items-end justify-between gap-3 h-48">
              {data.revenueChart.bars.map((bar) => (
                <div key={bar.day} className="flex-1 flex flex-col items-center gap-2">
                  <div
                    className="relative w-full flex items-end justify-center"
                    style={{ height: '160px' }}
                  >
                    <div
                      // rounded-full (Banani's own bar-chart class) rounds
                      // ALL four corners relative to the bar's shorter side
                      // — fine for Banani's placeholder data (no bar ever
                      // got tall/wide enough to notice), but a real bar
                      // near 100% height renders as a blob, not a bar. Top
                      // corners only fixes it while keeping the same
                      // rounded language as the rest of the design.
                      className="w-full bg-gradient-to-t from-primary to-primary/70 rounded-t-md min-h-[4px]"
                      style={{ height: `${Math.max(bar.value, 2)}%` }}
                      title={`${bar.amount.toLocaleString('fr-FR')} FCFA`}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground font-medium">{bar.day}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent payments */}
        <div className="bg-surface border border-border rounded-lg p-6">
          <h3 className="text-sm font-bold text-foreground mb-6">Paiements récents</h3>
          {!data ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : data.recentPayments.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Aucun paiement pour le moment.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Garage
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Forfait
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Moyen
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Statut
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Montant
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentPayments.map((p) => (
                    <tr key={p.id} className="border-b border-border hover:bg-secondary">
                      <td className="py-3 px-4 text-foreground font-medium">
                        {p.organizationName}
                      </td>
                      <td className="py-3 px-4 text-foreground">{p.plan}</td>
                      <td className="py-3 px-4 text-foreground">{p.provider}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded ${STATUS_BADGE[p.status] ?? 'bg-muted text-muted-foreground'}`}
                        >
                          {STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-foreground font-bold">
                        {p.amount.toLocaleString('fr-FR')} FCFA
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {new Date(p.createdAt).toLocaleDateString('fr-FR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!data && !error && (
          <div className="flex items-center justify-center text-muted-foreground text-xs gap-2">
            <Icon i="loader-circle" size={14} className="animate-spin" />
            Chargement…
          </div>
        )}
      </div>
    </>
  );
}
