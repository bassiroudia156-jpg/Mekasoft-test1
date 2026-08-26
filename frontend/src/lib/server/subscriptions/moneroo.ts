// Moneroo adapter — subscription billing (2026-08-18). One-shot mobile-money
// checkout (all-Africa aggregator); no push-renewal capability, hence the
// relance cron (reminders.ts) + grace period (downgrade.ts) for this
// provider. API shapes per docs.moneroo.io / the izisaas-payments-handler
// skill's examples/moneroo.ts — adapted here to single-tenant env-var
// credentials (MekaSoft has ONE Moneroo account, not per-org BYOK).
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { WebhookProvider } from '../webhook/handler';
import { createLogger } from '../logger';
import type {
  SubscriptionCheckoutInput,
  SubscriptionCheckoutResult,
  SubscriptionProvider,
} from './types';

const log = createLogger();
const MONEROO_API_URL = 'https://api.moneroo.io';
const FETCH_TIMEOUT_MS = 15_000;

function isConfigured(): boolean {
  return !!(process.env.MONEROO_SECRET_KEY && process.env.MONEROO_WEBHOOK_SECRET);
}

/** Moneroo requires customer.first_name/last_name — silently 400s on a bare
 * email (skill gotcha). Split a single display name, "-" fallback for the
 * last name when we only have one word. */
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

async function monerooFetch(path: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(`${MONEROO_API_URL}${path}`, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export const monerooSubscriptionProvider: SubscriptionProvider = {
  name: 'MONEROO',
  isConfigured,

  async createCheckout(input: SubscriptionCheckoutInput): Promise<SubscriptionCheckoutResult> {
    const secretKey = process.env.MONEROO_SECRET_KEY;
    if (!secretKey) throw new Error('Moneroo not configured');

    const { first, last } = splitName(input.customerName, input.customerEmail);
    const body = {
      amount: input.amount,
      currency: input.currency,
      description: `MekaSoft — abonnement ${input.plan} (1 mois)`.slice(0, 200),
      return_url: input.successUrl,
      customer: {
        email: input.customerEmail,
        first_name: first,
        last_name: last,
        ...(input.customerPhone ? { phone: input.customerPhone } : {}),
      },
      metadata: {
        subscriptionPaymentId: input.subscriptionPaymentId,
        organizationId: input.organizationId,
        plan: input.plan,
      },
    };

    const res = await monerooFetch('/v1/payments/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const parsed = (await res.json().catch(() => null)) as {
      data?: { id?: string; checkout_url?: string };
      message?: string;
    } | null;

    if (!res.ok || !parsed?.data?.id || !parsed.data.checkout_url) {
      throw new Error(parsed?.message ?? `Moneroo responded ${res.status}`);
    }

    return { providerRef: parsed.data.id, checkoutUrl: parsed.data.checkout_url };
  },
};

/** Re-query for defense-in-depth (recommended for Moneroo per the skill's
 * gotchas — the HMAC is safe, but the live re-query is cheap insurance).
 * Used both by the webhook handler and the /verify-checkout poll route. */
export async function verifyMonerooPayment(
  paymentId: string,
): Promise<{ status: string; amount?: number; currency?: string } | null> {
  const secretKey = process.env.MONEROO_SECRET_KEY;
  if (!secretKey) return null;

  const res = await monerooFetch(`/v1/payments/${encodeURIComponent(paymentId)}/verify`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${secretKey}`, Accept: 'application/json' },
  }).catch(() => null);
  if (!res || !res.ok) return null;

  const json = (await res.json().catch(() => null)) as {
    data?: { status?: string; amount?: number | string; currency?: { code?: string } | string };
  } | null;
  if (!json?.data?.status) return null;

  const currency =
    typeof json.data.currency === 'string' ? json.data.currency : json.data.currency?.code;
  const amount =
    typeof json.data.amount === 'string' ? parseInt(json.data.amount, 10) : json.data.amount;
  return {
    status: String(json.data.status).toLowerCase(),
    ...(amount !== undefined ? { amount } : {}),
    ...(currency !== undefined ? { currency } : {}),
  };
}

// ───────────────────────────────────────────────────────────────────────
// Webhook — WebhookProvider<MonerooWebhookPayload>. HMAC-SHA256 over the
// raw body, header `X-Moneroo-Signature`. Raw-body capture is non-negotiable
// here (createWebhookHandler reads it via arrayBuffer() before any JSON
// parse, so this is automatically satisfied).
// ───────────────────────────────────────────────────────────────────────

export interface MonerooWebhookPayload {
  event?: string;
  data?: { id?: string; amount?: number | string; currency?: unknown };
}

export const monerooWebhookProvider: WebhookProvider<MonerooWebhookPayload> = {
  name: 'moneroo-subscription',

  verifySignature(rawBody, headers) {
    const secret = process.env.MONEROO_WEBHOOK_SECRET;
    if (!secret) return { valid: false, reason: 'not configured' };
    const provided = headers['x-moneroo-signature'];
    if (!provided) return { valid: false, reason: 'missing X-Moneroo-Signature header' };

    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { valid: false, reason: 'signature mismatch' };
    }
    return { valid: true };
  },

  parsePayload(rawBody) {
    return JSON.parse(rawBody.toString('utf-8')) as MonerooWebhookPayload;
  },

  extractIds(payload) {
    const externalId = payload.data?.id ?? '';
    const eventType = payload.event ?? 'unknown';
    const kind =
      payload.event === 'payment.success'
        ? ('paid' as const)
        : payload.event === 'payment.failed' || payload.event === 'payment.cancelled'
          ? ('failed' as const)
          : ('other' as const);
    if (kind === 'other') {
      log.info('moneroo subscription webhook: unhandled event (skipped)', { event: payload.event });
    }
    return { externalId, eventType, kind };
  },
};
