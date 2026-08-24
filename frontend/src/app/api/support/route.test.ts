import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/redis', () => ({ getRedis: () => null }));
vi.mock('@/lib/server/middleware', () => ({ optionalAuth: vi.fn() }));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});

import { optionalAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { POST } from './route';

const mockOptionalAuth = vi.mocked(optionalAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);

const validBody = {
  name: 'Amadou',
  email: 'amadou@test.local',
  subject: 'Question',
  message: 'Comment ça marche ?',
};

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/support', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockOptionalAuth.mockResolvedValue(null);
  mockVerifyCsrf.mockReturnValue(null);
  prismaMock.supportTicket.create.mockResolvedValue({
    id: 'st_1',
    createdAt: new Date('2026-08-24T00:00:00.000Z'),
  } as never);
});

describe('POST /api/support', () => {
  // 2026-08-24 audit fix regression coverage — anonymous submitters (no
  // account) have no CSRF cookie to check; the route must stay usable for
  // them without ever calling verifyCsrf.
  it('creates an anonymous ticket (userId null) without checking CSRF', async () => {
    const res = await POST(makePost(validBody));
    expect(res.status).toBe(201);
    expect(mockVerifyCsrf).not.toHaveBeenCalled();
    expect(prismaMock.supportTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: null }) }),
    );
  });

  // The actual vulnerability this fix closes: a logged-in caller's session
  // must not be usable from a forged cross-site request.
  it('403s an authenticated submission with no/invalid CSRF token, without creating a row', async () => {
    mockOptionalAuth.mockResolvedValue({ user: { sub: 'user_1', email: 'a@test.local' } });
    mockVerifyCsrf.mockReturnValue(
      new Response(JSON.stringify({ error: 'Invalid CSRF token' }), { status: 403 }) as never,
    );

    const res = await POST(makePost(validBody));

    expect(res.status).toBe(403);
    expect(prismaMock.supportTicket.create).not.toHaveBeenCalled();
  });

  it('creates a ticket attributed to the caller once CSRF passes', async () => {
    mockOptionalAuth.mockResolvedValue({ user: { sub: 'user_1', email: 'a@test.local' } });
    mockVerifyCsrf.mockReturnValue(null);

    const res = await POST(makePost(validBody));

    expect(res.status).toBe(201);
    expect(prismaMock.supportTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user_1' }) }),
    );
  });

  it('400s on an invalid body', async () => {
    const res = await POST(makePost({ ...validBody, email: 'not-an-email' }));
    expect(res.status).toBe(400);
    expect(prismaMock.supportTicket.create).not.toHaveBeenCalled();
  });
});
