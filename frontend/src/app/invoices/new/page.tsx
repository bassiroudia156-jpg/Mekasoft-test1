// Ported from Banani NewInvoice + NewInvoiceFresh (empty vs.
// intervention-preselected state via ?interventionId=, mirroring
// Phase 5's intervention-creation locked entry points) — internal success
// view = InvoiceCreatedSuccess, same pattern as /interventions/new.
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

// Mirrors lib/server/invoices/totals.ts PAYMENT_TERMS — that file is
// `server-only`, so the client keeps its own copy of the label set (values
// must match exactly; the server is the source of truth for the due-date
// math).
const PAYMENT_TERMS_OPTIONS = [
  { value: 'À réception', label: 'À réception' },
  { value: 'Net 15 jours', label: 'Net 15 jours' },
  { value: 'Net 30 jours', label: 'Net 30 jours' },
  { value: 'Net 45 jours', label: 'Net 45 jours' },
  { value: 'Net 60 jours', label: 'Net 60 jours' },
];

interface ClientIntervention {
  id: string;
  reference: string;
  work: string;
  amount: number;
  status: string;
  createdAt: string;
  invoiced: boolean;
}

interface InterventionDetail {
  id: string;
  reference: string;
  work: string;
  subtotal: number;
  taxRatePct: number;
  taxAmount: number;
  amount: number;
  invoiceId: string | null;
  client: { id: string; name: string };
}

interface CreatedInvoice {
  id: string;
  reference: string;
  amount: number;
  issueDate: string;
  dueDate: string;
}

function formatFCFA(n: number): string {
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

function NewInvoiceBody() {
  const user = useUser();
  const router = useRouter();
  const params = useSearchParams();
  const lockedInterventionId = params.get('interventionId');

  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState<string | null>(null);
  const [clientQuery, setClientQuery] = useState('');
  const [clientOptions, setClientOptions] = useState<SearchSelectOption[]>([]);
  const [clientLocked, setClientLocked] = useState(!!lockedInterventionId);
  const [clientInterventions, setClientInterventions] = useState<ClientIntervention[]>([]);

  const [interventionId, setInterventionId] = useState('');
  const [interventionLabel, setInterventionLabel] = useState<string | null>(null);
  const [interventionQuery, setInterventionQuery] = useState('');
  const [interventionLocked, setInterventionLocked] = useState(!!lockedInterventionId);
  const [interventionAmount, setInterventionAmount] = useState<number | null>(null);
  const [alreadyInvoiced, setAlreadyInvoiced] = useState(false);

  const [paymentTerms, setPaymentTerms] = useState('Net 30 jours');
  const [notes, setNotes] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedInvoice | null>(null);

  // Locked entry point: from an intervention's "Facturer" button.
  useEffect(() => {
    if (!lockedInterventionId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ intervention: InterventionDetail }>(
          `/api/interventions/${lockedInterventionId}`,
        );
        if (cancelled) return;
        setInterventionId(res.intervention.id);
        setInterventionLabel(res.intervention.reference);
        setInterventionAmount(res.intervention.amount);
        setClientId(res.intervention.client.id);
        setClientName(res.intervention.client.name);
        setAlreadyInvoiced(!!res.intervention.invoiceId);
      } catch {
        if (!cancelled) {
          setClientLocked(false);
          setInterventionLocked(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lockedInterventionId]);

  // Client search-as-you-type (only when not locked).
  useEffect(() => {
    if (clientLocked || clientQuery.trim().length < 2) {
      setClientOptions([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await api<{ items: { id: string; name: string; phone: string }[] }>(
          `/api/clients?q=${encodeURIComponent(clientQuery)}&limit=8`,
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

  // Once a client is selected, load its interventions for the (uninvoiced-
  // only) intervention picker — decision #6, phase-6-invoices.md.
  useEffect(() => {
    if (!clientId || interventionLocked) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ client: { interventions: ClientIntervention[] } }>(
          `/api/clients/${clientId}`,
        );
        if (!cancelled) setClientInterventions(res.client.interventions);
      } catch {
        if (!cancelled) setClientInterventions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, interventionLocked]);

  if (!user) return null;

  const uninvoiced = clientInterventions.filter((i) => !i.invoiced);
  const interventionOptions: SearchSelectOption[] = uninvoiced
    .filter((i) =>
      interventionQuery.trim()
        ? `${i.reference} ${i.work}`.toLowerCase().includes(interventionQuery.toLowerCase())
        : true,
    )
    .map((i) => ({
      id: i.id,
      label: i.reference,
      sublabel: `${i.work} · ${formatFCFA(i.amount)}`,
    }));

  function handleSelectClient(opt: SearchSelectOption) {
    setClientId(opt.id);
    setClientName(opt.label);
    setClientOptions([]);
    setClientQuery('');
    setInterventionId('');
    setInterventionLabel(null);
    setInterventionAmount(null);
  }

  function handleSelectIntervention(opt: SearchSelectOption) {
    setInterventionId(opt.id);
    setInterventionLabel(opt.label);
    setInterventionQuery('');
    const found = uninvoiced.find((i) => i.id === opt.id) ?? null;
    setInterventionAmount(found?.amount ?? null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!interventionId) {
      setError('Sélectionnez une intervention à facturer.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api<{
        invoice: {
          id: string;
          reference: string;
          amount: number;
          issueDate: string;
          dueDate: string;
        };
      }>('/api/invoices', {
        method: 'POST',
        body: {
          interventionId,
          paymentTerms,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      });
      setCreated(res.invoice);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INTERVENTION_ALREADY_INVOICED') {
        setError('Cette intervention a déjà une facture.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Erreur inconnue.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setCreated(null);
    setClientId('');
    setClientName(null);
    setInterventionId('');
    setInterventionLabel(null);
    setInterventionAmount(null);
    setClientInterventions([]);
    setPaymentTerms('Net 30 jours');
    setNotes('');
  }

  return (
    <div className="flex bg-background min-h-screen">
      <Sidebar active="invoices" />

      <div className="flex flex-col flex-1 min-w-0">
        <PageHeader
          eyebrow={created ? 'Facture créée' : 'Nouvelle facture'}
          title={created ? 'Facture émise avec succès' : 'Créer une facture'}
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
                  Facture créée avec succès !
                </h2>
                <p className="text-muted-foreground text-sm">
                  La facture sera automatiquement envoyée au client par email.
                </p>
              </div>

              <div className="bg-surface border border-border rounded-md p-6 text-left space-y-3">
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Détails de la facture
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Référence</div>
                    <div className="text-2xl font-bold font-headings text-foreground">
                      {created.reference}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Client</div>
                    <div className="text-sm font-medium text-foreground">{clientName}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Montant TTC</div>
                    <div className="text-lg font-bold text-primary">
                      {formatFCFA(created.amount)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Échéance</div>
                    <div className="text-sm font-medium text-foreground">
                      {new Date(created.dueDate).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-2">
                <Button
                  variant="primary"
                  className="justify-center"
                  onClick={() => router.push(`/invoices/${created.id}`)}
                >
                  <Icon i="file-text" size={16} />
                  Voir la facture
                </Button>
                <Button
                  variant="soft"
                  className="justify-center"
                  onClick={() => router.push(`/invoices/${created.id}/print`)}
                >
                  <Icon i="printer" size={16} />
                  Imprimer
                </Button>
                <Button
                  variant="outline"
                  className="justify-center"
                  onClick={() => router.push(`/invoices?created=${created.id}`)}
                >
                  <Icon i="list-filter" size={16} />
                  Retour à la liste
                </Button>
                <Button variant="soft" className="justify-center" onClick={resetForm}>
                  <Icon i="plus" size={16} />
                  Créer une nouvelle facture
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="max-w-2xl mx-auto p-6 flex flex-col gap-6">
              <FormSection title="Client & intervention">
                {clientLocked && clientName ? (
                  <div className="bg-secondary/10 border border-secondary rounded-md p-4 mb-4">
                    <div className="text-sm font-medium text-secondary-foreground">
                      Facture pour <span className="font-bold">{clientName}</span>
                    </div>
                  </div>
                ) : (
                  <div className="mb-4">
                    <SearchSelect
                      label="Client"
                      name="clientSearch"
                      required
                      placeholder="Chercher un client…"
                      query={clientQuery}
                      onQueryChange={setClientQuery}
                      options={clientOptions}
                      selectedLabel={clientName}
                      onSelect={handleSelectClient}
                      onClear={() => {
                        setClientId('');
                        setClientName(null);
                        setClientInterventions([]);
                      }}
                    />
                  </div>
                )}

                {interventionLocked && interventionLabel ? (
                  <div className="bg-secondary/10 border border-secondary rounded-md p-4">
                    <div className="text-sm font-medium text-secondary-foreground">
                      Intervention : <span className="font-bold">{interventionLabel}</span>
                    </div>
                    {alreadyInvoiced && (
                      <div className="text-xs text-warning mt-1">
                        Cette intervention a déjà une facture.
                      </div>
                    )}
                  </div>
                ) : (
                  <SearchSelect
                    label="Intervention à facturer"
                    name="interventionSearch"
                    required
                    placeholder={
                      clientId
                        ? uninvoiced.length > 0
                          ? 'Sélectionner une intervention…'
                          : 'Aucune intervention à facturer pour ce client'
                        : 'Choisissez un client d’abord'
                    }
                    query={interventionQuery}
                    onQueryChange={setInterventionQuery}
                    options={clientId ? interventionOptions : []}
                    selectedLabel={interventionLabel}
                    onSelect={handleSelectIntervention}
                    onClear={() => {
                      setInterventionId('');
                      setInterventionLabel(null);
                      setInterventionAmount(null);
                    }}
                  />
                )}

                {interventionAmount !== null && (
                  <div className="bg-primary/5 border border-primary/10 rounded-md px-4 py-3 mt-4 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Montant TTC de l&apos;intervention
                    </span>
                    <span className="text-lg font-bold text-primary">
                      {formatFCFA(interventionAmount)}
                    </span>
                  </div>
                )}
              </FormSection>

              <FormSection title="Conditions">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field
                    label="Conditions de paiement"
                    name="paymentTerms"
                    type="select"
                    value={paymentTerms}
                    onChange={setPaymentTerms}
                    options={PAYMENT_TERMS_OPTIONS}
                  />
                </div>
              </FormSection>

              <FormSection title="Notes (optionnel)">
                <Field
                  label=""
                  name="notes"
                  type="textarea"
                  value={notes}
                  onChange={setNotes}
                  placeholder="Notes internes ou précisions pour le client…"
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
                  disabled={submitting || alreadyInvoiced}
                  className="flex-1 justify-center"
                >
                  {submitting ? 'Création…' : 'Créer la facture'}
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

export default function NewInvoicePage() {
  return (
    <Suspense fallback={null}>
      <NewInvoiceBody />
    </Suspense>
  );
}
