// lib/server/security/turnstile.ts — security-audit fix (2026-08-24,
// control #12: no anti-bot protection on public forms).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { verifyTurnstileToken } from './turnstile';

const originalSecret = process.env.TURNSTILE_SECRET_KEY;
const originalFetch = global.fetch;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
  else process.env.TURNSTILE_SECRET_KEY = originalSecret;
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('verifyTurnstileToken — TURNSTILE_SECRET_KEY not configured', () => {
  beforeEach(() => {
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  it('is inert — always returns true, even with no token at all', async () => {
    await expect(verifyTurnstileToken(undefined)).resolves.toBe(true);
  });

  it('never calls fetch (no siteverify round-trip) when unconfigured', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    await verifyTurnstileToken('some-token');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('verifyTurnstileToken — TURNSTILE_SECRET_KEY configured', () => {
  beforeEach(() => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
  });

  it('rejects immediately when no token is provided (no network call)', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    await expect(verifyTurnstileToken(undefined)).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns true on a genuine success response from Cloudflare', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    }) as unknown as typeof fetch;
    await expect(verifyTurnstileToken('good-token')).resolves.toBe(true);
  });

  it('returns false on a success:false response (invalid/expired token)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, 'error-codes': ['timeout-or-duplicate'] }),
    }) as unknown as typeof fetch;
    await expect(verifyTurnstileToken('stale-token')).resolves.toBe(false);
  });

  it('fails closed (returns false) on a non-OK HTTP response from Cloudflare', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;
    await expect(verifyTurnstileToken('token')).resolves.toBe(false);
  });

  it('fails closed (returns false) when the network call throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNRESET')) as unknown as typeof fetch;
    await expect(verifyTurnstileToken('token')).resolves.toBe(false);
  });

  it('posts the secret + response as form-encoded body to the siteverify endpoint', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;
    await verifyTurnstileToken('the-token', '203.0.113.4');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({ method: 'POST' }),
    );
    const call = fetchSpy.mock.calls[0] as [string, RequestInit];
    const sentBody = call[1].body as URLSearchParams;
    expect(sentBody.get('secret')).toBe('test-secret');
    expect(sentBody.get('response')).toBe('the-token');
    expect(sentBody.get('remoteip')).toBe('203.0.113.4');
  });
});
