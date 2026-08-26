import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { resolveOrganizationForAnonymousIntent } from './anonymous';

const intent = {
  id: 'intent_1',
  email: 'nouveau@garage.test',
  atelierName: 'Garage Ndiaye',
  phone: '+221771234567',
};

beforeEach(() => {
  prismaMock.user.findUnique.mockReset();
  prismaMock.organizationMember.findFirst.mockReset();
  prismaMock.organization.create.mockReset();
  prismaMock.organizationMember.create.mockReset();
  prismaMock.user.create.mockReset();
  prismaMock.verificationCode.create.mockReset();
});

describe('resolveOrganizationForAnonymousIntent', () => {
  it('reuses the existing org when the email already has one', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user_1' } as never);
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      organizationId: 'org_existing',
    } as never);

    const result = await resolveOrganizationForAnonymousIntent(prismaMock, intent);

    expect(result).toEqual({ kind: 'existing_org', organizationId: 'org_existing' });
    expect(prismaMock.organization.create).not.toHaveBeenCalled();
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('creates an org for an existing user who has none yet', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user_1' } as never);
    prismaMock.organizationMember.findFirst.mockResolvedValue(null as never);
    prismaMock.organization.create.mockResolvedValue({ id: 'org_new' } as never);
    prismaMock.organizationMember.create.mockResolvedValue({} as never);

    const result = await resolveOrganizationForAnonymousIntent(prismaMock, intent);

    expect(result).toEqual({ kind: 'new_org_existing_user', organizationId: 'org_new' });
    expect(prismaMock.organization.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Garage Ndiaye',
          phone: '+221771234567',
          ownerId: 'user_1',
        }),
      }),
    );
    expect(prismaMock.organizationMember.create).toHaveBeenCalledWith({
      data: { organizationId: 'org_new', userId: 'user_1', role: 'OWNER' },
    });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.verificationCode.create).not.toHaveBeenCalled();
  });

  it('creates a passwordless user + org + reset code when the email is brand new', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null as never);
    prismaMock.user.create.mockResolvedValue({ id: 'user_new' } as never);
    prismaMock.organization.create.mockResolvedValue({ id: 'org_new' } as never);
    prismaMock.organizationMember.create.mockResolvedValue({} as never);
    prismaMock.verificationCode.create.mockResolvedValue({} as never);

    const result = await resolveOrganizationForAnonymousIntent(prismaMock, intent);

    expect(result.kind).toBe('new_org_new_user');
    expect(result.organizationId).toBe('org_new');
    if (result.kind === 'new_org_new_user') {
      expect(result.resetCode).toMatch(/^[A-Z0-9]{8}$/);
    }
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: { email: 'nouveau@garage.test' },
      select: { id: true },
    });
    expect(prismaMock.verificationCode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user_new', type: 'PASSWORD_RESET' }),
      }),
    );
  });
});
