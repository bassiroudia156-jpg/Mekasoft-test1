// Ported from Banani InterventionDetailsView. Parts editing (AddParts /
// AddAnotherPart / PartsAddedConfirmation) is inline here rather than a
// separate route — see Phase 5 decisions. "Modifier"/"Archiver" buttons
// from the Banani mock have no designed target/behavior and were dropped
// (same "no dead UI" principle applied to ClientProfile's bare "Modifier"
// button in Phase 4).
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useMobileSidebar } from '@/contexts/MobileSidebarContext';
import { useRefetchOnFocus } from '@/lib/useRefetchOnFocus';
import { formatInterventionDate } from '@/lib/format-intervention-date';
import Sidebar from '@/components/layout/Sidebar';
import Badge, { type BadgeTone } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import RadioCard from '@/components/ui/RadioCard';
import Field from '@/components/ui/Field';
import Icon from '@/components/ui/Icon';
import AddPartForm, { type NewPart } from '@/components/interventions/AddPartForm';
import PartsRow from '@/components/interventions/PartsRow';
import Switch from '@/components/ui/Switch';
import { type InterventionStatus } from '@/components/interventions/InterventionRow';

interface InterventionPart {
  id: string;
  reference: string | null;
  name: string;
  supplier: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  inStock: boolean;
}

interface InterventionDetail {
  id: string;
  reference: string;
  status: InterventionStatus;
  work: string;
  category: string | null;
  priority: string;
  notes: string | null;
  laborAmount: number;
  partsAmount: number;
  taxRatePct: number;
  taxAmount: number;
  subtotal: number;
  amount: number;
  createdAt: string;
  invoiceId: string | null;
  client: { id: string; name: string; phone: string };
  vehicle: {
    id: string;
    brand: string;
    model: string;
    year: number | null;
    registration: string;
    mileage: number | null;
  };
  parts: InterventionPart[];
}

const STATUS_TONE: Record<InterventionStatus, BadgeTone> = {
  'En cours': 'warning',
  Terminé: 'success',
  'En attente': 'muted',
  'Non payé': 'accent',
};

const STATUS_OPTIONS: InterventionStatus[] = ['En cours', 'Terminé', 'En attente', 'Non payé'];

function formatFCFA(n: number): string {
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

// Mirrors lib/server/interventions/totals.ts's computeTotals() — that file
// is `import 'server-only'`-guarded so it can't be shared into this client
// component; the formula is 3 lines and used only for optimistic local
// recomputation (audit request, 2026-08-18) ahead of the server's own
// response, which remains the source of truth on every mutation below.
function localTotals(laborAmount: number, partsAmount: number, taxRatePct: number) {
  const subtotal = laborAmount + partsAmount;
  const tax = Math.round((subtotal * taxRatePct) / 100);
  return { subtotal, tax, total: subtotal + tax };
}

export default function InterventionDetailPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const { toggle } = useMobileSidebar();
  const params = useParams<{ id: string }>();

  const [intervention, setIntervention] = useState<InterventionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<InterventionStatus | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [addPartOpen, setAddPartOpen] = useState(false);
  const [taxModalOpen, setTaxModalOpen] = useState(false);
  const [pendingTaxRatePct, setPendingTaxRatePct] = useState('');
  // On/off toggle for the same reason as /interventions/new's — flipping a
  // switch is easier to manage than remembering to type 0. Initialized from
  // the intervention's current rate when the modal opens (see the "Modifier
  // le taux de TVA" button's onClick below).
  const [pendingTaxEnabled, setPendingTaxEnabled] = useState(true);
  const [savingTax, setSavingTax] = useState(false);

  function handleToggleTax(next: boolean) {
    setPendingTaxEnabled(next);
    if (next && (!pendingTaxRatePct || Number(pendingTaxRatePct) === 0)) {
      setPendingTaxRatePct('18');
    }
  }

  async function load() {
    try {
      const res = await api<{ intervention: InterventionDetail }>(
        `/api/interventions/${params.id}`,
      );
      setIntervention(res.intervention);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? 'Intervention introuvable.'
          : 'Erreur inconnue.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, params.id]);

  // Audit request (2026-08-18): keep this page current without a manual
  // reload — silently re-fetch when the tab regains focus.
  useRefetchOnFocus(() => {
    if (user) void load();
  });

  if (!user) return null;

  async function changeStatus(status: InterventionStatus) {
    if (!intervention) return;
    const previous = intervention;
    setSavingStatus(true);
    // Optimistic (audit request, 2026-08-18: "ça doit etre un peu comme de
    // l'optimistique") — flip the status locally right away instead of
    // waiting on a round-trip; roll back + toast if the PATCH fails.
    setIntervention({ ...previous, status });
    setStatusModalOpen(false);
    try {
      await api(`/api/interventions/${params.id}`, { method: 'PATCH', body: { status } });
      toast('Statut mis à jour.', 'success');
    } catch (err) {
      setIntervention(previous);
      toast(err instanceof ApiError ? err.message : 'Erreur inconnue.', 'error');
    } finally {
      setSavingStatus(false);
    }
  }

  async function saveTaxRate() {
    if (!intervention) return;
    const previous = intervention;
    const value = pendingTaxEnabled
      ? Math.min(100, Math.max(0, Number(pendingTaxRatePct) || 0))
      : 0;
    setSavingTax(true);
    const totals = localTotals(previous.laborAmount, previous.partsAmount, value);
    setIntervention({
      ...previous,
      taxRatePct: value,
      taxAmount: totals.tax,
      subtotal: totals.subtotal,
      amount: totals.total,
    });
    setTaxModalOpen(false);
    try {
      await api(`/api/interventions/${params.id}`, {
        method: 'PATCH',
        body: { taxRatePct: value },
      });
      toast('Taux de TVA mis à jour.', 'success');
    } catch (err) {
      setIntervention(previous);
      toast(err instanceof ApiError ? err.message : 'Erreur inconnue.', 'error');
    } finally {
      setSavingTax(false);
    }
  }

  async function addPart(part: NewPart) {
    if (!intervention) return;
    try {
      // The POST response already carries the created row + recomputed
      // totals (audit request, 2026-08-18) — merge it in directly instead
      // of a second round-trip GET just to see what was just created.
      const res = await api<{
        part: InterventionPart;
        totals: { partsAmount: number; taxAmount: number; amount: number };
      }>(`/api/interventions/${params.id}/parts`, { method: 'POST', body: part });
      toast(`${part.name} ajouté avec succès.`, 'success');
      setIntervention((prev) =>
        prev
          ? {
              ...prev,
              parts: [...prev.parts, res.part],
              partsAmount: res.totals.partsAmount,
              taxAmount: res.totals.taxAmount,
              subtotal: prev.laborAmount + res.totals.partsAmount,
              amount: res.totals.amount,
            }
          : prev,
      );
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur inconnue.', 'error');
    }
  }

  async function deletePart(part: InterventionPart) {
    if (!intervention) return;
    const previous = intervention;
    // Optimistic removal, recomputed locally with the same formula the
    // server uses — rolled back if the DELETE actually fails.
    const newPartsAmount = Math.max(0, previous.partsAmount - part.total);
    const totals = localTotals(previous.laborAmount, newPartsAmount, previous.taxRatePct);
    setIntervention({
      ...previous,
      parts: previous.parts.filter((p) => p.id !== part.id),
      partsAmount: newPartsAmount,
      taxAmount: totals.tax,
      subtotal: totals.subtotal,
      amount: totals.total,
    });
    try {
      await api(`/api/interventions/${params.id}/parts/${part.id}`, { method: 'DELETE' });
      toast(`${part.name} retiré.`, 'success');
    } catch (err) {
      setIntervention(previous);
      toast(err instanceof ApiError ? err.message : 'Erreur inconnue.', 'error');
    }
  }

  return (
    <div className="flex bg-background min-h-screen">
      <Sidebar active="interventions" />

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
              onClick={() => router.push('/interventions')}
              className="text-muted-foreground text-sm flex items-center gap-1"
            >
              <Icon i="chevron-left" size={14} />
              Retour
            </button>
            <span className="text-muted-foreground">/</span>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-widest">
                Détail de l&apos;intervention
              </div>
              <div className="text-lg font-bold font-headings text-foreground">
                {intervention ? `${intervention.reference} · ${intervention.client.name}` : '…'}
              </div>
            </div>
          </div>
          {intervention && (
            <div className="flex items-center gap-2">
              <Link
                href={`/interventions/${intervention.id}/devis`}
                className="text-primary text-sm font-medium flex items-center gap-1"
              >
                <Icon i="printer" size={14} />
                Imprimer
              </Link>
              <Link
                href={`/interventions/${intervention.id}/devis`}
                className="text-primary text-sm font-medium flex items-center gap-1"
              >
                <Icon i="download" size={14} />
                Télécharger
              </Link>
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground p-6">Chargement…</p>
        ) : error ? (
          <p className="text-sm text-warning p-6">{error}</p>
        ) : (
          intervention && (
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-5xl mx-auto p-6 flex flex-col gap-6">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <Badge tone={STATUS_TONE[intervention.status]}>{intervention.status}</Badge>
                    <span className="text-xs text-muted-foreground">
                      Créée {formatInterventionDate(intervention.createdAt)}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPendingStatus(intervention.status);
                      setStatusModalOpen(true);
                    }}
                  >
                    Modifier le statut
                  </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 flex flex-col gap-6 min-w-0">
                    <div className="bg-surface border border-border rounded-md p-5">
                      <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-4">
                        Client et véhicule
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Client</div>
                          <div className="text-sm font-medium text-foreground">
                            {intervention.client.name}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {intervention.client.phone}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Véhicule</div>
                          <div className="text-sm font-medium text-foreground">
                            {intervention.vehicle.brand} {intervention.vehicle.model}
                            {intervention.vehicle.year ? ` ${intervention.vehicle.year}` : ''}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Plaque : {intervention.vehicle.registration}
                            {intervention.vehicle.mileage
                              ? ` · ${intervention.vehicle.mileage.toLocaleString('fr-FR')} km`
                              : ''}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-surface border border-border rounded-md p-5">
                      <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
                        Travaux à effectuer
                      </div>
                      <div className="bg-input rounded-md px-3 py-3 text-sm text-foreground mb-4">
                        {intervention.work}
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="text-muted-foreground">Catégorie</span>
                          <div className="font-medium text-foreground">
                            {intervention.category ?? '—'}
                          </div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Priorité</span>
                          <div className="font-medium text-foreground">{intervention.priority}</div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-surface border border-border rounded-md p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                          Pièces de rechange
                        </div>
                        <span className="text-xs font-bold text-foreground bg-primary/10 px-2 py-1 rounded-md">
                          {intervention.parts.length} pièce(s)
                        </span>
                      </div>

                      {intervention.parts.length > 0 && (
                        <div className="overflow-x-auto mb-3">
                          <div className="min-w-[600px]">
                            {intervention.parts.map((p) => (
                              <PartsRow
                                key={p.id}
                                reference={p.reference ?? '—'}
                                name={p.name}
                                supplier={p.supplier ?? '—'}
                                quantity={p.quantity}
                                unit={p.unit}
                                unitPrice={formatFCFA(p.unitPrice)}
                                total={formatFCFA(p.total)}
                                inStock={p.inStock}
                                onDelete={() => void deletePart(p)}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {addPartOpen ? (
                        <AddPartForm
                          title="Ajouter une autre pièce"
                          onAdd={(part) => {
                            void addPart(part);
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAddPartOpen(true)}
                          className="text-xs text-primary font-medium flex items-center gap-1"
                        >
                          <Icon i="plus" size={12} />
                          Ajouter une pièce
                        </button>
                      )}
                    </div>

                    <div className="bg-surface border border-border rounded-md p-5">
                      <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
                        Notes internes
                      </div>
                      <div className="bg-input rounded-md px-3 py-3 text-sm text-muted-foreground min-h-20">
                        {intervention.notes || 'Aucune note pour le moment'}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4">
                    <div className="bg-primary/5 border border-primary/10 rounded-md p-5">
                      <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-4">
                        Résumé financier
                      </div>
                      <div className="space-y-2.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">Main-d&apos;œuvre</span>
                          <span className="font-medium text-foreground">
                            {intervention.laborAmount.toLocaleString('fr-FR')}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">Pièces</span>
                          <span className="font-medium text-foreground">
                            {intervention.partsAmount.toLocaleString('fr-FR')}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">Sous-total</span>
                          <span className="font-medium text-foreground">
                            {intervention.subtotal.toLocaleString('fr-FR')}
                          </span>
                        </div>
                        <div className="border-t border-primary/10 pt-2.5 flex justify-between items-center text-xs">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            TVA {intervention.taxRatePct}%
                            {!intervention.invoiceId && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPendingTaxRatePct(String(intervention.taxRatePct));
                                  setPendingTaxEnabled(intervention.taxRatePct > 0);
                                  setTaxModalOpen(true);
                                }}
                                aria-label="Modifier le taux de TVA"
                                className="text-muted-foreground hover:text-primary"
                              >
                                <Icon i="pencil" size={11} />
                              </button>
                            )}
                          </span>
                          <span className="font-medium text-foreground">
                            {intervention.taxAmount.toLocaleString('fr-FR')}
                          </span>
                        </div>
                        <div className="border-t border-primary/10 pt-2.5 flex justify-between items-center">
                          <span className="font-medium text-foreground">Total</span>
                          <span className="text-lg font-bold text-primary">
                            {intervention.amount.toLocaleString('fr-FR')}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">FCFA</div>
                      </div>
                    </div>

                    <div className="bg-surface border border-border rounded-md p-5">
                      <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
                        Paiement
                      </div>
                      <Badge tone={intervention.status === 'Non payé' ? 'accent' : 'success'}>
                        {intervention.status === 'Non payé' ? 'Non payé' : 'Payé'}
                      </Badge>
                      {intervention.status === 'Non payé' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-center mt-3 text-accent border-accent"
                          onClick={() => void changeStatus('Terminé')}
                        >
                          Marquer comme payé
                        </Button>
                      )}
                    </div>

                    <div className="bg-surface border border-border rounded-md p-5">
                      <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
                        Facturation
                      </div>
                      {intervention.invoiceId ? (
                        <Link href={`/invoices/${intervention.invoiceId}`}>
                          <Button variant="soft" size="sm" className="w-full justify-center">
                            <Icon i="file-text" size={14} />
                            Voir la facture
                          </Button>
                        </Link>
                      ) : (
                        <Link href={`/invoices/new?interventionId=${intervention.id}`}>
                          <Button variant="outline" size="sm" className="w-full justify-center">
                            <Icon i="file-text" size={14} />
                            Facturer cette intervention
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        )}
      </div>

      <Modal
        open={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        title="Modifier le statut"
        icon="wrench"
        maxWidth="md"
      >
        <div className="flex flex-col gap-3">
          {STATUS_OPTIONS.map((s) => (
            <RadioCard
              key={s}
              label={s}
              selected={pendingStatus === s}
              onClick={() => setPendingStatus(s)}
            />
          ))}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setStatusModalOpen(false)}
              disabled={savingStatus}
              className="flex-1 justify-center"
            >
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={() => pendingStatus && void changeStatus(pendingStatus)}
              disabled={savingStatus || !pendingStatus}
              className="flex-1 justify-center"
            >
              {savingStatus ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={taxModalOpen}
        onClose={() => setTaxModalOpen(false)}
        title="Modifier le taux de TVA"
        icon="percent"
        maxWidth="md"
      >
        <div className="flex flex-col gap-4">
          <Field
            label="TVA (%)"
            name="taxRatePct"
            type="number"
            value={pendingTaxEnabled ? pendingTaxRatePct : '0'}
            onChange={setPendingTaxRatePct}
            placeholder="18"
            disabled={!pendingTaxEnabled}
            helper={
              pendingTaxEnabled
                ? 'Modifiable selon le pays ou le produit'
                : 'TVA désactivée pour cette intervention'
            }
            labelExtra={
              <Switch
                checked={pendingTaxEnabled}
                onChange={handleToggleTax}
                label={pendingTaxEnabled ? 'Désactiver la TVA' : 'Activer la TVA'}
              />
            }
          />
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setTaxModalOpen(false)}
              disabled={savingTax}
              className="flex-1 justify-center"
            >
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={() => void saveTaxRate()}
              disabled={savingTax}
              className="flex-1 justify-center"
            >
              {savingTax ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
