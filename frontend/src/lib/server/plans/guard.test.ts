import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect } from 'vitest';
import {
  checkClientLimit,
  checkVehicleLimit,
  checkInterventionMonthlyLimit,
  checkUserLimit,
  checkUserLimitForInviteAccept,
} from './guard';

const ORG_ID = 'org-1';

describe('plan limit guards', () => {
  describe('checkClientLimit', () => {
    it('returns null (allowed) when under the FREE cap (3)', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({ plan: 'FREE' } as never);
      prismaMock.client.count.mockResolvedValue(2);
      expect(await checkClientLimit(ORG_ID)).toBeNull();
    });

    it('blocks at the FREE cap with PLAN_LIMIT_CLIENTS', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({ plan: 'FREE' } as never);
      prismaMock.client.count.mockResolvedValue(3);
      expect(await checkClientLimit(ORG_ID)).toEqual({
        code: 'PLAN_LIMIT_CLIENTS',
        limit: 3,
        plan: 'FREE',
      });
    });

    it('never blocks on PRO (unlimited clients)', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({ plan: 'PRO' } as never);
      prismaMock.client.count.mockResolvedValue(9_999);
      expect(await checkClientLimit(ORG_ID)).toBeNull();
      expect(prismaMock.client.count).not.toHaveBeenCalled();
    });

    it('never blocks on BUSINESS (unlimited clients)', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({ plan: 'BUSINESS' } as never);
      prismaMock.client.count.mockResolvedValue(9_999);
      expect(await checkClientLimit(ORG_ID)).toBeNull();
      expect(prismaMock.client.count).not.toHaveBeenCalled();
    });

    it('falls back to FREE limits for an unrecognized/legacy plan value', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({ plan: 'LEGACY' } as never);
      prismaMock.client.count.mockResolvedValue(3);
      expect(await checkClientLimit(ORG_ID)).toMatchObject({
        code: 'PLAN_LIMIT_CLIENTS',
        limit: 3,
      });
    });

    it('treats a missing organization as FREE rather than throwing', async () => {
      prismaMock.organization.findUnique.mockResolvedValue(null);
      prismaMock.client.count.mockResolvedValue(3);
      expect(await checkClientLimit(ORG_ID)).toMatchObject({ code: 'PLAN_LIMIT_CLIENTS' });
    });
  });

  describe('checkVehicleLimit', () => {
    it('blocks at the FREE cap (3)', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({ plan: 'FREE' } as never);
      prismaMock.vehicle.count.mockResolvedValue(3);
      expect(await checkVehicleLimit(ORG_ID)).toEqual({
        code: 'PLAN_LIMIT_VEHICLES',
        limit: 3,
        plan: 'FREE',
      });
    });

    it('allows unlimited on PRO', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({ plan: 'PRO' } as never);
      expect(await checkVehicleLimit(ORG_ID)).toBeNull();
    });
  });

  describe('checkInterventionMonthlyLimit', () => {
    it('blocks at the FREE monthly cap (5) and scopes the count to this month', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({ plan: 'FREE' } as never);
      prismaMock.intervention.count.mockResolvedValue(5);
      const result = await checkInterventionMonthlyLimit(ORG_ID);
      expect(result).toEqual({ code: 'PLAN_LIMIT_INTERVENTIONS_MONTHLY', limit: 5, plan: 'FREE' });
      const where = prismaMock.intervention.count.mock.calls[0]![0]!.where as {
        organizationId: string;
        createdAt: { gte: Date };
      };
      expect(where.organizationId).toBe(ORG_ID);
      expect(where.createdAt.gte).toBeInstanceOf(Date);
    });

    it('does not block under the cap', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({ plan: 'FREE' } as never);
      prismaMock.intervention.count.mockResolvedValue(4);
      expect(await checkInterventionMonthlyLimit(ORG_ID)).toBeNull();
    });
  });

  describe('checkUserLimit', () => {
    it('blocks a FREE org (max 1) from inviting a 2nd member', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({ plan: 'FREE' } as never);
      prismaMock.organizationMember.count.mockResolvedValue(1);
      prismaMock.organizationInvite.count.mockResolvedValue(0);
      expect(await checkUserLimit(ORG_ID)).toEqual({
        code: 'PLAN_LIMIT_USERS',
        limit: 1,
        plan: 'FREE',
      });
    });

    it('blocks a PRO org (max 1, same cap as FREE) from inviting a 2nd member', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({ plan: 'PRO' } as never);
      prismaMock.organizationMember.count.mockResolvedValue(1);
      prismaMock.organizationInvite.count.mockResolvedValue(0);
      expect(await checkUserLimit(ORG_ID)).toEqual({
        code: 'PLAN_LIMIT_USERS',
        limit: 1,
        plan: 'PRO',
      });
    });

    it('counts pending invites toward the cap, not just active members (BUSINESS maxUsers=5)', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({ plan: 'BUSINESS' } as never);
      prismaMock.organizationMember.count.mockResolvedValue(3);
      prismaMock.organizationInvite.count.mockResolvedValue(2);
      expect(await checkUserLimit(ORG_ID)).toEqual({
        code: 'PLAN_LIMIT_USERS',
        limit: 5,
        plan: 'BUSINESS',
      });
    });

    it('allows an invite when members + pending invites are under the cap', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({ plan: 'BUSINESS' } as never);
      prismaMock.organizationMember.count.mockResolvedValue(2);
      prismaMock.organizationInvite.count.mockResolvedValue(1);
      expect(await checkUserLimit(ORG_ID)).toBeNull();
    });
  });

  describe('checkUserLimitForInviteAccept', () => {
    const INVITE_ID = 'invite-1';

    it('allows the accept when this invite already reserved the last seat (excludes itself from the pending count)', async () => {
      // BUSINESS maxUsers=5: 4 members + 0 OTHER pending invites — this
      // invite itself is excluded via `id: { not: INVITE_ID }`.
      prismaMock.organization.findUnique.mockResolvedValue({ plan: 'BUSINESS' } as never);
      prismaMock.organizationMember.count.mockResolvedValue(4);
      prismaMock.organizationInvite.count.mockResolvedValue(0);
      expect(await checkUserLimitForInviteAccept(ORG_ID, INVITE_ID)).toBeNull();
      expect(prismaMock.organizationInvite.count).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID, status: 'PENDING', id: { not: INVITE_ID } },
      });
    });

    it('blocks the accept when the org downgraded below its reserved seats since the invite was sent', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({ plan: 'FREE' } as never);
      prismaMock.organizationMember.count.mockResolvedValue(1);
      prismaMock.organizationInvite.count.mockResolvedValue(0);
      expect(await checkUserLimitForInviteAccept(ORG_ID, INVITE_ID)).toEqual({
        code: 'PLAN_LIMIT_USERS',
        limit: 1,
        plan: 'FREE',
      });
    });

    it('still blocks when a DIFFERENT still-pending invite (not this one) already fills the remaining capacity', async () => {
      // BUSINESS maxUsers=5: 4 members + 1 OTHER pending invite = 5 — no
      // room left for THIS accept regardless of self-exclusion.
      prismaMock.organization.findUnique.mockResolvedValue({ plan: 'BUSINESS' } as never);
      prismaMock.organizationMember.count.mockResolvedValue(4);
      prismaMock.organizationInvite.count.mockResolvedValue(1);
      expect(await checkUserLimitForInviteAccept(ORG_ID, INVITE_ID)).toEqual({
        code: 'PLAN_LIMIT_USERS',
        limit: 5,
        plan: 'BUSINESS',
      });
    });
  });
});
