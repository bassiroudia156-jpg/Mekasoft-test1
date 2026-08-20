// POST /api/invites/[token]/accept tests. No prior coverage existed for
// this route — added alongside the checkUserLimitForInviteAccept fix
// (2026-08-19 plan-gating audit): an invite can sit PENDING for days, and
// the org's plan can drop underneath it in the meantime (grace-period
// expiry, a cancelled Stripe subscription) — this route must re-check the
// seat cap at accept time, not just trust the check done when the invite
// was sent.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

mockNextCookies();

import { POST } from './route';

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://test/api/invites/tok123/accept', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function ctx(): { params: Promise<{ token: string }> } {
  return { params: Promise.resolve({ token: 'tok123' }) };
}

const BASE_INVITE = {
  id: 'inv-1',
  organizationId: 'org-1',
  email: 'newmember@example.com',
  name: 'Nouveau Membre',
  role: 'MEMBER',
  jobTitle: null,
  status: 'PENDING',
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
};

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
  prismaMock.organizationInvite.findUnique.mockResolvedValue(BASE_INVITE as never);
  prismaMock.organizationInvite.updateMany.mockResolvedValue({ count: 1 } as never);
  prismaMock.user.findUnique.mockResolvedValue(null); // email not taken, by default
  prismaMock.user.create.mockResolvedValue({
    id: 'u-new',
    email: BASE_INVITE.email,
    tokenVersion: 0,
  } as never);
  prismaMock.organizationMember.create.mockResolvedValue({} as never);
});

describe('POST /api/invites/[token]/accept', () => {
  it('happy path: room under the cap — creates the user + member, issues cookies', async () => {
    prismaMock.organization.findUnique.mockResolvedValue({ plan: 'FREE' } as never);
    prismaMock.organizationMember.count.mockResolvedValue(0);
    prismaMock.organizationInvite.count.mockResolvedValue(0); // no OTHER pending invites

    const res = await POST(makeReq({ password: 'a-fine-password-123' }), ctx());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(prismaMock.organizationMember.create).toHaveBeenCalledWith({
      data: { organizationId: 'org-1', userId: 'u-new', role: 'MEMBER', jobTitle: null },
    });
    expect(__cookieStore.has('app-token')).toBe(true);
  });

  it('regression guard: accepts even when members+pending (including THIS invite) already equal the cap', async () => {
    // PRO/"Premium", maxUsers=5 (merged in from the retired BUSINESS tier —
    // see lib/server/plans/limits.ts's header comment): 4 real members +
    // this one PENDING invite = 5, exactly at cap — legitimate (invites are
    // allowed to fill the cap). organizationInvite.count is queried with
    // `id: { not: inviteId } }`, so the mock reflects "0 OTHER pending
    // invites" even though this invite itself is still PENDING in
    // BASE_INVITE.
    prismaMock.organization.findUnique.mockResolvedValue({ plan: 'PRO' } as never);
    prismaMock.organizationMember.count.mockResolvedValue(4);
    prismaMock.organizationInvite.count.mockResolvedValue(0);

    const res = await POST(makeReq({ password: 'a-fine-password-123' }), ctx());

    expect(res.status).toBe(200);
    expect(prismaMock.organizationMember.create).toHaveBeenCalled();
  });

  it('403s PLAN_LIMIT_USERS when the org downgraded below its reserved seats since the invite was sent', async () => {
    // The invite was sent while on PRO/"Premium" (room for it); by accept
    // time the org has been downgraded to FREE (max 1) and already has its
    // 1 owner.
    prismaMock.organization.findUnique.mockResolvedValue({ plan: 'FREE' } as never);
    prismaMock.organizationMember.count.mockResolvedValue(1);
    prismaMock.organizationInvite.count.mockResolvedValue(0);

    const res = await POST(makeReq({ password: 'a-fine-password-123' }), ctx());

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('PLAN_LIMIT_USERS');
    expect(prismaMock.organizationMember.create).not.toHaveBeenCalled();
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.organizationInvite.updateMany).not.toHaveBeenCalled();
    expect(__cookieStore.size()).toBe(0);
  });

  it('excludes the invite being accepted from the OTHER-pending-invites count passed to the guard', async () => {
    prismaMock.organization.findUnique.mockResolvedValue({ plan: 'PRO' } as never);
    prismaMock.organizationMember.count.mockResolvedValue(0);
    prismaMock.organizationInvite.count.mockResolvedValue(0);

    await POST(makeReq({ password: 'a-fine-password-123' }), ctx());

    const where = prismaMock.organizationInvite.count.mock.calls[0]?.[0]?.where as {
      id?: { not: string };
    };
    expect(where?.id).toEqual({ not: 'inv-1' });
  });

  it('404s INVITE_NOT_FOUND for an unknown token', async () => {
    prismaMock.organizationInvite.findUnique.mockResolvedValue(null);
    const res = await POST(makeReq({ password: 'a-fine-password-123' }), ctx());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('INVITE_NOT_FOUND');
  });

  it('410s INVITE_ALREADY_USED for a non-PENDING invite (skips the plan-limit check entirely)', async () => {
    prismaMock.organizationInvite.findUnique.mockResolvedValue({
      ...BASE_INVITE,
      status: 'ACCEPTED',
    } as never);
    const res = await POST(makeReq({ password: 'a-fine-password-123' }), ctx());
    expect(res.status).toBe(410);
    expect((await res.json()).error).toBe('INVITE_ALREADY_USED');
    expect(prismaMock.organization.findUnique).not.toHaveBeenCalled();
  });

  it('410s INVITE_EXPIRED for a lapsed invite', async () => {
    prismaMock.organizationInvite.findUnique.mockResolvedValue({
      ...BASE_INVITE,
      expiresAt: new Date(Date.now() - 1_000),
    } as never);
    const res = await POST(makeReq({ password: 'a-fine-password-123' }), ctx());
    expect(res.status).toBe(410);
    expect((await res.json()).error).toBe('INVITE_EXPIRED');
  });

  it("source contains runtime='nodejs' and withRequestContext", () => {
    const src = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    expect(src).toMatch(/export\s+const\s+runtime\s*=\s*['"]nodejs['"]/);
    expect(src).toContain('withRequestContext');
  });
});
