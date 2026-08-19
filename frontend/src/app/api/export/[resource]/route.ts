// GET /api/export/[resource] — Business-plan CSV export
// (clients|vehicles|interventions|invoices|payments). One flat file per
// resource rather than a combined ZIP — no new dependency, and each
// resource already has a natural single-sheet shape. Capped at 10k rows
// per export (a CSV download, not a paginated API) — generous for this
// product's scale, prevents an unbounded query on a garage with years of
// history.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { prisma } from '@/lib/server/prisma';
import { getPlanLimits } from '@/lib/server/plans/limits';
import { toCsv } from '@/lib/server/export/csv';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const EXPORT_ROW_CAP = 10_000;

const RESOURCES = ['clients', 'vehicles', 'interventions', 'invoices', 'payments'] as const;
type Resource = (typeof RESOURCES)[number];

function isResource(v: string): v is Resource {
  return (RESOURCES as readonly string[]).includes(v);
}

function clientDisplayName(c: {
  type: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
}): string {
  if (c.type === 'COMPANY') return c.companyName ?? '';
  return [c.firstName, c.lastName].filter(Boolean).join(' ');
}

function fr(d: Date): string {
  return d.toLocaleDateString('fr-FR');
}

async function buildCsv(resource: Resource, organizationId: string): Promise<string> {
  switch (resource) {
    case 'clients': {
      const rows = await prisma.client.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: EXPORT_ROW_CAP,
      });
      return toCsv(
        ['Nom', 'Type', 'Téléphone', 'Email', 'Ville', 'Statut', 'Créé le'],
        rows.map((c) => [
          clientDisplayName(c),
          c.type,
          c.phone,
          c.email ?? '',
          c.city ?? '',
          c.status,
          fr(c.createdAt),
        ]),
      );
    }
    case 'vehicles': {
      const rows = await prisma.vehicle.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: EXPORT_ROW_CAP,
        include: {
          client: { select: { type: true, firstName: true, lastName: true, companyName: true } },
        },
      });
      return toCsv(
        ['Marque', 'Modèle', 'Immatriculation', 'Propriétaire', 'Kilométrage', 'Statut', 'Créé le'],
        rows.map((v) => [
          v.brand,
          v.model,
          v.registration,
          clientDisplayName(v.client),
          v.mileage ?? '',
          v.status,
          fr(v.createdAt),
        ]),
      );
    }
    case 'interventions': {
      const rows = await prisma.intervention.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: EXPORT_ROW_CAP,
        include: {
          client: { select: { type: true, firstName: true, lastName: true, companyName: true } },
          vehicle: { select: { brand: true, model: true, registration: true } },
        },
      });
      return toCsv(
        ['Référence', 'Client', 'Véhicule', 'Travaux', 'Montant (FCFA)', 'Statut', 'Créé le'],
        rows.map((i) => [
          i.reference,
          clientDisplayName(i.client),
          `${i.vehicle.brand} ${i.vehicle.model} · ${i.vehicle.registration}`,
          i.work,
          i.amount,
          i.status,
          fr(i.createdAt),
        ]),
      );
    }
    case 'invoices': {
      const rows = await prisma.invoice.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: EXPORT_ROW_CAP,
        include: {
          client: { select: { type: true, firstName: true, lastName: true, companyName: true } },
        },
      });
      return toCsv(
        [
          'Référence',
          'Client',
          'Description',
          'Montant TTC (FCFA)',
          'Statut',
          'Échéance',
          'Émise le',
        ],
        rows.map((inv) => [
          inv.reference,
          clientDisplayName(inv.client),
          inv.description,
          inv.amount,
          inv.status,
          fr(inv.dueDate),
          fr(inv.issueDate),
        ]),
      );
    }
    case 'payments': {
      const rows = await prisma.payment.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: EXPORT_ROW_CAP,
        include: {
          client: { select: { type: true, firstName: true, lastName: true, companyName: true } },
          invoice: { select: { reference: true } },
        },
      });
      return toCsv(
        ['Référence', 'Facture', 'Client', 'Montant (FCFA)', 'Méthode', 'Statut', 'Date'],
        rows.map((p) => [
          p.reference,
          p.invoice.reference,
          clientDisplayName(p.client),
          p.amount,
          p.method,
          p.status,
          fr(p.paymentDate),
        ]),
      );
    }
  }
}

export async function GET(
  req: NextRequest,
  routeCtx: { params: Promise<{ resource: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireCallerOrg('MEMBER');
    if (auth instanceof NextResponse) return auth;

    const { resource } = await routeCtx.params;
    if (!isResource(resource)) {
      return NextResponse.json(
        { error: 'UNKNOWN_RESOURCE' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const org = await prisma.organization.findUnique({
      where: { id: auth.organizationId },
      select: { plan: true },
    });
    if (!getPlanLimits(org?.plan ?? 'FREE').features.dataExport) {
      return NextResponse.json(
        {
          error: 'PLAN_FEATURE_LOCKED',
          message: "L'export de données est réservé au plan Business.",
        },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const csv = await buildCsv(resource, auth.organizationId);
    const today = new Date().toISOString().slice(0, 10);

    return new NextResponse(csv, {
      headers: {
        'x-request-id': ctx.requestId,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${resource}-${today}.csv"`,
      },
    });
  });
}
