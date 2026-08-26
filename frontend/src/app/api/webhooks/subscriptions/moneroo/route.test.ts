import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';

const findUnique = vi.fn();
const create = vi.fn();
const update = vi.fn();
const paymentFindUnique = vi.fn();
const paymentUpdateMany = vi.fn();
const subscriptionUpsert = vi.fn();
const subscriptionFindUnique = vi.fn();
const orgUpdate = vi.fn();
const orgFindUnique = vi.fn();
const paymentCreate = vi.fn();
const paymentUpdate = vi.fn();
const anonymousIntentFindUnique = vi.fn();
const anonymousIntentUpdate = vi.fn();

const $transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
  fn({
    webhookLog: { findUnique, create, update },
    subscriptionPayment: {
      findUnique: paymentFindUnique,
      updateMany: paymentUpdateMany,
      create: paymentCreate,
      update: paymentUpdate,
    },
    subscription: { upsert: subscriptionUpsert, findUnique: subscriptionFindUnique },
    organization: { update: orgUpdate, findUnique: orgFindUnique },
    anonymousSubscriptionIntent: {
      findUnique: anonymousIntentFindUnique,
      update: anonymousIntentUpdate,
    },
  }),
);

vi.mock('@/lib/server/prisma', () => ({ prisma: { $transaction } }));
vi.mock('@/lib/server/queues/email-queue-singleton', () => ({
  getEmailQueue: vi.fn(() => null), // postCommit no-ops when unconfigured
}));
vi.mock('@/lib/server/subscriptions/anonymous', () => ({
  resolveOrganizationForAnonymousIntent: vi.fn(),
}));

import { resolveOrganizationForAnonymousIntent } from '@/lib/server/subscriptions/anonymous';
const mockResolveAnonymous = vi.mocked(resolveOrganizationForAnonymousIntent);

const WEBHOOK_SECRET = 'test-moneroo-secret';

function signedRequest(payload: object): NextRequest {
  const rawBody = Buffer.from(JSON.stringify(payload));
  const sig = createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
  return new NextRequest('http://test/api/webhooks/subscriptions/moneroo', {
    method: 'POST',
    headers: { 'x-moneroo-signature': sig, 'content-type': 'application/json' },
    body: rawBody,
  });
}

beforeEach(() => {
  vi.stubEnv('MONEROO_SECRET_KEY', 'sk_test');
  vi.stubEnv('MONEROO_WEBHOOK_SECRET', WEBHOOK_SECRET);
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

describe('POST /api/webhooks/subscriptions/moneroo', () => {
  it('activates the subscription when a PENDING row matches and the amount is within tolerance', async () => {
    paymentFindUnique.mockResolvedValueOnce({
      id: 'sp_1',
      organizationId: 'org_1',
      plan: 'PRO',
      provider: 'MONEROO',
      providerRef: 'pay_123',
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
    const res = await POST(
      signedRequest({ event: 'payment.success', data: { id: 'pay_123', amount: 9_900 } }),
    );

    expect(res.status).toBe(200);
    expect(subscriptionUpsert).toHaveBeenCalled();
    expect(orgUpdate).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      data: { plan: 'PRO', planUpdatedAt: expect.any(Date) },
    });
  });

  it('anonymous checkout — resolves the org, activates against it, and marks the intent SUCCEEDED', async () => {
    anonymousIntentFindUnique.mockResolvedValueOnce({
      id: 'intent_1',
      email: 'nouveau@garage.test',
      atelierName: 'Garage Ndiaye',
      phone: '+221771234567',
      plan: 'PRO',
      provider: 'MONEROO',
      providerRef: 'pay_anon_1',
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
    const res = await POST(
      signedRequest({ event: 'payment.success', data: { id: 'pay_anon_1', amount: 9_900 } }),
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

  it('does NOT credit when no matching SubscriptionPayment row exists', async () => {
    paymentFindUnique.mockResolvedValueOnce(null);
    const { POST } = await import('./route');
    const res = await POST(
      signedRequest({ event: 'payment.success', data: { id: 'unknown_pay' } }),
    );
    expect(res.status).toBe(200);
    expect(subscriptionUpsert).not.toHaveBeenCalled();
  });

  it('does NOT credit on amount mismatch beyond 5% tolerance', async () => {
    paymentFindUnique.mockResolvedValueOnce({
      id: 'sp_1',
      organizationId: 'org_1',
      plan: 'PRO',
      provider: 'MONEROO',
      providerRef: 'pay_123',
      amount: 9_900,
      currency: 'XOF',
      status: 'PENDING',
    });
    const { POST } = await import('./route');
    const res = await POST(
      signedRequest({ event: 'payment.success', data: { id: 'pay_123', amount: 100 } }),
    );
    expect(res.status).toBe(200);
    expect(subscriptionUpsert).not.toHaveBeenCalled();
  });

  it('marks the SubscriptionPayment FAILED on payment.failed', async () => {
    const { POST } = await import('./route');
    const res = await POST(signedRequest({ event: 'payment.failed', data: { id: 'pay_123' } }));
    expect(res.status).toBe(200);
    expect(paymentUpdateMany).toHaveBeenCalledWith({
      where: { provider: 'MONEROO', providerRef: 'pay_123', status: 'PENDING' },
      data: { status: 'FAILED' },
    });
  });

  it('401s on a tampered body (bad HMAC)', async () => {
    const rawBody = Buffer.from(
      JSON.stringify({ event: 'payment.success', data: { id: 'pay_123' } }),
    );
    const req = new NextRequest('http://test/api/webhooks/subscriptions/moneroo', {
      method: 'POST',
      headers: { 'x-moneroo-signature': 'deadbeef', 'content-type': 'application/json' },
      body: rawBody,
    });
    const { POST } = await import('./route');
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('exports runtime=nodejs and dynamic=force-dynamic', async () => {
    const mod = (await import('./route')) as { runtime?: string; dynamic?: string };
    expect(mod.runtime).toBe('nodejs');
    expect(mod.dynamic).toBe('force-dynamic');
  });
});
