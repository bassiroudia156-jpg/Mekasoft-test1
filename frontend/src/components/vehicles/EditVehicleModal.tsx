'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import Field from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import { SkeletonForm } from '@/components/ui/Skeleton';

export interface EditVehicleModalSavedPayload {
  id: string;
  brand: string;
  model: string;
  registration: string;
  mileage: number | null;
  status: 'Actif' | 'Inactif';
}

export interface EditVehicleModalProps {
  vehicleId: string;
  onClose: () => void;
  onSaved: (vehicle: EditVehicleModalSavedPayload) => void;
}

interface VehicleDetail {
  id: string;
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
}

// 2026-08-18 audit fix: "Modifier les informations" from VehicleRowMenu —
// lazy-fetches the full vehicle record (the list/client-profile rows only
// carry the display subset) rather than bloating either list endpoint's
// payload for a rarely-used action.
export default function EditVehicleModal({ vehicleId, onClose, onSaved }: EditVehicleModalProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [registration, setRegistration] = useState('');
  const [mileage, setMileage] = useState('');
  const [fuelType, setFuelType] = useState('');
  const [vin, setVin] = useState('');
  const [engineNumber, setEngineNumber] = useState('');
  const [color, setColor] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'Actif' | 'Inactif'>('Actif');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const res = await api<{ vehicle: VehicleDetail }>(`/api/vehicles/${vehicleId}`);
        if (cancelled) return;
        const v = res.vehicle;
        setBrand(v.brand);
        setModel(v.model);
        setYear(v.year ? String(v.year) : '');
        setRegistration(v.registration);
        setMileage(v.mileage !== null ? String(v.mileage) : '');
        setFuelType(v.fuelType ?? '');
        setVin(v.vin ?? '');
        setEngineNumber(v.engineNumber ?? '');
        setColor(v.color ?? '');
        setNotes(v.notes ?? '');
        setStatus(v.status);
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof ApiError ? err.message : 'Impossible de charger le véhicule.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vehicleId]);

  async function onSubmit() {
    setError(null);
    if (!brand.trim() || !model.trim() || !registration.trim()) {
      setError('Marque, modèle et immatriculation sont obligatoires.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api<{ vehicle: VehicleDetail }>(`/api/vehicles/${vehicleId}`, {
        method: 'PATCH',
        body: {
          brand,
          model,
          registration,
          year: year ? Number(year) : null,
          mileage: mileage ? Number(mileage) : null,
          fuelType: fuelType || null,
          vin: vin || null,
          engineNumber: engineNumber || null,
          color: color || null,
          notes: notes || null,
          status,
        },
      });
      onSaved({
        id: res.vehicle.id,
        brand: res.vehicle.brand,
        model: res.vehicle.model,
        registration: res.vehicle.registration,
        mileage: res.vehicle.mileage,
        status: res.vehicle.status,
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'REGISTRATION_ALREADY_EXISTS') {
        setError('Un véhicule avec cette immatriculation existe déjà.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Erreur inconnue.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <SkeletonForm fields={4} />;
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="text-sm text-warning">
          {loadError}
        </p>
        <Button variant="outline" onClick={onClose} className="justify-center">
          Fermer
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Marque" name="brand" required value={brand} onChange={setBrand} />
        <Field label="Modèle" name="model" required value={model} onChange={setModel} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Année" name="year" type="number" value={year} onChange={setYear} />
        <Field
          label="Immatriculation"
          name="registration"
          required
          value={registration}
          onChange={setRegistration}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          label="Kilométrage"
          name="mileage"
          type="number"
          value={mileage}
          onChange={setMileage}
        />
        <Field label="Type de carburant" name="fuelType" value={fuelType} onChange={setFuelType} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="N° de série (VIN)" name="vin" value={vin} onChange={setVin} />
        <Field
          label="N° de moteur"
          name="engineNumber"
          value={engineNumber}
          onChange={setEngineNumber}
        />
      </div>
      <Field label="Couleur" name="color" value={color} onChange={setColor} />
      <Field
        label="Statut"
        name="status"
        type="select"
        value={status}
        onChange={(v) => setStatus(v as 'Actif' | 'Inactif')}
        options={[
          { value: 'Actif', label: 'Actif' },
          { value: 'Inactif', label: 'Inactif' },
        ]}
      />
      <Field
        label="Notes"
        name="notes"
        type="textarea"
        value={notes}
        onChange={setNotes}
        placeholder="Ajouter des notes sur ce véhicule"
      />

      {error && (
        <p role="alert" className="text-sm text-warning">
          {error}
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <Button
          variant="outline"
          onClick={onClose}
          disabled={submitting}
          className="flex-1 justify-center"
        >
          Annuler
        </Button>
        <Button
          variant="primary"
          onClick={() => void onSubmit()}
          disabled={submitting}
          className="flex-1 justify-center"
        >
          {submitting ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  );
}
