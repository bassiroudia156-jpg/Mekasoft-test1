// GET/POST /api/clients — Banani ClientsList / AddNewClient
// (+AddNewIndividualClient/_next1 "Add Company" type-toggle states).
//
// A Client is INDIVIDUAL or COMPANY (one model, type-discriminated required
// fields — see schema.prisma comment). List search matches name/phone/email
// across both shapes; cursor pagination follows the admin/users list
// pattern (clampLimit/cursorWhere/buildPage).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';

import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { zPhone } from '@/lib/server/zod-helpers';
import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { checkClientLimit } from '@/lib/server/plans/guard';
import { encryptPii } from '@/lib/server/clients/pii-crypto';

const Q_MAX = 200;

const ClientBody = z
  .object({
    type: z.enum(['INDIVIDUAL', 'COMPANY']),
    phone: zPhone,
    email: z.string().email().optional(),
    street: z.string().max(200).optional(),
    city: z.string().max(100).optional(),
    postalCode: z.string().max(20).optional(),
    country: z.string().max(100).optional(),
    notes: z.string().max(2000).optional(),
    firstName: z.string().trim().max(100).optional(),
    lastName: z.string().trim().max(100).optional(),
    profession: z.string().max(150).optional(),
    dateOfBirth: z.string().optional(),
    gender: z.string().max(20).optional(),
    idNumber: z.string().max(60).optional(),
    companyName: z.string().trim().max(200).optional(),
    taxId: z.string().max(60).optional(),
    sector: z.string().max(150).optional(),
    contactName: z.string().max(120).optional(),
    contactRole: z.string().max(100).optional(),
    contactPhone: z.string().max(30).optional(),
    contactEmail: z.string().email().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'INDIVIDUAL') {
      if (!data.firstName)
        ctx.addIssue({ code: 'custom', path: ['firstName'], message: 'Required' });
      if (!data.lastName) ctx.addIssue({ code: 'custom', path: ['lastName'], message: 'Required' });
    } else {
      if (!data.companyName)
        ctx.addIssue({ code: 'custom', path: ['companyName'], message: 'Required' });
    }
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

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireCallerOrg('MEMBER');
    if (auth instanceof NextResponse) return auth;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const q = (url.searchParams.get('q') ?? '').slice(0, Q_MAX).trim();
    const status = url.searchParams.get('status');
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const where: Prisma.ClientWhereInput = {
      organizationId: auth.organizationId,
      ...(status ? { status } : {}),
      // 2026-08-18 audit fix: `q`'s own OR and cursorWhere()'s OR were
      // previously both spread as top-level `OR` keys on the same object —
      // the second silently overwrote the first, so a search combined with
      // pagination (page 2+ of search results) quietly dropped the search
      // filter entirely. Nesting both inside `AND` keeps them independent
      // regardless of which are present.
      AND: [
        ...(q
          ? [
              {
                OR: [
                  { firstName: { contains: q, mode: 'insensitive' as const } },
                  { lastName: { contains: q, mode: 'insensitive' as const } },
                  { companyName: { contains: q, mode: 'insensitive' as const } },
                  { phone: { contains: q, mode: 'insensitive' as const } },
                  { email: { contains: q, mode: 'insensitive' as const } },
                ],
              },
            ]
          : []),
        cursorWhere(cursor),
      ],
    };

    const rows = await prisma.client.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        type: true,
        firstName: true,
        lastName: true,
        companyName: true,
        phone: true,
        email: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { vehicles: true } },
      },
    });

    const page = buildPage(rows, limit);
    const items = page.items.map((c) => ({
      id: c.id,
      type: c.type,
      name: displayName(c),
      phone: c.phone,
      email: c.email,
      status: c.status,
      vehicles: c._count.vehicles,
    }));

    // Counts for the "Tous/Actifs/Inactifs" filter tabs reflect the whole
    // org, independent of the current search text.
    const [total, active, inactive] = await Promise.all([
      prisma.client.count({ where: { organizationId: auth.organizationId } }),
      prisma.client.count({ where: { organizationId: auth.organizationId, status: 'actif' } }),
      prisma.client.count({ where: { organizationId: auth.organizationId, status: 'inactif' } }),
    ]);

    return NextResponse.json(
      { items, nextCursor: page.nextCursor, counts: { total, actif: active, inactif: inactive } },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireCallerOrg('MEMBER');
    if (auth instanceof NextResponse) return auth;

    const parsed = ClientBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_BODY', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const data = parsed.data;

    const limitError = await checkClientLimit(auth.organizationId);
    if (limitError) {
      return NextResponse.json(
        {
          error: limitError.code,
          message: `Le plan ${limitError.plan} est limité à ${limitError.limit} clients.`,
        },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const client = await prisma.client.create({
      data: {
        organizationId: auth.organizationId,
        type: data.type,
        phone: data.phone,
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.street !== undefined ? { street: data.street } : {}),
        ...(data.city !== undefined ? { city: data.city } : {}),
        ...(data.postalCode !== undefined ? { postalCode: data.postalCode } : {}),
        ...(data.country !== undefined ? { country: data.country } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
        ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
        ...(data.profession !== undefined ? { profession: data.profession } : {}),
        ...(data.dateOfBirth !== undefined ? { dateOfBirth: new Date(data.dateOfBirth) } : {}),
        ...(data.gender !== undefined ? { gender: data.gender } : {}),
        // Security audit fix (2026-08-24, control #5) — idNumber (national
        // ID) is PII; encrypt at rest via the same ENCRYPTION_KEY-backed
        // AES-256-GCM primitive used for payment credentials. See
        // lib/server/clients/pii-crypto.ts for the degrade-gracefully
        // rationale (no ENCRYPTION_KEY → plaintext fallback, never a
        // blocked write).
        ...(data.idNumber !== undefined ? { idNumber: encryptPii(data.idNumber) } : {}),
        ...(data.companyName !== undefined ? { companyName: data.companyName } : {}),
        ...(data.taxId !== undefined ? { taxId: data.taxId } : {}),
        ...(data.sector !== undefined ? { sector: data.sector } : {}),
        ...(data.contactName !== undefined ? { contactName: data.contactName } : {}),
        ...(data.contactRole !== undefined ? { contactRole: data.contactRole } : {}),
        ...(data.contactPhone !== undefined ? { contactPhone: data.contactPhone } : {}),
        ...(data.contactEmail !== undefined ? { contactEmail: data.contactEmail } : {}),
      },
      select: {
        id: true,
        type: true,
        firstName: true,
        lastName: true,
        companyName: true,
        phone: true,
        email: true,
        street: true,
        city: true,
        postalCode: true,
        country: true,
      },
    });

    return NextResponse.json(
      { client: { ...client, name: displayName(client) } },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
