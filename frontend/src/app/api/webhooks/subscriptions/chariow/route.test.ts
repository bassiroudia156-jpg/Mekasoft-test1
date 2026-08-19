import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findUnique = vi.fn();
const create = vi.fn();
const update = vi.fn();
const paymentFindUnique = vi.fn();
const subscriptionUpsert = vi.fn();
const subscriptionFindUnique = vi.fn();
const orgUpdate = vi.fn();
const orgFindUnique = vi.fn();
const paymentCreate = vi.fn();
const paymentUpdate = vi.fn();

const $transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
  fn({
    webhookLog: { findUnique, create, update },
    subscriptionPayment: {
      findUnique: paymentFindUnique,
      create: paymentCreate,
      update: paymentUpdate,
    },
    subscription: { upsert: subscriptionUpsert, findUnique: subscriptionFindUnique },
    organization: { update: orgUpdate, findUnique: orgFindUnique },
  }),
);

vi.mock('@/lib/server/prisma', () => ({ prisma: { $transaction } }));
vi.mock('@/lib/server/queues/email-queue-singleton', () => ({
  getEmailQueue: vi.fn(() => null),
}));
vi.mock('@/lib/server/subscriptions/chariow', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/subscriptions/chariow')>(
    '@/lib/server/subscriptions/chariow',
  );
  return { ...actual, getChariowSale: vi.fn() };
});

import { getChariowSale } from '@/lib/server/subscriptions/chariow';
const mockGetSale = vi.mocked(getChariowSale);

const WEBHOOK_SECRET = 'test-chariow-secret';

function makeRequest(payload: object, secret = WEBHOOK_SECRET): NextRequest {
  return new NextRequest(`http://test/api/webhooks/subscriptions/chariow?secret=${secret}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  vi.stubEnv('CHARIOW_WEBHOOK_SECRET', WEBHOOK_SECRET);
  vi.clearAllMocks();
  findUnique.mockResolvedValue(null);
  paymentFindUnique.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/webhooks/subscriptions/chariow', () => {
  it('401s when ?secret= does not match CHARIOW_WEBHOOK_SECRET', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      makeRequest({ event: 'settled.sale', data: { sale_id: 's1' } }, 'wrong-secret'),
    );
    expect(res.status).toBe(401);
    expect(mockGetSale).not.toHaveBeenCalled();
  });

  it('re-queries GET /sales/{id} and does NOT credit if the re-query disagrees with the webhook (zero trust in body)', async () => {
    mockGetSale.mockResolvedValueOnce({ status: 'pending' });
    const { POST } = await import('./route');
    const res = await POST(makeRequest({ event: 'settled.sale', data: { sale_id: 's1' } }));
    expect(res.status).toBe(200);
    expect(subscriptionUpsert).not.toHaveBeenCalled();
  });

  it('credits when the re-query confirms succeeded and a matching PENDING row exists', async () => {
    mockGetSale.mockResolvedValueOnce({ status: 'succeeded', amount: 9_900, currency: 'XOF' });
    paymentFindUnique.mockResolvedValueOnce({
      id: 'sp_1',
      organizationId: 'org_1',
      plan: 'PRO',
      provider: 'CHARIOW',
      providerRef: 's1',
      amount: 9_900,
      currency: 'XOF',
      status: 'PENDING',
    });
    orgFindUnique.mockResolvedValue({
      name: 'Garage Demo',
      contactEmail: null,
      owner: { email: 'owner@test.local' },
    });
    subscriptionFindUnique.mockResolvedValue({
      currentPeriodEnd: new Date('2026-09-19T00:00:00Z'),
    });

    const { POST } = await import('./route');
    const res = await POST(makeRequest({ event: 'settled.sale', data: { sale_id: 's1' } }));
    expect(res.status).toBe(200);
    expect(subscriptionUpsert).toHaveBeenCalled();
    expect(orgUpdate).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      data: { plan: 'PRO', planUpdatedAt: expect.any(Date) },
    });
  });

  it('does NOT credit when the re-queried amount is outside tolerance', async () => {
    mockGetSale.mockResolvedValueOnce({ status: 'succeeded', amount: 100, currency: 'XOF' });
    paymentFindUnique.mockResolvedValueOnce({
      id: 'sp_1',
      organizationId: 'org_1',
      plan: 'PRO',
      provider: 'CHARIOW',
      providerRef: 's1',
      amount: 9_900,
      currency: 'XOF',
      status: 'PENDING',
    });
    const { POST } = await import('./route');
    const res = await POST(makeRequest({ event: 'settled.sale', data: { sale_id: 's1' } }));
    expect(res.status).toBe(200);
    expect(subscriptionUpsert).not.toHaveBeenCalled();
  });

  it('ignores an unrecognized event type (e.g. "unpaid.sale") without crediting', async () => {
    const { POST } = await import('./route');
    const res = await POST(makeRequest({ event: 'unpaid.sale', data: { sale_id: 's1' } }));
    expect(res.status).toBe(200);
    expect(mockGetSale).not.toHaveBeenCalled(); // kind='other' never dispatches onPaid
    expect(subscriptionUpsert).not.toHaveBeenCalled();
  });
});
