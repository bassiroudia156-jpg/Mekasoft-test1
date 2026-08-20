// POST creates the caller's organization ("atelier") + first
// OrganizationMember(OWNER) row, atomically — this is the org-bootstrap
// step of the Banani onboarding wizard (step 2 "Infos garage" + step 3
// "Équipe" submit together, since step 4 is a pure success screen with no
// further input — see .planning/banani/IMPLEMENTATION-PLAN.md Phase 2).
//
// V1 assumes single-org-per-user (no org-switcher UI yet): a second POST
// from a user who already belongs to an organization is rejected with 409
// rather than silently creating a second org — the frontend redirects to
// /dashboard on that code instead of treating it as an error.
//
// GET lists the caller's organizations — used by /onboarding and
// /dashboard to decide whether to show the wizard or the org-less banner.
// Phase 8: GET also returns the shop-detail fields (street/postalCode/
// country/taxId/siren/contactEmail/hours*) so /profile (Atelier card,
// formerly /settings) and /settings/shop don't need a dedicated endpoint —
// additive, existing consumers only destructure id/slug/name/role.
//
// PATCH updates the CALLER's own org (no [id] in the URL — same implicit-
// scoping convention as requireCallerOrg everywhere else). Gated at
// requireCallerOrg('ADMIN'): shop identity/contact info is not a plain-
// MEMBER action.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { prisma } from '@/lib/server/prisma';
import { slugify, ensureUniqueSlug } from '@/lib/server/slug';
import { zPhone, zEmail } from '@/lib/server/zod-helpers';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { getPlanLimits } from '@/lib/server/plans/limits';

const CreateOrgBody = z.object({
  name: z.string().trim().min(2, 'Nom trop court').max(120),
  phone: zPhone,
  city: z.string().trim().min(2, 'Ville trop courte').max(80),
  teamSizeHint: z.enum(['SOLO', 'SMALL', 'MEDIUM', 'LARGE']).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const json = await req.json().catch(() => null);
    const parsed = CreateOrgBody.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_BODY', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { name, phone, city, teamSizeHint } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.organizationMember.findFirst({
        where: { userId: auth.user.sub },
        select: { organization: { select: { id: true, slug: true, name: true } } },
      });
      if (existing) {
        return { ok: false as const, organization: existing.organization };
      }

      let created: { id: string; slug: string; name: string } | undefined;
      await ensureUniqueSlug(slugify(name), async (candidateSlug) => {
        created = await tx.organization.create({
          data: {
            slug: candidateSlug,
            name,
            ownerId: auth.user.sub,
            phone,
            city,
            ...(teamSizeHint !== undefined ? { teamSizeHint } : {}),
          },
          select: { id: true, slug: true, name: true },
        });
        return created;
      });
      if (!created) {
        // Unreachable in practice — ensureUniqueSlug only returns after its
        // create() callback resolves without throwing.
        throw new Error('Organization creation did not produce a row');
      }

      await tx.organizationMember.create({
        data: { organizationId: created.id, userId: auth.user.sub, role: 'OWNER' },
      });

      return { ok: true as const, organization: created };
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: 'ORGANIZATION_ALREADY_EXISTS',
          message: 'You already belong to an organization.',
          organization: result.organization,
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      { organization: result.organization },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const memberships = await prisma.organizationMember.findMany({
      where: { userId: auth.user.sub },
      select: {
        role: true,
        organization: {
          select: {
            id: true,
            slug: true,
            name: true,
            phone: true,
            city: true,
            street: true,
            postalCode: true,
            country: true,
            taxId: true,
            siren: true,
            contactEmail: true,
            hoursWeekday: true,
            hoursSaturday: true,
            hoursSunday: true,
            plan: true,
            logoUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const organizations = memberships.map((m) => ({
      id: m.organization.id,
      slug: m.organization.slug,
      name: m.organization.name,
      role: m.role,
      phone: m.organization.phone,
      city: m.organization.city,
      street: m.organization.street,
      postalCode: m.organization.postalCode,
      country: m.organization.country,
      taxId: m.organization.taxId,
      siren: m.organization.siren,
      contactEmail: m.organization.contactEmail,
      hoursWeekday: m.organization.hoursWeekday,
      hoursSaturday: m.organization.hoursSaturday,
      hoursSunday: m.organization.hoursSunday,
      plan: m.organization.plan,
      logoUrl: m.organization.logoUrl,
    }));

    return NextResponse.json({ organizations }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

const PatchOrgBody = z
  .object({
    name: z.string().trim().min(2, 'Nom trop court').max(120).optional(),
    phone: zPhone.optional(),
    city: z.string().trim().min(1).max(80).optional(),
    street: z.string().trim().max(200).nullable().optional(),
    postalCode: z.string().trim().max(20).nullable().optional(),
    country: z.string().trim().max(80).nullable().optional(),
    taxId: z.string().trim().max(50).nullable().optional(),
    siren: z.string().trim().max(50).nullable().optional(),
    contactEmail: zEmail.nullable().optional(),
    hoursWeekday: z.string().trim().max(50).nullable().optional(),
    hoursSaturday: z.string().trim().max(50).nullable().optional(),
    hoursSunday: z.string().trim().max(50).nullable().optional(),
    logoUrl: z.string().trim().url().max(500).nullable().optional(),
  })
  .refine((v) => Object.values(v).some((val) => val !== undefined), {
    message: 'At least one field is required',
  });

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const callerOrg = await requireCallerOrg('ADMIN', req.headers.get('authorization'));
    if (callerOrg instanceof NextResponse) return callerOrg;

    const json = await req.json().catch(() => null);
    const parsed = PatchOrgBody.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_BODY', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const {
      name,
      phone,
      city,
      street,
      postalCode,
      country,
      taxId,
      siren,
      contactEmail,
      hoursWeekday,
      hoursSaturday,
      hoursSunday,
      logoUrl,
    } = parsed.data;

    if (logoUrl !== undefined && logoUrl !== null) {
      const org = await prisma.organization.findUnique({
        where: { id: callerOrg.organizationId },
        select: { plan: true },
      });
      if (!getPlanLimits(org?.plan ?? 'FREE').features.invoiceBranding) {
        return NextResponse.json(
          {
            error: 'PLAN_FEATURE_LOCKED',
            message: 'Le logo sur les factures est réservé au plan Premium.',
          },
          { status: 403, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    await prisma.organization.update({
      where: { id: callerOrg.organizationId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(city !== undefined ? { city } : {}),
        ...(street !== undefined ? { street } : {}),
        ...(postalCode !== undefined ? { postalCode } : {}),
        ...(country !== undefined ? { country } : {}),
        ...(taxId !== undefined ? { taxId } : {}),
        ...(siren !== undefined ? { siren } : {}),
        ...(contactEmail !== undefined ? { contactEmail } : {}),
        ...(hoursWeekday !== undefined ? { hoursWeekday } : {}),
        ...(hoursSaturday !== undefined ? { hoursSaturday } : {}),
        ...(hoursSunday !== undefined ? { hoursSunday } : {}),
        ...(logoUrl !== undefined ? { logoUrl } : {}),
      },
    });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
