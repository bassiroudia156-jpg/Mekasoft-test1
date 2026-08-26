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
vi.mock('@/lib/server/subscriptions/stripe', () => ({
  createStripePortalSession: vi.fn(),
}));

import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { verifyCsrf } from '@/lib/server/auth';
import { createStripePortalSession } from '@/lib/server/subscriptions/stripe';
import { POST } from './route';

const mockRequireCallerOrg = vi.mocked(requireCallerOrg);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockPortalSession = vi.mocked(createStripePortalSession);

const callerCtx = {
  user: { sub: 'user_1', email: 'owner@test.local' },
  organizationId: 'org_1',
  role: 'OWNER' as const,
};

function makePost(): NextRequest {
  return new NextRequest('http://test/api/subscriptions/portal', { method: 'POST' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireCallerOrg.mockResolvedValue(callerCtx);
});

describe('POST /api/subscriptions/portal', () => {
  it('returns the Stripe portal url for a STRIPE subscription', async () => {
    prismaMock.subscription.findUnique.mockResolvedValueOnce({
      provider: 'STRIPE',
      stripeCustomerId: 'cus_1',
    } as never);
    mockPortalSession.mockResolvedValueOnce({ url: 'https://billing.stripe.test/p/1' });

    const res = await POST(makePost());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(body.url).toBe('https://billing.stripe.test/p/1');
  });

  it('404s NO_STRIPE_SUBSCRIPTION for a MONEROO subscription (no portal)', async () => {
    prismaMock.subscription.findUnique.mockResolvedValueOnce({
      provider: 'MONEROO',
      stripeCustomerId: null,
    } as never);
    const res = await POST(makePost());
    expect(res.status).toBe(404);
    expect(mockPortalSession).not.toHaveBeenCalled();
  });

  it('404s NO_STRIPE_SUBSCRIPTION when the org has no subscription at all', async () => {
    prismaMock.subscription.findUnique.mockResolvedValueOnce(null as never);
    const res = await POST(makePost());
    expect(res.status).toBe(404);
  });

  it('502s PORTAL_UNAVAILABLE when Stripe throws', async () => {
    prismaMock.subscription.findUnique.mockResolvedValueOnce({
      provider: 'STRIPE',
      stripeCustomerId: 'cus_1',
    } as never);
    mockPortalSession.mockRejectedValueOnce(new Error('Stripe not configured'));
    const res = await POST(makePost());
    expect(res.status).toBe(502);
  });

  it('propagates a CSRF failure before any DB work', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await POST(makePost());
    expect(res.status).toBe(403);
    expect(prismaMock.subscription.findUnique).not.toHaveBeenCalled();
  });
});
