// Find SENT Quote rows whose validUntil has passed and mark them EXPIRED
// in batches — same shape as orders/expire.ts (D-14). DRAFT quotes are
// never candidates (nothing was promised to a client yet); ACCEPTED/
// REJECTED/EXPIRED are already terminal. Idempotent: re-running finds zero
// SENT + expired rows once they're EXPIRED.
import 'server-only';
import type { PrismaClient } from '@prisma/client';

export interface ExpireQuotesOptions {
  prisma: PrismaClient;
  batchSize?: number; // default 100 — D-08
}

export async function expireSentQuotes(opts: ExpireQuotesOptions): Promise<{ expired: number }> {
  const batchSize = opts.batchSize ?? 100;

  const candidates = await opts.prisma.quote.findMany({
    where: { status: 'SENT', validUntil: { lt: new Date() } },
    orderBy: { validUntil: 'asc' },
    take: batchSize,
    select: { id: true },
  });

  if (candidates.length === 0) return { expired: 0 };

  let expired = 0;
  for (const q of candidates) {
    // Per-row tx — the status='SENT' WHERE-guard prevents racing with a
    // client clicking Accept/Reject right as this cron runs.
    const updated = await opts.prisma.$transaction(async (tx) => {
      const u = await tx.quote.updateMany({
        where: { id: q.id, status: 'SENT' },
        data: { status: 'EXPIRED' },
      });
      return u.count > 0;
    });
    if (updated) expired++;
  }
  return { expired };
}
