// GET/PATCH/DELETE /api/admin/payment-credentials — SUPERADMIN-only editor
// for Chariow's admin-editable credentials (2026-08-22 — the exception to
// the rest of the app's "secrets stay in env vars" rule, see
// credentials.ts's file comment for why Chariow specifically needs this).
//
// GET: masked status only — never a plaintext secret, only a last-4 hint
// and (for the webhook secret) the composed webhook URL.
// PATCH: partial update — any field omitted from the body is left
// untouched (a password field's "blank means keep it" convention), since
// the current value is never sent back to the client to prefill a form.
// Pass '' explicitly to clear a single field.
// DELETE: drops the DB override entirely, reverting to env-var-only config.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import {
  getChariowCredentialsStatus,
  saveChariowCredentials,
  clearChariowCredentials,
} from '@/lib/server/subscriptions/credentials';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const PatchBody = z.object({
  apiKey: z.string().trim().max(500).optional(),
  webhookSecret: z.string().trim().max(500).optional(),
  productIdPro: z.string().trim().max(200).optional(),
  productIdBusiness: z.string().trim().max(200).optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const chariow = await getChariowCredentialsStatus();
    return NextResponse.json({ chariow }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { apiKey, webhookSecret, productIdPro, productIdBusiness } = parsed.data;
    if (
      apiKey === undefined &&
      webhookSecret === undefined &&
      productIdPro === undefined &&
      productIdBusiness === undefined
    ) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'No fields to update.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    try {
      await prisma.$transaction(async (tx) => {
        const result = await saveChariowCredentials(
          {
            apiKey,
            webhookSecret,
            productIdPro,
            productIdBusiness,
            updatedByAdminId: auth.admin.id,
          },
          tx,
        );
        await logAdminAction(tx, {
          actorId: auth.admin.id,
          action: 'payment_credentials.update',
          targetType: 'PaymentProviderCredential',
          targetId: 'CHARIOW',
          metadata: {
            fieldsChanged: [
              ...(apiKey !== undefined ? ['apiKey'] : []),
              ...(webhookSecret !== undefined ? ['webhookSecret'] : []),
              ...(productIdPro !== undefined ? ['productIdPro'] : []),
              ...(productIdBusiness !== undefined ? ['productIdBusiness'] : []),
            ],
            before: result.before,
            after: result.after,
          },
        });
      });
    } catch (err) {
      // Only thrown by saveChariowCredentials when ENCRYPTION_KEY is
      // unset — Prisma auto-rolls-back the transaction (no half-written
      // row, no audit log for a write that didn't actually happen).
      const message = err instanceof Error ? err.message : 'Unknown error';
      return NextResponse.json(
        { error: 'ENCRYPTION_NOT_CONFIGURED', message },
        { status: 500, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      { chariow: await getChariowCredentialsStatus() },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    await prisma.$transaction(async (tx) => {
      await clearChariowCredentials(tx);
      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'payment_credentials.clear',
        targetType: 'PaymentProviderCredential',
        targetId: 'CHARIOW',
        metadata: {},
      });
    });

    const chariow = await getChariowCredentialsStatus();
    return NextResponse.json(
      { chariow },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
