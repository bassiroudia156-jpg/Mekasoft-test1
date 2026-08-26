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
vi.mock('@/lib/server/subscriptions/fulfillment', () => ({
  activateSubscription: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/server/subscriptions/stripe', () => ({
  getStripeClient: vi.fn(),
}));
vi.mock('@/lib/server/subscriptions/moneroo', () => ({
  verifyMonerooPayment: vi.fn(),
}));
vi.mock('@/lib/server/subscriptions/chariow', () => ({
  getChariowSale: vi.fn(),
}));

import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { verifyCsrf } from '@/lib/server/auth';
import { activateSubscription } from '@/lib/server/subscriptions/fulfillment';
import { getStripeClient } from '@/lib/server/subscriptions/stripe';
import { verifyMonerooPayment } from '@/lib/server/subscriptions/moneroo';
import { getChariowSale } from '@/lib/server/subscriptions/chariow';
import { POST } from './route';

const mockRequireCallerOrg = vi.mocked(requireCallerOrg);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockActivate = vi.mocked(activateSubscription);
const mockGetStripeClient = vi.mocked(getStripeClient);
const mockVerifyMoneroo = vi.mocked(verifyMonerooPayment);
const mockGetChariowSale = vi.mocked(getChariowSale);

const callerCtx = {
  user: { sub: 'user_1', email: 'owner@test.local' },
  organizationId: 'org_1',
  role: 'MEMBER' as const,
};

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/subscriptions/verify', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const basePayment = {
  id: 'sp_1',
  organizationId: 'org_1',
  plan: 'PRO',
  status: 'PENDING',
  amount: 9_900,
  currency: 'XOF',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireCallerOrg.mockResolvedValue(callerCtx);
});

describe('POST /api/subscriptions/verify', () => {
  it('short-circuits with the stored status when the payment is no longer PENDING', async () => {
    prismaMock.subscriptionPayment.findUnique.mockResolvedValueOnce({
      ...basePayment,
      provider: 'MONEROO',
      providerRef: 'pay_1',
      status: 'SUCCEEDED',
    } as never);
    const res = await POST(makePost({ paymentId: 'sp_1' }));
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('SUCCEEDED');
    expect(mockVerifyMoneroo).not.toHaveBeenCalled();
  });

  it('404s PAYMENT_NOT_FOUND for a payment belonging to a different org', async () => {
    prismaMock.subscriptionPayment.findUnique.mockResolvedValueOnce({
      ...basePayment,
      organizationId: 'org_OTHER',
      provider: 'MONEROO',
      providerRef: 'pay_1',
    } as never);
    const res = await POST(makePost({ paymentId: 'sp_1' }));
    expect(res.status).toBe(404);
  });

  it('MONEROO: credits and returns SUCCEEDED when the re-query confirms completed', async () => {
    prismaMock.subscriptionPayment.findUnique.mockResolvedValueOnce({
      ...basePayment,
      provider: 'MONEROO',
      providerRef: 'pay_1',
    } as never);
    mockVerifyMoneroo.mockResolvedValueOnce({
      status: 'completed',
      amount: 9_900,
      currency: 'XOF',
    });

    const res = await POST(makePost({ paymentId: 'sp_1' }));
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('SUCCEEDED');
    expect(mockActivate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ provider: 'MONEROO', providerRef: 'pay_1' }),
    );
  });

  it('MONEROO: does NOT credit on amount mismatch beyond the 5% tolerance', async () => {
    prismaMock.subscriptionPayment.findUnique.mockResolvedValueOnce({
      ...basePayment,
      provider: 'MONEROO',
      providerRef: 'pay_1',
    } as never);
    mockVerifyMoneroo.mockResolvedValueOnce({ status: 'completed', amount: 500, currency: 'XOF' });

    const res = await POST(makePost({ paymentId: 'sp_1' }));
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('PENDING');
    expect(mockActivate).not.toHaveBeenCalled();
  });

  it('MONEROO: stays PENDING when the re-query has not confirmed yet', async () => {
    prismaMock.subscriptionPayment.findUnique.mockResolvedValueOnce({
      ...basePayment,
      provider: 'MONEROO',
      providerRef: 'pay_1',
    } as never);
    mockVerifyMoneroo.mockResolvedValueOnce({ status: 'pending' });
    const res = await POST(makePost({ paymentId: 'sp_1' }));
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('PENDING');
    expect(mockActivate).not.toHaveBeenCalled();
  });

  it('CHARIOW: credits on a succeeded re-query within amount tolerance', async () => {
    prismaMock.subscriptionPayment.findUnique.mockResolvedValueOnce({
      ...basePayment,
      provider: 'CHARIOW',
      providerRef: 'sale_1',
    } as never);
    mockGetChariowSale.mockResolvedValueOnce({
      status: 'succeeded',
      amount: 9_900,
      currency: 'XOF',
    });
    const res = await POST(makePost({ paymentId: 'sp_1' }));
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('SUCCEEDED');
    expect(mockActivate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ provider: 'CHARIOW', providerRef: 'sale_1' }),
    );
  });

  it('STRIPE: credits via session/subscription retrieval when payment_status is paid', async () => {
    prismaMock.subscriptionPayment.findUnique.mockResolvedValueOnce({
      ...basePayment,
      provider: 'STRIPE',
      providerRef: 'cs_1',
    } as never);
    mockGetStripeClient.mockReturnValue({
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({ payment_status: 'paid', subscription: 'sub_1' }),
        },
      },
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue({
          id: 'sub_1',
          customer: 'cus_1',
          latest_invoice: 'in_1',
          items: { data: [{ current_period_end: 1_787_000_000 }] },
        }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const res = await POST(makePost({ paymentId: 'sp_1' }));
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('SUCCEEDED');
    expect(mockActivate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        provider: 'STRIPE',
        stripeSubscriptionId: 'sub_1',
        stripeCustomerId: 'cus_1',
      }),
    );
  });

  it('STRIPE: stays PENDING when the session is not yet paid', async () => {
    prismaMock.subscriptionPayment.findUnique.mockResolvedValueOnce({
      ...basePayment,
      provider: 'STRIPE',
      providerRef: 'cs_1',
    } as never);
    mockGetStripeClient.mockReturnValue({
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({ payment_status: 'unpaid', subscription: null }),
        },
      },
      subscriptions: { retrieve: vi.fn() },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const res = await POST(makePost({ paymentId: 'sp_1' }));
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('PENDING');
    expect(mockActivate).not.toHaveBeenCalled();
  });

  it('propagates a CSRF failure before any DB work', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await POST(makePost({ paymentId: 'sp_1' }));
    expect(res.status).toBe(403);
    expect(prismaMock.subscriptionPayment.findUnique).not.toHaveBeenCalled();
  });
});
