// CLI convenience for changing an org's plan without a running admin UI —
// there isn't one yet (examples/frontend-pages/admin/* are unwired
// references, see CLAUDE.md "headless on purpose"). Same effect as
// PATCH /api/admin/organizations/[id]/plan, minus the HTTP round-trip.
// Usage: pnpm exec tsx scripts/set-org-plan.ts <org-slug> <FREE|PRO|BUSINESS>
//
// Mirrors make-superadmin.ts's shape: idempotent, atomic update + audit
// row in one $transaction, self-attributed actorId (CLI = shell access
// already implies SUPERADMIN-equivalent trust, same accepted threat model
// as BOOTSTRAP_SUPERADMIN).

import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { logAdminAction } from '../src/lib/server/admin/audit';
import { isPlan, PLANS } from '../src/lib/server/plans/limits';

let prismaClient: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prismaClient) prismaClient = new PrismaClient();
  return prismaClient;
}

interface RunDeps {
  prisma?: Pick<PrismaClient, 'organization' | 'user' | '$transaction' | '$disconnect'>;
}

export async function main(
  args: string[] = process.argv.slice(2),
  deps: RunDeps = {},
): Promise<number> {
  const [slug, planArg] = args;
  if (!slug || !planArg || !isPlan(planArg)) {
    console.error(`Usage: pnpm exec tsx scripts/set-org-plan.ts <org-slug> <${PLANS.join('|')}>`);
    return 1;
  }
  const plan = planArg;

  const prisma = deps.prisma ?? getPrisma();
  try {
    const org = await prisma.organization.findUnique({ where: { slug } });
    if (!org) {
      console.error(`Error: no organization with slug "${slug}".`);
      return 1;
    }
    if (org.plan === plan) {
      console.log(`${org.name} (${slug}) is already on ${plan} — no-op.`);
      return 0;
    }

    // Self-attributed: there's no HTTP-authenticated SUPERADMIN caller in a
    // CLI context, so the org's own owner is logged as the actor — same
    // convention as BOOTSTRAP_SUPERADMIN in make-superadmin.ts.
    const previousPlan = org.plan;
    await prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: org.id },
        data: { plan, planUpdatedAt: new Date() },
      });
      await logAdminAction(tx, {
        actorId: org.ownerId,
        action: 'organization.plan_change',
        targetType: 'Organization',
        targetId: org.id,
        metadata: { from: previousPlan, to: plan, via: 'cli-script' },
      });
    });

    console.log(`✓ ${org.name} (${slug}): ${previousPlan} → ${plan}`);
    return 0;
  } finally {
    if (!deps.prisma && prismaClient) {
      await prismaClient.$disconnect();
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
