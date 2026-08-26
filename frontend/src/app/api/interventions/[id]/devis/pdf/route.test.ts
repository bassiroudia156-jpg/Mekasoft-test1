import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/organizations/require-caller-org', () => ({
  requireCallerOrg: vi.fn(),
}));
vi.mock('@/lib/server/interventions/devis-pdf', () => ({
  renderDevisPdf: vi.fn(),
}));

import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { renderDevisPdf } from '@/lib/server/interventions/devis-pdf';
import { GET } from './route';

const mockRequireCallerOrg = vi.mocked(requireCallerOrg);
const mockRenderPdf = vi.mocked(renderDevisPdf);

const callerCtx = {
  user: { sub: 'user_1', email: 'user@test.local' },
  organizationId: 'org_1',
  role: 'OWNER' as const,
};

const interventionRow = {
  id: 'int_1',
  reference: 'INT-2026-001',
  work: 'Vidange + plaquettes',
  laborAmount: 5_000,
  partsAmount: 10_000,
  taxRatePct: 18,
  amount: 17_700,
  createdAt: new Date('2026-08-24T00:00:00.000Z'),
  client: {
    type: 'INDIVIDUAL',
    firstName: 'Amadou',
    lastName: 'Ndiaye',
    companyName: null,
    phone: '+221771234567',
  },
  vehicle: {
    brand: 'Toyota',
    model: 'Corolla',
    year: 2018,
    registration: 'DK-1234-AB',
    mileage: 82_000,
  },
  parts: [{ name: 'Plaquettes de frein', quantity: 1, unitPrice: 10_000, total: 10_000 }],
};

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/interventions/int_1/devis/pdf');
}

function makeCtx() {
  return { params: Promise.resolve({ id: 'int_1' }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCallerOrg.mockResolvedValue(callerCtx);
  mockRenderPdf.mockResolvedValue(Buffer.from('%PDF-fake'));
  prismaMock.intervention.findFirst.mockResolvedValue(interventionRow as never);
});

describe('GET /api/interventions/[id]/devis/pdf', () => {
  it('propagates a non-2xx from requireCallerOrg without touching the DB', async () => {
    mockRequireCallerOrg.mockResolvedValueOnce(
      NextResponse.json({ error: 'NO_ORGANIZATION' }, { status: 404 }),
    );
    const res = await GET(makeGet(), makeCtx());
    expect(res.status).toBe(404);
    expect(prismaMock.intervention.findFirst).not.toHaveBeenCalled();
  });

  it('scopes the lookup by organizationId (never id alone)', async () => {
    await GET(makeGet(), makeCtx());
    expect(prismaMock.intervention.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'int_1', organizationId: 'org_1' } }),
    );
  });

  it('404s INTERVENTION_NOT_FOUND without rendering a PDF', async () => {
    prismaMock.intervention.findFirst.mockResolvedValueOnce(null as never);
    const res = await GET(makeGet(), makeCtx());
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INTERVENTION_NOT_FOUND');
    expect(mockRenderPdf).not.toHaveBeenCalled();
  });

  it('returns an inline PDF with the devis reference in the filename', async () => {
    const res = await GET(makeGet(), makeCtx());

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toBe(
      'inline; filename="Devis-INT-2026-001.pdf"',
    );
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.toString()).toBe('%PDF-fake');
  });

  it('passes the computed totals (subtotal/tax) through, not just the stored amount', async () => {
    await GET(makeGet(), makeCtx());
    expect(mockRenderPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        laborAmount: 5_000,
        partsAmount: 10_000,
        subtotal: 15_000,
        taxRatePct: 18,
        taxAmount: 2_700,
        amount: 17_700,
      }),
    );
  });
});
