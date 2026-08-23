import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// 2026-08-22: hoisted (not plain top-level `const`) — chariow.ts's mock
// factory below does an async `vi.importActual` of the real module, which
// now transitively imports credentials.ts → @/lib/server/prisma. That
// eagerly resolves this file's own `@/lib/server/prisma` mock factory
// before Vitest reaches this file's ordinary top-level statements,
// throwing "Cannot access '$transaction' before initialization" on a
// plain `const`. `vi.hoisted()` guarantees these exist before ANY
// `vi.mock()` factory runs, regardless of that ordering.
const {
  findUnique,
  paymentFindUnique,
  subscriptionUpsert,
  subscriptionFindUnique,
  orgUpdate,
  orgFindUnique,
  anonymousIntentFindUnique,
  anonymousIntentUpdate,
  $transaction,
} = vi.hoisted(() => {
  const findUnique = vi.fn();
  const paymentFindUnique = vi.fn();
  const subscriptionUpsert = vi.fn();
  const subscriptionFindUnique = vi.fn();
  const orgUpdate = vi.fn();
  const orgFindUnique = vi.fn();
  const anonymousIntentFindUnique = vi.fn();
  const anonymousIntentUpdate = vi.fn();
  const $transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      webhookLog: { findUnique, create: vi.fn(), update: vi.fn() },
      subscriptionPayment: {
        findUnique: paymentFindUnique,
        create: vi.fn(),
        update: vi.fn(),
      },
      subscription: { upsert: subscriptionUpsert, findUnique: subscriptionFindUnique },
      organization: { update: orgUpdate, findUnique: orgFindUnique },
      anonymousSubscriptionIntent: {
        findUnique: anonymousIntentFindUnique,
        update: anonymousIntentUpdate,
      },
    }),
  );
  return {
    findUnique,
    paymentFindUnique,
    subscriptionUpsert,
    subscriptionFindUnique,
    orgUpdate,
    orgFindUnique,
    anonymousIntentFindUnique,
    anonymousIntentUpdate,
    $transaction,
  };
});

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    $transaction,
    // No DB override configured — getChariowCredentials() falls through to
    // the CHARIOW_WEBHOOK_SECRET env var this file stubs below, matching
    // how these tests already exercise the env-var-only path.
    paymentProviderCredential: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));
vi.mock('@/lib/server/queues/email-queue-singleton', () => ({
  getEmailQueue: vi.fn(() => null),
}));
vi.mock('@/lib/server/subscriptions/chariow', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/subscriptions/chariow')>(
    '@/lib/server/subscriptions/chariow',
  );
  return { ...actual, getChariowSale: vi.fn() };
});

vi.mock('@/lib/server/subscriptions/anonymous', () => ({
  resolveOrganizationForAnonymousIntent: vi.fn(),
}));

import { getChariowSale } from '@/lib/server/subscriptions/chariow';
import { resolveOrganizationForAnonymousIntent } from '@/lib/server/subscriptions/anonymous';
const mockGetSale = vi.mocked(getChariowSale);
const mockResolveAnonymous = vi.mocked(resolveOrganizationForAnonymousIntent);

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
  // No matching AnonymousSubscriptionIntent by default — every existing
  // test below exercises the authenticated (real-org) flow.
  anonymousIntentFindUnique.mockResolvedValue(null);
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

  it('anonymous checkout — resolves the org, activates against it, and marks the intent SUCCEEDED', async () => {
    mockGetSale.mockResolvedValueOnce({ status: 'succeeded', amount: 9_900, currency: 'XOF' });
    anonymousIntentFindUnique.mockResolvedValueOnce({
      id: 'intent_1',
      email: 'nouveau@garage.test',
      atelierName: 'Garage Ndiaye',
      phone: '+221771234567',
      plan: 'PRO',
      provider: 'CHARIOW',
      providerRef: 's_anon_1',
      amount: 9_900,
      currency: 'XOF',
      status: 'PENDING',
    });
    mockResolveAnonymous.mockResolvedValueOnce({
      kind: 'new_org_new_user',
      organizationId: 'org_new',
      resetCode: 'ABCD1234',
    });
    orgFindUnique.mockResolvedValue({
      name: 'Garage Ndiaye',
      contactEmail: null,
      owner: { email: 'nouveau@garage.test' },
    });
    subscriptionFindUnique.mockResolvedValue({
      currentPeriodEnd: new Date('2026-09-19T00:00:00Z'),
    });

    const { POST } = await import('./route');
    const res = await POST(makeRequest({ event: 'settled.sale', data: { sale_id: 's_anon_1' } }));

    expect(res.status).toBe(200);
    expect(mockResolveAnonymous).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'intent_1' }),
    );
    expect(subscriptionUpsert).toHaveBeenCalled();
    expect(orgUpdate).toHaveBeenCalledWith({
      where: { id: 'org_new' },
      data: { plan: 'PRO', planUpdatedAt: expect.any(Date) },
    });
    expect(anonymousIntentUpdate).toHaveBeenCalledWith({
      where: { id: 'intent_1' },
      data: {
        status: 'SUCCEEDED',
        succeededAt: expect.any(Date),
        organizationId: 'org_new',
        resultKind: 'new_org_new_user',
      },
    });
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
