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

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/feedback', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockOptionalAuth.mockResolvedValue(null);
  mockVerifyCsrf.mockReturnValue(null);
  prismaMock.feedback.create.mockResolvedValue({
    id: 'fb_1',
    createdAt: new Date('2026-08-24T00:00:00.000Z'),
  } as never);
});

describe('POST /api/feedback', () => {
  // 2026-08-24 audit fix regression coverage — anonymous submitters have no
  // session, so no CSRF cookie exists to check; the route must stay usable
  // for them without ever calling verifyCsrf.
  it('creates anonymous feedback (userId null) without checking CSRF', async () => {
    const res = await POST(makePost({ message: 'Super app', rating: 5 }));
    expect(res.status).toBe(201);
    expect(mockVerifyCsrf).not.toHaveBeenCalled();
    expect(prismaMock.feedback.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: null, message: 'Super app' }),
      }),
    );
  });

  // The actual vulnerability this fix closes: a logged-in caller's session
  // must not be usable from a forged cross-site request.
  it('403s an authenticated submission with no/invalid CSRF token, without creating a row', async () => {
    mockOptionalAuth.mockResolvedValue({ user: { sub: 'user_1', email: 'a@test.local' } });
    mockVerifyCsrf.mockReturnValue(
      new Response(JSON.stringify({ error: 'Invalid CSRF token' }), { status: 403 }) as never,
    );

    const res = await POST(makePost({ message: 'Forged' }));

    expect(res.status).toBe(403);
    expect(prismaMock.feedback.create).not.toHaveBeenCalled();
  });

  it('creates feedback attributed to the caller once CSRF passes', async () => {
    mockOptionalAuth.mockResolvedValue({ user: { sub: 'user_1', email: 'a@test.local' } });
    mockVerifyCsrf.mockReturnValue(null);

    const res = await POST(makePost({ message: 'Great', rating: 4 }));

    expect(res.status).toBe(201);
    expect(prismaMock.feedback.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user_1' }) }),
    );
  });

  it('400s on an invalid body', async () => {
    const res = await POST(makePost({ message: '' }));
    expect(res.status).toBe(400);
    expect(prismaMock.feedback.create).not.toHaveBeenCalled();
  });
});
