// Added alongside PATCH /api/clients/[id] (Phase C item #6, 2026-08-25) —
// mirrors invoices/[id]/route.test.ts's shape (the closest existing
// GET+PATCH detail-route test in this codebase).
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
vi.mock('@/lib/server/clients/pii-crypto', () => ({
  encryptPii: vi.fn((v: string) => `enc:${v}`),
  decryptPii: vi.fn((v: string) => v),
}));

import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { verifyCsrf } from '@/lib/server/auth';
import { encryptPii } from '@/lib/server/clients/pii-crypto';
import { GET, PATCH } from './route';

const mockRequireCallerOrg = vi.mocked(requireCallerOrg);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockEncryptPii = vi.mocked(encryptPii);

const callerCtx = {
  user: { sub: 'user_1', email: 'owner@test.local' },
  organizationId: 'org_1',
  role: 'MEMBER' as const,
  jobTitle: null,
};

const clientRow = {
  id: 'client_1',
  type: 'INDIVIDUAL',
  firstName: 'Awa',
  lastName: 'Ndiaye',
  companyName: null,
  phone: '+221771234567',
  email: null,
  street: null,
  city: null,
  postalCode: null,
  country: 'Sénégal',
  notes: null,
  profession: null,
  dateOfBirth: null,
  gender: null,
  taxId: null,
  sector: null,
  contactName: null,
  contactRole: null,
  contactPhone: null,
  contactEmail: null,
  status: 'actif',
};

function makePatch(body: unknown): NextRequest {
  return new NextRequest('http://test/api/clients/client_1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireCallerOrg.mockResolvedValue(callerCtx);
});

describe('GET /api/clients/[id]', () => {
  it('404s CLIENT_NOT_FOUND when the client does not belong to the caller org', async () => {
    prismaMock.client.findFirst.mockResolvedValue(null as never);
    const req = new NextRequest('http://test/api/clients/client_1', { method: 'GET' });
    const res = await GET(req, { params: Promise.resolve({ id: 'client_1' }) });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/clients/[id]', () => {
  it('propagates CSRF failure before touching the DB', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await PATCH(makePatch({ notes: 'x' }), {
      params: Promise.resolve({ id: 'client_1' }),
    });
    expect(res.status).toBe(403);
    expect(prismaMock.client.findFirst).not.toHaveBeenCalled();
  });

  it('404s CLIENT_NOT_FOUND when the client does not belong to the caller org', async () => {
    prismaMock.client.findFirst.mockResolvedValue(null as never);
    const res = await PATCH(makePatch({ notes: 'x' }), {
      params: Promise.resolve({ id: 'client_1' }),
    });
    expect(res.status).toBe(404);
  });

  it('400s INVALID_BODY on an empty patch', async () => {
    prismaMock.client.findFirst.mockResolvedValue({ id: 'client_1' } as never);
    const res = await PATCH(makePatch({}), { params: Promise.resolve({ id: 'client_1' }) });
    expect(res.status).toBe(400);
  });

  it('encrypts idNumber via encryptPii before writing, never storing plaintext', async () => {
    prismaMock.client.findFirst.mockResolvedValue({ id: 'client_1' } as never);
    prismaMock.client.update.mockResolvedValue(clientRow as never);

    const res = await PATCH(makePatch({ idNumber: '1234567890' }), {
      params: Promise.resolve({ id: 'client_1' }),
    });

    expect(res.status).toBe(200);
    expect(mockEncryptPii).toHaveBeenCalledWith('1234567890');
    const updateArgs = prismaMock.client.update.mock.calls[0]?.[0];
    expect(updateArgs?.data).toMatchObject({ idNumber: 'enc:1234567890' });
  });

  it('clears idNumber (no re-encryption) when explicitly set to null', async () => {
    prismaMock.client.findFirst.mockResolvedValue({ id: 'client_1' } as never);
    prismaMock.client.update.mockResolvedValue(clientRow as never);

    await PATCH(makePatch({ idNumber: null }), { params: Promise.resolve({ id: 'client_1' }) });

    expect(mockEncryptPii).not.toHaveBeenCalled();
    const updateArgs = prismaMock.client.update.mock.calls[0]?.[0];
    expect(updateArgs?.data).toMatchObject({ idNumber: null });
  });

  it('updates phone/status and returns the recomputed display name', async () => {
    prismaMock.client.findFirst.mockResolvedValue({ id: 'client_1' } as never);
    prismaMock.client.update.mockResolvedValue({
      ...clientRow,
      phone: '+221709998877',
      status: 'inactif',
    } as never);

    const res = await PATCH(makePatch({ phone: '+221709998877', status: 'inactif' }), {
      params: Promise.resolve({ id: 'client_1' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { client: { phone: string; status: string; name: string } };
    expect(body.client.phone).toBe('+221709998877');
    expect(body.client.status).toBe('inactif');
    expect(body.client.name).toBe('Awa Ndiaye');
  });
});
