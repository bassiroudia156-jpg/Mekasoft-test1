// /api/admin/feedback — ADMIN-readable feedback inbox with a "traité"
// (reviewed) toggle. Covers GET (list, ./route.ts) and PATCH
// (./[id]/route.ts) in one file, mirroring the established consolidation
// convention (see admin/users/route.test.ts's "Wave 1 & 2").
//
// The PATCH route was fixed 2026-08-21 to go through logAdminAction (it
// previously skipped audit logging entirely) — several tests below pin
// that down explicitly so it can't silently regress.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});
vi.mock('@/lib/server/admin/audit', () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { GET } from './route';
import { PATCH } from './[id]/route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockLogAdminAction = vi.mocked(logAdminAction);

const adminUser = seedAdmin({ id: 'admin_1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: adminUser.id, email: adminUser.email },
  admin: { id: adminUser.id, email: adminUser.email, role: 'ADMIN' as const },
};

function makeGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}
function makePatch(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://test/api/admin/feedback/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
function paramsOf(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const baseFeedback = {
  id: 'feedback_1',
  userId: null,
  message: 'Super outil !',
  rating: 5,
  reviewed: false,
  createdAt: new Date('2026-08-20T00:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockVerifyCsrf.mockReturnValue(null);
  mockLogAdminAction.mockResolvedValue(undefined);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('GET /api/admin/feedback', () => {
  it('returns the feedback list for ADMIN', async () => {
    prismaMock.feedback.findMany.mockResolvedValueOnce([baseFeedback] as never);
    const res = await GET(makeGet('http://test/api/admin/feedback'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { feedback: { message: string }[] };
    expect(body.feedback[0]?.message).toBe('Super outil !');
  });

  it('filters by ?reviewed=true', async () => {
    prismaMock.feedback.findMany.mockResolvedValueOnce([]);
    await GET(makeGet('http://test/api/admin/feedback?reviewed=true'));
    expect(prismaMock.feedback.findMany).toHaveBeenCalledWith({
      where: { reviewed: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  });

  it('filters by ?reviewed=false', async () => {
    prismaMock.feedback.findMany.mockResolvedValueOnce([]);
    await GET(makeGet('http://test/api/admin/feedback?reviewed=false'));
    expect(prismaMock.feedback.findMany).toHaveBeenCalledWith({
      where: { reviewed: false },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  });

  it('rejects a non-admin caller without touching the DB', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet('http://test/api/admin/feedback'));
    expect(res.status).toBe(403);
    expect(prismaMock.feedback.findMany).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/feedback/[id]', () => {
  it('toggles reviewed and writes an audited feedback.update action (2026-08-21 fix)', async () => {
    prismaMock.feedback.findUnique.mockResolvedValueOnce(baseFeedback as never);
    prismaMock.feedback.update.mockResolvedValueOnce({
      ...baseFeedback,
      reviewed: true,
    } as never);

    const res = await PATCH(makePatch('feedback_1', { reviewed: true }), paramsOf('feedback_1'));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { feedback: { reviewed: boolean } };
    expect(body.feedback.reviewed).toBe(true);
    expect(prismaMock.feedback.update).toHaveBeenCalledWith({
      where: { id: 'feedback_1' },
      data: { reviewed: true },
    });
    expect(mockLogAdminAction).toHaveBeenCalledTimes(1);
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: adminUser.id,
        action: 'feedback.update',
        targetType: 'Feedback',
        targetId: 'feedback_1',
        metadata: { from: false, to: true },
      }),
    );
  });

  it('404s FEEDBACK_NOT_FOUND for a missing row, no update/audit', async () => {
    prismaMock.feedback.findUnique.mockResolvedValueOnce(null);
    const res = await PATCH(makePatch('missing', { reviewed: true }), paramsOf('missing'));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('FEEDBACK_NOT_FOUND');
    expect(prismaMock.feedback.update).not.toHaveBeenCalled();
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('400s on an invalid body', async () => {
    const res = await PATCH(makePatch('feedback_1', { reviewed: 'yes' }), paramsOf('feedback_1'));
    expect(res.status).toBe(400);
    expect(prismaMock.feedback.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a non-admin caller without touching the DB', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await PATCH(makePatch('feedback_1', { reviewed: true }), paramsOf('feedback_1'));
    expect(res.status).toBe(403);
    expect(prismaMock.feedback.findUnique).not.toHaveBeenCalled();
  });

  it('propagates a CSRF failure before any auth/DB work', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await PATCH(makePatch('feedback_1', { reviewed: true }), paramsOf('feedback_1'));
    expect(res.status).toBe(403);
    expect(mockRequireAdmin).not.toHaveBeenCalled();
  });
});
