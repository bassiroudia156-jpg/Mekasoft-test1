'use client';

// /admin/audit-log — UI for the existing GET /api/admin/audit-log route
// (no new backend needed; the route + its filters already existed). Added
// to the sidebar on top of Banani's own nav list because "avoir les
// bonnes informations" / "gérer tous les aspects du site" is directly
// served by a working who-did-what-when view, and the backend was already
// fully built for it.
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import AdminTopBar from '@/components/admin/AdminTopBar';
import { SkeletonTable } from '@/components/ui/Skeleton';

interface AuditRow {
  id: string;
  actorId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  createdAt: string;
}

export default function AdminAuditLogPage() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [actionFilter, setActionFilter] = useState('');

  const load = useCallback(() => {
    setRows(null);
    const params = new URLSearchParams();
    if (actionFilter) params.set('action', actionFilter);
    api<{ items: AuditRow[] }>(`/api/admin/audit-log?${params.toString()}`)
      .then((res) => setRows(res.items))
      .catch(() => setRows([]));
  }, [actionFilter]);

  useEffect(load, [load]);

  return (
    <>
      <AdminTopBar
        title="Journal d'activité"
        subtitle="Actions effectuées par les administrateurs"
      />
      <div className="flex flex-col gap-4 p-6">
        <input
          type="text"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          placeholder="Filtrer par action (ex: user.role_change)…"
          className="px-3 py-2 border border-border rounded-md text-sm bg-input max-w-sm"
        />

        <div className="bg-surface border border-border rounded-lg p-6">
          {!rows ? (
            <SkeletonTable rows={10} cols={4} />
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Aucune action enregistrée.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Action
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Cible
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Détails
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border hover:bg-secondary align-top"
                    >
                      <td className="py-3 px-4 font-mono text-xs text-foreground">{row.action}</td>
                      <td className="py-3 px-4 text-foreground text-xs">
                        {row.targetType ?? '—'}
                        {row.targetId ? (
                          <div className="text-muted-foreground">{row.targetId}</div>
                        ) : null}
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground max-w-xs">
                        <pre className="whitespace-pre-wrap break-words font-mono">
                          {row.metadata ? JSON.stringify(row.metadata) : '—'}
                        </pre>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-xs whitespace-nowrap">
                        {new Date(row.createdAt).toLocaleString('fr-FR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
