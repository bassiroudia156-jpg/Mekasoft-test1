// GET /api/admin/integrations — SUPERADMIN-only read-only status panel for
// every external provider this project wires. Reports configured/not
// configured from env-var PRESENCE only — never the values themselves —
// plus a live ping for the one provider cheap enough to check on every
// request (Redis). Deliberately does NOT let the admin type API keys into
// a form: secrets stay in Vercel env vars, not the database, so this page
// can't become a credentials-leak surface.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { redis } from '@/lib/server/redis';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

interface IntegrationStatus {
  id: string;
  label: string;
  configured: boolean;
  /** null = no live check attempted (env-presence only). */
  healthy: boolean | null;
  detail: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    let redisHealthy: boolean | null = null;
    if (redis) {
      try {
        await redis.ping();
        redisHealthy = true;
      } catch {
        redisHealthy = false;
      }
    }

    const integrations: IntegrationStatus[] = [
      {
        id: 'stripe',
        label: 'Stripe (cartes bancaires)',
        configured: Boolean(process.env.STRIPE_SECRET_KEY),
        healthy: null,
        detail: 'Abonnements Pro/Business — paiement carte.',
      },
      {
        id: 'moneroo',
        label: 'Moneroo (Mobile Money)',
        configured: Boolean(process.env.MONEROO_SECRET_KEY),
        healthy: null,
        detail: 'Abonnements Pro/Business — paiement mobile money.',
      },
      {
        id: 'chariow',
        label: 'Chariow (Mobile Money)',
        configured: Boolean(process.env.CHARIOW_API_KEY),
        healthy: null,
        detail: 'Abonnements Pro/Business — paiement mobile money (fallback).',
      },
      {
        id: 'cloudinary',
        label: 'Cloudinary (stockage fichiers)',
        configured: Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY),
        healthy: null,
        detail: 'Logos garage, pièces jointes.',
      },
      {
        id: 'resend',
        label: 'Resend (emails)',
        configured: Boolean(process.env.RESEND_API_KEY),
        healthy: null,
        detail: 'Emails transactionnels (bienvenue, factures, support).',
      },
      {
        id: 'twilio',
        label: 'Twilio (WhatsApp)',
        configured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
        healthy: null,
        detail: 'Relances abonnement par WhatsApp.',
      },
      {
        id: 'google-oauth',
        label: 'Google OAuth',
        configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        healthy: null,
        detail: 'Connexion "Se connecter avec Google".',
      },
      {
        id: 'upstash-redis',
        label: 'Upstash Redis',
        configured: Boolean(process.env.UPSTASH_REDIS_REST_URL),
        healthy: redisHealthy,
        detail: 'Rate limiting, verrous, cache — PING testé en direct.',
      },
      {
        id: 'sentry',
        label: 'Sentry (observabilité)',
        configured: Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
        healthy: null,
        detail: 'Suivi des erreurs serveur/client.',
      },
    ];

    return NextResponse.json({ integrations }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
