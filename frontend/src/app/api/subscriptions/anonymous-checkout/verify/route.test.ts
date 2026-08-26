import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/subscriptions/anonymous-checkout/verify', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const baseIntent = {
  id: 'intent_1',
  email: 'nouveau@garage.test',
  atelierName: 'Garage Ndiaye',
  phone: '+221771234567',
  plan: 'PRO',
  provider: 'STRIPE',
  providerRef: 'cs_123',
  amount: 9_900,
  currency: 'XOF',
  status: 'PENDING',
  checkoutUrl: 'https://stripe.test/c/cs_123',
  organizationId: null,
  resultKind: null,
  createdAt: new Date(),
  succeededAt: null,
};

beforeEach(() => {
  prismaMock.anonymousSubscriptionIntent.findUnique.mockReset();
});

describe('POST /api/subscriptions/anonymous-checkout/verify', () => {
  it('400s on an invalid body', async () => {
    const res = await POST(makePost({}));
    expect(res.status).toBe(400);
  });

  it('404s INTENT_NOT_FOUND when no matching row exists', async () => {
    prismaMock.anonymousSubscriptionIntent.findUnique.mockResolvedValue(null as never);
    const res = await POST(makePost({ intentId: 'nope' }));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INTENT_NOT_FOUND');
  });

  it('reports PENDING without ever crediting anything itself', async () => {
    prismaMock.anonymousSubscriptionIntent.findUnique.mockResolvedValue(baseIntent as never);
    const res = await POST(makePost({ intentId: 'intent_1' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; isNewAccount: boolean };
    expect(body.status).toBe('PENDING');
    expect(body.isNewAccount).toBe(false);
  });

  it('reports SUCCEEDED with isNewAccount=true for a new_org_new_user resolution', async () => {
    prismaMock.anonymousSubscriptionIntent.findUnique.mockResolvedValue({
      ...baseIntent,
      status: 'SUCCEEDED',
      resultKind: 'new_org_new_user',
      organizationId: 'org_1',
    } as never);
    const res = await POST(makePost({ intentId: 'intent_1' }));
    const body = (await res.json()) as { status: string; isNewAccount: boolean; email: string };
    expect(body.status).toBe('SUCCEEDED');
    expect(body.isNewAccount).toBe(true);
    expect(body.email).toBe('nouveau@garage.test');
  });

  it('reports SUCCEEDED with isNewAccount=false for an existing-org resolution', async () => {
    prismaMock.anonymousSubscriptionIntent.findUnique.mockResolvedValue({
      ...baseIntent,
      status: 'SUCCEEDED',
      resultKind: 'existing_org',
      organizationId: 'org_9',
    } as never);
    const res = await POST(makePost({ intentId: 'intent_1' }));
    const body = (await res.json()) as { isNewAccount: boolean };
    expect(body.isNewAccount).toBe(false);
  });
});
