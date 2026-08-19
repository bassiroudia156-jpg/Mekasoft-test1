// FAC-YYYY-### sequential reference generator, scoped per organization per
// calendar year (matches Banani's FAC-2025-087 mock data). Same
// low-concurrency retry-once assumption as intervention references.
import 'server-only';

export function formatInvoiceReference(year: number, n: number): string {
  return `FAC-${year}-${String(n).padStart(3, '0')}`;
}

export async function nextInvoiceReference(
  tx: {
    invoice: {
      count: (args: {
        where: { organizationId: string; issueDate: { gte: Date; lt: Date } };
      }) => Promise<number>;
    };
  },
  organizationId: string,
  issueDate: Date,
): Promise<string> {
  const year = issueDate.getFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  const count = await tx.invoice.count({
    where: { organizationId, issueDate: { gte: start, lt: end } },
  });
  return formatInvoiceReference(year, count + 1);
}
