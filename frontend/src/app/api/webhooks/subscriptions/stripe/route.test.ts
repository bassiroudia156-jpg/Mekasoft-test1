import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findUnique = vi.fn();
const create = vi.fn();
const update = vi.fn();
const paymentFindUnique = vi.fn();
const paymentCreate = vi.fn();
const paymentUpdate = vi.fn();
const subscriptionUpsert = vi.fn();
const subscriptionFindUnique = vi.fn();
const subscriptionUpdateMany = vi.fn();
const orgUpdate = vi.fn();
const orgFindUnique = vi.fn();
const anonymousIntentFindUnique = vi.fn();
const anonymousIntentUpdate = vi.fn();

const $transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
  fn({
    webhookLog: { findUnique, create, update },
    subscriptionPayment: {
      findUnique: paymentFindUnique,
      create: paymentCreate,
      update: paymentUpdate,
    },
    subscription: {
      upsert: subscriptionUpsert,
      findUnique: subscriptionFindUnique,
      updateMany: subscriptionUpdateMany,
    },
    organization: { update: orgUpdate, findUnique: orgFindUnique },
    anonymousSubscriptionIntent: {
      findUnique: anonymousIntentFindUnique,
      update: anonymousIntentUpdate,
    },
  }),
);

vi.mock('@/lib/server/prisma', () => ({ prisma: { $transaction } }));
vi.mock('@/lib/server/queues/email-queue-singleton', () => ({
  getEmailQueue: vi.fn(() => null),
}));

// The SDK's own `constructEvent` HMAC verification is Stripe's code, not
// ours — the route test fakes verification/parsing so it can focus on OUR
// dispatch logic (extractIds → onPaid/onFailed → activateSubscription).
let nextEvent: unknown;
vi.mock('@/lib/server/subscriptions/stripe', () => ({
  stripeWebhookProvider: {
    name: 'stripe-subscription',
    verifySignature: vi.fn(() => ({ valid: true })),
    parsePayload: vi.fn(() => nextEvent),
    extractIds: vi.fn((event: { id: string; type: string }) => {
      const kind =
        event.type === 'invoice.paid'
          ? 'paid'
          : event.type === 'invoice.payment_failed' ||
              event.type === 'customer.subscription.deleted'
            ? 'failed'
            : 'other';
      return { externalId: event.id, eventType: event.type, kind };
    }),
  },
  getStripeClient: vi.fn(),
}));

vi.mock('@/lib/server/subscriptions/anonymous', () => ({
  resolveOrganizationForAnonymousIntent: vi.fn(),
}));

import { getStripeClient } from '@/lib/server/subscriptions/stripe';
import { resolveOrganizationForAnonymousIntent } from '@/lib/server/subscriptions/anonymous';
const mockGetStripeClient = vi.mocked(getStripeClient);
const mockResolveAnonymous = vi.mocked(resolveOrganizationForAnonymousIntent);

function makeRequest(event: unknown): NextRequest {
  nextEvent = event;
  return new NextRequest('http://test/api/webhooks/subscriptions/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 'fake', 'content-type': 'application/json' },
    body: JSON.stringify(event),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  findUnique.mockResolvedValue(null);
  // No matching AnonymousSubscriptionIntent by default — every existing
  // test below exercises the authenticated (real-org) flow.
  anonymousIntentFindUnique.mockResolvedValue(null);
});

describe('POST /api/webhooks/subscriptions/stripe', () => {
  it('invoice.paid: retrieves the subscription, activates it, and bumps Organization.plan', async () => {
    mockGetStripeClient.mockReturnValue({
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue({
          id: 'sub_1',
          customer: 'cus_1',
          metadata: { organizationId: 'org_1', plan: 'PRO' },
          items: { data: [{ current_period_end: 1_789_000_000 }] },
        }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    orgFindUnique.mockResolvedValue({
      name: 'Garage Demo',
      contactEmail: null,
      owner: { email: 'owner@test.local' },
    });

    const { POST } = await import('./route');
    const res = await POST(
      makeRequest({
        id: 'evt_1',
        type: 'invoice.paid',
        data: {
          object: { id: 'in_1', subscription: 'sub_1', amount_paid: 9_900, currency: 'xof' },
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(subscriptionUpsert).toHaveBeenCalled();
    expect(orgUpdate).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      data: { plan: 'PRO', planUpdatedAt: expect.any(Date) },
    });
  });

  it('invoice.paid: anonymous checkout — resolves the org via resolveOrganizationForAnonymousIntent, activates against the real org, and marks the intent SUCCEEDED', async () => {
    mockGetStripeClient.mockReturnValue({
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue({
          id: 'sub_1',
          customer: 'cus_1',
          // `organizationId` is really the AnonymousSubscriptionIntent id here.
          metadata: { organizationId: 'intent_1', plan: 'PRO' },
          items: { data: [{ current_period_end: 1_789_000_000 }] },
        }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    anonymousIntentFindUnique.mockResolvedValueOnce({
      id: 'intent_1',
      email: 'nouveau@garage.test',
      atelierName: 'Garage Ndiaye',
      phone: '+221771234567',
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

    const { POST } = await import('./route');
    const res = await POST(
      makeRequest({
        id: 'evt_anon_1',
        type: 'invoice.paid',
        data: {
          object: { id: 'in_anon_1', subscription: 'sub_1', amount_paid: 9_900, currency: 'xof' },
        },
      }),
    );

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

  it('invoice.paid: skips silently when the invoice has no subscription reference', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      makeRequest({ id: 'evt_2', type: 'invoice.paid', data: { object: { id: 'in_2' } } }),
    );
    expect(res.status).toBe(200);
    expect(subscriptionUpsert).not.toHaveBeenCalled();
  });

  it('invoice.paid: skips when the retrieved subscription has no organizationId/plan metadata', async () => {
    mockGetStripeClient.mockReturnValue({
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue({
          id: 'sub_1',
          customer: 'cus_1',
          metadata: {},
          items: { data: [{ current_period_end: 1_789_000_000 }] },
        }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const { POST } = await import('./route');
    const res = await POST(
      makeRequest({
        id: 'evt_3',
        type: 'invoice.paid',
        data: { object: { id: 'in_3', subscription: 'sub_1' } },
      }),
    );
    expect(res.status).toBe(200);
    expect(subscriptionUpsert).not.toHaveBeenCalled();
  });

  it('customer.subscription.deleted: marks the row CANCELED and downgrades the org to FREE', async () => {
    subscriptionUpdateMany.mockResolvedValueOnce({ count: 1 });
    subscriptionFindUnique.mockResolvedValueOnce({ organizationId: 'org_1' });

    const { POST } = await import('./route');
    const res = await POST(
      makeRequest({
        id: 'evt_4',
        type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_1' } },
      }),
    );
    expect(res.status).toBe(200);
    expect(subscriptionUpdateMany).toHaveBeenCalledWith({
      where: { stripeSubscriptionId: 'sub_1' },
      data: { status: 'CANCELED' },
    });
    expect(orgUpdate).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      data: { plan: 'FREE', planUpdatedAt: expect.any(Date) },
    });
  });

  it('customer.subscription.deleted: does not downgrade when no row matches (stale webhook)', async () => {
    subscriptionUpdateMany.mockResolvedValueOnce({ count: 0 });
    const { POST } = await import('./route');
    const res = await POST(
      makeRequest({
        id: 'evt_5',
        type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_stale' } },
      }),
    );
    expect(res.status).toBe(200);
    expect(orgUpdate).not.toHaveBeenCalled();
  });

  it('invoice.payment_failed: does not touch Subscription/Organization (Stripe handles its own retries)', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      makeRequest({
        id: 'evt_6',
        type: 'invoice.payment_failed',
        data: { object: { id: 'in_6', subscription: 'sub_1' } },
      }),
    );
    expect(res.status).toBe(200);
    expect(subscriptionUpsert).not.toHaveBeenCalled();
    expect(orgUpdate).not.toHaveBeenCalled();
  });

  it('exports runtime=nodejs and dynamic=force-dynamic', async () => {
    const mod = (await import('./route')) as { runtime?: string; dynamic?: string };
    expect(mod.runtime).toBe('nodejs');
    expect(mod.dynamic).toBe('force-dynamic');
  });
});
