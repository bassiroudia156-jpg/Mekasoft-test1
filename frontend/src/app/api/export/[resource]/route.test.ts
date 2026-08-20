// Freemium plan (2026-08-18) — Premium-only CSV export (2026-08-20: was
// Business-only, merged into PRO/"Premium" — see
// lib/server/plans/limits.ts's header comment).
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/organizations/require-caller-org', () => ({
  requireCallerOrg: vi.fn(),
}));

import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { GET } from './route';

const mockRequireCallerOrg = vi.mocked(requireCallerOrg);

const callerCtx = {
  user: { sub: 'user_1', email: 'user@test.local' },
  organizationId: 'org_1',
  role: 'OWNER' as const,
};

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/export/clients', { method: 'GET' });
}

function paramsOf(resource: string): { params: Promise<{ resource: string }> } {
  return { params: Promise.resolve({ resource }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCallerOrg.mockResolvedValue(callerCtx);
});

describe('/api/export/[resource]', () => {
  it('403s PLAN_FEATURE_LOCKED on a FREE org without querying the resource table', async () => {
    prismaMock.organization.findUnique.mockResolvedValueOnce({ plan: 'FREE' } as never);
    const res = await GET(makeGet(), paramsOf('clients'));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('PLAN_FEATURE_LOCKED');
    expect(prismaMock.client.findMany).not.toHaveBeenCalled();
  });

  it('404s an unknown resource segment before touching the DB', async () => {
    const res = await GET(makeGet(), paramsOf('widgets'));
    expect(res.status).toBe(404);
    expect(prismaMock.organization.findUnique).not.toHaveBeenCalled();
  });

  it('returns a CSV attachment for clients on PRO/"Premium"', async () => {
    prismaMock.organization.findUnique.mockResolvedValueOnce({ plan: 'PRO' } as never);
    prismaMock.client.findMany.mockResolvedValueOnce([
      {
        type: 'INDIVIDUAL',
        firstName: 'Moussa',
        lastName: 'Diallo',
        companyName: null,
        phone: '+221771234567',
        email: null,
        city: 'Dakar',
        status: 'actif',
        createdAt: new Date('2026-08-01T00:00:00Z'),
      },
    ] as never);

    const res = await GET(makeGet(), paramsOf('clients'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
    expect(res.headers.get('Content-Disposition')).toContain('clients-');
    const body = await res.text();
    expect(body).toContain('Moussa Diallo');
    expect(body).toContain('Dakar');
  });

  it('scopes every resource query to the caller organizationId', async () => {
    prismaMock.organization.findUnique.mockResolvedValueOnce({ plan: 'PRO' } as never);
    prismaMock.invoice.findMany.mockResolvedValueOnce([]);
    await GET(makeGet(), paramsOf('invoices'));
    expect(prismaMock.invoice.findMany.mock.calls[0]![0]!.where).toEqual({
      organizationId: 'org_1',
    });
  });

  it('propagates a non-2xx from requireCallerOrg without a DB hit', async () => {
    mockRequireCallerOrg.mockResolvedValueOnce(
      NextResponse.json({ error: 'NO_ORGANIZATION' }, { status: 404 }),
    );
    const res = await GET(makeGet(), paramsOf('clients'));
    expect(res.status).toBe(404);
    expect(prismaMock.organization.findUnique).not.toHaveBeenCalled();
  });
});
