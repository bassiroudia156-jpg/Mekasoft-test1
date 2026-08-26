'use client';

// /admin/pricing — the explicit "modifier le prix de l'abonnement"
// requirement. PRO and BUSINESS are editable; FREE is definitionally 0 and
// has no form control here (matches the API's own PLAN_NOT_EDITABLE guard
// on FREE). Changing a price here immediately affects what
// /subscriptions/plans, the landing page, and new checkouts show — see
// lib/server/plans/pricing.ts's file comment.
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import AdminTopBar from '@/components/admin/AdminTopBar';
import { Skeleton } from '@/components/ui/Skeleton';
import Button from '@/components/ui/Button';
import Field from '@/components/ui/Field';

interface PlanPricingRow {
  label: string;
  priceFcfa: number;
  originalPriceFcfa: number | null;
  isOverride: boolean;
}

const EDITABLE_PLANS = ['PRO', 'BUSINESS'] as const;

function PlanPricingCard({
  plan,
  row,
  onSaved,
}: {
  plan: 'PRO' | 'BUSINESS';
  row: PlanPricingRow;
  onSaved: (row: PlanPricingRow) => void;
}) {
  const { toast: showToast } = useToast();
  const [priceFcfa, setPriceFcfa] = useState(String(row.priceFcfa));
  const [originalPriceFcfa, setOriginalPriceFcfa] = useState(
    row.originalPriceFcfa != null ? String(row.originalPriceFcfa) : '',
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    const price = Number(priceFcfa);
    const original = originalPriceFcfa.trim() === '' ? null : Number(originalPriceFcfa);
    if (!Number.isInteger(price) || price < 0) {
      showToast('Le prix doit être un nombre entier positif.', 'error');
      return;
    }
    if (original !== null && (!Number.isInteger(original) || original < price)) {
      showToast('Le prix barré doit être supérieur ou égal au prix affiché.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await api<{ pricing: PlanPricingRow }>('/api/admin/plan-pricing', {
        method: 'PATCH',
        body: { plan, priceFcfa: price, originalPriceFcfa: original },
      });
      onSaved(res.pricing);
      showToast('Prix mis à jour.', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Échec de la mise à jour.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-6 flex flex-col gap-5">
      <div>
        <h2 className="text-base font-bold text-foreground">Forfait {row.label}</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Actuellement {row.priceFcfa.toLocaleString('fr-FR')} FCFA/mois
          {row.originalPriceFcfa
            ? ` (barré : ${row.originalPriceFcfa.toLocaleString('fr-FR')} FCFA)`
            : ''}
          {row.isOverride ? '' : ' — valeur par défaut, jamais modifiée.'}
        </p>
      </div>

      <Field
        label="Prix affiché (FCFA / mois)"
        name={`priceFcfa-${plan}`}
        type="number"
        value={priceFcfa}
        onChange={setPriceFcfa}
      />

      <Field
        label="Prix barré (optionnel — laisser vide pour ne pas en afficher)"
        name={`originalPriceFcfa-${plan}`}
        type="number"
        value={originalPriceFcfa}
        onChange={setOriginalPriceFcfa}
      />

      <div className="flex justify-end">
        <Button variant="primary" disabled={saving} onClick={() => void save()}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  );
}

export default function AdminPricingPage() {
  const { toast: showToast } = useToast();
  const [pricing, setPricing] = useState<Record<string, PlanPricingRow> | null>(null);

  useEffect(() => {
    api<{ pricing: Record<string, PlanPricingRow> }>('/api/admin/plan-pricing')
      .then((res) => setPricing(res.pricing))
      .catch(() => showToast('Impossible de charger la tarification.', 'error'));
    // Runs once on mount only — showToast is stable from context, no deps needed.
  }, []);

  return (
    <>
      <AdminTopBar title="Tarification" subtitle="Prix des forfaits Pro et Business" />
      <div className="p-6 max-w-2xl flex flex-col gap-6">
        {!pricing
          ? EDITABLE_PLANS.map((plan) => (
              <div key={plan} className="bg-surface border border-border rounded-lg p-6">
                <div className="flex flex-col gap-4">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </div>
            ))
          : EDITABLE_PLANS.map((plan) => {
              const row = pricing[plan];
              if (!row) return null;
              return (
                <PlanPricingCard
                  key={plan}
                  plan={plan}
                  row={row}
                  onSaved={(next) =>
                    setPricing((prev) => (prev ? { ...prev, [plan]: next } : prev))
                  }
                />
              );
            })}
      </div>
    </>
  );
}
