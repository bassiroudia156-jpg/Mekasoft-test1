'use client';

// /admin/promotions — coupon CRUD ("faire fonctionner le bouton coupon").
// Create/list/activate-deactivate here; redemption tracking is the
// `redeemedCount` / `maxRedemptions` pair shown per row (see
// lib/server/coupons/redeem.ts for how redemption is claimed atomically).
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import AdminTopBar from '@/components/admin/AdminTopBar';
import { SkeletonTable } from '@/components/ui/Skeleton';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Field from '@/components/ui/Field';

interface CouponRow {
  id: string;
  code: string;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: number;
  appliesToPlan: string | null;
  maxRedemptions: number | null;
  redeemedCount: number;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
}

const EMPTY_FORM = {
  code: '',
  discountType: 'PERCENT' as 'PERCENT' | 'FIXED',
  discountValue: '',
  maxRedemptions: '',
  expiresAt: '',
};

export default function AdminPromotionsPage() {
  const { toast: showToast } = useToast();
  const [rows, setRows] = useState<CouponRow[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  function load() {
    setRows(null);
    api<{ coupons: CouponRow[] }>('/api/admin/coupons')
      .then((res) => setRows(res.coupons))
      .catch(() => setRows([]));
  }

  useEffect(load, []);

  async function createCoupon() {
    const discountValue = Number(form.discountValue);
    if (!form.code.trim() || !Number.isInteger(discountValue) || discountValue <= 0) {
      showToast('Code et valeur de réduction sont requis.', 'error');
      return;
    }
    setSaving(true);
    try {
      await api('/api/admin/coupons', {
        method: 'POST',
        body: {
          code: form.code.trim(),
          discountType: form.discountType,
          discountValue,
          maxRedemptions: form.maxRedemptions.trim() ? Number(form.maxRedemptions) : null,
          expiresAt: form.expiresAt.trim() ? new Date(form.expiresAt).toISOString() : null,
        },
      });
      showToast('Code promo créé.', 'success');
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Échec de la création.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: CouponRow) {
    try {
      await api(`/api/admin/coupons/${row.id}`, { method: 'PATCH', body: { active: !row.active } });
      showToast(row.active ? 'Code désactivé.' : 'Code activé.', 'success');
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Échec de la mise à jour.', 'error');
    }
  }

  return (
    <>
      <AdminTopBar
        title="Promotions"
        subtitle="Codes promo pour l'abonnement Pro"
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            Nouveau code
          </Button>
        }
      />
      <div className="p-6">
        <div className="bg-surface border border-border rounded-lg p-6">
          {!rows ? (
            <SkeletonTable rows={6} cols={5} />
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Aucun code promo pour le moment.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Code
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Réduction
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Utilisations
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Expire
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Statut
                    </th>
                    <th className="py-3 px-4" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-border hover:bg-secondary">
                      <td className="py-3 px-4 font-mono font-medium text-foreground">
                        {row.code}
                      </td>
                      <td className="py-3 px-4 text-foreground">
                        {row.discountType === 'PERCENT'
                          ? `-${row.discountValue}%`
                          : `-${row.discountValue.toLocaleString('fr-FR')} FCFA`}
                      </td>
                      <td className="py-3 px-4 text-foreground">
                        {row.redeemedCount} {row.maxRedemptions ? `/ ${row.maxRedemptions}` : ''}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {row.expiresAt
                          ? new Date(row.expiresAt).toLocaleDateString('fr-FR')
                          : 'Jamais'}
                      </td>
                      <td className="py-3 px-4">
                        <Badge tone={row.active ? 'success' : 'muted'}>
                          {row.active ? 'Actif' : 'Inactif'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button variant="outline" size="sm" onClick={() => void toggleActive(row)}>
                          {row.active ? 'Désactiver' : 'Activer'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nouveau code promo"
        maxWidth="md"
      >
        <div className="p-6 flex flex-col gap-4">
          <Field
            label="Code"
            name="code"
            value={form.code}
            onChange={(v) => setForm((f) => ({ ...f, code: v.toUpperCase() }))}
            placeholder="RENTREE2026"
          />
          <Field
            label="Type de réduction"
            name="discountType"
            type="select"
            value={form.discountType}
            onChange={(v) => setForm((f) => ({ ...f, discountType: v as 'PERCENT' | 'FIXED' }))}
            options={[
              { value: 'PERCENT', label: 'Pourcentage (%)' },
              { value: 'FIXED', label: 'Montant fixe (FCFA)' },
            ]}
          />
          <Field
            label={form.discountType === 'PERCENT' ? 'Valeur (%)' : 'Valeur (FCFA)'}
            name="discountValue"
            type="number"
            value={form.discountValue}
            onChange={(v) => setForm((f) => ({ ...f, discountValue: v }))}
          />
          <Field
            label="Nombre d'utilisations max (optionnel)"
            name="maxRedemptions"
            type="number"
            value={form.maxRedemptions}
            onChange={(v) => setForm((f) => ({ ...f, maxRedemptions: v }))}
          />
          <Field
            label="Date d'expiration (optionnel)"
            name="expiresAt"
            type="date"
            value={form.expiresAt}
            onChange={(v) => setForm((f) => ({ ...f, expiresAt: v }))}
          />
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Annuler
            </Button>
            <Button variant="primary" disabled={saving} onClick={() => void createCoupon()}>
              {saving ? 'Création…' : 'Créer'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
