import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/subscriptions/reminders', () => ({
  sendSubscriptionReminders: vi.fn(),
}));

import { sendSubscriptionReminders } from '@/lib/server/subscriptions/reminders';
import { POST } from './route';

const mockSend = vi.mocked(sendSubscriptionReminders);

function makeReq(secret?: string): NextRequest {
  return new NextRequest('http://test/api/cron/subscription-reminders', {
    method: 'POST',
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'test-cron-secret');
  vi.clearAllMocks();
  mockSend.mockResolvedValue({ candidates: 2, emailsSent: 2, whatsappSent: 1, skipped: 0 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/cron/subscription-reminders', () => {
  it('401s without a valid CRON_SECRET bearer token', async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('runs sendSubscriptionReminders and returns its counters', async () => {
    const res = await POST(makeReq('test-cron-secret'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; candidates: number; emailsSent: number };
    expect(body.ok).toBe(true);
    expect(body.candidates).toBe(2);
    expect(body.emailsSent).toBe(2);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('exports runtime=nodejs and dynamic=force-dynamic', async () => {
    const mod = (await import('./route')) as { runtime?: string; dynamic?: string };
    expect(mod.runtime).toBe('nodejs');
    expect(mod.dynamic).toBe('force-dynamic');
  });
});
