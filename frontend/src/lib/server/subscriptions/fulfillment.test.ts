import { describe, it, expect, vi, beforeEach } from 'vitest';
import { activateSubscription } from './fulfillment';

function makeClient(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    subscriptionPayment: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    },
    subscription: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    organization: {
      update: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

beforeEach(() => {
  vi.stubEnv('SUBSCRIPTION_GRACE_DAYS', '3');
});

describe('activateSubscription', () => {
  it('creates a fresh SubscriptionPayment row when no PENDING row matches (Stripe invoice.paid case)', async () => {
    const client = makeClient();
    await activateSubscription(client, {
      organizationId: 'org_1',
      plan: 'PRO',
      provider: 'STRIPE',
      providerRef: 'in_123',
      amount: 9_900,
      currency: 'XOF',
      stripePeriodEnd: new Date('2026-09-18T00:00:00Z'),
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
    });
    expect(client.subscriptionPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SUCCEEDED', providerRef: 'in_123' }),
      }),
    );
  });

  it('reconciles an existing PENDING row instead of creating a duplicate (Moneroo/Chariow case)', async () => {
    const client = makeClient({
      subscriptionPayment: {
        findUnique: vi.fn().mockResolvedValue({ id: 'sp_1', status: 'PENDING' }),
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({}),
      },
    });
    await activateSubscription(client, {
      organizationId: 'org_1',
      plan: 'PRO',
      provider: 'MONEROO',
      providerRef: 'pay_abc',
      amount: 9_900,
      currency: 'XOF',
    });
    expect(client.subscriptionPayment.update).toHaveBeenCalledWith({
      where: { id: 'sp_1' },
      data: { status: 'SUCCEEDED', succeededAt: expect.any(Date) },
    });
    expect(client.subscriptionPayment.create).not.toHaveBeenCalled();
  });

  it('does not double-update an already-SUCCEEDED row (webhook + verify-poll race)', async () => {
    const client = makeClient({
      subscriptionPayment: {
        findUnique: vi.fn().mockResolvedValue({ id: 'sp_1', status: 'SUCCEEDED' }),
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({}),
      },
    });
    await activateSubscription(client, {
      organizationId: 'org_1',
      plan: 'PRO',
      provider: 'MONEROO',
      providerRef: 'pay_abc',
      amount: 9_900,
      currency: 'XOF',
    });
    expect(client.subscriptionPayment.update).not.toHaveBeenCalled();
  });

  it('uses stripePeriodEnd directly and sets graceEndsAt=null for STRIPE', async () => {
    const client = makeClient();
    await activateSubscription(client, {
      organizationId: 'org_1',
      plan: 'BUSINESS',
      provider: 'STRIPE',
      providerRef: 'in_1',
      amount: 19_900,
      currency: 'XOF',
      stripePeriodEnd: new Date('2026-09-18T00:00:00Z'),
    });
    expect(client.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          currentPeriodEnd: new Date('2026-09-18T00:00:00Z'),
          graceEndsAt: null,
        }),
      }),
    );
  });

  it('computes a 30-day period + grace for MONEROO/CHARIOW from now when no prior subscription exists', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-19T00:00:00Z'));
    const client = makeClient();
    await activateSubscription(client, {
      organizationId: 'org_1',
      plan: 'PRO',
      provider: 'CHARIOW',
      providerRef: 'sale_1',
      amount: 9_900,
      currency: 'XOF',
    });
    const call = client.subscription.upsert.mock.calls[0][0];
    expect(call.create.currentPeriodEnd).toEqual(new Date('2026-09-18T00:00:00Z')); // +30d
    expect(call.create.graceEndsAt).toEqual(new Date('2026-09-21T00:00:00Z')); // +30d+3d
    vi.useRealTimers();
  });

  it('extends from the existing currentPeriodEnd when still in the future (renewal, no wasted days)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-19T00:00:00Z'));
    const client = makeClient({
      subscription: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ currentPeriodEnd: new Date('2026-08-25T00:00:00Z') }),
        upsert: vi.fn().mockResolvedValue({}),
      },
    });
    await activateSubscription(client, {
      organizationId: 'org_1',
      plan: 'PRO',
      provider: 'MONEROO',
      providerRef: 'pay_2',
      amount: 9_900,
      currency: 'XOF',
    });
    const call = client.subscription.upsert.mock.calls[0][0];
    // base = 2026-08-25 (still future) + 30d, not "now" + 30d
    expect(call.create.currentPeriodEnd).toEqual(new Date('2026-09-24T00:00:00Z'));
    vi.useRealTimers();
  });

  it('bumps Organization.plan and planUpdatedAt', async () => {
    const client = makeClient();
    await activateSubscription(client, {
      organizationId: 'org_1',
      plan: 'BUSINESS',
      provider: 'MONEROO',
      providerRef: 'pay_3',
      amount: 19_900,
      currency: 'XOF',
    });
    expect(client.organization.update).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      data: { plan: 'BUSINESS', planUpdatedAt: expect.any(Date) },
    });
  });
});
