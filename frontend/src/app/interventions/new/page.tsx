// Ported from Banani NewIntervention + NewInterventionWithParts (parts-
// added state) + NewInterventionFromVehicle (locked entry point) +
// PartsValidatedIntervention (parts-confirmed variant) +
// InterventionCreatedSuccess (internal success view, same pattern as
// /clients/new and /vehicles/new).
//
// Parts editing is inline (not a separate route) — see Phase 5 decisions
// in .planning/banani/phase-5-interventions.md: there's no intervention ID
// to round-trip against until creation, so the parts basket lives as local
// state here and is submitted atomically with the intervention.
'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import Sidebar from '@/components/layout/Sidebar';
import PageHeader from '@/components/ui/PageHeader';
import FormSection from '@/components/ui/FormSection';
import Field from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import SearchSelect, { type SearchSelectOption } from '@/components/ui/SearchSelect';
import AddPartForm, { type NewPart } from '@/components/interventions/AddPartForm';
import PartsRow from '@/components/interventions/PartsRow';
import Switch from '@/components/ui/Switch';

const CATEGORY_OPTIONS = [
  { value: 'Maintenance', label: 'Maintenance' },
  { value: 'Réparation', label: 'Réparation' },
  { value: 'Diagnostic', label: 'Diagnostic' },
  { value: 'Révision', label: 'Révision' },
  { value: 'Autre', label: 'Autre' },
];

const PRIORITY_OPTIONS = [
  { value: 'Normal', label: 'Normal' },
  { value: 'Urgente', label: 'Urgente' },
];

interface VehicleOption {
  id: string;
  brand: string;
  model: string;
  year: number | null;
  registration: string;
  mileage: number | null;
}

interface CreatedIntervention {
  id: string;
  reference: string;
  createdAt: string;
}

function formatFCFA(n: number): string {
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

function NewInterventionBody() {
  const user = useUser();
  const router = useRouter();
  const params = useSearchParams();
  const lockedClientId = params.get('clientId');
  const lockedVehicleId = params.get('vehicleId');

  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState<string | null>(null);
  const [clientQuery, setClientQuery] = useState('');
  const [clientOptions, setClientOptions] = useState<SearchSelectOption[]>([]);
  const [clientLocked, setClientLocked] = useState(!!lockedClientId || !!lockedVehicleId);

  const [vehicleId, setVehicleId] = useState('');
  const [vehicleName, setVehicleName] = useState<string | null>(null);
  const [vehicleDetails, setVehicleDetails] = useState<VehicleOption | null>(null);
  const [vehicleQuery, setVehicleQuery] = useState('');
  const [clientVehicles, setClientVehicles] = useState<VehicleOption[]>([]);
  const [vehicleLocked, setVehicleLocked] = useState(!!lockedVehicleId);

  const [work, setWork] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('Normal');
  const [notes, setNotes] = useState('');
  const [laborAmount, setLaborAmount] = useState('');
  const [partsAmountManual, setPartsAmountManual] = useState('');
  const [parts, setParts] = useState<NewPart[]>([]);
  const [showPartsEditor, setShowPartsEditor] = useState(false);
  // Pre-filled with Senegal's real TVA rate but fully editable — not every
  // country/product shares it (Intervention.taxRatePct is per-row for
  // exactly this reason).
  const [taxRatePct, setTaxRatePct] = useState('18');
  // On/off toggle requested on top of the (already optional) rate field —
  // easier to flip a switch than to remember to type 0. Toggling off never
  // clears `taxRatePct` itself, just forces the effective rate to 0 and
  // disables the field — toggling back on restores whatever was typed
  // before (or 18 if that was itself 0/empty, matching the field's default).
  const [taxEnabled, setTaxEnabled] = useState(true);

  function handleToggleTax(next: boolean) {
    setTaxEnabled(next);
    if (next && (!taxRatePct || Number(taxRatePct) === 0)) {
      setTaxRatePct('18');
    }
  }

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedIntervention | null>(null);

  const partsTotal = parts.reduce((sum, p) => sum + p.quantity * p.unitPrice, 0);
  const effectivePartsAmount = parts.length > 0 ? partsTotal : Number(partsAmountManual) || 0;
  const laborNum = Number(laborAmount) || 0;
  const subtotal = laborNum + effectivePartsAmount;
  const taxRatePctNum = taxEnabled ? Math.min(100, Math.max(0, Number(taxRatePct) || 0)) : 0;
  const taxAmount = Math.round((subtotal * taxRatePctNum) / 100);
  const total = subtotal + taxAmount;

  // Pre-fill locked entry points: from a client's profile (?clientId=) or
  // from a vehicle (?vehicleId=, both fields lock — NewInterventionFromVehicle).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (lockedVehicleId) {
          const vRes = await api<{ vehicle: VehicleOption & { clientId: string } }>(
            `/api/vehicles/${lockedVehicleId}`,
          );
          if (cancelled) return;
          setVehicleId(vRes.vehicle.id);
          setVehicleName(`${vRes.vehicle.brand} ${vRes.vehicle.model}`);
          setVehicleDetails(vRes.vehicle);
          const cRes = await api<{ client: { id: string; name: string } }>(
            `/api/clients/${vRes.vehicle.clientId}`,
          );
          if (cancelled) return;
          setClientId(cRes.client.id);
          setClientName(cRes.client.name);
        } else if (lockedClientId) {
          const cRes = await api<{ client: { id: string; name: string } }>(
            `/api/clients/${lockedClientId}`,
          );
          if (cancelled) return;
          setClientId(cRes.client.id);
          setClientName(cRes.client.name);
        }
      } catch {
        // Locking is best-effort — the search fields still work if this fails.
        if (!cancelled) {
          setClientLocked(false);
          setVehicleLocked(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lockedClientId, lockedVehicleId]);

  // Client picker — a real "menu roulant": focusing the field with nothing
  // typed yet shows a default browsable list of the org's clients (most
  // recent first, same ordering as /clients), not just a "type 2+
  // characters to search" combobox. Typing narrows it via the same search
  // used elsewhere. Both branches share one debounced fetch.
  useEffect(() => {
    if (clientLocked) {
      setClientOptions([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const q = clientQuery.trim();
        const params = new URLSearchParams({ limit: '20' });
        if (q) params.set('q', q);
        const res = await api<{ items: { id: string; name: string; phone: string }[] }>(
          `/api/clients?${params.toString()}`,
        );
        if (!cancelled) {
          setClientOptions(res.items.map((c) => ({ id: c.id, label: c.name, sublabel: c.phone })));
        }
      } catch {
        if (!cancelled) setClientOptions([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [clientQuery, clientLocked]);

  // Once a client is selected, load its vehicles for the (client-scoped)
  // vehicle picker — a repair job must be for a vehicle that client owns.
  useEffect(() => {
    if (!clientId || vehicleLocked) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ client: { vehicles: VehicleOption[] } }>(
          `/api/clients/${clientId}`,
        );
        if (!cancelled) setClientVehicles(res.client.vehicles);
      } catch {
        if (!cancelled) setClientVehicles([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, vehicleLocked]);

  if (!user) return null;

  const vehicleOptions: SearchSelectOption[] = clientVehicles
    .filter((v) =>
      vehicleQuery.trim()
        ? `${v.brand} ${v.model} ${v.registration}`
            .toLowerCase()
            .includes(vehicleQuery.toLowerCase())
        : true,
    )
    .map((v) => ({ id: v.id, label: `${v.brand} ${v.model}`, sublabel: v.registration }));

  function handleSelectClient(opt: SearchSelectOption) {
    setClientId(opt.id);
    setClientName(opt.label);
    setClientOptions([]);
    setClientQuery('');
    setVehicleId('');
    setVehicleName(null);
    setVehicleDetails(null);
  }

  function handleSelectVehicle(opt: SearchSelectOption) {
    setVehicleId(opt.id);
    setVehicleName(opt.label);
    setVehicleQuery('');
    const found = clientVehicles.find((v) => v.id === opt.id) ?? null;
    setVehicleDetails(found);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!clientId || !vehicleId) {
      setError('Sélectionnez un client et un véhicule.');
      return;
    }
    if (!work.trim()) {
      setError('Description des travaux requise.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api<{ intervention: CreatedIntervention }>('/api/interventions', {
        method: 'POST',
        body: {
          clientId,
          vehicleId,
          work,
          ...(category ? { category } : {}),
          priority,
          ...(notes ? { notes } : {}),
          laborAmount: laborNum,
          partsAmount: parts.length > 0 ? 0 : Number(partsAmountManual) || 0,
          parts,
          taxRatePct: taxRatePctNum,
        },
      });
      setCreated(res.intervention);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur inconnue.');
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setCreated(null);
    setClientId('');
    setClientName(null);
    setVehicleId('');
    setVehicleName(null);
    setVehicleDetails(null);
    setWork('');
    setCategory('');
    setPriority('Normal');
    setNotes('');
    setLaborAmount('');
    setPartsAmountManual('');
    setParts([]);
    setShowPartsEditor(false);
  }

  return (
    <div className="flex bg-background min-h-screen">
      <Sidebar active="interventions" />

      <div className="flex flex-col flex-1">
        <PageHeader
          eyebrow={created ? 'Intervention créée' : 'Nouvelle intervention'}
          title={
            created ? 'Dossier de réparation ouvert avec succès' : 'Créer un dossier de réparation'
          }
          action={
            !created && (
              <button
                type="button"
                onClick={() => router.back()}
                className="text-primary text-sm font-medium"
              >
                Fermer
              </button>
            )
          }
        />

        <div className="flex-1 overflow-y-auto">
          {created ? (
            <div className="max-w-2xl w-full mx-auto p-6 flex flex-col gap-6 text-center">
              <div className="flex justify-center mb-2">
                <div className="w-24 h-24 rounded-full bg-success/10 border border-success/20 flex items-center justify-center">
                  <Icon i="circle-check" size={48} className="text-success" />
                </div>
              </div>
              <div>
                <h2 className="text-2xl font-bold font-headings text-foreground mb-2">
                  Intervention créée avec succès !
                </h2>
                <p className="text-muted-foreground text-sm">
                  Le dossier de réparation a été ouvert et est prêt pour la gestion.
                </p>
              </div>

              <div className="bg-surface border border-border rounded-md p-6 text-left space-y-3">
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Détails de l&apos;intervention
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Numéro de dossier</div>
                    <div className="text-2xl font-bold font-headings text-foreground">
                      {created.reference}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Client</div>
                    <div className="text-sm font-medium text-foreground">{clientName}</div>
                  </div>
                </div>
              </div>

              <div className="bg-primary/5 border border-primary/10 rounded-md p-5">
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
                  Résumé financier
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Main-d&apos;œuvre</span>
                    <span className="font-medium text-foreground">{formatFCFA(laborNum)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Pièces détachées</span>
                    <span className="font-medium text-foreground">
                      {formatFCFA(effectivePartsAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">TVA ({taxRatePctNum}%)</span>
                    <span className="font-medium text-foreground">{formatFCFA(taxAmount)}</span>
                  </div>
                  <div className="border-t border-primary/10 pt-2 flex justify-between items-center">
                    <span className="font-medium text-foreground">Total estimé</span>
                    <span className="text-lg font-bold text-primary">{formatFCFA(total)}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-2">
                <Button
                  variant="primary"
                  className="justify-center"
                  onClick={() => router.push(`/interventions/${created.id}`)}
                >
                  <Icon i="file-text" size={16} />
                  Voir le dossier
                </Button>
                <Button
                  variant="soft"
                  className="justify-center"
                  onClick={() => router.push(`/interventions/${created.id}/devis`)}
                >
                  <Icon i="printer" size={16} />
                  Imprimer le devis
                </Button>
                <Button variant="soft" className="justify-center col-span-2" onClick={resetForm}>
                  <Icon i="plus" size={16} />
                  Créer une nouvelle intervention
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="max-w-3xl mx-auto p-6 flex flex-col gap-6">
              <FormSection title="Client & véhicule">
                {clientLocked && clientName ? (
                  <div className="bg-secondary/10 border border-secondary rounded-md p-4 mb-4">
                    <div className="text-sm font-medium text-secondary-foreground">
                      Intervention pour <span className="font-bold">{clientName}</span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <SearchSelect
                      label="Client"
                      name="clientSearch"
                      required
                      placeholder="Chercher ou créer…"
                      query={clientQuery}
                      onQueryChange={setClientQuery}
                      options={clientOptions}
                      selectedLabel={clientName}
                      onSelect={handleSelectClient}
                      onClear={() => {
                        setClientId('');
                        setClientName(null);
                      }}
                    />
                    <SearchSelect
                      label="Véhicule"
                      name="vehicleSearch"
                      required
                      placeholder={
                        clientId ? 'Sélectionner un véhicule…' : 'Choisissez un client d’abord'
                      }
                      query={vehicleQuery}
                      onQueryChange={setVehicleQuery}
                      options={clientId ? vehicleOptions : []}
                      selectedLabel={vehicleName}
                      onSelect={handleSelectVehicle}
                      onClear={() => {
                        setVehicleId('');
                        setVehicleName(null);
                        setVehicleDetails(null);
                      }}
                    />
                  </div>
                )}

                {vehicleLocked && vehicleName && (
                  <div className="bg-secondary/10 border border-secondary rounded-md p-4 mb-4">
                    <div className="text-sm font-medium text-secondary-foreground">
                      Véhicule : <span className="font-bold">{vehicleName}</span>
                    </div>
                  </div>
                )}

                {vehicleDetails && (
                  <div className="grid grid-cols-3 gap-4 text-xs pt-2 border-t border-border">
                    <div>
                      <div className="text-muted-foreground font-medium">Plaque</div>
                      <div className="text-foreground font-bold">{vehicleDetails.registration}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground font-medium">Kilométrage</div>
                      <div className="text-foreground font-bold">
                        {vehicleDetails.mileage
                          ? `${vehicleDetails.mileage.toLocaleString('fr-FR')} km`
                          : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground font-medium">Modèle</div>
                      <div className="text-foreground font-bold">
                        {vehicleDetails.brand} {vehicleDetails.model}
                        {vehicleDetails.year ? ` ${vehicleDetails.year}` : ''}
                      </div>
                    </div>
                  </div>
                )}
              </FormSection>

              <FormSection title="Travaux à effectuer">
                <Field
                  label="Description des travaux"
                  name="work"
                  type="textarea"
                  required
                  value={work}
                  onChange={setWork}
                  placeholder="Ex: Vidange huile, remplacement filtre, inspection frein…"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  <Field
                    label="Catégorie"
                    name="category"
                    type="select"
                    value={category}
                    onChange={setCategory}
                    placeholder="Maintenance, Réparation…"
                    options={CATEGORY_OPTIONS}
                  />
                  <Field
                    label="Priorité"
                    name="priority"
                    type="select"
                    value={priority}
                    onChange={setPriority}
                    options={PRIORITY_OPTIONS}
                  />
                </div>
              </FormSection>

              <FormSection title={parts.length > 0 ? 'Coût estimé (mis à jour)' : 'Coût estimé'}>
                <div className="flex items-center justify-between mb-4">
                  <span />
                  {parts.length === 0 && (
                    <button
                      type="button"
                      onClick={() => setShowPartsEditor((v) => !v)}
                      className="text-xs text-primary font-medium"
                    >
                      {showPartsEditor ? 'Masquer les pièces' : 'Ajouter pièces de rechange'}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <Field
                    label="Main-d'œuvre (CFA)"
                    name="laborAmount"
                    type="number"
                    value={laborAmount}
                    onChange={setLaborAmount}
                    placeholder="Ex: 25000"
                  />
                  <Field
                    label="Pièces détachées (CFA)"
                    name="partsAmount"
                    type="number"
                    value={parts.length > 0 ? String(partsTotal) : partsAmountManual}
                    onChange={setPartsAmountManual}
                    placeholder="Ex: 15000"
                    {...(parts.length > 0
                      ? { helper: 'Calculé depuis la liste des pièces ci-dessous' }
                      : {})}
                  />
                  <Field
                    label="TVA (%)"
                    name="taxRatePct"
                    type="number"
                    value={taxEnabled ? taxRatePct : '0'}
                    onChange={setTaxRatePct}
                    placeholder="18"
                    disabled={!taxEnabled}
                    helper={
                      taxEnabled
                        ? 'Modifiable selon le pays ou le produit'
                        : 'TVA désactivée pour cette intervention'
                    }
                    labelExtra={
                      <Switch
                        checked={taxEnabled}
                        onChange={handleToggleTax}
                        label={taxEnabled ? 'Désactiver la TVA' : 'Activer la TVA'}
                      />
                    }
                  />
                </div>

                {(showPartsEditor || parts.length > 0) && (
                  <div className="flex flex-col gap-3 mb-4">
                    <AddPartForm onAdd={(p) => setParts((prev) => [...prev, p])} />
                    {parts.length > 0 && (
                      <div className="bg-background border border-border rounded-md overflow-hidden">
                        <div className="flex items-center gap-4 px-4 py-2.5 border-b border-border text-xs font-medium uppercase tracking-widest text-muted-foreground">
                          <div className="w-5" />
                          <div className="flex-1">Pièce</div>
                          <div className="w-32">Fournisseur</div>
                          <div className="w-24">Quantité</div>
                          <div className="w-24 text-right">P.U.</div>
                          <div className="w-28 text-right">Total</div>
                          <div className="w-20 text-center">Stock</div>
                          <div className="w-6" />
                        </div>
                        {parts.map((p, idx) => (
                          <PartsRow
                            key={idx}
                            reference={p.reference ?? '—'}
                            name={p.name}
                            supplier={p.supplier ?? '—'}
                            quantity={p.quantity}
                            unit={p.unit}
                            unitPrice={formatFCFA(p.unitPrice)}
                            total={formatFCFA(p.quantity * p.unitPrice)}
                            inStock={p.inStock}
                            onDelete={() => setParts((prev) => prev.filter((_, i) => i !== idx))}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div
                  className={
                    parts.length > 0
                      ? 'bg-success/5 border border-success/20 rounded-md px-4 py-3 flex items-center justify-between'
                      : 'bg-primary/5 border border-primary/10 rounded-md px-4 py-3 flex items-center justify-between'
                  }
                >
                  <div>
                    <div className="text-xs text-muted-foreground">
                      {parts.length > 0
                        ? `Total estimé (avec ${parts.length} pièces)`
                        : 'Total estimé'}
                    </div>
                    <div className="text-2xl font-bold font-headings text-foreground">
                      {formatFCFA(total)}
                    </div>
                  </div>
                  {parts.length > 0 ? (
                    <div className="flex items-center gap-2 text-success text-sm font-medium bg-success/10 px-3 py-1.5 rounded-md">
                      <Icon i="circle-check" size={16} />
                      Pièces confirmées
                    </div>
                  ) : (
                    <Icon i="info" size={20} className="text-primary" />
                  )}
                </div>
              </FormSection>

              <FormSection title="Notes internes">
                <Field
                  label=""
                  name="notes"
                  type="textarea"
                  value={notes}
                  onChange={setNotes}
                  placeholder="Observations sur l'état du véhicule, demandes clients…"
                />
              </FormSection>

              {error && (
                <p role="alert" className="text-sm text-warning">
                  {error}
                </p>
              )}

              <div className="flex gap-3 py-4 border-t border-border">
                <Button
                  type="submit"
                  variant="accent"
                  disabled={submitting}
                  className="flex-1 justify-center"
                >
                  {submitting ? 'Création…' : "Créer l'intervention"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  disabled={submitting}
                  className="flex-1 justify-center"
                >
                  Annuler
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NewInterventionPage() {
  return (
    <Suspense fallback={null}>
      <NewInterventionBody />
    </Suspense>
  );
}
