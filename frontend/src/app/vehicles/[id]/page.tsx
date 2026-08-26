// Phase C item #7 (2026-08-25) — dedicated vehicle detail page. Layout
// mirrors clients/[id]/page.tsx's left-identity/right-history split; the
// "Historique des interventions" panel is the extracted
// InterventionHistoryCard (see its own header comment) rather than a
// rebuild — this page is what that extraction was for. Backed by GET
// /api/vehicles/[id]'s new `client`/`interventions` fields.
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useMobileSidebar } from '@/contexts/MobileSidebarContext';
import { useRefetchOnFocus } from '@/lib/useRefetchOnFocus';
import Sidebar from '@/components/layout/Sidebar';
import EditVehicleModal from '@/components/vehicles/EditVehicleModal';
import InterventionHistoryCard from '@/components/interventions/InterventionHistoryCard';
import { type InterventionStatus } from '@/components/interventions/InterventionRow';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import {
  SkeletonProfileCard,
  SkeletonInfoCard,
  SkeletonInterventionRow,
} from '@/components/ui/Skeleton';

interface VehicleDetail {
  id: string;
  clientId: string;
  brand: string;
  model: string;
  year: number | null;
  registration: string;
  mileage: number | null;
  fuelType: string | null;
  vin: string | null;
  engineNumber: string | null;
  color: string | null;
  notes: string | null;
  status: 'Actif' | 'Inactif';
  client: { id: string; name: string; phone: string };
  interventions: {
    id: string;
    reference: string;
    work: string;
    amount: number;
    status: InterventionStatus;
    createdAt: string;
  }[];
}

export default function VehicleDetailPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const { toggle } = useMobileSidebar();
  const params = useParams<{ id: string }>();

  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ vehicle: VehicleDetail }>(`/api/vehicles/${params.id}`);
        if (!cancelled) setVehicle(res.vehicle);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError && err.status === 404
              ? 'Véhicule introuvable.'
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

  useRefetchOnFocus(() => setRefreshTick((t) => t + 1));

  if (!user) return null;

  async function handleToggleStatus() {
    if (!vehicle) return;
    const nextStatus: 'Actif' | 'Inactif' = vehicle.status === 'Actif' ? 'Inactif' : 'Actif';
    const previous = vehicle.status;
    setVehicle((prev) => (prev ? { ...prev, status: nextStatus } : prev));
    try {
      await api(`/api/vehicles/${vehicle.id}`, { method: 'PATCH', body: { status: nextStatus } });
      toast(`Véhicule maintenant ${nextStatus === 'Actif' ? 'actif' : 'inactif'}.`, 'success');
    } catch (err) {
      setVehicle((prev) => (prev ? { ...prev, status: previous } : prev));
      toast(err instanceof ApiError ? err.message : 'Erreur inconnue.', 'error');
    }
  }

  return (
    <div className="flex bg-background min-h-screen">
      <Sidebar active="vehicles" />

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
              onClick={() => router.push('/vehicles')}
              className="text-muted-foreground text-sm flex items-center gap-1"
            >
              <Icon i="chevron-left" size={14} />
              Retour
            </button>
            <span className="text-muted-foreground">/</span>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-widest">
                Fiche véhicule
              </div>
              <div className="text-lg font-bold font-headings text-foreground">
                {vehicle ? `${vehicle.brand} ${vehicle.model}` : '…'}
              </div>
            </div>
          </div>
          {vehicle && (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Icon i="pencil" size={14} />
                Modifier
              </Button>
              <Button
                variant="primary"
                onClick={() => router.push(`/interventions/new?vehicleId=${vehicle.id}`)}
              >
                <Icon i="wrench" size={14} />
                Nouvelle intervention
              </Button>
            </div>
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
                  <SkeletonInterventionRow key={i} />
                ))}
              </div>
            </div>
          </div>
        ) : error ? (
          <p className="text-sm text-warning p-6">{error}</p>
        ) : (
          vehicle && (
            <div className="p-6 flex flex-col lg:flex-row gap-6">
              {/* Left column — identity */}
              <div className="w-full lg:w-72 flex flex-col gap-4 shrink-0">
                <div className="bg-surface border border-border rounded-md p-5 flex flex-col items-center gap-3 text-center">
                  <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                    <Icon i="car" size={32} className="text-primary" />
                  </div>
                  <div>
                    <div className="text-base font-bold text-foreground">
                      {vehicle.brand} {vehicle.model}
                      {vehicle.year ? ` ${vehicle.year}` : ''}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Plaque : {vehicle.registration}
                    </div>
                  </div>
                  <div
                    className={`flex items-center gap-1.5 w-full px-2 py-1 rounded-sm justify-center ${vehicle.status === 'Actif' ? 'bg-success/10' : 'bg-muted'}`}
                  >
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${vehicle.status === 'Actif' ? 'bg-success' : 'bg-muted-foreground'}`}
                    />
                    <span
                      className={`text-xs font-medium ${vehicle.status === 'Actif' ? 'text-success' : 'text-muted-foreground'}`}
                    >
                      {vehicle.status}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleToggleStatus()}
                    className="text-xs text-primary font-medium"
                  >
                    {vehicle.status === 'Actif' ? 'Désactiver' : 'Activer'}
                  </button>
                </div>

                <div className="bg-surface border border-border rounded-md p-5 flex flex-col gap-3 text-sm">
                  <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    Propriétaire
                  </div>
                  <Link
                    href={`/clients/${vehicle.client.id}`}
                    className="flex items-center gap-2 text-primary font-medium"
                  >
                    <Icon i="user" size={14} />
                    {vehicle.client.name}
                  </Link>
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <Icon i="phone" size={14} />
                    {vehicle.client.phone}
                  </div>
                </div>

                <div className="bg-surface border border-border rounded-md p-5 flex flex-col gap-3 text-xs">
                  <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    Détails techniques
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-muted-foreground">Kilométrage</div>
                      <div className="text-foreground font-bold mt-0.5">
                        {vehicle.mileage ? `${vehicle.mileage.toLocaleString('fr-FR')} km` : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Carburant</div>
                      <div className="text-foreground font-bold mt-0.5">
                        {vehicle.fuelType ?? '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">VIN</div>
                      <div className="text-foreground font-bold mt-0.5 break-all">
                        {vehicle.vin ?? '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">N° moteur</div>
                      <div className="text-foreground font-bold mt-0.5 break-all">
                        {vehicle.engineNumber ?? '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Couleur</div>
                      <div className="text-foreground font-bold mt-0.5">{vehicle.color ?? '—'}</div>
                    </div>
                  </div>
                  {vehicle.notes && (
                    <div className="border-t border-border pt-3">
                      <div className="text-muted-foreground mb-1">Notes</div>
                      <div className="text-foreground whitespace-pre-wrap">{vehicle.notes}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right column — intervention history */}
              <div className="flex-1 flex flex-col gap-4 min-w-0">
                <div className="bg-surface border border-border rounded-md p-5 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">Interventions</div>
                    <div className="text-xl font-bold text-foreground mt-0.5">
                      {vehicle.interventions.length}
                    </div>
                  </div>
                  <Badge tone={vehicle.status === 'Actif' ? 'success' : 'muted'}>
                    {vehicle.status}
                  </Badge>
                </div>

                <InterventionHistoryCard
                  items={vehicle.interventions.map((i) => ({
                    ...i,
                    client: vehicle.client.name,
                    vehicle: `${vehicle.brand} ${vehicle.model} · ${vehicle.registration}`,
                  }))}
                  onView={(id) => router.push(`/interventions/${id}`)}
                />
              </div>
            </div>
          )
        )}
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Modifier le véhicule"
        icon="pencil"
        maxWidth="lg"
      >
        {vehicle && editOpen && (
          <EditVehicleModal
            vehicleId={vehicle.id}
            onClose={() => setEditOpen(false)}
            onSaved={() => {
              setEditOpen(false);
              toast('Véhicule mis à jour.', 'success');
              setRefreshTick((t) => t + 1);
            }}
          />
        )}
      </Modal>
    </div>
  );
}
