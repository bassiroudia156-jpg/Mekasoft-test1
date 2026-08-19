import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downgradeExpiredSubscriptions } from './downgrade';

function makePrisma(candidates: unknown[], updateManyCount = 1) {
  const updateManyOnSubscription = vi.fn().mockResolvedValue({ count: updateManyCount });
  const orgUpdate = vi.fn().mockResolvedValue({});
  return {
    subscription: {
      findMany: vi.fn().mockResolvedValue(candidates),
      updateMany: updateManyOnSubscription,
    },
    organization: { update: orgUpdate },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        subscription: { updateMany: updateManyOnSubscription },
        organization: { update: orgUpdate },
      }),
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-19T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('downgradeExpiredSubscriptions', () => {
  it('reverts an org to FREE once graceEndsAt has passed', async () => {
    const prisma = makePrisma([{ id: 'sub_1', organizationId: 'org_1', plan: 'PRO' }]);
    const result = await downgradeExpiredSubscriptions({ prisma });
    expect(result.downgraded).toBe(1);
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      data: { plan: 'FREE', planUpdatedAt: expect.any(Date) },
    });
  });

  it('only queries ACTIVE MONEROO/CHARIOW subscriptions past their grace date', async () => {
    const prisma = makePrisma([]);
    await downgradeExpiredSubscriptions({ prisma });
    expect(prisma.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'ACTIVE',
          provider: { in: ['MONEROO', 'CHARIOW'] },
          graceEndsAt: { lt: expect.any(Date) },
        },
      }),
    );
  });

  it('does not downgrade when the race-guard update matches zero rows (fresh checkout landed first)', async () => {
    const prisma = makePrisma([{ id: 'sub_1', organizationId: 'org_1', plan: 'PRO' }], 0);
    const result = await downgradeExpiredSubscriptions({ prisma });
    expect(result.downgraded).toBe(0);
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  it('returns downgraded:0 when there are no candidates', async () => {
    const prisma = makePrisma([]);
    const result = await downgradeExpiredSubscriptions({ prisma });
    expect(result.downgraded).toBe(0);
  });

  it('processes multiple candidates independently', async () => {
    const prisma = makePrisma([
      { id: 'sub_1', organizationId: 'org_1', plan: 'PRO' },
      { id: 'sub_2', organizationId: 'org_2', plan: 'BUSINESS' },
    ]);
    const result = await downgradeExpiredSubscriptions({ prisma });
    expect(result.downgraded).toBe(2);
    expect(prisma.organization.update).toHaveBeenCalledTimes(2);
  });
});
