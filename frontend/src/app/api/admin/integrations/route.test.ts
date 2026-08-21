// GET /api/admin/integrations — SUPERADMIN-only read-only provider status
// panel. Reports `configured` from env-var PRESENCE only (never leaks a
// value) plus a live Redis PING. Mirrors admin/rate-limits/route.test.ts's
// approach of swapping the `redis` export via a mutable holder.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireSuperadmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));

interface RedisStub {
  ping: ReturnType<typeof vi.fn>;
}
const redisHolder: { current: RedisStub | null } = { current: null };
vi.mock('@/lib/server/redis', () => ({
  get redis() {
    return redisHolder.current;
  },
}));

import { requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { GET } from './route';
import { seedSuperadmin } from '@/test-utils/admin-fixtures';

const mockRequireSuperadmin = vi.mocked(requireSuperadmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const superadminUser = seedSuperadmin({ id: 'superadmin_1', email: 'superadmin@test.local' });
const superadminCtx = {
  user: { sub: superadminUser.id, email: superadminUser.email },
  admin: { id: superadminUser.id, email: superadminUser.email, role: 'SUPERADMIN' as const },
};

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/admin/integrations', { method: 'GET' });
}

const ENV_KEYS = [
  'STRIPE_SECRET_KEY',
  'MONEROO_SECRET_KEY',
  'CHARIOW_API_KEY',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'RESEND_API_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'UPSTASH_REDIS_REST_URL',
  'SENTRY_DSN',
  'NEXT_PUBLIC_SENTRY_DSN',
] as const;
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSuperadmin.mockResolvedValue(superadminCtx);
  mockRateLimit.mockResolvedValue(null);
  redisHolder.current = null;
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe('GET /api/admin/integrations', () => {
  it('reports every provider not configured when no env vars are set, no secret values leaked', async () => {
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      integrations: { id: string; configured: boolean; healthy: boolean | null }[];
    };
    expect(body.integrations).toHaveLength(9);
    expect(body.integrations.every((i) => i.configured === false)).toBe(true);
    // No env value ever appears anywhere in the payload.
    expect(JSON.stringify(body)).not.toContain(process.env.STRIPE_SECRET_KEY ?? '__unset__');
    const upstash = body.integrations.find((i) => i.id === 'upstash-redis');
    expect(upstash?.healthy).toBeNull();
  });

  it('flags stripe/resend as configured once their env vars are set', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_xxx';
    process.env.RESEND_API_KEY = 're_xxx';
    const res = await GET(makeGet());
    const body = (await res.json()) as { integrations: { id: string; configured: boolean }[] };
    expect(body.integrations.find((i) => i.id === 'stripe')?.configured).toBe(true);
    expect(body.integrations.find((i) => i.id === 'resend')?.configured).toBe(true);
    expect(body.integrations.find((i) => i.id === 'moneroo')?.configured).toBe(false);
  });

  it('cloudinary requires BOTH cloud name and API key to count as configured', async () => {
    process.env.CLOUDINARY_CLOUD_NAME = 'demo';
    const res = await GET(makeGet());
    const body = (await res.json()) as { integrations: { id: string; configured: boolean }[] };
    expect(body.integrations.find((i) => i.id === 'cloudinary')?.configured).toBe(false);

    process.env.CLOUDINARY_API_KEY = 'key';
    const res2 = await GET(makeGet());
    const body2 = (await res2.json()) as { integrations: { id: string; configured: boolean }[] };
    expect(body2.integrations.find((i) => i.id === 'cloudinary')?.configured).toBe(true);
  });

  it('pings Redis live and reports healthy: true on success', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
    redisHolder.current = { ping: vi.fn().mockResolvedValue('PONG') };
    const res = await GET(makeGet());
    const body = (await res.json()) as {
      integrations: { id: string; configured: boolean; healthy: boolean | null }[];
    };
    const upstash = body.integrations.find((i) => i.id === 'upstash-redis');
    expect(upstash).toMatchObject({ configured: true, healthy: true });
  });

  it('reports healthy: false when the Redis ping throws', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
    redisHolder.current = { ping: vi.fn().mockRejectedValue(new Error('timeout')) };
    const res = await GET(makeGet());
    const body = (await res.json()) as {
      integrations: { id: string; healthy: boolean | null }[];
    };
    const upstash = body.integrations.find((i) => i.id === 'upstash-redis');
    expect(upstash?.healthy).toBe(false);
  });

  it('rejects a non-SUPERADMIN caller without pinging Redis', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'SUPERADMIN_REQUIRED' }, { status: 403 }),
    );
    redisHolder.current = { ping: vi.fn() };
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
    expect(redisHolder.current.ping).not.toHaveBeenCalled();
  });

  it('propagates 429 from the rate limiter', async () => {
    mockRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(429);
  });
});
