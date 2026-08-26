'use client';

// /admin/users — hand-designed (no Banani screen for this one; see the
// user's explicit go-ahead in .planning/banani/admin-dashboard.md), built
// from the same visual language as the Banani-sourced /admin dashboard and
// composed almost entirely from existing primitives (Card via bg-surface
// shell, SlideOver, Modal, Badge, Button).
//
// Core requirement this page exists for: "je peux le promouvoir en admin,
// en tant que premium et je peux aussi suspendre son compte ou même
// enlever son abonnement". Role/status live on User; the paid plan is
// really the plan of the user's organization (this product has no
// per-user plan concept) — the detail panel shows each garage the user
// belongs to with its own "Passer en Pro / Repasser en Gratuit" quick
// action, reusing the existing PATCH /api/admin/organizations/[id]/plan
// route. This quick toggle only ever targets PRO — a BUSINESS change goes
// through the fuller plan selector on /admin/garages instead.
import { useEffect, useState, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import AdminTopBar from '@/components/admin/AdminTopBar';
import { SkeletonTable, Skeleton, SkeletonInfoCard } from '@/components/ui/Skeleton';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import SlideOver from '@/components/ui/SlideOver';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import { useAuth } from '@/contexts/AuthContext';

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: 'USER' | 'ADMIN' | 'SUPERADMIN';
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
}

interface Membership {
  role: string;
  organization: { id: string; name: string; slug: string; plan: string };
}

interface UserDetail extends UserRow {
  lastLoginAt: string | null;
  emailVerifiedAt: string | null;
  memberships: Membership[];
}

const ROLE_LABEL: Record<string, string> = {
  USER: 'Utilisateur',
  ADMIN: 'Admin',
  SUPERADMIN: 'Superadmin',
};

const PLAN_LABEL: Record<string, string> = {
  FREE: 'Gratuit',
  PRO: 'Pro',
  BUSINESS: 'Business',
};

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const { toast: showToast } = useToast();
  const isSuperadmin = me?.role === 'SUPERADMIN';

  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [selected, setSelected] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmSuspend, setConfirmSuspend] = useState<UserRow | null>(null);
  const [planTarget, setPlanTarget] = useState<{
    org: Membership['organization'];
    nextPlan: string;
  } | null>(null);

  const load = useCallback(() => {
    setRows(null);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (roleFilter) params.set('role', roleFilter);
    if (statusFilter) params.set('status', statusFilter);
    api<{ items: UserRow[] }>(`/api/admin/users?${params.toString()}`)
      .then((res) => setRows(res.items))
      .catch(() => setRows([]));
  }, [q, roleFilter, statusFilter]);

  useEffect(() => {
    const t = setTimeout(load, 250); // debounce search typing
    return () => clearTimeout(t);
  }, [load]);

  async function openDetail(row: UserRow) {
    setDetailLoading(true);
    setSelected(null);
    try {
      const res = await api<{ user: UserDetail }>(`/api/admin/users/${row.id}`);
      setSelected(res.user);
    } catch {
      showToast('Impossible de charger cet utilisateur.', 'error');
    } finally {
      setDetailLoading(false);
    }
  }

  async function changeRole(userId: string, role: string) {
    setBusy(true);
    try {
      await api(`/api/admin/users/${userId}/role`, { method: 'PATCH', body: { role } });
      showToast('Rôle mis à jour.', 'success');
      if (selected) setSelected({ ...selected, role: role as UserDetail['role'] });
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Échec de la mise à jour.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(userId: string, status: 'ACTIVE' | 'SUSPENDED') {
    setBusy(true);
    try {
      await api(`/api/admin/users/${userId}/status`, { method: 'PATCH', body: { status } });
      showToast(status === 'SUSPENDED' ? 'Compte suspendu.' : 'Compte réactivé.', 'success');
      if (selected) setSelected({ ...selected, status });
      setConfirmSuspend(null);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Échec de la mise à jour.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function changeOrgPlan(orgId: string, plan: string) {
    setBusy(true);
    try {
      await api(`/api/admin/organizations/${orgId}/plan`, { method: 'PATCH', body: { plan } });
      showToast(
        plan === 'PRO' ? 'Garage passé en Pro.' : 'Abonnement retiré (retour Gratuit).',
        'success',
      );
      setPlanTarget(null);
      if (selected) {
        setSelected({
          ...selected,
          memberships: selected.memberships.map((m) =>
            m.organization.id === orgId ? { ...m, organization: { ...m.organization, plan } } : m,
          ),
        });
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Échec du changement de forfait.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AdminTopBar title="Utilisateurs" subtitle="Comptes de la plateforme" />
      <div className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher par email ou nom…"
            className="px-3 py-2 border border-border rounded-md text-sm bg-input flex-1 min-w-[200px]"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 border border-border rounded-md text-sm bg-input"
          >
            <option value="">Tous les rôles</option>
            <option value="USER">Utilisateur</option>
            <option value="ADMIN">Admin</option>
            <option value="SUPERADMIN">Superadmin</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-border rounded-md text-sm bg-input"
          >
            <option value="">Tous les statuts</option>
            <option value="ACTIVE">Actif</option>
            <option value="SUSPENDED">Suspendu</option>
          </select>
        </div>

        <div className="bg-surface border border-border rounded-lg p-6">
          {!rows ? (
            <SkeletonTable rows={8} cols={4} />
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Aucun utilisateur trouvé.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Utilisateur
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Rôle
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Statut
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Inscrit le
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => void openDetail(row)}
                      className="border-b border-border hover:bg-secondary cursor-pointer"
                    >
                      <td className="py-3 px-4">
                        <div className="font-medium text-foreground">{row.name ?? row.email}</div>
                        {row.name && (
                          <div className="text-xs text-muted-foreground">{row.email}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-foreground">{ROLE_LABEL[row.role]}</td>
                      <td className="py-3 px-4">
                        <Badge tone={row.status === 'ACTIVE' ? 'success' : 'warning'}>
                          {row.status === 'ACTIVE' ? 'Actif' : 'Suspendu'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {new Date(row.createdAt).toLocaleDateString('fr-FR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <SlideOver open={Boolean(selected) || detailLoading} onClose={() => setSelected(null)}>
        <div className="p-6 flex flex-col gap-5">
          {detailLoading || !selected ? (
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-4 w-4" />
              </div>
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3 w-48" />
              </div>
              <SkeletonInfoCard rows={3} />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold font-headings text-foreground">Utilisateur</h2>
                <button type="button" onClick={() => setSelected(null)} aria-label="Fermer">
                  <Icon i="x" size={18} className="text-muted-foreground" />
                </button>
              </div>

              <div>
                <div className="font-medium text-foreground">{selected.name ?? '—'}</div>
                <div className="text-sm text-muted-foreground">{selected.email}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Dernière connexion :{' '}
                  {selected.lastLoginAt
                    ? new Date(selected.lastLoginAt).toLocaleString('fr-FR')
                    : 'jamais'}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                  Rôle
                </div>
                {isSuperadmin ? (
                  <select
                    value={selected.role}
                    disabled={busy}
                    onChange={(e) => void changeRole(selected.id, e.target.value)}
                    className="px-3 py-2 border border-border rounded-md text-sm bg-input"
                  >
                    <option value="USER">Utilisateur</option>
                    <option value="ADMIN">Admin</option>
                    <option value="SUPERADMIN">Superadmin</option>
                  </select>
                ) : (
                  <Badge tone="primary">{ROLE_LABEL[selected.role]}</Badge>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                  Statut
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={selected.status === 'ACTIVE' ? 'success' : 'warning'}>
                    {selected.status === 'ACTIVE' ? 'Actif' : 'Suspendu'}
                  </Badge>
                  {selected.status === 'ACTIVE' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => setConfirmSuspend(selected)}
                    >
                      Suspendre
                    </Button>
                  ) : (
                    isSuperadmin && (
                      <Button
                        variant="outline-primary"
                        size="sm"
                        disabled={busy}
                        onClick={() => void changeStatus(selected.id, 'ACTIVE')}
                      >
                        Réactiver
                      </Button>
                    )
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                  Garages
                </div>
                {selected.memberships.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Aucun garage.</div>
                ) : (
                  selected.memberships.map((m) => (
                    <div
                      key={m.organization.id}
                      className="border border-border rounded-md p-3 flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="text-sm font-medium text-foreground">
                          {m.organization.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {m.role} · {PLAN_LABEL[m.organization.plan] ?? m.organization.plan}
                        </div>
                      </div>
                      {isSuperadmin && (
                        <Button
                          variant="outline-primary"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            setPlanTarget({
                              org: m.organization,
                              // Quick toggle: FREE → PRO, or any paid plan
                              // (PRO/BUSINESS) → FREE ("enlever son
                              // abonnement"). A FREE → BUSINESS jump goes
                              // through /admin/garages's fuller selector.
                              nextPlan: m.organization.plan === 'FREE' ? 'PRO' : 'FREE',
                            })
                          }
                        >
                          {m.organization.plan === 'FREE'
                            ? 'Passer en Pro'
                            : "Retirer l'abonnement"}
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </SlideOver>

      <Modal
        open={Boolean(confirmSuspend)}
        onClose={() => setConfirmSuspend(null)}
        title="Suspendre ce compte ?"
        maxWidth="md"
      >
        <div className="p-6 flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {confirmSuspend?.email} ne pourra plus se connecter tant que le compte n&apos;est pas
            réactivé.
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setConfirmSuspend(null)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => confirmSuspend && void changeStatus(confirmSuspend.id, 'SUSPENDED')}
            >
              Suspendre
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(planTarget)}
        onClose={() => setPlanTarget(null)}
        title={
          planTarget?.nextPlan === 'PRO' ? 'Passer ce garage en Pro ?' : "Retirer l'abonnement ?"
        }
        maxWidth="md"
      >
        <div className="p-6 flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {planTarget?.org.name} —{' '}
            {planTarget?.nextPlan === 'PRO'
              ? 'accès Pro activé immédiatement, sans passer par un paiement.'
              : "retour au forfait Gratuit ; l'abonnement payant en cours (le cas échéant) n'est pas remboursé automatiquement."}
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setPlanTarget(null)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() =>
                planTarget && void changeOrgPlan(planTarget.org.id, planTarget.nextPlan)
              }
            >
              Confirmer
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
