// GET /api/reports/monthly/pdf — Business-plan monthly activity report.
// ?month=YYYY-MM to fetch a past month (defaults to the current one).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { getPlanLimits } from '@/lib/server/plans/limits';
import { buildMonthlyReport } from '@/lib/server/reports/monthly';
import { renderMonthlyReportPdf } from '@/lib/server/reports/pdf';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

function parseMonthParam(raw: string | null): Date | null {
  if (!raw) return new Date();
  const m = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!m || m[1] === undefined || m[2] === undefined) return null;
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return new Date(Date.UTC(year, monthIndex, 1));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireCallerOrg('MEMBER');
    if (auth instanceof NextResponse) return auth;

    const month = parseMonthParam(req.nextUrl.searchParams.get('month'));
    if (!month) {
      return NextResponse.json(
        { error: 'INVALID_MONTH', message: 'Expected ?month=YYYY-MM' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const org = await prisma.organization.findUnique({
      where: { id: auth.organizationId },
      select: { name: true, plan: true },
    });
    if (!org) {
      return NextResponse.json(
        { error: 'ORGANIZATION_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (!getPlanLimits(org.plan).features.monthlyReport) {
      return NextResponse.json(
        {
          error: 'PLAN_FEATURE_LOCKED',
          message: 'Le rapport mensuel est réservé au plan Business.',
        },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const data = await buildMonthlyReport(auth.organizationId, org.name, month);
    const pdfBuffer = await renderMonthlyReportPdf(data);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'x-request-id': ctx.requestId,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="rapport-${data.periodLabel.replace(' ', '-')}.pdf"`,
      },
    });
  });
}
