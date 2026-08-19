// Twilio WhatsApp sender — relance channel for MONEROO/CHARIOW subscriptions
// (Stripe auto-renews via card and never needs this). Plain `fetch` against
// Twilio's REST API rather than the `twilio` npm SDK — one endpoint, one
// call shape, not worth a new dependency (same reasoning as the CSV export
// module going dependency-free).
//
// Env-gated like redis.ts/email.ts: returns null when TWILIO_ACCOUNT_SID /
// TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM are absent — callers skip
// WhatsApp and fall back to email-only, never throw.
import 'server-only';
import { createLogger } from '../logger';

const log = createLogger();

export interface WhatsAppClient {
  /** `to` is E.164 (e.g. "+221771234567") — the `whatsapp:` prefix is added here. */
  send(to: string, body: string): Promise<{ sid: string }>;
}

export interface WhatsAppSendError {
  status: number;
  message: string;
}

function isConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_WHATSAPP_FROM
  );
}

let _client: WhatsAppClient | null | undefined;

/** Lazy singleton — mirrors getRedis()'s "cache null too" pattern so a
 * missing env doesn't re-check on every call. */
export function getWhatsAppClient(): WhatsAppClient | null {
  if (_client !== undefined) return _client;

  if (!isConfigured()) {
    log.warn(
      'subscriptions/whatsapp: not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM required) — relances will be email-only',
    );
    _client = null;
    return null;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const authToken = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_WHATSAPP_FROM!;
  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  _client = {
    async send(to, body) {
      const params = new URLSearchParams({
        From: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
        To: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
        Body: body,
      });

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
      if (!res.ok) {
        throw Object.assign(new Error(json.message ?? `Twilio error (${res.status})`), {
          status: res.status,
        });
      }
      if (!json.sid) {
        throw new Error('Twilio response missing sid');
      }
      return { sid: json.sid };
    },
  };
  return _client;
}

/** Test-only — clear the cached client. */
export function __resetWhatsAppClient(): void {
  _client = undefined;
}
