import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/redis', () => ({ redis: null }));
vi.mock('@/lib/server/subscriptions/registry', () => ({
  getSubscriptionProvider: vi.fn(),
  listConfiguredProviders: vi.fn(),
  SubscriptionProviderUnconfiguredError: class SubscriptionProviderUnconfiguredError extends Error {},
}));

import {
  getSubscriptionProvider,
  listConfiguredProviders,
  SubscriptionProviderUnconfiguredError,
} from '@/lib/server/subscriptions/registry';
import { GET, POST } from './route';

const mockGetProvider = vi.mocked(getSubscriptionProvider);
const mockListConfigured = vi.mocked(listConfiguredProviders);

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/subscriptions/anonymous-checkout', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const validBody = {
  email: 'nouveau@garage.test',
  atelierName: 'Garage Ndiaye',
  phone: '+221771234567',
  plan: 'PRO' as const,
  provider: 'STRIPE' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.anonymousSubscriptionIntent.create.mockResolvedValue({ id: 'intent_1' } as never);
  prismaMock.anonymousSubscriptionIntent.update.mockResolvedValue({} as never);
});

describe('GET /api/subscriptions/anonymous-checkout', () => {
  it('returns whichever providers are configured, no auth required', async () => {
    mockListConfigured.mockReturnValue(['STRIPE']);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { availableProviders: string[] };
    expect(body.availableProviders).toEqual(['STRIPE']);
  });
});

describe('POST /api/subscriptions/anonymous-checkout', () => {
  it('creates a PENDING intent, calls the provider, and returns the checkoutUrl', async () => {
    mockGetProvider.mockReturnValue({
      name: 'STRIPE',
      isConfigured: () => true,
      createCheckout: vi
        .fn()
        .mockResolvedValue({ providerRef: 'cs_123', checkoutUrl: 'https://stripe.test/c/cs_123' }),
    });

    const res = await POST(makePost(validBody));

    expect(res.status).toBe(201);
    const body = (await res.json()) as { checkoutUrl: string; intentId: string };
    expect(body.checkoutUrl).toBe('https://stripe.test/c/cs_123');
    expect(body.intentId).toBe('intent_1');
    expect(prismaMock.anonymousSubscriptionIntent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'nouveau@garage.test',
          atelierName: 'Garage Ndiaye',
          phone: '+221771234567',
          plan: 'PRO',
          provider: 'STRIPE',
          amount: 9_900,
          currency: 'XOF',
          status: 'PENDING',
        }),
      }),
    );
    expect(prismaMock.anonymousSubscriptionIntent.update).toHaveBeenCalledWith({
      where: { id: 'intent_1' },
      data: { providerRef: 'cs_123', checkoutUrl: 'https://stripe.test/c/cs_123' },
    });
  });

  it('400s on an invalid body', async () => {
    const res = await POST(makePost({ ...validBody, email: 'not-an-email' }));
    expect(res.status).toBe(400);
    expect(prismaMock.anonymousSubscriptionIntent.create).not.toHaveBeenCalled();
  });

  it('400s on a malformed phone', async () => {
    const res = await POST(makePost({ ...validBody, phone: '0771234567' }));
    expect(res.status).toBe(400);
  });

  it('503s SUBSCRIPTION_PROVIDER_UNCONFIGURED without creating an intent', async () => {
    mockGetProvider.mockImplementation(() => {
      throw new SubscriptionProviderUnconfiguredError('MONEROO');
    });
    const res = await POST(makePost({ ...validBody, provider: 'MONEROO' }));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('SUBSCRIPTION_PROVIDER_UNCONFIGURED');
    expect(prismaMock.anonymousSubscriptionIntent.create).not.toHaveBeenCalled();
  });

  it('marks the intent FAILED and returns 502 when the provider call throws', async () => {
    mockGetProvider.mockReturnValue({
      name: 'STRIPE',
      isConfigured: () => true,
      createCheckout: vi.fn().mockRejectedValue(new Error('Stripe is down')),
    });
    const res = await POST(makePost(validBody));
    expect(res.status).toBe(502);
    expect(prismaMock.anonymousSubscriptionIntent.update).toHaveBeenCalledWith({
      where: { id: 'intent_1' },
      data: { status: 'FAILED' },
    });
  });
});
