'use client';

// /admin/garages — hand-designed, lists Organizations ("garages" in this
// product's vocabulary). Plan changes reuse PATCH /api/admin/organizations/
// [id]/plan (same route the Users page's per-membership action calls) —
// SUPERADMIN-only, matches the CLAUDE.md "Only SUPERADMIN..." precedent for
// money-adjacent mutations.
import { useEffect, useState, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import AdminTopBar from '@/components/admin/AdminTopBar';
import { SkeletonTable } from '@/components/ui/Skeleton';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  city: string | null;
  createdAt: string;
  _count: { members: number; clients: number; vehicles: number; interventions: number };
}

export default function AdminGaragesPage() {
  const { user: me } = useAuth();
  const { toast: showToast } = useToast();
  const isSuperadmin = me?.role === 'SUPERADMIN';

  const [rows, setRows] = useState<OrgRow[] | null>(null);
  const [q, setQ] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [planTarget, setPlanTarget] = useState<{ org: OrgRow; nextPlan: string } | null>(null);

  const load = useCallback(() => {
    setRows(null);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (planFilter) params.set('plan', planFilter);
    api<{ items: OrgRow[] }>(`/api/admin/organizations?${params.toString()}`)
      .then((res) => setRows(res.items))
      .catch(() => setRows([]));
  }, [q, planFilter]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function changePlan(orgId: string, plan: string) {
    setBusy(true);
    try {
      await api(`/api/admin/organizations/${orgId}/plan`, { method: 'PATCH', body: { plan } });
      showToast(
        plan === 'PRO' ? 'Garage passé en Premium.' : 'Garage repassé en Gratuit.',
        'success',
      );
      setPlanTarget(null);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Échec du changement de forfait.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AdminTopBar title="Garages" subtitle="Ateliers inscrits sur MekaSoft" />
      <div className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher par nom…"
            className="px-3 py-2 border border-border rounded-md text-sm bg-input flex-1 min-w-[200px]"
          />
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="px-3 py-2 border border-border rounded-md text-sm bg-input"
          >
            <option value="">Tous les forfaits</option>
            <option value="FREE">Gratuit</option>
            <option value="PRO">Premium</option>
          </select>
        </div>

        <div className="bg-surface border border-border rounded-lg p-6">
          {!rows ? (
            <SkeletonTable rows={8} cols={5} />
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Aucun garage trouvé.
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
                      Équipe
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Clients / Véhicules
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Inscrit le
                    </th>
                    {isSuperadmin && <th className="py-3 px-4" />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-border hover:bg-secondary">
                      <td className="py-3 px-4">
                        <div className="font-medium text-foreground">{row.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.city ?? '—'} · /{row.slug}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge tone={row.plan === 'PRO' ? 'accent' : 'muted'}>
                          {row.plan === 'PRO' ? 'Premium' : 'Gratuit'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-foreground">{row._count.members}</td>
                      <td className="py-3 px-4 text-foreground">
                        {row._count.clients} / {row._count.vehicles}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {new Date(row.createdAt).toLocaleDateString('fr-FR')}
                      </td>
                      {isSuperadmin && (
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="outline-primary"
                            size="sm"
                            onClick={() =>
                              setPlanTarget({
                                org: row,
                                nextPlan: row.plan === 'PRO' ? 'FREE' : 'PRO',
                              })
                            }
                          >
                            {row.plan === 'PRO' ? 'Retirer Premium' : 'Passer en Premium'}
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={Boolean(planTarget)}
        onClose={() => setPlanTarget(null)}
        title={
          planTarget?.nextPlan === 'PRO'
            ? 'Passer ce garage en Premium ?'
            : "Retirer l'abonnement Premium ?"
        }
        maxWidth="md"
      >
        <div className="p-6 flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{planTarget?.org.name}</p>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setPlanTarget(null)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => planTarget && void changePlan(planTarget.org.id, planTarget.nextPlan)}
            >
              Confirmer
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
