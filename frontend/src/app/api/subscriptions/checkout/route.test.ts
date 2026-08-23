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
vi.mock('@/lib/server/subscriptions/registry', () => ({
  getSubscriptionProvider: vi.fn(),
  SubscriptionProviderUnconfiguredError: class SubscriptionProviderUnconfiguredError extends Error {},
}));

import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { verifyCsrf } from '@/lib/server/auth';
import {
  getSubscriptionProvider,
  SubscriptionProviderUnconfiguredError,
} from '@/lib/server/subscriptions/registry';
import { POST } from './route';

const mockRequireCallerOrg = vi.mocked(requireCallerOrg);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockGetProvider = vi.mocked(getSubscriptionProvider);

const callerCtx = {
  user: { sub: 'user_1', email: 'owner@test.local' },
  organizationId: 'org_1',
  role: 'OWNER' as const,
};

const orgRow = {
  id: 'org_1',
  name: 'Garage Demo',
  phone: '+221771234567',
  contactEmail: null,
  owner: { email: 'owner@test.local' },
};

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/subscriptions/checkout', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireCallerOrg.mockResolvedValue(callerCtx);
  prismaMock.organization.findUnique.mockResolvedValue(orgRow as never);
  // 2026-08-20: the create call moved inside prisma.$transaction (coupon
  // redemption needs to be atomic with it) — passthrough so `tx.*` calls
  // inside the callback hit the same deep mock as everything else. Same
  // pattern already used by admin/organizations/[id]/plan/route.test.ts.
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
  prismaMock.subscriptionPayment.create.mockResolvedValue({ id: 'sp_1', amount: 9_900 } as never);
  prismaMock.subscriptionPayment.update.mockResolvedValue({} as never);
});

describe('POST /api/subscriptions/checkout', () => {
  it('creates a PENDING SubscriptionPayment row, calls the provider, and returns the checkoutUrl', async () => {
    mockGetProvider.mockResolvedValue({
      name: 'STRIPE',
      isConfigured: () => true,
      createCheckout: vi
        .fn()
        .mockResolvedValue({ providerRef: 'cs_123', checkoutUrl: 'https://stripe.test/c/cs_123' }),
    });

    const res = await POST(makePost({ plan: 'PRO', provider: 'STRIPE' }));

    expect(res.status).toBe(201);
    const body = (await res.json()) as { checkoutUrl: string; paymentId: string };
    expect(body.checkoutUrl).toBe('https://stripe.test/c/cs_123');
    expect(prismaMock.subscriptionPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org_1',
          plan: 'PRO',
          provider: 'STRIPE',
          amount: 9_900,
          currency: 'XOF',
          status: 'PENDING',
        }),
      }),
    );
    expect(prismaMock.subscriptionPayment.update).toHaveBeenCalledWith({
      where: { id: 'sp_1' },
      data: { providerRef: 'cs_123', checkoutUrl: 'https://stripe.test/c/cs_123' },
    });
  });

  it('403s / propagates CSRF failure before touching the DB', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await POST(makePost({ plan: 'PRO', provider: 'STRIPE' }));
    expect(res.status).toBe(403);
    expect(prismaMock.organization.findUnique).not.toHaveBeenCalled();
  });

  it('400s on an invalid body', async () => {
    const res = await POST(makePost({ plan: 'ENTERPRISE', provider: 'STRIPE' }));
    expect(res.status).toBe(400);
  });

  it('404s ORGANIZATION_NOT_FOUND when the org lookup misses', async () => {
    prismaMock.organization.findUnique.mockResolvedValueOnce(null as never);
    const res = await POST(makePost({ plan: 'PRO', provider: 'STRIPE' }));
    expect(res.status).toBe(404);
  });

  it('503s SUBSCRIPTION_PROVIDER_UNCONFIGURED when the provider has no env configured', async () => {
    mockGetProvider.mockImplementation(() => {
      throw new SubscriptionProviderUnconfiguredError('MONEROO');
    });
    const res = await POST(makePost({ plan: 'PRO', provider: 'MONEROO' }));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('SUBSCRIPTION_PROVIDER_UNCONFIGURED');
    expect(prismaMock.subscriptionPayment.create).not.toHaveBeenCalled();
  });

  it('400s PHONE_REQUIRED for MONEROO/CHARIOW when the org has no phone on file', async () => {
    prismaMock.organization.findUnique.mockResolvedValueOnce({ ...orgRow, phone: null } as never);
    mockGetProvider.mockResolvedValue({
      name: 'CHARIOW',
      isConfigured: () => true,
      createCheckout: vi.fn(),
    });
    const res = await POST(makePost({ plan: 'PRO', provider: 'CHARIOW' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('PHONE_REQUIRED');
    expect(prismaMock.subscriptionPayment.create).not.toHaveBeenCalled();
  });

  it('marks the SubscriptionPayment row FAILED and returns 502 when the provider call throws', async () => {
    mockGetProvider.mockResolvedValue({
      name: 'STRIPE',
      isConfigured: () => true,
      createCheckout: vi.fn().mockRejectedValue(new Error('Stripe is down')),
    });
    const res = await POST(makePost({ plan: 'PRO', provider: 'STRIPE' }));
    expect(res.status).toBe(502);
    expect(prismaMock.subscriptionPayment.update).toHaveBeenCalledWith({
      where: { id: 'sp_1' },
      data: { status: 'FAILED' },
    });
  });

  it('propagates a non-2xx from requireCallerOrg without touching the DB', async () => {
    mockRequireCallerOrg.mockResolvedValueOnce(
      NextResponse.json({ error: 'NO_ORGANIZATION' }, { status: 404 }),
    );
    const res = await POST(makePost({ plan: 'PRO', provider: 'STRIPE' }));
    expect(res.status).toBe(404);
    expect(prismaMock.organization.findUnique).not.toHaveBeenCalled();
  });

  // 2026-08-22 bug fix regression coverage — see stripe.ts's createCheckout
  // comment: a redeemed coupon used to compute a discounted `amount` but
  // never actually reach the provider charge.
  describe('coupon discount reaches the provider (2026-08-22 bug fix)', () => {
    const couponRow = {
      id: 'coupon_1',
      code: 'PROMO50',
      discountType: 'PERCENT',
      discountValue: 50,
      appliesToPlan: null,
      maxRedemptions: null,
      redeemedCount: 0,
      active: true,
      expiresAt: null,
    };

    it('passes the discountAmount computed from the redeemed coupon to createCheckout', async () => {
      prismaMock.coupon.findUnique.mockResolvedValue(couponRow as never);
      prismaMock.coupon.updateMany.mockResolvedValue({ count: 1 } as never);
      prismaMock.subscriptionPayment.create.mockResolvedValue({
        id: 'sp_1',
        amount: 4_950,
      } as never);

      const createCheckout = vi
        .fn()
        .mockResolvedValue({ providerRef: 'cs_123', checkoutUrl: 'https://stripe.test/c/cs_123' });
      mockGetProvider.mockResolvedValue({
        name: 'STRIPE',
        isConfigured: () => true,
        createCheckout,
      });

      const res = await POST(makePost({ plan: 'PRO', provider: 'STRIPE', couponCode: 'promo50' }));

      expect(res.status).toBe(201);
      expect(createCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 4_950, discountAmount: 4_950 }),
      );
    });

    it('400s COUPON_UNSUPPORTED_FOR_PROVIDER for CHARIOW + a coupon, before creating any row', async () => {
      // orgRow (set in beforeEach) already has a phone on file, so this
      // exercises the new coupon guard rather than the PHONE_REQUIRED one.
      mockGetProvider.mockResolvedValue({
        name: 'CHARIOW',
        isConfigured: () => true,
        createCheckout: vi.fn(),
      });

      const res = await POST(makePost({ plan: 'PRO', provider: 'CHARIOW', couponCode: 'PROMO50' }));

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('COUPON_UNSUPPORTED_FOR_PROVIDER');
      expect(prismaMock.subscriptionPayment.create).not.toHaveBeenCalled();
    });
  });
});
