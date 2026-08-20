// Freemium plan (2026-08-18) — Premium-only monthly report PDF (2026-08-20:
// was Business-only, merged into PRO/"Premium" — see
// lib/server/plans/limits.ts's header comment).
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/organizations/require-caller-org', () => ({
  requireCallerOrg: vi.fn(),
}));
vi.mock('@/lib/server/reports/monthly', () => ({
  buildMonthlyReport: vi.fn(),
}));
vi.mock('@/lib/server/reports/pdf', () => ({
  renderMonthlyReportPdf: vi.fn(),
}));

import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { buildMonthlyReport } from '@/lib/server/reports/monthly';
import { renderMonthlyReportPdf } from '@/lib/server/reports/pdf';
import { GET } from './route';

const mockRequireCallerOrg = vi.mocked(requireCallerOrg);
const mockBuildReport = vi.mocked(buildMonthlyReport);
const mockRenderPdf = vi.mocked(renderMonthlyReportPdf);

const callerCtx = {
  user: { sub: 'user_1', email: 'user@test.local' },
  organizationId: 'org_1',
  role: 'OWNER' as const,
};

function makeGet(url = 'http://test/api/reports/monthly/pdf'): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCallerOrg.mockResolvedValue(callerCtx);
  mockRenderPdf.mockResolvedValue(Buffer.from('%PDF-fake'));
});

describe('/api/reports/monthly/pdf', () => {
  it('403s PLAN_FEATURE_LOCKED on a FREE org without building the report', async () => {
    prismaMock.organization.findUnique.mockResolvedValueOnce({
      name: 'Garage',
      plan: 'FREE',
    } as never);
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('PLAN_FEATURE_LOCKED');
    expect(mockBuildReport).not.toHaveBeenCalled();
  });

  it('returns an inline PDF for a PRO/"Premium" org', async () => {
    prismaMock.organization.findUnique.mockResolvedValueOnce({
      name: 'Garage Demo',
      plan: 'PRO',
    } as never);
    mockBuildReport.mockResolvedValueOnce({
      organizationName: 'Garage Demo',
      periodLabel: 'août 2026',
      newClients: 1,
      newVehicles: 1,
      interventionsCreated: 2,
      interventionsCompleted: 1,
      revenueFcfa: 10_000,
      unpaidInvoices: 0,
      topClients: [],
    });

    const res = await GET(makeGet());

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(mockBuildReport).toHaveBeenCalledWith('org_1', 'Garage Demo', expect.any(Date));
  });

  it('404s ORGANIZATION_NOT_FOUND when the org lookup misses', async () => {
    prismaMock.organization.findUnique.mockResolvedValueOnce(null as never);
    const res = await GET(makeGet());
    expect(res.status).toBe(404);
  });

  it('400s on a malformed ?month= value without touching the DB', async () => {
    const res = await GET(makeGet('http://test/api/reports/monthly/pdf?month=not-a-month'));
    expect(res.status).toBe(400);
    expect(prismaMock.organization.findUnique).not.toHaveBeenCalled();
  });

  it('accepts a well-formed ?month=YYYY-MM and passes that month through', async () => {
    prismaMock.organization.findUnique.mockResolvedValueOnce({
      name: 'Garage Demo',
      plan: 'PRO',
    } as never);
    mockBuildReport.mockResolvedValueOnce({
      organizationName: 'Garage Demo',
      periodLabel: 'juin 2026',
      newClients: 0,
      newVehicles: 0,
      interventionsCreated: 0,
      interventionsCompleted: 0,
      revenueFcfa: 0,
      unpaidInvoices: 0,
      topClients: [],
    });

    await GET(makeGet('http://test/api/reports/monthly/pdf?month=2026-06'));

    const passedMonth = mockBuildReport.mock.calls[0]?.[2] as Date;
    expect(passedMonth.getUTCFullYear()).toBe(2026);
    expect(passedMonth.getUTCMonth()).toBe(5); // June, 0-indexed
  });

  it('propagates a non-2xx from requireCallerOrg without a DB hit', async () => {
    mockRequireCallerOrg.mockResolvedValueOnce(
      NextResponse.json({ error: 'NO_ORGANIZATION' }, { status: 404 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(404);
    expect(prismaMock.organization.findUnique).not.toHaveBeenCalled();
  });
});
