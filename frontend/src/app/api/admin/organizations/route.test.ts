// Freemium plan (2026-08-18) — SUPERADMIN organizations list (search + plan
// filter + cursor pagination). Mirrors admin/users/route.test.ts's shape.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { GET } from './route';
import { seedSuperadmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const superadminUser = seedSuperadmin({ id: 'superadmin_1', email: 'superadmin@test.local' });
const superadminCtx = {
  user: { sub: superadminUser.id, email: superadminUser.email },
  admin: { id: superadminUser.id, email: superadminUser.email, role: 'SUPERADMIN' as const },
};

function makeGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(superadminCtx);
  mockRateLimit.mockResolvedValue(null);
});

const orgRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'org_1',
  name: 'Garage Demo',
  slug: 'garage-demo',
  plan: 'FREE',
  planUpdatedAt: null,
  city: 'Dakar',
  createdAt: new Date('2026-05-01T00:00:00Z'),
  _count: { members: 1, clients: 3, vehicles: 3, interventions: 5 },
  ...overrides,
});

describe('/api/admin/organizations — list', () => {
  it('GET requires SUPERADMIN (calls requireAdmin with SUPERADMIN)', async () => {
    prismaMock.organization.findMany.mockResolvedValueOnce([]);
    await GET(makeGet('http://test/api/admin/organizations'));
    expect(mockRequireAdmin).toHaveBeenCalledWith('SUPERADMIN');
  });

  it('GET returns paginated organizations', async () => {
    prismaMock.organization.findMany.mockResolvedValueOnce([orgRow()] as never);
    const res = await GET(makeGet('http://test/api/admin/organizations'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { id: string }[]; nextCursor: string | null };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.id).toBe('org_1');
  });

  it('GET filters by ?plan=', async () => {
    prismaMock.organization.findMany.mockResolvedValueOnce([]);
    await GET(makeGet('http://test/api/admin/organizations?plan=BUSINESS'));
    const where = prismaMock.organization.findMany.mock.calls[0]![0]!.where as { plan?: string };
    expect(where.plan).toBe('BUSINESS');
  });

  it('GET ?q= searches name/slug without dropping the cursor filter (AND-nested, not colliding OR keys)', async () => {
    prismaMock.organization.findMany.mockResolvedValueOnce([]);
    await GET(makeGet('http://test/api/admin/organizations?q=demo&cursor=abc'));
    const where = prismaMock.organization.findMany.mock.calls[0]![0]!.where as {
      AND: unknown[];
    };
    expect(where.AND).toHaveLength(2);
  });

  it('GET propagates 403 from requireAdmin without a DB hit', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'SUPERADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet('http://test/api/admin/organizations'));
    expect(res.status).toBe(403);
    expect(prismaMock.organization.findMany).not.toHaveBeenCalled();
  });
});
