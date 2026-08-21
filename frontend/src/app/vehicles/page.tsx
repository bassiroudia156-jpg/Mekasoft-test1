// Ported from Banani VehiclesListNavigated + DeleteVehicleConfirmation/
// VehicleDeletedSuccess. 2026-08-18 audit: the row "..." grew a real menu
// (Modifier/Activer-Désactiver/Supprimer, see VehicleRowMenu) — it used to
// only ever open the delete confirm directly since Banani hadn't designed
// anything else behind it.
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useRefetchOnFocus } from '@/lib/useRefetchOnFocus';
import Sidebar from '@/components/layout/Sidebar';
import VehicleRow from '@/components/vehicles/VehicleRow';
import EditVehicleModal from '@/components/vehicles/EditVehicleModal';
import DeleteVehicleModal, {
  type DeleteVehicleModalTarget,
} from '@/components/vehicles/DeleteVehicleModal';
import { SkeletonVehicleRow } from '@/components/ui/Skeleton';
import PageHeader from '@/components/ui/PageHeader';
import FilterButton from '@/components/ui/FilterButton';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import AnimatedNumber from '@/components/ui/AnimatedNumber';

interface VehicleListItem {
  id: string;
  brand: string;
  model: string;
  registration: string;
  mileage: number | null;
  lastServiceAt: string | null;
  status: 'Actif' | 'Inactif';
  owner: string;
}

type StatusFilter = 'all' | 'Actif' | 'Inactif';

export default function VehiclesPage() {
  const user = useUser();
  const { toast } = useToast();

  const [items, setItems] = useState<VehicleListItem[]>([]);
  const [counts, setCounts] = useState({ total: 0, Actif: 0, Inactif: 0 });
  const [avgMileage, setAvgMileage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const loadSeq = useRef(0);

  const [deleteTarget, setDeleteTarget] = useState<DeleteVehicleModalTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editTarget, setEditTarget] = useState<string | null>(null);

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
        items: VehicleListItem[];
        counts: typeof counts;
        avgMileage: number | null;
      }>(`/api/vehicles?${params.toString()}`);
      if (loadSeq.current !== seq) return; // a newer load() superseded this one
      setItems(res.items);
      setCounts(res.counts);
      setAvgMileage(res.avgMileage);
      setError(null);
    } catch (err) {
      if (loadSeq.current !== seq) return;
      // Audit fix (2026-08-17): no catch at all previously — a failed fetch
      // silently rendered "Aucun véhicule" as if the fleet were empty.
      setError(err instanceof ApiError ? err.message : 'Impossible de charger les véhicules.');
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

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const targetStatus = items.find((v) => v.id === target.id)?.status;
    setDeleting(true);
    // Optimistic removal (audit request, 2026-08-18: "ça doit etre un peu
    // comme de l'optimistique") — drop the row from the list immediately
    // instead of waiting on a second round-trip GET; roll back + toast if
    // the DELETE actually fails (e.g. VEHICLE_HAS_INTERVENTIONS).
    setItems((prev) => prev.filter((v) => v.id !== target.id));
    setCounts((prev) => ({
      ...prev,
      total: prev.total - 1,
      ...(targetStatus ? { [targetStatus]: prev[targetStatus] - 1 } : {}),
    }));
    setDeleteTarget(null);
    try {
      await api(`/api/vehicles/${target.id}`, { method: 'DELETE' });
      toast(
        `${target.brand} ${target.model} (${target.registration}) a été supprimé du parc.`,
        'success',
      );
    } catch (err) {
      // Rollback — re-insert at its original position isn't tracked, but a
      // full reload guarantees a correct list again after a failed delete.
      await load();
      if (err instanceof ApiError && err.code === 'VEHICLE_HAS_INTERVENTIONS') {
        toast("Ce véhicule a un historique d'interventions et ne peut pas être supprimé.", 'error');
      } else {
        toast(err instanceof ApiError ? err.message : 'Erreur inconnue.', 'error');
      }
    } finally {
      setDeleting(false);
    }
  }

  // 2026-08-18 audit fix: "Activer"/"Désactiver" from VehicleRowMenu.
  // Optimistic status flip + count move, rollback + error toast on failure.
  async function handleToggleStatus(v: VehicleListItem) {
    const nextStatus: VehicleListItem['status'] = v.status === 'Actif' ? 'Inactif' : 'Actif';
    setItems((prev) => prev.map((row) => (row.id === v.id ? { ...row, status: nextStatus } : row)));
    setCounts((prev) => ({
      ...prev,
      [v.status]: prev[v.status] - 1,
      [nextStatus]: prev[nextStatus] + 1,
    }));
    try {
      await api(`/api/vehicles/${v.id}`, { method: 'PATCH', body: { status: nextStatus } });
      toast(
        `${v.brand} ${v.model} est maintenant ${nextStatus === 'Actif' ? 'actif' : 'inactif'}.`,
        'success',
      );
    } catch (err) {
      setItems((prev) => prev.map((row) => (row.id === v.id ? { ...row, status: v.status } : row)));
      setCounts((prev) => ({
        ...prev,
        [v.status]: prev[v.status] + 1,
        [nextStatus]: prev[nextStatus] - 1,
      }));
      toast(err instanceof ApiError ? err.message : 'Erreur inconnue.', 'error');
    }
  }

  return (
    <div className="flex bg-background min-h-screen">
      <Sidebar active="vehicles" />

      <div className="flex flex-col flex-1 min-w-0">
        <PageHeader
          eyebrow="Parc"
          title="Parc automobile"
          action={
            <Link href="/vehicles/new">
              <Button variant="accent">
                <Icon i="plus" size={14} />
                Ajouter un véhicule
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
                placeholder="Chercher marque, immatriculation, propriétaire…"
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
                active={status === 'Actif'}
                count={counts.Actif}
                onClick={() => setStatus('Actif')}
              />
              <FilterButton
                label="Inactifs"
                active={status === 'Inactif'}
                count={counts.Inactif}
                onClick={() => setStatus('Inactif')}
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
            <div>
              <span className="text-muted-foreground">Km moyen</span>
              <div className="font-bold text-foreground text-base">
                {avgMileage ? (
                  <AnimatedNumber value={avgMileage} format={(n) => `${Math.round(n / 1000)}k`} />
                ) : (
                  '—'
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col">
          <div className="bg-surface border border-border rounded-md overflow-hidden m-4 lg:m-6 flex flex-col flex-1">
            <div className="overflow-x-auto">
              <div className="flex items-center gap-4 px-5 py-3 border-b border-border bg-background shrink-0 min-w-[860px]">
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground flex-1">
                  Marque / Modèle
                </div>
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground w-28">
                  Immatriculation
                </div>
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground flex-1">
                  Propriétaire
                </div>
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground w-32 text-right">
                  Kilométrage
                </div>
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground w-24 text-right">
                  Dernier service
                </div>
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground w-20">
                  Statut
                </div>
                <div className="w-14 shrink-0" />
              </div>

              <div className="flex-1 min-w-[860px]">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => <SkeletonVehicleRow key={i} />)
                ) : error ? (
                  <p role="alert" className="text-sm text-warning p-5">
                    {error}
                  </p>
                ) : items.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-5">
                    Aucun véhicule pour l&apos;instant.
                  </p>
                ) : (
                  items.map((v) => (
                    <VehicleRow
                      key={v.id}
                      brand={v.brand}
                      model={v.model}
                      registration={v.registration}
                      owner={v.owner}
                      mileage={v.mileage ? `${v.mileage.toLocaleString('fr-FR')} km` : '—'}
                      lastService={
                        v.lastServiceAt
                          ? new Date(v.lastServiceAt).toLocaleDateString('fr-FR')
                          : '—'
                      }
                      status={v.status}
                      onEdit={() => setEditTarget(v.id)}
                      onToggleStatus={() => void handleToggleStatus(v)}
                      onDelete={() =>
                        setDeleteTarget({
                          id: v.id,
                          brand: v.brand,
                          model: v.model,
                          registration: v.registration,
                          owner: v.owner,
                        })
                      }
                    />
                  ))
                )}
              </div>
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-background shrink-0">
              <span className="text-xs text-muted-foreground">
                Affichage {items.length} sur {counts.total} véhicules
              </span>
            </div>
          </div>
        </div>
      </div>

      <DeleteVehicleModal
        target={deleteTarget}
        deleting={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />

      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Modifier le véhicule"
        icon="pencil"
        maxWidth="lg"
      >
        {editTarget && (
          <EditVehicleModal
            vehicleId={editTarget}
            onClose={() => setEditTarget(null)}
            onSaved={() => {
              setEditTarget(null);
              toast('Véhicule mis à jour.', 'success');
              void load();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
