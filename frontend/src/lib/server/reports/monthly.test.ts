import { describe, it, expect, vi } from 'vitest';
import { buildMonthlyReport } from './monthly';

function makePrisma(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    client: { count: vi.fn().mockResolvedValue(0) },
    vehicle: { count: vi.fn().mockResolvedValue(0) },
    intervention: { count: vi.fn().mockResolvedValue(0) },
    invoice: { count: vi.fn().mockResolvedValue(0) },
    payment: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('buildMonthlyReport', () => {
  it('formats the period label in French for the given month', async () => {
    const prisma = makePrisma();
    const data = await buildMonthlyReport(
      'org_1',
      'Garage Demo',
      new Date(Date.UTC(2026, 7, 15)), // August 2026
      prisma,
    );
    expect(data.periodLabel).toBe('août 2026');
    expect(data.organizationName).toBe('Garage Demo');
  });

  it('sums payment amounts into revenueFcfa', async () => {
    const prisma = makePrisma({
      payment: {
        findMany: vi.fn().mockResolvedValue([
          {
            amount: 15_000,
            client: { type: 'INDIVIDUAL', firstName: 'A', lastName: 'B', companyName: null },
          },
          {
            amount: 25_000,
            client: { type: 'INDIVIDUAL', firstName: 'A', lastName: 'B', companyName: null },
          },
        ]),
      },
    });
    const data = await buildMonthlyReport('org_1', 'Garage', new Date(), prisma);
    expect(data.revenueFcfa).toBe(40_000);
  });

  it('aggregates topClients by client name, sorted descending, capped at 5', async () => {
    const rows = [
      {
        amount: 10_000,
        client: { type: 'INDIVIDUAL', firstName: 'Awa', lastName: 'Ndiaye', companyName: null },
      },
      {
        amount: 50_000,
        client: { type: 'INDIVIDUAL', firstName: 'Moussa', lastName: 'Diallo', companyName: null },
      },
      {
        amount: 5_000,
        client: { type: 'INDIVIDUAL', firstName: 'Awa', lastName: 'Ndiaye', companyName: null },
      },
    ];
    const prisma = makePrisma({ payment: { findMany: vi.fn().mockResolvedValue(rows) } });
    const data = await buildMonthlyReport('org_1', 'Garage', new Date(), prisma);
    expect(data.topClients).toEqual([
      { name: 'Moussa Diallo', revenueFcfa: 50_000 },
      { name: 'Awa Ndiaye', revenueFcfa: 15_000 },
    ]);
  });

  it('COMPANY clients use companyName, not first/last', async () => {
    const rows = [
      {
        amount: 12_000,
        client: {
          type: 'COMPANY',
          firstName: null,
          lastName: null,
          companyName: 'Sénégal Auto SARL',
        },
      },
    ];
    const prisma = makePrisma({ payment: { findMany: vi.fn().mockResolvedValue(rows) } });
    const data = await buildMonthlyReport('org_1', 'Garage', new Date(), prisma);
    expect(data.topClients[0]?.name).toBe('Sénégal Auto SARL');
  });

  it('scopes every count query to the given organizationId and month bounds', async () => {
    const clientCount = vi.fn().mockResolvedValue(2);
    const prisma = makePrisma({ client: { count: clientCount } });
    await buildMonthlyReport('org_42', 'Garage', new Date(Date.UTC(2026, 7, 1)), prisma);
    const where = clientCount.mock.calls[0]![0].where as {
      organizationId: string;
      createdAt: { gte: Date; lt: Date };
    };
    expect(where.organizationId).toBe('org_42');
    expect(where.createdAt.gte.getUTCMonth()).toBe(7); // August
    expect(where.createdAt.lt.getUTCMonth()).toBe(8); // September (exclusive upper bound)
  });

  it('returns zeroed counters and an empty topClients list when the org has no activity', async () => {
    const data = await buildMonthlyReport('org_1', 'Garage', new Date(), makePrisma());
    expect(data.revenueFcfa).toBe(0);
    expect(data.topClients).toEqual([]);
    expect(data.newClients).toBe(0);
  });
});
