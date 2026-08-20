// Freemium plan (2026-08-18) — set-org-plan CLI script. Same test shape as
// make-superadmin.test.ts: `main(args, { prisma })` with a mocked client,
// no subprocess, CLI guard stays inert under vitest.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { main } from './set-org-plan';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
  prismaMock.$transaction.mockImplementation(async (cb: unknown) => {
    if (typeof cb === 'function') {
      return await (cb as (tx: typeof prismaMock) => Promise<unknown>)(prismaMock);
    }
    return undefined;
  });
});

describe('scripts/set-org-plan', () => {
  it('changes plan and writes an organization.plan_change AdminAction', async () => {
    prismaMock.organization.findUnique.mockResolvedValue({
      id: 'org_1',
      slug: 'garage-demo',
      name: 'Garage Demo',
      ownerId: 'user_1',
      plan: 'FREE',
    } as never);
    prismaMock.organization.update.mockResolvedValue({} as never);
    prismaMock.adminAction.create.mockResolvedValue({} as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main(['garage-demo', 'PRO'], { prisma: prismaMock });

    expect(code).toBe(0);
    expect(prismaMock.organization.update).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      data: { plan: 'PRO', planUpdatedAt: expect.any(Date) },
    });
    const auditCall = prismaMock.adminAction.create.mock.calls[0]?.[0];
    expect(auditCall?.data).toMatchObject({
      actorId: 'user_1',
      action: 'organization.plan_change',
      targetType: 'Organization',
      targetId: 'org_1',
      metadata: { from: 'FREE', to: 'PRO', via: 'cli-script' },
    });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('FREE → PRO'));
    logSpy.mockRestore();
  });

  it('unknown slug exits 1 with a clear message, no mutation', async () => {
    prismaMock.organization.findUnique.mockResolvedValue(null);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const code = await main(['nope', 'PRO'], { prisma: prismaMock });

    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('no organization'));
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('same-plan is a no-op (idempotent)', async () => {
    prismaMock.organization.findUnique.mockResolvedValue({
      id: 'org_1',
      slug: 'garage-demo',
      name: 'Garage Demo',
      ownerId: 'user_1',
      plan: 'PRO',
    } as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main(['garage-demo', 'PRO'], { prisma: prismaMock });

    expect(code).toBe(0);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('no-op'));
    logSpy.mockRestore();
  });

  it('rejects an invalid plan value with usage message, no DB call', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const code = await main(['garage-demo', 'ENTERPRISE'], { prisma: prismaMock });

    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
    expect(prismaMock.organization.findUnique).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('missing args exits 1 with usage message', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const code = await main([], { prisma: prismaMock });

    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
    errSpy.mockRestore();
  });
});
