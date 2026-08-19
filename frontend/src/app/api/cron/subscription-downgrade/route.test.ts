import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/subscriptions/downgrade', () => ({
  downgradeExpiredSubscriptions: vi.fn(),
}));

import { downgradeExpiredSubscriptions } from '@/lib/server/subscriptions/downgrade';
import { POST } from './route';

const mockDowngrade = vi.mocked(downgradeExpiredSubscriptions);

function makeReq(secret?: string): NextRequest {
  return new NextRequest('http://test/api/cron/subscription-downgrade', {
    method: 'POST',
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'test-cron-secret');
  vi.clearAllMocks();
  mockDowngrade.mockResolvedValue({ downgraded: 3 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/cron/subscription-downgrade', () => {
  it('401s without a valid CRON_SECRET bearer token', async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect(mockDowngrade).not.toHaveBeenCalled();
  });

  it('runs downgradeExpiredSubscriptions and returns the count', async () => {
    const res = await POST(makeReq('test-cron-secret'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; downgraded: number };
    expect(body.ok).toBe(true);
    expect(body.downgraded).toBe(3);
  });

  it('exports runtime=nodejs and dynamic=force-dynamic', async () => {
    const mod = (await import('./route')) as { runtime?: string; dynamic?: string };
    expect(mod.runtime).toBe('nodejs');
    expect(mod.dynamic).toBe('force-dynamic');
  });
});
