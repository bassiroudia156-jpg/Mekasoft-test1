// Plan-limit enforcement — called from the Client/Vehicle/Intervention/
// team-invite POST routes right after auth, before the mutation. Every
// guard returns a stable error code (`PLAN_LIMIT_*`) the frontend switches
// on to show an upgrade prompt, per CLAUDE.md's ApiError.code convention —
// never a translated message alone.
import 'server-only';
import { prisma } from '@/lib/server/prisma';
import { getPlanLimits } from './limits';

export interface PlanLimitError {
  code:
    | 'PLAN_LIMIT_CLIENTS'
    | 'PLAN_LIMIT_VEHICLES'
    | 'PLAN_LIMIT_INTERVENTIONS_MONTHLY'
    | 'PLAN_LIMIT_USERS';
  limit: number;
  plan: string;
}

async function getOrgPlan(organizationId: string): Promise<string> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { plan: true },
  });
  return org?.plan ?? 'FREE';
}

/** First of the current UTC month — matches the dashboard stats route's own
 * `monthStart` convention (lib/server/... /dashboard/stats route.ts). */
function monthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function checkClientLimit(organizationId: string): Promise<PlanLimitError | null> {
  const plan = await getOrgPlan(organizationId);
  const { maxClients } = getPlanLimits(plan);
  if (maxClients === null) return null;
  const count = await prisma.client.count({ where: { organizationId } });
  if (count >= maxClients) return { code: 'PLAN_LIMIT_CLIENTS', limit: maxClients, plan };
  return null;
}

export async function checkVehicleLimit(organizationId: string): Promise<PlanLimitError | null> {
  const plan = await getOrgPlan(organizationId);
  const { maxVehicles } = getPlanLimits(plan);
  if (maxVehicles === null) return null;
  const count = await prisma.vehicle.count({ where: { organizationId } });
  if (count >= maxVehicles) return { code: 'PLAN_LIMIT_VEHICLES', limit: maxVehicles, plan };
  return null;
}

export async function checkInterventionMonthlyLimit(
  organizationId: string,
): Promise<PlanLimitError | null> {
  const plan = await getOrgPlan(organizationId);
  const { maxInterventionsPerMonth } = getPlanLimits(plan);
  if (maxInterventionsPerMonth === null) return null;
  const count = await prisma.intervention.count({
    where: { organizationId, createdAt: { gte: monthStart() } },
  });
  if (count >= maxInterventionsPerMonth) {
    return { code: 'PLAN_LIMIT_INTERVENTIONS_MONTHLY', limit: maxInterventionsPerMonth, plan };
  }
  return null;
}

/** Counts active members + still-pending invites — an org shouldn't be able
 * to dodge the seat cap by sending 5 pending invites past its limit and
 * having them all land at once. */
export async function checkUserLimit(organizationId: string): Promise<PlanLimitError | null> {
  const plan = await getOrgPlan(organizationId);
  const { maxUsers } = getPlanLimits(plan);
  if (maxUsers === null) return null;
  const [memberCount, pendingInviteCount] = await Promise.all([
    prisma.organizationMember.count({ where: { organizationId } }),
    prisma.organizationInvite.count({ where: { organizationId, status: 'PENDING' } }),
  ]);
  if (memberCount + pendingInviteCount >= maxUsers) {
    return { code: 'PLAN_LIMIT_USERS', limit: maxUsers, plan };
  }
  return null;
}

/** Re-checked at accept time (not just at invite-send time) — an invite can
 * sit PENDING for days, and the org's plan can drop underneath it in the
 * meantime (grace-period expiry, a cancelled Stripe subscription). Excludes
 * `inviteId` from the pending count: that invite already reserved its seat
 * when it was sent (and was allowed to, right up to the cap) — accepting it
 * converts a reservation into a real member without changing the total
 * headcount, so it must NOT double-count against itself. Without the
 * exclusion, any accept on an org sitting exactly at its cap (the normal,
 * expected case — invites are allowed to fill the cap) would be wrongly
 * rejected. This only fires when capacity genuinely shrank since the invite
 * was sent. */
export async function checkUserLimitForInviteAccept(
  organizationId: string,
  inviteId: string,
): Promise<PlanLimitError | null> {
  const plan = await getOrgPlan(organizationId);
  const { maxUsers } = getPlanLimits(plan);
  if (maxUsers === null) return null;
  const [memberCount, otherPendingInviteCount] = await Promise.all([
    prisma.organizationMember.count({ where: { organizationId } }),
    prisma.organizationInvite.count({
      where: { organizationId, status: 'PENDING', id: { not: inviteId } },
    }),
  ]);
  if (memberCount + otherPendingInviteCount >= maxUsers) {
    return { code: 'PLAN_LIMIT_USERS', limit: maxUsers, plan };
  }
  return null;
}
