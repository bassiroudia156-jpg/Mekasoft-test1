'use client';

// /admin/pricing — the explicit "modifier le prix de l'abonnement"
// requirement. Only PRO ("Premium") is editable; FREE is definitionally 0
// and has no form control here (matches the API's own PLAN_NOT_EDITABLE
// guard on FREE). Changing the price here immediately affects what
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

export default function AdminPricingPage() {
  const { toast: showToast } = useToast();
  const [pricing, setPricing] = useState<Record<string, PlanPricingRow> | null>(null);
  const [priceFcfa, setPriceFcfa] = useState('');
  const [originalPriceFcfa, setOriginalPriceFcfa] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ pricing: Record<string, PlanPricingRow> }>('/api/admin/plan-pricing')
      .then((res) => {
        setPricing(res.pricing);
        setPriceFcfa(String(res.pricing.PRO?.priceFcfa ?? ''));
        setOriginalPriceFcfa(
          res.pricing.PRO?.originalPriceFcfa != null
            ? String(res.pricing.PRO.originalPriceFcfa)
            : '',
        );
      })
      .catch(() => showToast('Impossible de charger la tarification.', 'error'));
    // Runs once on mount only — showToast is stable from context, no deps needed.
  }, []);

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
        body: { plan: 'PRO', priceFcfa: price, originalPriceFcfa: original },
      });
      setPricing((prev) => (prev ? { ...prev, PRO: res.pricing } : prev));
      showToast('Prix mis à jour.', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Échec de la mise à jour.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <AdminTopBar title="Tarification" subtitle="Prix du forfait Premium" />
      <div className="p-6 max-w-2xl">
        <div className="bg-surface border border-border rounded-lg p-6">
          {!pricing ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-base font-bold text-foreground">Forfait Premium</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Actuellement {pricing.PRO?.priceFcfa.toLocaleString('fr-FR')} FCFA/mois
                  {pricing.PRO?.originalPriceFcfa
                    ? ` (barré : ${pricing.PRO.originalPriceFcfa.toLocaleString('fr-FR')} FCFA)`
                    : ''}
                  {pricing.PRO?.isOverride ? '' : ' — valeur par défaut, jamais modifiée.'}
                </p>
              </div>

              <Field
                label="Prix affiché (FCFA / mois)"
                name="priceFcfa"
                type="number"
                value={priceFcfa}
                onChange={setPriceFcfa}
              />

              <Field
                label="Prix barré (optionnel — laisser vide pour ne pas en afficher)"
                name="originalPriceFcfa"
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
          )}
        </div>
      </div>
    </>
  );
}
