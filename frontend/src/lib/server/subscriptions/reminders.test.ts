import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendSubscriptionReminders } from './reminders';

const mockEnqueue = vi.fn().mockResolvedValue('job_1');
const mockWhatsAppSend = vi.fn().mockResolvedValue({ sid: 'SM1' });

vi.mock('../queues/email-queue-singleton', () => ({
  getEmailQueue: vi.fn(() => ({ enqueue: mockEnqueue })),
}));
vi.mock('./whatsapp', () => ({
  getWhatsAppClient: vi.fn(() => null), // default: WhatsApp not configured
}));

import { getEmailQueue } from '../queues/email-queue-singleton';
import { getWhatsAppClient } from './whatsapp';

function makeSub(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sub_1',
    organizationId: 'org_1',
    plan: 'PRO',
    provider: 'MONEROO',
    remindersSent: 0,
    currentPeriodEnd: new Date('2026-08-26T00:00:00Z'), // 7 days from "now" below
    organization: {
      name: 'Garage Demo',
      phone: '+221771234567',
      contactEmail: null,
      owner: { email: 'owner@test.local' },
    },
    ...overrides,
  };
}

function makePrisma(subs: ReturnType<typeof makeSub>[]) {
  return {
    subscription: {
      findMany: vi.fn().mockResolvedValue(subs),
      update: vi.fn().mockResolvedValue({}),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-19T00:00:00Z'));
  vi.stubEnv('SUBSCRIPTION_REMINDER_DAYS_BEFORE', '7,3,1');
  vi.clearAllMocks();
  vi.mocked(getEmailQueue).mockReturnValue({ enqueue: mockEnqueue } as never);
  vi.mocked(getWhatsAppClient).mockReturnValue(null);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('sendSubscriptionReminders', () => {
  it('sends the J-7 email for a subscription exactly 7 days from expiry, remindersSent 0→1', async () => {
    const prisma = makePrisma([makeSub()]);
    const result = await sendSubscriptionReminders({ prisma });
    expect(result.emailsSent).toBe(1);
    expect(mockEnqueue).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@test.local' }));
    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub_1' },
      data: { remindersSent: { increment: 1 }, lastReminderSentAt: expect.any(Date) },
    });
  });

  it('skips a subscription that already got its J-7 reminder and is not yet at J-3', async () => {
    const prisma = makePrisma([
      makeSub({ remindersSent: 1, currentPeriodEnd: new Date('2026-08-24T00:00:00Z') }), // 5 days out
    ]);
    const result = await sendSubscriptionReminders({ prisma });
    expect(result.emailsSent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it('sends the J-3 reminder once the subscription crosses that threshold', async () => {
    const prisma = makePrisma([
      makeSub({ remindersSent: 1, currentPeriodEnd: new Date('2026-08-22T00:00:00Z') }), // 3 days out
    ]);
    const result = await sendSubscriptionReminders({ prisma });
    expect(result.emailsSent).toBe(1);
    expect(prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { remindersSent: { increment: 1 }, lastReminderSentAt: expect.any(Date) },
      }),
    );
  });

  it('never sends once all configured tiers are exhausted (remindersSent >= tiers.length)', async () => {
    const prisma = makePrisma([
      makeSub({ remindersSent: 3, currentPeriodEnd: new Date('2026-08-19T12:00:00Z') }),
    ]);
    // The findMany mock itself is what the WHERE clause would filter in
    // production (remindersSent < tiers.length) — assert the function
    // still no-ops defensively even if a stale row slipped through.
    const result = await sendSubscriptionReminders({ prisma });
    expect(result.emailsSent).toBe(0);
  });

  it('skips a subscription that already lapsed (daysUntilExpiry < 0) — that is downgrade.ts’s job', async () => {
    const prisma = makePrisma([
      makeSub({ currentPeriodEnd: new Date('2026-08-10T00:00:00Z') }), // in the past
    ]);
    const result = await sendSubscriptionReminders({ prisma });
    expect(result.emailsSent).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('also sends WhatsApp when configured and the org has a phone', async () => {
    vi.mocked(getWhatsAppClient).mockReturnValue({ send: mockWhatsAppSend });
    const prisma = makePrisma([makeSub()]);
    const result = await sendSubscriptionReminders({ prisma });
    expect(result.whatsappSent).toBe(1);
    expect(mockWhatsAppSend).toHaveBeenCalledWith(
      '+221771234567',
      expect.stringContaining('MekaSoft'),
    );
  });

  it('a failed WhatsApp send does not block the email path or the remindersSent bump', async () => {
    vi.mocked(getWhatsAppClient).mockReturnValue({
      send: vi.fn().mockRejectedValue(new Error('twilio down')),
    });
    const prisma = makePrisma([makeSub()]);
    const result = await sendSubscriptionReminders({ prisma });
    expect(result.emailsSent).toBe(1);
    expect(result.whatsappSent).toBe(0);
    expect(prisma.subscription.update).toHaveBeenCalled();
  });

  it('never targets STRIPE subscriptions (query narrows to MONEROO/CHARIOW only)', async () => {
    const prisma = makePrisma([]);
    await sendSubscriptionReminders({ prisma });
    expect(prisma.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ provider: { in: ['MONEROO', 'CHARIOW'] } }),
      }),
    );
  });
});
