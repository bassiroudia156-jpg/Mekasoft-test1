'use client';

// /admin/analytics — real 30-day trends (GET /api/admin/analytics). See
// that route's file comment for the exact queries behind each number.
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import AdminTopBar from '@/components/admin/AdminTopBar';
import { Skeleton } from '@/components/ui/Skeleton';
import Badge from '@/components/ui/Badge';

interface AnalyticsData {
  windowDays: number;
  signupsByDay: number[];
  revenueByDay: number[];
  planDistribution: { plan: string; count: number }[];
  topGarages: { organizationId: string; name: string; plan: string; interventionCount: number }[];
}

function MiniBarChart({
  values,
  formatTooltip,
}: {
  values: number[];
  formatTooltip: (n: number) => string;
}) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-0.5 h-24">
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 bg-primary/70 rounded-t-sm min-h-[2px]"
          style={{ height: `${Math.max((v / max) * 100, 2)}%` }}
          title={formatTooltip(v)}
        />
      ))}
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    api<AnalyticsData>('/api/admin/analytics')
      .then(setData)
      .catch(() => setData(null));
  }, []);

  const totalSignups = data?.signupsByDay.reduce((s, v) => s + v, 0) ?? 0;
  const totalRevenue = data?.revenueByDay.reduce((s, v) => s + v, 0) ?? 0;

  return (
    <>
      <AdminTopBar title="Analytics" subtitle="Tendances sur 30 jours" />
      <div className="flex flex-col gap-6 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-surface border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-foreground">Nouvelles inscriptions (30j)</h3>
              {data && (
                <span className="text-xs text-muted-foreground">Total : {totalSignups}</span>
              )}
            </div>
            {!data ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <MiniBarChart
                values={data.signupsByDay}
                formatTooltip={(n) => `${n} inscription(s)`}
              />
            )}
          </div>

          <div className="bg-surface border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-foreground">Revenus (30j)</h3>
              {data && (
                <span className="text-xs text-muted-foreground">
                  Total : {totalRevenue.toLocaleString('fr-FR')} FCFA
                </span>
              )}
            </div>
            {!data ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <MiniBarChart
                values={data.revenueByDay}
                formatTooltip={(n) => `${n.toLocaleString('fr-FR')} FCFA`}
              />
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-surface border border-border rounded-lg p-6">
            <h3 className="text-sm font-bold text-foreground mb-4">Répartition des forfaits</h3>
            {!data ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {data.planDistribution.map((p) => (
                  <div key={p.plan} className="flex items-center justify-between">
                    <Badge tone={p.plan === 'PRO' ? 'accent' : 'muted'}>
                      {p.plan === 'PRO' ? 'Premium' : 'Gratuit'}
                    </Badge>
                    <span className="text-sm font-medium text-foreground">{p.count} garage(s)</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-surface border border-border rounded-lg p-6">
            <h3 className="text-sm font-bold text-foreground mb-4">
              Garages les plus actifs (30j)
            </h3>
            {!data ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full" />
              </div>
            ) : data.topGarages.length === 0 ? (
              <div className="text-sm text-muted-foreground">Aucune activité sur la période.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {data.topGarages.map((g, i) => (
                  <div key={g.organizationId} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">
                      {i + 1}. {g.name}
                    </span>
                    <span className="text-muted-foreground">
                      {g.interventionCount} intervention(s)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
