// GET/POST /api/quotes/respond/[token] — public, no account, no CSRF
// (pre-session route — same carve-out as /api/invites/[token]/accept: the
// bearer of the 32-byte random token is the proof, there's no session to
// forge). Powers /quotes/respond/[token], the page a client opens from the
// quote-sent email to review the devis and accept/reject it themselves.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ action: z.enum(['accept', 'reject']) });

// IP-keyed (no email on this route) — mainly a brake on scripted abuse;
// the token itself (32 bytes, base64url) is not brute-forceable in any
// realistic window.
const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'quotes:respond',
  windowMs: 15 * 60 * 1000,
  max: 30,
  code: 'TOO_MANY_ATTEMPTS',
  message: 'Trop de tentatives. Réessayez plus tard.',
});

function displayName(c: {
  type: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
}) {
  if (c.type === 'COMPANY') return c.companyName ?? '';
  return [c.firstName, c.lastName].filter(Boolean).join(' ');
}

export async function GET(
  req: NextRequest,
  routeCtx: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const rl = await limiter.check(req, null);
    if (rl) return rl;

    const { token } = await routeCtx.params;

    const row = await prisma.quote.findUnique({
      where: { token },
      include: {
        client: { select: { type: true, firstName: true, lastName: true, companyName: true } },
        vehicle: { select: { brand: true, model: true, year: true, registration: true } },
        organization: { select: { name: true } },
        parts: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!row) {
      return NextResponse.json(
        { error: 'QUOTE_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      {
        quote: {
          reference: row.reference,
          status: row.status,
          organizationName: row.organization.name,
          clientName: displayName(row.client),
          vehicle: `${row.vehicle.brand} ${row.vehicle.model}${row.vehicle.year ? ` ${row.vehicle.year}` : ''} · ${row.vehicle.registration}`,
          work: row.work,
          laborAmount: row.laborAmount,
          partsAmount: row.partsAmount,
          taxRatePct: row.taxRatePct,
          taxAmount: row.taxAmount,
          subtotal: row.subtotal,
          amount: row.amount,
          validUntil: row.validUntil,
          respondedAt: row.respondedAt,
          createdAt: row.createdAt,
          parts: row.parts.map((p) => ({
            name: p.name,
            quantity: p.quantity,
            unit: p.unit,
            unitPrice: p.unitPrice,
            total: p.total,
          })),
        },
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function POST(
  req: NextRequest,
  routeCtx: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const rl = await limiter.check(req, null);
    if (rl) return rl;

    const { token } = await routeCtx.params;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_BODY', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const existing = await prisma.quote.findUnique({
      where: { token },
      select: { id: true, status: true, validUntil: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'QUOTE_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (existing.status !== 'SENT') {
      return NextResponse.json(
        { error: 'QUOTE_NOT_RESPONDABLE', message: 'Ce devis a déjà reçu une réponse.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (existing.validUntil.getTime() < Date.now()) {
      return NextResponse.json(
        { error: 'QUOTE_EXPIRED', message: 'Ce devis a expiré.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // WR-05-style TOCTOU close: guard the update on status still being SENT
    // so two concurrent clicks (e.g. a double-tap) can't both "win".
    const result = await prisma.quote.updateMany({
      where: { id: existing.id, status: 'SENT' },
      data: {
        status: parsed.data.action === 'accept' ? 'ACCEPTED' : 'REJECTED',
        respondedAt: new Date(),
        respondedByName: 'Client (lien)',
      },
    });
    if (result.count === 0) {
      return NextResponse.json(
        { error: 'QUOTE_NOT_RESPONDABLE', message: 'Ce devis a déjà reçu une réponse.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      { ok: true, status: parsed.data.action === 'accept' ? 'ACCEPTED' : 'REJECTED' },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
