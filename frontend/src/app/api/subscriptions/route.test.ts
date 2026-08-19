import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/organizations/require-caller-org', () => ({
  requireCallerOrg: vi.fn(),
}));
vi.mock('@/lib/server/subscriptions/registry', () => ({
  listConfiguredProviders: vi.fn(),
}));

import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { listConfiguredProviders } from '@/lib/server/subscriptions/registry';
import { GET } from './route';

const mockRequireCallerOrg = vi.mocked(requireCallerOrg);
const mockListConfigured = vi.mocked(listConfiguredProviders);

const callerCtx = {
  user: { sub: 'user_1', email: 'owner@test.local' },
  organizationId: 'org_1',
  role: 'MEMBER' as const,
};

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/subscriptions', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCallerOrg.mockResolvedValue(callerCtx);
  mockListConfigured.mockReturnValue(['STRIPE']);
});

describe('GET /api/subscriptions', () => {
  it('returns the org subscription + available providers', async () => {
    prismaMock.subscription.findUnique.mockResolvedValueOnce({
      plan: 'PRO',
      provider: 'STRIPE',
      status: 'ACTIVE',
      currentPeriodEnd: new Date('2026-09-19T00:00:00Z'),
      graceEndsAt: null,
      cancelAtPeriodEnd: false,
    } as never);

    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      subscription: { plan: string };
      availableProviders: string[];
    };
    expect(body.subscription.plan).toBe('PRO');
    expect(body.availableProviders).toEqual(['STRIPE']);
  });

  it('returns subscription:null for a FREE org with no subscription row', async () => {
    prismaMock.subscription.findUnique.mockResolvedValueOnce(null as never);
    const res = await GET(makeGet());
    const body = (await res.json()) as { subscription: unknown };
    expect(body.subscription).toBeNull();
  });

  it('propagates a non-2xx from requireCallerOrg', async () => {
    mockRequireCallerOrg.mockResolvedValueOnce(
      NextResponse.json({ error: 'NO_ORGANIZATION' }, { status: 404 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(404);
    expect(prismaMock.subscription.findUnique).not.toHaveBeenCalled();
  });
});
