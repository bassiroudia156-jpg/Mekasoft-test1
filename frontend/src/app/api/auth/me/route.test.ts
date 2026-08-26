// Tests for GET /api/auth/me (AUTH-06).
// Pattern 14. requireAuth-gated. Note: requireAuth uses cookies() from
// next/headers internally, so tests must use mockNextCookies + prismaMock.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';

mockNextCookies();

vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return {
    ...actual,
    verifyToken: vi.fn(),
  };
});

import { verifyToken } from '@/lib/server/auth';
import { GET, PATCH } from './route';
import { NextRequest } from 'next/server';

function makeReq(opts: { tokenCookie?: string; bearer?: string } = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`;
  return new NextRequest('https://test/api/auth/me', {
    method: 'GET',
    headers,
  });
}

function makePatchReq(
  body: unknown,
  opts: { bearer?: string; csrf?: string | null } = {},
): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`;
  // verifyCsrf (real, unmocked) only rejects when the header is missing —
  // it skips the cookie-match comparison entirely when no CSRF cookie is
  // present on the request, which is the case here (no `Cookie` header set).
  if (opts.csrf !== null) headers['x-csrf-token'] = opts.csrf ?? 'csrf-fixture';
  return new NextRequest('https://test/api/auth/me', {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  __cookieStore.clear();
  vi.mocked(verifyToken).mockReset();
});

describe('GET /api/auth/me', () => {
  it('Test 1: authed — returns user identity', async () => {
    // Place token cookie via mock store; requireAuth reads it via cookies().
    __cookieStore.clear();
    // Fake cookies.set: use mockStore via the mock-cookies internal store.
    // Simpler: test injects directly through Bearer header path which
    // requireAuth supports as a fallback when no cookie is present.
    vi.mocked(verifyToken).mockResolvedValue({
      sub: 'u1',
      email: 'a@b.com',
      tokenVersion: 0,
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      tokenVersion: 0,
    } as never);

    const res = await GET(makeReq({ bearer: 'valid-access-token' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      user: { sub: 'u1', email: 'a@b.com' },
    });
  });

  it('Test 2: no cookie + no bearer — 401 missing token', async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Missing token|token/i);
  });

  it('Test 3: stale tokenVersion — 401', async () => {
    vi.mocked(verifyToken).mockResolvedValue({
      sub: 'u1',
      email: 'a@b.com',
      tokenVersion: 0,
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      tokenVersion: 1, // bumped via change-password
    } as never);

    const res = await GET(makeReq({ bearer: 'stale-jwt' }));
    expect(res.status).toBe(401);
  });

  it('Test 4: deleted user — 401', async () => {
    vi.mocked(verifyToken).mockResolvedValue({
      sub: 'u-deleted',
      email: 'gone@b.com',
      tokenVersion: 0,
    });
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await GET(makeReq({ bearer: 'orphan-jwt' }));
    expect(res.status).toBe(401);
  });
});

// 2026-08-24 — PHONE_ALREADY_IN_USE check added ahead of dual login (phone
// as a login identifier alongside email, see auth/login/route.ts).
describe('PATCH /api/auth/me', () => {
  const AUTH_LOOKUP = { id: 'u1', email: 'a@b.com', tokenVersion: 0 } as never;

  beforeEach(() => {
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'u1', email: 'a@b.com', tokenVersion: 0 });
  });

  it('Test 1: happy path — phone free, update goes through', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(AUTH_LOOKUP) // requireAuth's own lookup
      .mockResolvedValueOnce(null); // phone-uniqueness check — nobody has it

    const res = await PATCH(makePatchReq({ phone: '+221771234567' }, { bearer: 'valid-jwt' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: expect.objectContaining({ phone: '+221771234567' }),
      }),
    );
  });

  it('Test 2: phone already used by ANOTHER user — 409 PHONE_ALREADY_IN_USE, no update', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(AUTH_LOOKUP)
      .mockResolvedValueOnce({ id: 'u2' } as never); // taken by someone else

    const res = await PATCH(makePatchReq({ phone: '+221771234567' }, { bearer: 'valid-jwt' }));

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('PHONE_ALREADY_IN_USE');
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('Test 3: re-saving your OWN existing phone — not rejected', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(AUTH_LOOKUP)
      .mockResolvedValueOnce({ id: 'u1' } as never); // the caller themself

    const res = await PATCH(makePatchReq({ phone: '+221771234567' }, { bearer: 'valid-jwt' }));

    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalled();
  });

  it('Test 4: clearing phone (null) — uniqueness check skipped entirely', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(AUTH_LOOKUP);

    const res = await PATCH(makePatchReq({ phone: null }, { bearer: 'valid-jwt' }));

    expect(res.status).toBe(200);
    // Only requireAuth's own lookup ran — no second findUnique for a null phone.
    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phone: null }) }),
    );
  });

  it('Test 5: missing CSRF header — 403, no auth/db calls', async () => {
    const res = await PATCH(makePatchReq({ name: 'New Name' }, { csrf: null }));
    expect(res.status).toBe(403);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('Test 6: no auth — 401', async () => {
    const res = await PATCH(makePatchReq({ name: 'New Name' }));
    expect(res.status).toBe(401);
  });

  it('Test 7: empty body — 400 INVALID_BODY', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(AUTH_LOOKUP);
    const res = await PATCH(makePatchReq({}, { bearer: 'valid-jwt' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_BODY');
  });
});
