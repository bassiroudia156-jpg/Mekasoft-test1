// Chariow adapter — subscription billing (2026-08-18). One-shot mobile-money
// hosted checkout (Orange Money/Wave/MTN/Moov + card) — see Chariow.md at
// the repo root for the full integration doc this adapter implements
// against. Same manual-renewal caveat as Moneroo: no push-renewal, hence
// the relance cron + grace period.
//
// Single-tenant: MekaSoft has ONE Chariow account (Chariow.md §1's "compte
// plateforme unique" variant, not the per-creator BYOK variant the doc
// leads with).
//
// 2026-08-22: credentials now resolve through credentials.ts's
// getChariowCredentials() — a DB override (set from /admin/integrations)
// wins over the CHARIOW_* env vars when present, same override-with-
// fallback shape as plans/pricing.ts. This is why isConfigured/
// createCheckout/getChariowSale below all became async where they weren't
// before (a plain env-var read didn't need to be).
import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js/min';
import type { WebhookProvider } from '../webhook/handler';
import { createLogger } from '../logger';
import { getChariowCredentials } from './credentials';
import type {
  SubscriptionCheckoutInput,
  SubscriptionCheckoutResult,
  SubscriptionProvider,
} from './types';

const log = createLogger();
const CHARIOW_API_URL = process.env.CHARIOW_API_URL || 'https://api.chariow.com/v1';
const FETCH_TIMEOUT_MS = 15_000;

function productIdForPlan(
  plan: 'PRO' | 'BUSINESS',
  creds: { productIdPro: string | null; productIdBusiness: string | null },
): string | null {
  return plan === 'PRO' ? creds.productIdPro : creds.productIdBusiness;
}

async function isConfigured(): Promise<boolean> {
  const creds = await getChariowCredentials();
  return !!(creds.apiKey && creds.webhookSecret && creds.productIdPro && creds.productIdBusiness);
}

async function chariowFetch(path: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(`${CHARIOW_API_URL}${path}`, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Chariow.md §3bis — { number: NATIONAL digits (no +indicatif, no leading
 * 0), country_code: ISO2 }, built from an already-validated E.164 phone
 * (Organization.phone, validated by zPhone at org-creation time). Reuses
 * `libphonenumber-js/min` — already a dependency (PhoneField.tsx). */
export function resolveChariowPhone(
  e164Phone: string,
): { number: string; country_code: string } | null {
  const parsed = parsePhoneNumberFromString(e164Phone);
  if (!parsed || !parsed.country) return null;
  return { number: parsed.nationalNumber, country_code: parsed.country };
}

/** Splits a display name into the two fields Chariow requires (§3.1 "les
 * DEUX requis") — same fallback shape as Moneroo's splitName. */
function splitName(
  full: string | undefined,
  fallbackEmail: string,
): { first: string; last: string } {
  const v = (full ?? '').trim();
  if (!v) {
    const local = fallbackEmail.split('@')[0] || 'Client';
    return { first: local, last: '-' };
  }
  const parts = v.split(/\s+/);
  return { first: parts[0]!, last: parts.slice(1).join(' ') || '-' };
}

export const chariowSubscriptionProvider: SubscriptionProvider = {
  name: 'CHARIOW',
  isConfigured,

  async createCheckout(input: SubscriptionCheckoutInput): Promise<SubscriptionCheckoutResult> {
    const creds = await getChariowCredentials();
    const apiKey = creds.apiKey;
    if (!apiKey) throw new Error('Chariow not configured');
    const productId = productIdForPlan(input.plan, creds);
    if (!productId) throw new Error(`No Chariow product id configured for plan ${input.plan}`);

    const { first, last } = splitName(input.customerName, input.customerEmail);
    const phone = input.customerPhone ? resolveChariowPhone(input.customerPhone) : null;
    if (!phone) {
      throw new Error(
        'Chariow requires a valid phone number (Organization.phone) to start a checkout',
      );
    }

    const body = {
      product_id: productId,
      email: input.customerEmail,
      first_name: first,
      last_name: last,
      phone,
      redirect_url: input.successUrl,
      custom_metadata: {
        subscriptionPaymentId: input.subscriptionPaymentId,
        organizationId: input.organizationId,
        plan: input.plan,
      },
    };

    const res = await chariowFetch('/checkout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const parsed = (await res.json().catch(() => null)) as {
      data?: { purchase?: { id?: string }; payment?: { checkout_url?: string } };
      message?: string;
    } | null;

    const saleId = parsed?.data?.purchase?.id;
    const checkoutUrl = parsed?.data?.payment?.checkout_url;
    if (!res.ok || !saleId || !checkoutUrl) {
      throw new Error(parsed?.message ?? `Chariow responded ${res.status}`);
    }

    return { providerRef: saleId, checkoutUrl };
  },
};

// Chariow.md §3.3 — statuses normalized in this order ONLY: "unpaid" must be
// tested before "paid" (the substring trap: "unpaid".includes("paid")), then
// failures/cancellations, then success. Getting this order wrong credits an
// unpaid sale — Chariow.md calls this out explicitly as a real incident.
export type ChariowNormalizedStatus = 'succeeded' | 'failed' | 'abandoned' | 'pending';

export function mapChariowStatus(rawStatus: string): ChariowNormalizedStatus {
  const s = rawStatus.toLowerCase();
  if (/unpaid/.test(s)) return 'pending';
  if (/failed|error/.test(s)) return 'failed';
  if (/cancel|abandon|refund/.test(s)) return 'abandoned';
  if (/settle|complete|paid|success/.test(s)) return 'succeeded';
  return 'pending';
}

/** Re-query — GET /sales/{id}, the source of truth per Chariow.md §3.2, used
 * by both the webhook handler (defense-in-depth) and /verify-checkout poll. */
export async function getChariowSale(
  saleId: string,
): Promise<{ status: ChariowNormalizedStatus; amount?: number; currency?: string } | null> {
  const apiKey = (await getChariowCredentials()).apiKey;
  if (!apiKey) return null;

  const res = await chariowFetch(`/sales/${encodeURIComponent(saleId)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  }).catch(() => null);
  if (!res || !res.ok) return null;

  const json = (await res.json().catch(() => null)) as {
    data?: { status?: string; amount?: { value?: number; currency?: string } };
  } | null;
  if (!json?.data?.status) return null;

  return {
    status: mapChariowStatus(json.data.status),
    ...(json.data.amount?.value !== undefined ? { amount: json.data.amount.value } : {}),
    ...(json.data.amount?.currency !== undefined ? { currency: json.data.amount.currency } : {}),
  };
}

// ───────────────────────────────────────────────────────────────────────
// Webhook ("Pulse", Chariow.md §7) — the secret lives in the URL query
// string (`?secret=...`), NOT a header, so it cannot be checked inside
// `verifySignature(rawBody, headers)` (the PROTECTED createWebhookHandler
// factory only exposes headers, never the request URL, to providers).
// The route file itself checks `?secret=` BEFORE delegating to the
// factory — see app/api/webhooks/subscriptions/chariow/route.ts.
// verifySignature here is therefore a deliberate pass-through: by the time
// it runs, the secret has already been verified in constant time one layer
// up. "Zero confiance dans le corps" (§7) still holds — onPaid re-queries
// GET /sales/{id} rather than trusting the webhook payload's own status.
// ───────────────────────────────────────────────────────────────────────

export interface ChariowWebhookPayload {
  event?: string;
  data?: {
    id?: string;
    sale_id?: string;
    status?: string;
    custom_metadata?: Record<string, unknown>;
  };
}

export const chariowWebhookProvider: WebhookProvider<ChariowWebhookPayload> = {
  name: 'chariow-subscription',

  verifySignature() {
    // Secret already checked by the route wrapper (query param, not a
    // header) — see file-level comment above.
    return { valid: true };
  },

  parsePayload(rawBody) {
    return JSON.parse(rawBody.toString('utf-8')) as ChariowWebhookPayload;
  },

  extractIds(payload) {
    const saleId = payload.data?.sale_id ?? payload.data?.id ?? '';
    const eventType = payload.event ?? 'unknown';
    // Chariow.md §7 — recognized success events. Everything else (including
    // a raw `status` field in some payload shapes) is re-verified against
    // GET /sales/{id} in the handler rather than trusted here.
    const successEvents = new Set(['successful.sale', 'settled.sale', 'completed.sale']);
    const kind = successEvents.has(eventType) ? ('paid' as const) : ('other' as const);
    if (kind === 'other') {
      log.info('chariow subscription webhook: unhandled event (skipped)', { event: eventType });
    }
    return { externalId: saleId, eventType, kind };
  },
};

/** Constant-time secret compare for the route wrapper (mirrors
 * lib/server/cron/auth.ts's own length-guarded timingSafeEqual pattern). */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
