// GET /api/auth/me — AUTH-06.
//
// Source: RESEARCH.md Pattern 14.
//
// requireAuth handles the cookie/Bearer lookup, JWT verification, and the
// DB-side tokenVersion re-check (T-1-02 mitigation against stale-JWT bypass
// after change-password bumps tokenVersion). Returns AuthContext on success
// or a 401 NextResponse on failure.
//
// Extra fields beyond { sub, email } (id, emailVerifiedAt, createdAt,
// updatedAt, hasPassword, linkedProviders) are fetched via a second DB hit
// so the AuthContext / profile page can branch on them without an extra
// round-trip. `hasPassword` distinguishes OAuth-only accounts (passwordHash
// is null) — used by /profile to switch between "Set password" and
// "Change password". `linkedProviders` is a string[] of provider names
// already wired (e.g. ['google']).
//
// Phase 8: also selects the caller's first `OrganizationMember` row
// (organizationId/orgRole/jobTitle) in the SAME query, and returns
// name/phone/avatarUrl. This is the single source of truth `AuthContext`
// fetches once per session — `Sidebar` and `ManagerProfilePanel` read
// identity + role label from here instead of each doing their own fetch.
//
// PATCH /api/auth/me — update the caller's own profile fields. Three
// independent optional inputs (name, phone, avatarUrl) so EditProfileModal's
// "save changes" and the avatar upload/remove flow can share one endpoint.
// At least one field is required. Returns { ok: true } — callers re-fetch
// via AuthContext's refresh() (same convention as change-password/set-password).
export const runtime = 'nodejs';

import 'server-only';
import { z } from 'zod';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { zPhone } from '@/lib/server/zod-helpers';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    // Defensive shape: tests sometimes stub findUnique with a minimal
    // `{ id, email, tokenVersion }` payload (the requireAuth contract).
    // We only read fields we know are present, and default the rest.
    const dbUser = await prisma.user.findUnique({
      where: { id: auth.user.sub },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        avatarUrl: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
        passwordHash: true,
        // App-wide role (USER | ADMIN | SUPERADMIN) — added 2026-08-20 so
        // the header "Admin" button can gate on it client-side. Every
        // mutating admin route still re-checks role server-side
        // (requireAdmin/requireSuperadmin); this is presentational only.
        role: true,
        oauthAccounts: { select: { provider: true } },
        memberships: {
          select: { organizationId: true, role: true, jobTitle: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });

    const membership = dbUser?.memberships?.[0] ?? null;

    const user = {
      // Keep `sub` for back-compat with the AuthContext payload contract
      // (older callers may still read it). New code should use `id`.
      sub: auth.user.sub,
      id: dbUser?.id ?? auth.user.sub,
      email: dbUser?.email ?? auth.user.email,
      name: dbUser?.name ?? null,
      phone: dbUser?.phone ?? null,
      avatarUrl: dbUser?.avatarUrl ?? null,
      emailVerifiedAt: dbUser?.emailVerifiedAt
        ? dbUser.emailVerifiedAt instanceof Date
          ? dbUser.emailVerifiedAt.toISOString()
          : dbUser.emailVerifiedAt
        : null,
      createdAt: dbUser?.createdAt
        ? dbUser.createdAt instanceof Date
          ? dbUser.createdAt.toISOString()
          : dbUser.createdAt
        : null,
      updatedAt: dbUser?.updatedAt
        ? dbUser.updatedAt instanceof Date
          ? dbUser.updatedAt.toISOString()
          : dbUser.updatedAt
        : null,
      hasPassword: !!dbUser?.passwordHash,
      role: dbUser?.role ?? 'USER',
      linkedProviders: (dbUser?.oauthAccounts ?? []).map((a) => a.provider),
      organizationId: membership?.organizationId ?? null,
      orgRole: membership?.role ?? null,
      jobTitle: membership?.jobTitle ?? null,
    };

    return NextResponse.json({ user }, { status: 200, headers: { 'x-request-id': ctx.requestId } });
  });
}

const PatchBody = z
  .object({
    name: z.string().trim().min(1, 'Name too short').max(120).optional(),
    phone: zPhone.nullable().optional(),
    avatarUrl: z.string().url().nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.phone !== undefined || v.avatarUrl !== undefined, {
    message: 'At least one field is required',
  });

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) {
      csrfFail.headers.set('x-request-id', ctx.requestId);
      return csrfFail;
    }

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const json = await req.json().catch(() => null);
    const parsed = PatchBody.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_BODY', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { name, phone, avatarUrl } = parsed.data;

    // 2026-08-24 — phone is now a login identifier alongside email (dual
    // login, see auth/login/route.ts), so it must be unique. The DB
    // constraint (schema.prisma) is the actual guarantee; this check just
    // turns a P2002 into a stable, friendly error code before it happens —
    // skipped entirely when phone isn't being changed or is being cleared.
    if (phone) {
      const existing = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
      if (existing && existing.id !== auth.user.sub) {
        return NextResponse.json(
          { error: 'PHONE_ALREADY_IN_USE', message: 'This phone number is already in use.' },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    await prisma.user.update({
      where: { id: auth.user.sub },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(avatarUrl !== undefined ? { avatarUrl } : {}),
      },
    });

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
