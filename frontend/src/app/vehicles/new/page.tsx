// Ported from Banani AddVehicleForClient(+CompanyOwned) — reached from a
// client's profile, clientId pre-filled/locked — and AddVehicleToFleet
// (+_next1) — reached from the fleet list directly, client picked via
// search. One form covers both Banani entry points via the optional
// ?clientId= query param, rather than two separate pages.
'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import Sidebar from '@/components/layout/Sidebar';
import PageHeader from '@/components/ui/PageHeader';
import FormSection from '@/components/ui/FormSection';
import RadioCard from '@/components/ui/RadioCard';
import Field from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';

interface ClientOption {
  id: string;
  name: string;
}

function NewVehicleBody() {
  const user = useUser();
  const router = useRouter();
  const params = useSearchParams();
  const lockedClientId = params.get('clientId');

  const [clientId, setClientId] = useState(lockedClientId ?? '');
  const [lockedClientName, setLockedClientName] = useState<string | null>(null);
  const [clientQuery, setClientQuery] = useState('');
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);
  const [selectedClientName, setSelectedClientName] = useState('');

  const [ownerType, setOwnerType] = useState<'INDIVIDUAL' | 'COMPANY'>('INDIVIDUAL');
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

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill banner when arriving with a locked clientId (from a client's profile).
  useEffect(() => {
    if (!lockedClientId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ client: { name: string } }>(`/api/clients/${lockedClientId}`);
        if (!cancelled) setLockedClientName(res.client.name);
      } catch {
        // Leave the banner off — the form still works with just the id.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lockedClientId]);

  // Client search-as-you-type when no clientId is locked (fleet-list entry point).
  useEffect(() => {
    if (lockedClientId || clientQuery.trim().length < 2) {
      setClientOptions([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await api<{ items: { id: string; name: string }[] }>(
          `/api/clients?q=${encodeURIComponent(clientQuery)}&limit=8`,
        );
        if (!cancelled) setClientOptions(res.items);
      } catch {
        if (!cancelled) setClientOptions([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [clientQuery, lockedClientId]);

  if (!user) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!clientId) {
      setError('Sélectionnez un client.');
      return;
    }
    setSubmitting(true);
    try {
      await api('/api/vehicles', {
        method: 'POST',
        body: {
          clientId,
          ownerType,
          brand,
          model,
          registration,
          ...(year ? { year: Number(year) } : {}),
          ...(mileage ? { mileage: Number(mileage) } : {}),
          ...(fuelType ? { fuelType } : {}),
          ...(vin ? { vin } : {}),
          ...(engineNumber ? { engineNumber } : {}),
          ...(color ? { color } : {}),
          ...(notes ? { notes } : {}),
        },
      });
      router.push(lockedClientId ? `/clients/${lockedClientId}` : `/vehicles`);
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

  return (
    <div className="flex bg-background min-h-screen">
      <Sidebar active="vehicles" />

      <div className="flex flex-col flex-1 min-w-0">
        <PageHeader
          eyebrow={lockedClientId ? 'Nouveau client' : 'Parc'}
          title="Ajouter un véhicule"
          action={
            <button
              type="button"
              onClick={() => router.back()}
              className="text-primary text-sm font-medium"
            >
              Retour
            </button>
          }
        />

        <div className="flex-1 overflow-y-auto">
          <form onSubmit={onSubmit} className="max-w-3xl mx-auto p-6 flex flex-col gap-6">
            {lockedClientId ? (
              <div className="bg-secondary/10 border border-secondary rounded-md p-4">
                <div className="text-sm font-medium text-secondary-foreground">
                  Ajout d&apos;un véhicule pour{' '}
                  <span className="font-bold">{lockedClientName ?? '…'}</span>
                </div>
              </div>
            ) : (
              <FormSection title="Client">
                <div className="relative">
                  <Field
                    label="Sélectionner le client"
                    name="clientSearch"
                    required
                    value={selectedClientName || clientQuery}
                    onChange={(v) => {
                      setClientQuery(v);
                      setSelectedClientName('');
                      setClientId('');
                    }}
                    placeholder="Tapez le nom du client…"
                  />
                  {clientOptions.length > 0 && !selectedClientName && (
                    <div className="absolute z-10 mt-1 w-full bg-surface border border-border rounded-md shadow-lg overflow-hidden">
                      {clientOptions.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setClientId(c.id);
                            setSelectedClientName(c.name);
                            setClientOptions([]);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-input"
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </FormSection>
            )}

            <FormSection title="Informations du véhicule">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                <Field
                  label="Marque"
                  name="brand"
                  required
                  value={brand}
                  onChange={setBrand}
                  placeholder="Ex: Toyota"
                />
                <Field
                  label="Modèle"
                  name="model"
                  required
                  value={model}
                  onChange={setModel}
                  placeholder="Ex: Prius"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                <Field
                  label="Année"
                  name="year"
                  type="number"
                  value={year}
                  onChange={setYear}
                  placeholder="Ex: 2020"
                />
                <Field
                  label="Immatriculation"
                  name="registration"
                  required
                  value={registration}
                  onChange={setRegistration}
                  placeholder="Ex: DK-1234-A"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Field
                  label="Kilométrage"
                  name="mileage"
                  type="number"
                  value={mileage}
                  onChange={setMileage}
                  placeholder="Ex: 45000"
                />
                <Field
                  label="Type de carburant"
                  name="fuelType"
                  value={fuelType}
                  onChange={setFuelType}
                  placeholder="Ex: Essence, Diesel"
                />
              </div>
            </FormSection>

            <FormSection title="Identifiants techniques">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                <Field
                  label="N° de série (VIN)"
                  name="vin"
                  value={vin}
                  onChange={setVin}
                  placeholder="Ex: WBADT43452G915078"
                />
                <Field
                  label="N° de moteur"
                  name="engineNumber"
                  value={engineNumber}
                  onChange={setEngineNumber}
                  placeholder="Ex: 123456789"
                />
              </div>
              <Field
                label="Couleur"
                name="color"
                value={color}
                onChange={setColor}
                placeholder="Ex: Noir, Bleu, Blanc"
              />
            </FormSection>

            <FormSection title="Propriétaire du véhicule">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <RadioCard
                  label="Client lui-même"
                  selected={ownerType === 'INDIVIDUAL'}
                  onClick={() => setOwnerType('INDIVIDUAL')}
                />
                <RadioCard
                  label="Entreprise cliente"
                  selected={ownerType === 'COMPANY'}
                  onClick={() => setOwnerType('COMPANY')}
                />
              </div>
            </FormSection>

            <FormSection title="Notes">
              <Field
                label=""
                name="notes"
                type="textarea"
                value={notes}
                onChange={setNotes}
                placeholder="Ajouter des notes sur ce véhicule"
              />
            </FormSection>

            <div className="bg-secondary/20 border border-secondary rounded-md px-4 py-3">
              <div className="flex gap-2 text-sm">
                <Icon
                  i="info"
                  size={16}
                  className="text-secondary-foreground flex-shrink-0 mt-0.5"
                />
                <p className="text-secondary-foreground">
                  Marque, modèle et immatriculation sont obligatoires pour
                  {lockedClientId ? ' enregistrer un véhicule.' : ' ajouter un véhicule au parc.'}
                </p>
              </div>
            </div>

            {error && (
              <p role="alert" className="text-sm text-warning">
                {error}
              </p>
            )}

            <div className="flex gap-3 py-4 border-t border-border">
              <Button
                type="submit"
                variant="primary"
                disabled={submitting}
                className="flex-1 justify-center"
              >
                <Icon i="check" size={14} />
                {submitting ? 'Ajout…' : 'Ajouter ce véhicule'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                className="flex-1 justify-center"
              >
                Annuler
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function NewVehiclePage() {
  return (
    <Suspense fallback={null}>
      <NewVehicleBody />
    </Suspense>
  );
}
