// /api/admin/support-tickets — ADMIN-readable inbox.
// Covers GET (list, ./route.ts) and PATCH (status/reply, ./[id]/route.ts)
// in one file, mirroring the established consolidation convention (see
// admin/users/route.test.ts's "Wave 1 & 2").
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
vi.mock('@/lib/server/queues/email-queue-singleton', () => ({
  getEmailQueue: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { GET } from './route';
import { PATCH } from './[id]/route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockLogAdminAction = vi.mocked(logAdminAction);
const mockGetEmailQueue = vi.mocked(getEmailQueue);

const adminUser = seedAdmin({ id: 'admin_1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: adminUser.id, email: adminUser.email },
  admin: { id: adminUser.id, email: adminUser.email, role: 'ADMIN' as const },
};

function makeGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}
function makePatch(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://test/api/admin/support-tickets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
function paramsOf(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const baseTicket = {
  id: 'ticket_1',
  userId: null,
  name: 'Aminata',
  email: 'aminata@test.local',
  subject: 'Problème de facture',
  message: "La facture n'arrive pas.",
  status: 'OPEN',
  createdAt: new Date('2026-08-20T00:00:00Z'),
  resolvedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockVerifyCsrf.mockReturnValue(null);
  mockLogAdminAction.mockResolvedValue(undefined);
  mockGetEmailQueue.mockReturnValue(null);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('GET /api/admin/support-tickets', () => {
  it('returns the ticket list for ADMIN', async () => {
    prismaMock.supportTicket.findMany.mockResolvedValueOnce([baseTicket] as never);
    const res = await GET(makeGet('http://test/api/admin/support-tickets'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tickets: { subject: string }[] };
    expect(body.tickets[0]?.subject).toBe('Problème de facture');
  });

  it('filters by ?status', async () => {
    prismaMock.supportTicket.findMany.mockResolvedValueOnce([]);
    await GET(makeGet('http://test/api/admin/support-tickets?status=RESOLVED'));
    expect(prismaMock.supportTicket.findMany).toHaveBeenCalledWith({
      where: { status: 'RESOLVED' },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  });

  it('rejects a non-admin caller without touching the DB', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet('http://test/api/admin/support-tickets'));
    expect(res.status).toBe(403);
    expect(prismaMock.supportTicket.findMany).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/support-tickets/[id]', () => {
  it('changes status and writes an audited support_ticket.update action', async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValueOnce(baseTicket as never);
    prismaMock.supportTicket.update.mockResolvedValueOnce({
      ...baseTicket,
      status: 'IN_PROGRESS',
    } as never);

    const res = await PATCH(makePatch('ticket_1', { status: 'IN_PROGRESS' }), paramsOf('ticket_1'));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ticket: { status: string } };
    expect(body.ticket.status).toBe('IN_PROGRESS');
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: adminUser.id,
        action: 'support_ticket.update',
        targetType: 'SupportTicket',
        targetId: 'ticket_1',
        metadata: { from: 'OPEN', to: 'IN_PROGRESS', replied: false },
      }),
    );
    expect(mockGetEmailQueue).not.toHaveBeenCalled();
  });

  it('a reply without an explicit status implicitly moves OPEN -> IN_PROGRESS and enqueues an email', async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValueOnce(baseTicket as never);
    prismaMock.supportTicket.update.mockResolvedValueOnce({
      ...baseTicket,
      status: 'IN_PROGRESS',
    } as never);
    const enqueue = vi.fn().mockResolvedValue(undefined);
    mockGetEmailQueue.mockReturnValue({ enqueue } as never);

    const res = await PATCH(
      makePatch('ticket_1', { reply: 'Voici la réponse.' }),
      paramsOf('ticket_1'),
    );

    expect(res.status).toBe(200);
    expect(prismaMock.supportTicket.update).toHaveBeenCalledWith({
      where: { id: 'ticket_1' },
      data: { status: 'IN_PROGRESS', resolvedAt: null },
    });
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ metadata: { from: 'OPEN', to: 'IN_PROGRESS', replied: true } }),
    );
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ to: baseTicket.email, subject: expect.stringContaining('Re:') }),
    );
  });

  it('status RESOLVED stamps resolvedAt', async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValueOnce(baseTicket as never);
    prismaMock.supportTicket.update.mockResolvedValueOnce({
      ...baseTicket,
      status: 'RESOLVED',
      resolvedAt: new Date('2026-08-21T00:00:00Z'),
    } as never);

    await PATCH(makePatch('ticket_1', { status: 'RESOLVED' }), paramsOf('ticket_1'));

    const args = prismaMock.supportTicket.update.mock.calls[0]?.[0];
    expect(args?.data).toMatchObject({ status: 'RESOLVED' });
    expect((args?.data as { resolvedAt: Date }).resolvedAt).toBeInstanceOf(Date);
  });

  it('skips the email send silently when the queue is not configured', async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValueOnce(baseTicket as never);
    prismaMock.supportTicket.update.mockResolvedValueOnce({
      ...baseTicket,
      status: 'IN_PROGRESS',
    } as never);
    mockGetEmailQueue.mockReturnValue(null);

    const res = await PATCH(makePatch('ticket_1', { reply: 'Réponse.' }), paramsOf('ticket_1'));
    expect(res.status).toBe(200);
  });

  it('404s TICKET_NOT_FOUND for a missing ticket, no update/audit', async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValueOnce(null);
    const res = await PATCH(makePatch('missing', { status: 'RESOLVED' }), paramsOf('missing'));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('TICKET_NOT_FOUND');
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('400s when neither status nor reply is provided', async () => {
    const res = await PATCH(makePatch('ticket_1', {}), paramsOf('ticket_1'));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.supportTicket.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a non-admin caller without touching the DB', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await PATCH(makePatch('ticket_1', { status: 'RESOLVED' }), paramsOf('ticket_1'));
    expect(res.status).toBe(403);
    expect(prismaMock.supportTicket.findUnique).not.toHaveBeenCalled();
  });

  it('propagates a CSRF failure before any auth/DB work', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await PATCH(makePatch('ticket_1', { status: 'RESOLVED' }), paramsOf('ticket_1'));
    expect(res.status).toBe(403);
    expect(mockRequireAdmin).not.toHaveBeenCalled();
  });
});
