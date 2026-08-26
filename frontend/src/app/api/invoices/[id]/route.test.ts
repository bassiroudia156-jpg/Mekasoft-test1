// No test file existed for this route before — added alongside the
// 2026-08-24 change that makes GET also return the intervention's parts +
// laborAmount, so the invoice document can itemize spare parts by name
// instead of a single free-text description line (explicit user request).
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

import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { verifyCsrf } from '@/lib/server/auth';
import { GET, PATCH } from './route';

const mockRequireCallerOrg = vi.mocked(requireCallerOrg);
const mockVerifyCsrf = vi.mocked(verifyCsrf);

const callerCtx = {
  user: { sub: 'user_1', email: 'owner@test.local' },
  organizationId: 'org_1',
  role: 'MEMBER' as const,
};

const invoiceRow = {
  id: 'inv_1',
  reference: 'FAC-2026-001',
  status: 'Émise',
  description: 'Vidange complète',
  subtotal: 15_000,
  taxRatePct: 18,
  taxAmount: 2_700,
  amount: 17_700,
  paymentTerms: 'Net 30 jours',
  issueDate: new Date('2026-08-01'),
  dueDate: new Date('2026-08-31'),
  notes: null,
  emailSentAt: null,
  emailSentTo: null,
  createdAt: new Date('2026-08-01'),
  client: {
    id: 'client_1',
    type: 'INDIVIDUAL',
    firstName: 'Awa',
    lastName: 'Ndiaye',
    companyName: null,
    phone: '+221771234567',
    email: 'awa@test.local',
  },
  intervention: {
    id: 'int_1',
    reference: 'INT-001',
    laborAmount: 10_000,
    parts: [
      {
        name: 'Plaquettes de frein avant',
        quantity: 2,
        unit: 'pcs',
        unitPrice: 2_500,
        total: 5_000,
      },
    ],
  },
  organization: { name: 'Garage Demo', phone: '+221338000000', city: 'Dakar' },
};

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/invoices/inv_1', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireCallerOrg.mockResolvedValue(callerCtx);
});

describe('GET /api/invoices/[id]', () => {
  it('includes the intervention parts (with name/désignation) and laborAmount in the response', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(invoiceRow as never);

    const res = await GET(makeGet(), { params: Promise.resolve({ id: 'inv_1' }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      invoice: {
        laborAmount: number;
        parts: { name: string; quantity: number; unitPrice: number; total: number }[];
      };
    };
    expect(body.invoice.laborAmount).toBe(10_000);
    expect(body.invoice.parts).toEqual([
      {
        name: 'Plaquettes de frein avant',
        quantity: 2,
        unit: 'pcs',
        unitPrice: 2_500,
        total: 5_000,
      },
    ]);
  });

  it('404s INVOICE_NOT_FOUND when the invoice does not belong to the caller org', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(null as never);
    const res = await GET(makeGet(), { params: Promise.resolve({ id: 'inv_1' }) });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/invoices/[id]', () => {
  it('403s / propagates CSRF failure before touching the DB', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const req = new NextRequest('http://test/api/invoices/inv_1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'Payée' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'inv_1' }) });
    expect(res.status).toBe(403);
    expect(prismaMock.invoice.findFirst).not.toHaveBeenCalled();
  });
});
