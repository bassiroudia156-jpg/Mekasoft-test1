// DEV-YYYY-### sequential reference generator, scoped per organization per
// calendar year — identical shape to invoices/reference.ts (FAC-YYYY-###)
// and payment-ledger/reference.ts (PAY-YYYY-###). Same low-concurrency
// retry-once assumption as those two.
import 'server-only';

export function formatQuoteReference(year: number, n: number): string {
  return `DEV-${year}-${String(n).padStart(3, '0')}`;
}

export async function nextQuoteReference(
  tx: {
    quote: {
      count: (args: {
        where: { organizationId: string; createdAt: { gte: Date; lt: Date } };
      }) => Promise<number>;
    };
  },
  organizationId: string,
  createdAt: Date,
): Promise<string> {
  const year = createdAt.getFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  const count = await tx.quote.count({
    where: { organizationId, createdAt: { gte: start, lt: end } },
  });
  return formatQuoteReference(year, count + 1);
}
