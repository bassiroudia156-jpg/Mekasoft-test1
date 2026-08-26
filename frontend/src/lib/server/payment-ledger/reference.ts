// PAY-YYYY-### sequential reference generator, scoped per organization per
// calendar year (matches Banani's PAY-2025-024 mock data). Same
// low-concurrency retry-once assumption as intervention/invoice references.
//
// NOT related to `lib/server/payments/` (the Bictorys PaymentProvider
// gateway) — see the Payment model's schema.prisma comment.
import 'server-only';

export function formatPaymentReference(year: number, n: number): string {
  return `PAY-${year}-${String(n).padStart(3, '0')}`;
}

export async function nextPaymentReference(
  tx: {
    payment: {
      count: (args: {
        where: { organizationId: string; paymentDate: { gte: Date; lt: Date } };
      }) => Promise<number>;
    };
  },
  organizationId: string,
  paymentDate: Date,
): Promise<string> {
  const year = paymentDate.getFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  const count = await tx.payment.count({
    where: { organizationId, paymentDate: { gte: start, lt: end } },
  });
  return formatPaymentReference(year, count + 1);
}
