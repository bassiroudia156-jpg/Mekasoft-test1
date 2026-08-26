// Freemium plan (2026-08-18) — SUPERADMIN plan-change endpoint. Mirrors
// admin/withdrawals/[id]/cancel's test shape (verifyCsrf + requireSuperadmin
// + rate-limit + $transaction passthrough mocks).
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
  requireSuperadmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});
vi.mock('@/lib/server/admin/audit', () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

import { requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { PATCH } from './route';
import { seedAdmin, seedSuperadmin } from '@/test-utils/admin-fixtures';

const mockRequireSuperadmin = vi.mocked(requireSuperadmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockLogAdminAction = vi.mocked(logAdminAction);

const superadminUser = seedSuperadmin({ id: 'superadmin_1', email: 'superadmin@test.local' });
const superadminCtx = {
  user: { sub: superadminUser.id, email: superadminUser.email },
  admin: { id: superadminUser.id, email: superadminUser.email, role: 'SUPERADMIN' as const },
};

function makePatch(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://test/api/admin/organizations/${id}/plan`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

function paramsOf(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSuperadmin.mockResolvedValue(superadminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockVerifyCsrf.mockReturnValue(null);
  mockLogAdminAction.mockResolvedValue(undefined);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('/api/admin/organizations/[id]/plan', () => {
  it('changes the plan and writes an audited organization.plan_change action', async () => {
    prismaMock.organization.findUnique.mockResolvedValueOnce({
      id: 'org_1',
      plan: 'FREE',
    } as never);
    prismaMock.organization.update.mockResolvedValueOnce({
      id: 'org_1',
      name: 'Garage Demo',
      plan: 'PRO',
      planUpdatedAt: new Date('2026-08-18T00:00:00Z'),
    } as never);

    const res = await PATCH(makePatch('org_1', { plan: 'PRO' }), paramsOf('org_1'));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { organization: { plan: string } };
    expect(body.organization.plan).toBe('PRO');
    expect(prismaMock.organization.update).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      data: { plan: 'PRO', planUpdatedAt: expect.any(Date) },
      select: { id: true, name: true, plan: true, planUpdatedAt: true },
    });
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: superadminUser.id,
        action: 'organization.plan_change',
        targetType: 'Organization',
        targetId: 'org_1',
        metadata: { from: 'FREE', to: 'PRO' },
      }),
    );
  });

  it('404s ORGANIZATION_NOT_FOUND for a missing org, no update/audit', async () => {
    prismaMock.organization.findUnique.mockResolvedValueOnce(null as never);

    const res = await PATCH(makePatch('missing', { plan: 'PRO' }), paramsOf('missing'));

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('ORGANIZATION_NOT_FOUND');
    expect(prismaMock.organization.update).not.toHaveBeenCalled();
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('400s on an invalid plan value', async () => {
    const res = await PATCH(makePatch('org_1', { plan: 'ENTERPRISE' }), paramsOf('org_1'));
    expect(res.status).toBe(400);
    expect(prismaMock.organization.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a non-SUPERADMIN (ADMIN) caller without touching the DB', async () => {
    const adminUser = seedAdmin({ id: 'admin_1' });
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'SUPERADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await PATCH(makePatch('org_1', { plan: 'PRO' }), paramsOf('org_1'));
    expect(res.status).toBe(403);
    expect(prismaMock.organization.findUnique).not.toHaveBeenCalled();
    void adminUser;
  });

  it('propagates a CSRF failure before any auth/DB work', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await PATCH(makePatch('org_1', { plan: 'PRO' }), paramsOf('org_1'));
    expect(res.status).toBe(403);
    expect(mockRequireSuperadmin).not.toHaveBeenCalled();
  });
});
