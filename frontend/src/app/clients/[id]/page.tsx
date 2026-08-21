// Ported from Banani ClientProfileIbrahima. `interventionsCount`/
// `totalSpent`/`lastVisit` and the "Historique des interventions" section
// are real as of Phase 5. 2026-08-18 audit: the vehicle sub-list's "..."
// rendered here without an `onMoreClick` at all (a plain VehicleRow call
// with the prop simply omitted) — now wired to the same
// Modifier/Activer-Désactiver/Supprimer menu as the main /vehicles page.
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useMobileSidebar } from '@/contexts/MobileSidebarContext';
import { useRefetchOnFocus } from '@/lib/useRefetchOnFocus';
import { formatInterventionDate } from '@/lib/format-intervention-date';
import Sidebar from '@/components/layout/Sidebar';
import VehicleRow from '@/components/vehicles/VehicleRow';
import EditVehicleModal from '@/components/vehicles/EditVehicleModal';
import DeleteVehicleModal, {
  type DeleteVehicleModalTarget,
} from '@/components/vehicles/DeleteVehicleModal';
import InterventionRow, {
  type InterventionStatus,
} from '@/components/interventions/InterventionRow';
import UserAvatar from '@/components/ui/UserAvatar';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import {
  SkeletonProfileCard,
  SkeletonInfoCard,
  SkeletonVehicleRow,
  SkeletonInterventionRow,
} from '@/components/ui/Skeleton';
import AnimatedNumber from '@/components/ui/AnimatedNumber';

interface ClientDetail {
  id: string;
  type: 'INDIVIDUAL' | 'COMPANY';
  name: string;
  phone: string;
  email: string | null;
  street: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  notes: string | null;
  status: 'actif' | 'inactif';
  createdAt: string;
  vehiclesCount: number;
  interventionsCount: number;
  totalSpent: number;
  lastVisit: string | null;
  interventions: {
    id: string;
    reference: string;
    work: string;
    vehicle: string;
    amount: number;
    status: InterventionStatus;
    createdAt: string;
  }[];
  vehicles: {
    id: string;
    brand: string;
    model: string;
    registration: string;
    mileage: number | null;
    lastServiceAt: string | null;
    status: 'Actif' | 'Inactif';
  }[];
}

export default function ClientProfilePage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const { toggle } = useMobileSidebar();
  const params = useParams<{ id: string }>();

  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteVehicleModalTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ client: ClientDetail }>(`/api/clients/${params.id}`);
        if (!cancelled) setClient(res.client);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError && err.status === 404
              ? 'Client introuvable.'
              : 'Erreur inconnue.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, params.id, refreshTick]);

  // Audit request (2026-08-18): keep this page current without a manual
  // reload — silently re-fetch when the tab regains focus.
  useRefetchOnFocus(() => setRefreshTick((t) => t + 1));

  if (!user) return null;

  // 2026-08-18 audit fix: "Activer"/"Désactiver" from VehicleRowMenu, on
  // this client's own vehicles sub-list. Optimistic flip on the nested
  // `client.vehicles` array, rollback + error toast on failure — mirrors
  // /vehicles/page.tsx's handleToggleStatus.
  async function handleToggleStatus(v: ClientDetail['vehicles'][number]) {
    const nextStatus: 'Actif' | 'Inactif' = v.status === 'Actif' ? 'Inactif' : 'Actif';
    setClient((prev) =>
      prev
        ? {
            ...prev,
            vehicles: prev.vehicles.map((row) =>
              row.id === v.id ? { ...row, status: nextStatus } : row,
            ),
          }
        : prev,
    );
    try {
      await api(`/api/vehicles/${v.id}`, { method: 'PATCH', body: { status: nextStatus } });
      toast(
        `${v.brand} ${v.model} est maintenant ${nextStatus === 'Actif' ? 'actif' : 'inactif'}.`,
        'success',
      );
    } catch (err) {
      setClient((prev) =>
        prev
          ? {
              ...prev,
              vehicles: prev.vehicles.map((row) =>
                row.id === v.id ? { ...row, status: v.status } : row,
              ),
            }
          : prev,
      );
      toast(err instanceof ApiError ? err.message : 'Erreur inconnue.', 'error');
    }
  }

  async function confirmDeleteVehicle() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleting(true);
    setClient((prev) =>
      prev
        ? {
            ...prev,
            vehicles: prev.vehicles.filter((v) => v.id !== target.id),
            vehiclesCount: prev.vehiclesCount - 1,
          }
        : prev,
    );
    setDeleteTarget(null);
    try {
      await api(`/api/vehicles/${target.id}`, { method: 'DELETE' });
      toast(
        `${target.brand} ${target.model} (${target.registration}) a été supprimé du parc.`,
        'success',
      );
    } catch (err) {
      // Rollback — a full reload guarantees a correct list again after a
      // failed delete (position isn't tracked for re-insertion).
      setRefreshTick((t) => t + 1);
      if (err instanceof ApiError && err.code === 'VEHICLE_HAS_INTERVENTIONS') {
        toast("Ce véhicule a un historique d'interventions et ne peut pas être supprimé.", 'error');
      } else {
        toast(err instanceof ApiError ? err.message : 'Erreur inconnue.', 'error');
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex bg-background min-h-screen">
      <Sidebar active="clients" />

      <div className="flex flex-col flex-1 min-w-0">
        <div className="bg-surface border-b border-border px-4 py-4 lg:px-6 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggle}
              aria-label="Ouvrir le menu"
              className="lg:hidden w-9 h-9 flex items-center justify-center rounded-sm border border-border text-foreground shrink-0"
            >
              <Icon i="menu" size={18} />
            </button>
            <button
              type="button"
              onClick={() => router.push('/clients')}
              className="text-muted-foreground text-sm flex items-center gap-1"
            >
              <Icon i="chevron-left" size={14} />
              Retour
            </button>
            <span className="text-muted-foreground">/</span>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-widest">
                Fiche client
              </div>
              <div className="text-lg font-bold font-headings text-foreground">
                {client?.name ?? '…'}
              </div>
            </div>
          </div>
          {client && (
            <Button
              variant="primary"
              onClick={() => router.push(`/interventions/new?clientId=${client.id}`)}
            >
              <Icon i="wrench" size={14} />
              Nouvelle intervention
            </Button>
          )}
        </div>

        {loading ? (
          <div className="p-6 flex flex-col lg:flex-row gap-6">
            <div className="w-full lg:w-72 flex flex-col gap-4 shrink-0">
              <SkeletonProfileCard />
            </div>
            <div className="flex-1 flex flex-col gap-4 min-w-0">
              <SkeletonInfoCard rows={3} />
              <div className="bg-surface border border-border rounded-md overflow-hidden">
                {Array.from({ length: 3 }).map((_, i) => (
                  <SkeletonVehicleRow key={i} />
                ))}
              </div>
              <div className="bg-surface border border-border rounded-md overflow-hidden">
                {Array.from({ length: 3 }).map((_, i) => (
                  <SkeletonInterventionRow key={i} />
                ))}
              </div>
            </div>
          </div>
        ) : error ? (
          <p className="text-sm text-warning p-6">{error}</p>
        ) : (
          client && (
            <div className="p-6 flex flex-col lg:flex-row gap-6">
              {/* Left column — identity + stats */}
              <div className="w-full lg:w-72 flex flex-col gap-4 shrink-0">
                <div className="bg-surface border border-border rounded-md p-5 flex flex-col items-center gap-3 text-center">
                  <UserAvatar name={client.name} className="w-20 h-20 rounded-full text-xl" />
                  <div>
                    <div className="text-base font-bold text-foreground">{client.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Client depuis{' '}
                      {new Date(client.createdAt).toLocaleDateString('fr-FR', {
                        month: 'short',
                        year: 'numeric',
                      })}
                    </div>
                  </div>
                  <div className="w-full border-t border-border pt-3 flex flex-col gap-2 text-sm text-left">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Icon i="phone" size={14} />
                      <span>{client.phone}</span>
                    </div>
                    {client.email && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Icon i="mail" size={14} />
                        <span>{client.email}</span>
                      </div>
                    )}
                    {(client.city || client.country) && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Icon i="map-pin" size={14} />
                        <span>{[client.city, client.country].filter(Boolean).join(', ')}</span>
                      </div>
                    )}
                  </div>
                  <div
                    className={`flex items-center gap-1.5 w-full px-2 py-1 rounded-sm justify-center ${client.status === 'actif' ? 'bg-success/10' : 'bg-muted'}`}
                  >
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${client.status === 'actif' ? 'bg-success' : 'bg-muted-foreground'}`}
                    />
                    <span
                      className={`text-xs font-medium ${client.status === 'actif' ? 'text-success' : 'text-muted-foreground'}`}
                    >
                      {client.status === 'actif' ? 'Actif' : 'Inactif'}
                    </span>
                  </div>
                </div>

                <div className="bg-surface border border-border rounded-md p-5 flex flex-col gap-4">
                  <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    Statistiques
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-background rounded-md p-3">
                      <div className="text-xs text-muted-foreground">Interventions</div>
                      <div className="text-xl font-bold text-foreground mt-0.5">
                        <AnimatedNumber value={client.interventionsCount} />
                      </div>
                    </div>
                    <div className="bg-background rounded-md p-3">
                      <div className="text-xs text-muted-foreground">Véhicules</div>
                      <div className="text-xl font-bold text-foreground mt-0.5">
                        <AnimatedNumber value={client.vehiclesCount} />
                      </div>
                    </div>
                    <div className="bg-background rounded-md p-3 col-span-2">
                      <div className="text-xs text-muted-foreground">Total dépensé</div>
                      <div className="text-xl font-bold text-foreground mt-0.5">
                        <AnimatedNumber
                          value={client.totalSpent}
                          format={(n) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground border-t border-border pt-3">
                    Dernière visite :{' '}
                    <span className="text-foreground font-medium">
                      {client.lastVisit
                        ? new Date(client.lastVisit).toLocaleDateString('fr-FR')
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right column — vehicles + history */}
              <div className="flex-1 flex flex-col gap-4 min-w-0">
                <div className="bg-surface border border-border rounded-md overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                    <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                      Véhicules enregistrés
                    </div>
                    <button
                      type="button"
                      onClick={() => router.push(`/vehicles/new?clientId=${client.id}`)}
                      className="flex items-center gap-1.5 text-xs text-primary font-medium"
                    >
                      <Icon i="plus" size={12} />
                      Ajouter
                    </button>
                  </div>
                  {client.vehicles.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-5">Aucun véhicule enregistré.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      {client.vehicles.map((v) => (
                        <VehicleRow
                          key={v.id}
                          brand={v.brand}
                          model={v.model}
                          registration={v.registration}
                          owner={client.name}
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
                              owner: client.name,
                            })
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-surface border border-border rounded-md overflow-hidden flex-1">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                    <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                      Historique des interventions
                    </div>
                  </div>
                  {client.interventions.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-5">
                      Aucune intervention pour l&apos;instant.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <div className="min-w-[700px]">
                        {client.interventions.map((i) => (
                          <InterventionRow
                            key={i.id}
                            id={i.reference}
                            client={client.name}
                            vehicle={i.vehicle}
                            work={i.work}
                            date={formatInterventionDate(i.createdAt)}
                            amount={`${i.amount.toLocaleString('fr-FR')} FCFA`}
                            status={i.status}
                            onView={() => router.push(`/interventions/${i.id}`)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        )}
      </div>

      <DeleteVehicleModal
        target={deleteTarget}
        deleting={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDeleteVehicle()}
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
              setRefreshTick((t) => t + 1);
            }}
          />
        )}
      </Modal>
    </div>
  );
}
