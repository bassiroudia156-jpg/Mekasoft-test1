import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/organizations/require-caller-org', () => ({
  requireCallerOrg: vi.fn(),
}));
vi.mock('@/lib/server/subscriptions/receipt-pdf', () => ({
  renderSubscriptionReceiptPdf: vi.fn(),
}));

import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { renderSubscriptionReceiptPdf } from '@/lib/server/subscriptions/receipt-pdf';
import { GET } from './route';

const mockRequireCallerOrg = vi.mocked(requireCallerOrg);
const mockRenderPdf = vi.mocked(renderSubscriptionReceiptPdf);

const callerCtx = {
  user: { sub: 'user_1', email: 'user@test.local' },
  organizationId: 'org_1',
  role: 'MEMBER' as const,
};

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/subscriptions/sp_1/receipt/pdf', { method: 'GET' });
}

function makeParams(paymentId: string) {
  return { params: Promise.resolve({ paymentId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCallerOrg.mockResolvedValue(callerCtx);
  mockRenderPdf.mockResolvedValue(Buffer.from('%PDF-fake'));
});

describe('GET /api/subscriptions/[paymentId]/receipt/pdf', () => {
  it('404s PAYMENT_NOT_FOUND when the payment does not belong to the caller org', async () => {
    prismaMock.subscriptionPayment.findFirst.mockResolvedValueOnce(null as never);
    const res = await GET(makeGet(), makeParams('sp_1'));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('PAYMENT_NOT_FOUND');
    expect(mockRenderPdf).not.toHaveBeenCalled();
  });

  it('404s RECEIPT_NOT_AVAILABLE when the payment has not SUCCEEDED', async () => {
    prismaMock.subscriptionPayment.findFirst.mockResolvedValueOnce({
      id: 'sp_1',
      organizationId: 'org_1',
      plan: 'PRO',
      provider: 'STRIPE',
      amount: 9_900,
      currency: 'XOF',
      status: 'PENDING',
      createdAt: new Date('2026-08-19'),
      succeededAt: null,
      organization: { name: 'Garage Demo' },
    } as never);
    const res = await GET(makeGet(), makeParams('sp_1'));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('RECEIPT_NOT_AVAILABLE');
    expect(mockRenderPdf).not.toHaveBeenCalled();
  });

  it('returns an inline PDF for a SUCCEEDED payment', async () => {
    prismaMock.subscriptionPayment.findFirst.mockResolvedValueOnce({
      id: 'sp_1',
      organizationId: 'org_1',
      plan: 'PRO',
      provider: 'MONEROO',
      amount: 9_900,
      currency: 'XOF',
      status: 'SUCCEEDED',
      createdAt: new Date('2026-08-19'),
      succeededAt: new Date('2026-08-19'),
      organization: { name: 'Garage Demo' },
    } as never);

    const res = await GET(makeGet(), makeParams('sp_1'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toContain('sp_1');
    expect(mockRenderPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: 'sp_1',
        organizationName: 'Garage Demo',
        plan: 'PRO',
        provider: 'MONEROO',
        providerLabel: 'Mobile Money (Moneroo)',
        amount: 9_900,
        currency: 'XOF',
      }),
    );
  });

  it('propagates a non-2xx from requireCallerOrg without a DB hit', async () => {
    mockRequireCallerOrg.mockResolvedValueOnce(
      NextResponse.json({ error: 'NO_ORGANIZATION' }, { status: 404 }),
    );
    const res = await GET(makeGet(), makeParams('sp_1'));
    expect(res.status).toBe(404);
    expect(prismaMock.subscriptionPayment.findFirst).not.toHaveBeenCalled();
  });

  it('exports runtime=nodejs', async () => {
    const mod = (await import('./route')) as { runtime?: string };
    expect(mod.runtime).toBe('nodejs');
  });
});
