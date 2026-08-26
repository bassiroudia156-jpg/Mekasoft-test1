// No test file existed for this route before — added alongside the
// 2026-08-24 INTERVENTION_ALREADY_INVOICED guard (see route.ts's file
// comment) since a 409 here is new, surprising behavior worth pinning.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/organizations/require-caller-org', () => ({
  requireCallerOrg: vi.fn(),
}));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});

import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { verifyCsrf } from '@/lib/server/auth';
import { DELETE } from './route';

const mockRequireCallerOrg = vi.mocked(requireCallerOrg);
const mockVerifyCsrf = vi.mocked(verifyCsrf);

const callerCtx = {
  user: { sub: 'user_1', email: 'owner@test.local' },
  organizationId: 'org_1',
  role: 'MEMBER' as const,
};

function makeDelete(): NextRequest {
  return new NextRequest('http://test/api/interventions/int_1/parts/part_1', { method: 'DELETE' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireCallerOrg.mockResolvedValue(callerCtx);
  prismaMock.$transaction.mockImplementation((ops: unknown) =>
    Promise.all(ops as Promise<unknown>[]),
  );
});

describe('DELETE /api/interventions/[id]/parts/[partId]', () => {
  it('removes the part and recomputes totals when the intervention is not yet invoiced', async () => {
    prismaMock.intervention.findFirst.mockResolvedValue({
      id: 'int_1',
      laborAmount: 10_000,
      partsAmount: 5_000,
      taxRatePct: 18,
      invoice: null,
    } as never);
    prismaMock.part.findFirst.mockResolvedValue({ id: 'part_1', total: 5_000 } as never);
    prismaMock.part.delete.mockResolvedValue({} as never);
    prismaMock.intervention.update.mockResolvedValue({} as never);

    const res = await DELETE(makeDelete(), {
      params: Promise.resolve({ id: 'int_1', partId: 'part_1' }),
    });

    expect(res.status).toBe(200);
    expect(prismaMock.part.delete).toHaveBeenCalledWith({ where: { id: 'part_1' } });
  });

  it('409s INTERVENTION_ALREADY_INVOICED and does not delete the part when the intervention has an invoice', async () => {
    prismaMock.intervention.findFirst.mockResolvedValue({
      id: 'int_1',
      laborAmount: 10_000,
      partsAmount: 5_000,
      taxRatePct: 18,
      invoice: { id: 'inv_1' },
    } as never);

    const res = await DELETE(makeDelete(), {
      params: Promise.resolve({ id: 'int_1', partId: 'part_1' }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INTERVENTION_ALREADY_INVOICED');
    expect(prismaMock.part.delete).not.toHaveBeenCalled();
  });

  it('404s INTERVENTION_NOT_FOUND before touching the invoice check', async () => {
    prismaMock.intervention.findFirst.mockResolvedValue(null as never);
    const res = await DELETE(makeDelete(), {
      params: Promise.resolve({ id: 'int_1', partId: 'part_1' }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INTERVENTION_NOT_FOUND');
  });

  it('404s PART_NOT_FOUND when the part does not belong to this intervention', async () => {
    prismaMock.intervention.findFirst.mockResolvedValue({
      id: 'int_1',
      laborAmount: 10_000,
      partsAmount: 5_000,
      taxRatePct: 18,
      invoice: null,
    } as never);
    prismaMock.part.findFirst.mockResolvedValue(null as never);

    const res = await DELETE(makeDelete(), {
      params: Promise.resolve({ id: 'int_1', partId: 'part_1' }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('PART_NOT_FOUND');
  });

  it('403s / propagates CSRF failure before touching the DB', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await DELETE(makeDelete(), {
      params: Promise.resolve({ id: 'int_1', partId: 'part_1' }),
    });
    expect(res.status).toBe(403);
    expect(prismaMock.intervention.findFirst).not.toHaveBeenCalled();
  });
});
