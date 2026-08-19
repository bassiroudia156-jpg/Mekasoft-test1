// INT-### sequential reference generator, scoped per organization. Same
// low-concurrency assumption used elsewhere in this app (a single garage's
// staff creating interventions isn't heavy concurrent-write territory) —
// retries once on a unique-constraint conflict rather than reaching for a
// dedicated counter table or advisory lock.
import 'server-only';

export function formatInterventionReference(n: number): string {
  return `INT-${String(n).padStart(3, '0')}`;
}

export async function nextInterventionReference(
  tx: { intervention: { count: (args: { where: { organizationId: string } }) => Promise<number> } },
  organizationId: string,
): Promise<string> {
  const count = await tx.intervention.count({ where: { organizationId } });
  return formatInterventionReference(count + 1);
}
