'use client';

// /admin/integrations — read-only status of every external provider (GET
// /api/admin/integrations), plus one exception: Chariow's credentials are
// admin-editable below (2026-08-22 — see lib/server/subscriptions/
// credentials.ts's file comment for why Chariow specifically, and not the
// others, needed this). Every other provider stays env-var-only and this
// page never shows a plaintext value for any of them, Chariow included —
// only a masked last-4 hint and the composed webhook URL.
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import AdminTopBar from '@/components/admin/AdminTopBar';
import { SkeletonTable, Skeleton } from '@/components/ui/Skeleton';
import Badge from '@/components/ui/Badge';
import Icon from '@/components/ui/Icon';
import Field from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';

interface IntegrationStatus {
  id: string;
  label: string;
  configured: boolean;
  healthy: boolean | null;
  detail: string;
  /** Chariow only — see the route's own comment for why this exists:
   * Chariow's webhook auth is a shared secret placed directly in the URL
   * (no HMAC), so hand-copying the wrong value into that URL is a real
   * failure mode. This is the correct one, ready to copy. */
  webhookUrl?: string;
  /** Chariow only — true when a DB override (set below) is the active
   * source rather than the CHARIOW_* env vars. */
  isOverride?: boolean;
}

interface ChariowStatus {
  configured: boolean;
  isOverride: boolean;
  apiKeyMasked: string | null;
  webhookSecretMasked: string | null;
  productIdPro: string | null;
  productIdBusiness: string | null;
  webhookUrl: string | null;
}

const EMPTY_CHARIOW_FORM = {
  apiKey: '',
  webhookSecret: '',
  productIdPro: '',
  productIdBusiness: '',
};

export default function AdminIntegrationsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<IntegrationStatus[] | null>(null);

  const [chariow, setChariow] = useState<ChariowStatus | null>(null);
  const [chariowForm, setChariowForm] = useState(EMPTY_CHARIOW_FORM);
  const [savingChariow, setSavingChariow] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  function load() {
    api<{ integrations: IntegrationStatus[] }>('/api/admin/integrations')
      .then((res) => setRows(res.integrations))
      .catch(() => setRows([]));
    api<{ chariow: ChariowStatus }>('/api/admin/payment-credentials')
      .then((res) => setChariow(res.chariow))
      .catch(() => setChariow(null));
  }

  useEffect(load, []);

  async function copyWebhookUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast('URL copiée — colle-la dans Chariow > Automation > Pulse.', 'success');
    } catch {
      toast('Copie impossible — sélectionne et copie le texte manuellement.', 'error');
    }
  }

  async function saveChariow() {
    // Only send fields the admin actually typed — an empty field means
    // "leave this one alone", not "clear it" (that's what "Réinitialiser"
    // is for). Product IDs aren't secret, so '' there really does mean
    // "clear" if the admin deliberately emptied a prefilled field.
    const body: Record<string, string> = {};
    if (chariowForm.apiKey.trim()) body.apiKey = chariowForm.apiKey.trim();
    if (chariowForm.webhookSecret.trim()) body.webhookSecret = chariowForm.webhookSecret.trim();
    if (chariowForm.productIdPro !== (chariow?.productIdPro ?? '')) {
      body.productIdPro = chariowForm.productIdPro.trim();
    }
    if (chariowForm.productIdBusiness !== (chariow?.productIdBusiness ?? '')) {
      body.productIdBusiness = chariowForm.productIdBusiness.trim();
    }
    if (Object.keys(body).length === 0) {
      toast('Aucun champ modifié.', 'error');
      return;
    }
    setSavingChariow(true);
    try {
      const res = await api<{ chariow: ChariowStatus }>('/api/admin/payment-credentials', {
        method: 'PATCH',
        body,
      });
      setChariow(res.chariow);
      setChariowForm(EMPTY_CHARIOW_FORM);
      toast('Configuration Chariow enregistrée.', 'success');
      load(); // refresh the read-only status row's "Configuré" badge too
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Échec de l’enregistrement.', 'error');
    } finally {
      setSavingChariow(false);
    }
  }

  async function clearChariow() {
    setClearing(true);
    try {
      const res = await api<{ chariow: ChariowStatus }>('/api/admin/payment-credentials', {
        method: 'DELETE',
      });
      setChariow(res.chariow);
      setChariowForm(EMPTY_CHARIOW_FORM);
      setClearConfirmOpen(false);
      toast('Configuration réinitialisée — retour aux variables d’environnement.', 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Échec de la réinitialisation.', 'error');
    } finally {
      setClearing(false);
    }
  }

  // Product ID fields are prefilled (they aren't secret); API key/webhook
  // secret never are — only their masked hint shows, in the placeholder.
  useEffect(() => {
    if (!chariow) return;
    setChariowForm((f) => ({
      ...f,
      productIdPro: chariow.productIdPro ?? '',
      productIdBusiness: chariow.productIdBusiness ?? '',
    }));
  }, [chariow]);

  return (
    <>
      <AdminTopBar title="Intégrations" subtitle="Statut des services externes connectés" />
      <div className="p-6">
        <div className="bg-surface border border-border rounded-lg p-6">
          {!rows ? (
            <SkeletonTable rows={6} cols={3} />
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {rows.map((row) => (
                <div key={row.id} className="flex flex-col gap-3 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-md flex items-center justify-center ${
                          row.configured ? 'bg-success/10' : 'bg-muted'
                        }`}
                      >
                        <Icon
                          i={row.configured ? 'check' : 'x'}
                          size={16}
                          className={row.configured ? 'text-success' : 'text-muted-foreground'}
                        />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">{row.label}</div>
                        <div className="text-xs text-muted-foreground">{row.detail}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {row.healthy !== null && (
                        <Badge tone={row.healthy ? 'success' : 'warning'}>
                          {row.healthy ? 'Connexion OK' : 'Connexion échouée'}
                        </Badge>
                      )}
                      <Badge tone={row.configured ? 'success' : 'muted'}>
                        {row.configured ? 'Configuré' : 'Non configuré'}
                      </Badge>
                    </div>
                  </div>

                  {/* Webhook URL (2026-08-22 audit fix) — Chariow has no
                      HMAC signature, auth is a shared secret placed
                      directly in the URL (Chariow.md §7), which is exactly
                      what broke in prod: the API key got pasted in there
                      instead of the webhook secret, so every Pulse call
                      401'd until Chariow auto-disabled it. This is the
                      correct URL, built server-side — copy it instead of
                      typing it. */}
                  {row.webhookUrl && (
                    <div className="ml-12 flex flex-col gap-1.5">
                      <span className="text-xs text-muted-foreground">
                        URL webhook (Chariow &gt; Automation &gt; Pulse) :
                      </span>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 min-w-0 truncate rounded-md border border-border bg-input px-3 py-2 text-xs text-foreground">
                          {row.webhookUrl}
                        </code>
                        <button
                          type="button"
                          onClick={() => void copyWebhookUrl(row.webhookUrl!)}
                          className="shrink-0 flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-input"
                        >
                          <Icon i="copy" size={13} />
                          Copier
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chariow credentials editor (2026-08-22) — "je veux que tu me
            crée la section où on peut renseigner toutes les infos
            nécessaires pour connecter chariow". Encrypted at rest
            (lib/server/crypto.ts AES-256-GCM), never round-tripped to the
            client in plaintext — a saved API key/webhook secret shows only
            as a masked last-4 hint via the field's placeholder, and the
            inputs always start empty (typing something = "change it",
            leaving it blank = "leave it alone"). */}
        {!chariow ? (
          <div className="bg-surface border border-border rounded-lg p-6 mt-6 flex flex-col gap-4">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-lg p-6 mt-6 flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-foreground">Configuration Chariow</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {chariow.isOverride
                    ? 'Source active : cette configuration (prioritaire sur les variables d’environnement).'
                    : 'Source active : variables d’environnement (aucune configuration enregistrée ici).'}
                </p>
              </div>
              <Badge tone={chariow.configured ? 'success' : 'muted'}>
                {chariow.configured ? 'Configuré' : 'Non configuré'}
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field
                label="Clé API Chariow"
                name="chariowApiKey"
                type="password"
                value={chariowForm.apiKey}
                onChange={(v) => setChariowForm((f) => ({ ...f, apiKey: v }))}
                placeholder={
                  chariow.apiKeyMasked ? `Actuelle : ${chariow.apiKeyMasked}` : 'sk_live_…'
                }
                helper="Laisser vide pour ne pas la changer."
              />
              <Field
                label="Secret webhook (Pulse)"
                name="chariowWebhookSecret"
                type="password"
                value={chariowForm.webhookSecret}
                onChange={(v) => setChariowForm((f) => ({ ...f, webhookSecret: v }))}
                placeholder={
                  chariow.webhookSecretMasked ? `Actuel : ${chariow.webhookSecretMasked}` : '…'
                }
                helper="Laisser vide pour ne pas le changer."
              />
              <Field
                label="ID produit Chariow — Pro"
                name="chariowProductIdPro"
                value={chariowForm.productIdPro}
                onChange={(v) => setChariowForm((f) => ({ ...f, productIdPro: v }))}
                placeholder="prd_…"
              />
              <Field
                label="ID produit Chariow — Business"
                name="chariowProductIdBusiness"
                value={chariowForm.productIdBusiness}
                onChange={(v) => setChariowForm((f) => ({ ...f, productIdBusiness: v }))}
                placeholder="prd_…"
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                disabled={!chariow.isOverride}
                onClick={() => setClearConfirmOpen(true)}
              >
                Réinitialiser (revenir aux variables d’env)
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={savingChariow}
                onClick={() => void saveChariow()}
              >
                {savingChariow ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={clearConfirmOpen}
        onClose={() => setClearConfirmOpen(false)}
        title="Réinitialiser la configuration Chariow ?"
        icon="triangle-alert"
        maxWidth="md"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            L’app retombera sur les variables d’environnement (CHARIOW_API_KEY,
            CHARIOW_WEBHOOK_SECRET, …). Si elles ne sont pas à jour, les paiements Chariow
            s’arrêteront jusqu’à ce que tu reconfigures l’une des deux sources.
          </p>
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => setClearConfirmOpen(false)}
              disabled={clearing}
            >
              Annuler
            </Button>
            <Button variant="destructive" onClick={() => void clearChariow()} disabled={clearing}>
              {clearing ? 'Réinitialisation…' : 'Réinitialiser'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
