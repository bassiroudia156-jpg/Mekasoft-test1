// Phase C item #8 (2026-08-25) — quote creation. Two paths, mirrored from
// the backend's own duality (api/quotes/route.ts's POST):
//   - "Depuis une intervention" — snapshot an existing intervention's
//     client/vehicle/work/amounts. Picker reuses the same search-as-you-type
//     pattern as everywhere else (SearchSelect); the server is the one that
//     actually rejects an intervention that already has a quote
//     (INTERVENTION_ALREADY_QUOTED), surfaced here as a plain error string.
//   - "À zéro" — chiffrer avant d'accepter le travail: client/vehicle/work
//     entered directly, same client/vehicle picker + parts basket as
//     /interventions/new (RadioCard toggle instead of two separate routes,
//     same "one form, one branch of local state" shape as that page).
'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import Sidebar from '@/components/layout/Sidebar';
import PageHeader from '@/components/ui/PageHeader';
import FormSection from '@/components/ui/FormSection';
import Field from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import RadioCard from '@/components/ui/RadioCard';
import SearchSelect, { type SearchSelectOption } from '@/components/ui/SearchSelect';
import AddPartForm, { type NewPart } from '@/components/interventions/AddPartForm';
import PartsRow, { PartsRowHeader } from '@/components/interventions/PartsRow';
import Switch from '@/components/ui/Switch';

interface VehicleOption {
  id: string;
  brand: string;
  model: string;
  year: number | null;
  registration: string;
  mileage: number | null;
}

// Shape returned by GET /api/interventions (list) — used to populate the
// search dropdown's options.
interface InterventionListItem {
  id: string;
  reference: string;
  client: string;
  vehicle: string;
  work: string;
  amount: number;
}

// Shape returned by GET /api/interventions/[id] (detail) — used for the
// preview card once one is picked. Deliberately narrow (only the fields
// this page reads) rather than the full InterventionDetail shape from
// /interventions/[id]/page.tsx.
interface InterventionPreview {
  reference: string;
  work: string;
  amount: number;
  client: { name: string };
  vehicle: { brand: string; model: string; registration: string };
}

interface CreatedQuote {
  id: string;
  reference: string;
  amount: number;
}

type Source = 'scratch' | 'intervention';

function formatFCFA(n: number): string {
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

function NewQuoteBody() {
  const user = useUser();
  const router = useRouter();

  const [source, setSource] = useState<Source>('scratch');

  // Path A — from an existing intervention.
  const [interventionId, setInterventionId] = useState('');
  const [interventionLabel, setInterventionLabel] = useState<string | null>(null);
  const [interventionPreview, setInterventionPreview] = useState<InterventionPreview | null>(null);
  const [interventionQuery, setInterventionQuery] = useState('');
  const [interventionOptions, setInterventionOptions] = useState<SearchSelectOption[]>([]);

  // Path B — from scratch (same picker shape as /interventions/new).
  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState<string | null>(null);
  const [clientQuery, setClientQuery] = useState('');
  const [clientOptions, setClientOptions] = useState<SearchSelectOption[]>([]);

  const [vehicleId, setVehicleId] = useState('');
  const [vehicleName, setVehicleName] = useState<string | null>(null);
  const [vehicleDetails, setVehicleDetails] = useState<VehicleOption | null>(null);
  const [vehicleQuery, setVehicleQuery] = useState('');
  const [clientVehicles, setClientVehicles] = useState<VehicleOption[]>([]);

  const [work, setWork] = useState('');
  const [laborAmount, setLaborAmount] = useState('');
  const [partsAmountManual, setPartsAmountManual] = useState('');
  const [parts, setParts] = useState<NewPart[]>([]);
  const [showPartsEditor, setShowPartsEditor] = useState(false);
  const [taxRatePct, setTaxRatePct] = useState('18');
  const [taxEnabled, setTaxEnabled] = useState(true);

  // Shared across both paths.
  const [validityDays, setValidityDays] = useState('30');
  const [notes, setNotes] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedQuote | null>(null);

  function handleToggleTax(next: boolean) {
    setTaxEnabled(next);
    if (next && (!taxRatePct || Number(taxRatePct) === 0)) {
      setTaxRatePct('18');
    }
  }

  const partsTotal = parts.reduce((sum, p) => sum + p.quantity * p.unitPrice, 0);
  const effectivePartsAmount = parts.length > 0 ? partsTotal : Number(partsAmountManual) || 0;
  const laborNum = Number(laborAmount) || 0;
  const subtotal = laborNum + effectivePartsAmount;
  const taxRatePctNum = taxEnabled ? Math.min(100, Math.max(0, Number(taxRatePct) || 0)) : 0;
  const taxAmount = Math.round((subtotal * taxRatePctNum) / 100);
  const total = subtotal + taxAmount;

  // Intervention picker — same debounced "menu roulant" search as the
  // client/vehicle pickers below.
  useEffect(() => {
    if (source !== 'intervention' || interventionId) {
      setInterventionOptions([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const q = interventionQuery.trim();
        const params = new URLSearchParams({ limit: '20' });
        if (q) params.set('q', q);
        const res = await api<{ items: InterventionListItem[] }>(
          `/api/interventions?${params.toString()}`,
        );
        if (!cancelled) {
          setInterventionOptions(
            res.items.map((it) => ({
              id: it.id,
              label: `${it.reference} — ${it.client}`,
              sublabel: `${it.vehicle} · ${it.work}`,
            })),
          );
        }
      } catch {
        if (!cancelled) setInterventionOptions([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [source, interventionQuery, interventionId]);

  useEffect(() => {
    if (source !== 'intervention' || !interventionId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ intervention: InterventionPreview }>(
          `/api/interventions/${interventionId}`,
        );
        if (!cancelled) setInterventionPreview(res.intervention);
      } catch {
        if (!cancelled) setInterventionPreview(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, interventionId]);

  useEffect(() => {
    if (source !== 'scratch') {
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
  }, [source, clientQuery]);

  useEffect(() => {
    if (!clientId) return;
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
  }, [clientId]);

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

  function handleSelectIntervention(opt: SearchSelectOption) {
    setInterventionId(opt.id);
    setInterventionLabel(opt.label);
    setInterventionQuery('');
  }

  function switchSource(next: Source) {
    setSource(next);
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const validityNum = Number(validityDays) || 30;

    if (source === 'intervention') {
      if (!interventionId) {
        setError('Sélectionnez une intervention.');
        return;
      }
      setSubmitting(true);
      try {
        const res = await api<{ quote: CreatedQuote }>('/api/quotes', {
          method: 'POST',
          body: {
            interventionId,
            validityDays: validityNum,
            ...(notes ? { notes } : {}),
          },
        });
        setCreated(res.quote);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Erreur inconnue.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

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
      const res = await api<{ quote: CreatedQuote }>('/api/quotes', {
        method: 'POST',
        body: {
          clientId,
          vehicleId,
          work,
          laborAmount: laborNum,
          partsAmount: parts.length > 0 ? 0 : Number(partsAmountManual) || 0,
          parts,
          taxRatePct: taxRatePctNum,
          validityDays: validityNum,
          ...(notes ? { notes } : {}),
        },
      });
      setCreated(res.quote);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur inconnue.');
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setCreated(null);
    setInterventionId('');
    setInterventionLabel(null);
    setInterventionPreview(null);
    setClientId('');
    setClientName(null);
    setVehicleId('');
    setVehicleName(null);
    setVehicleDetails(null);
    setWork('');
    setLaborAmount('');
    setPartsAmountManual('');
    setParts([]);
    setShowPartsEditor(false);
    setNotes('');
    setValidityDays('30');
  }

  return (
    <div className="flex bg-background min-h-screen">
      <Sidebar active="quotes" />

      <div className="flex flex-col flex-1 min-w-0">
        <PageHeader
          eyebrow={created ? 'Devis créé' : 'Nouveau devis'}
          title={created ? 'Devis créé avec succès' : 'Chiffrer une intervention'}
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
                  Devis créé avec succès !
                </h2>
                <p className="text-muted-foreground text-sm">
                  Le devis est en brouillon — envoyez-le au client quand vous êtes prêt.
                </p>
              </div>

              <div className="bg-surface border border-border rounded-md p-6 text-left space-y-3">
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Référence
                </div>
                <div className="text-2xl font-bold font-headings text-foreground">
                  {created.reference}
                </div>
                <div className="text-sm text-muted-foreground">{formatFCFA(created.amount)}</div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-2">
                <Button
                  variant="primary"
                  className="justify-center"
                  onClick={() => router.push(`/quotes/${created.id}`)}
                >
                  <Icon i="file-check" size={16} />
                  Voir le devis
                </Button>
                <Button
                  variant="soft"
                  className="justify-center"
                  onClick={() => window.open(`/api/quotes/${created.id}/pdf`, '_blank')}
                >
                  <Icon i="download" size={16} />
                  Télécharger PDF
                </Button>
                <Button variant="soft" className="justify-center col-span-2" onClick={resetForm}>
                  <Icon i="plus" size={16} />
                  Créer un nouveau devis
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="max-w-3xl mx-auto p-6 flex flex-col gap-6">
              <FormSection title="Origine du devis">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <RadioCard
                    label="À zéro — chiffrer avant d'accepter le travail"
                    selected={source === 'scratch'}
                    onClick={() => switchSource('scratch')}
                  />
                  <RadioCard
                    label="Depuis une intervention déjà ouverte"
                    selected={source === 'intervention'}
                    onClick={() => switchSource('intervention')}
                  />
                </div>
              </FormSection>

              {source === 'intervention' ? (
                <FormSection title="Intervention">
                  <div className="mb-4">
                    <Field
                      label="Validité (jours)"
                      name="validityDaysIntervention"
                      type="number"
                      value={validityDays}
                      onChange={setValidityDays}
                      placeholder="30"
                    />
                  </div>
                  <SearchSelect
                    label="Intervention"
                    name="interventionSearch"
                    required
                    placeholder="Chercher par référence, client, véhicule…"
                    query={interventionQuery}
                    onQueryChange={setInterventionQuery}
                    options={interventionOptions}
                    selectedLabel={interventionLabel}
                    onSelect={handleSelectIntervention}
                    onClear={() => {
                      setInterventionId('');
                      setInterventionLabel(null);
                      setInterventionPreview(null);
                    }}
                  />
                  {interventionPreview && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs pt-4 mt-4 border-t border-border">
                      <div>
                        <div className="text-muted-foreground font-medium">Client</div>
                        <div className="text-foreground font-bold">
                          {interventionPreview.client.name}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground font-medium">Véhicule</div>
                        <div className="text-foreground font-bold">
                          {interventionPreview.vehicle.brand} {interventionPreview.vehicle.model} ·{' '}
                          {interventionPreview.vehicle.registration}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground font-medium">Montant estimé</div>
                        <div className="text-foreground font-bold">
                          {formatFCFA(interventionPreview.amount)}
                        </div>
                      </div>
                      <div className="col-span-full">
                        <div className="text-muted-foreground font-medium">Travaux</div>
                        <div className="text-foreground">{interventionPreview.work}</div>
                      </div>
                    </div>
                  )}
                </FormSection>
              ) : (
                <>
                  <FormSection title="Client & véhicule">
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

                    {vehicleDetails && (
                      <div className="grid grid-cols-3 gap-4 text-xs pt-2 border-t border-border">
                        <div>
                          <div className="text-muted-foreground font-medium">Plaque</div>
                          <div className="text-foreground font-bold">
                            {vehicleDetails.registration}
                          </div>
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

                  <FormSection title="Travaux à chiffrer">
                    <Field
                      label="Description des travaux"
                      name="work"
                      type="textarea"
                      required
                      value={work}
                      onChange={setWork}
                      placeholder="Ex: Vidange huile, remplacement filtre, inspection frein…"
                    />
                  </FormSection>

                  <FormSection
                    title={parts.length > 0 ? 'Coût estimé (mis à jour)' : 'Coût estimé'}
                  >
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
                        label="Pièces (CFA)"
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
                            : 'TVA désactivée pour ce devis'
                        }
                        labelExtra={
                          <Switch
                            checked={taxEnabled}
                            onChange={handleToggleTax}
                            label={taxEnabled ? 'Désactiver la TVA' : 'Activer la TVA'}
                          />
                        }
                      />
                      <Field
                        label="Validité (jours)"
                        name="validityDays"
                        type="number"
                        value={validityDays}
                        onChange={setValidityDays}
                        placeholder="30"
                      />
                    </div>

                    {(showPartsEditor || parts.length > 0) && (
                      <div className="flex flex-col gap-3 mb-4">
                        <AddPartForm onAdd={(p) => setParts((prev) => [...prev, p])} />
                        {parts.length > 0 && (
                          <div className="overflow-x-auto">
                            <div className="min-w-[720px] bg-background border border-border rounded-md overflow-hidden">
                              <PartsRowHeader />
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
                                  onDelete={() =>
                                    setParts((prev) => prev.filter((_, i) => i !== idx))
                                  }
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="bg-primary/5 border border-primary/10 rounded-md px-4 py-3 flex items-center justify-between">
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
                      <Icon i="info" size={20} className="text-primary" />
                    </div>
                  </FormSection>
                </>
              )}

              <FormSection title="Notes internes">
                <Field
                  label=""
                  name="notes"
                  type="textarea"
                  value={notes}
                  onChange={setNotes}
                  placeholder="Précisions à conserver sur ce devis…"
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
                  {submitting ? 'Création…' : 'Créer le devis'}
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

export default function NewQuotePage() {
  return (
    <Suspense fallback={null}>
      <NewQuoteBody />
    </Suspense>
  );
}
