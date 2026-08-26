// Cloudflare Turnstile server-side verification (control #12 — anti-bot on
// public forms). Optional provider, same "boots conditionally" philosophy
// as Cloudinary/Resend/Bictorys (see CLAUDE.md): without TURNSTILE_SECRET_KEY
// configured, verification is skipped entirely and the caller degrades to
// "not enforced" rather than blocking signups — the app must keep working
// for forks that haven't set this up yet.
//
// 2026-08-24 — added by the security-audit fix pass (control #12: no
// anti-bot protection existed on POST /api/auth/signup).
import { log } from '@/lib/server/observability/log';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

interface TurnstileSiteverifyResponse {
  success: boolean;
  'error-codes'?: string[];
}

/**
 * Verifies a Turnstile token server-side.
 *
 * Returns `true` (allow the request through) when:
 *   - TURNSTILE_SECRET_KEY isn't configured (inert — logs a one-time warning), or
 *   - the token is genuinely valid per Cloudflare's siteverify response.
 *
 * Returns `false` (reject) when a secret key IS configured and the token is
 * missing, invalid, expired, or the siteverify call itself fails — a network
 * hiccup to Cloudflare should not silently wave bots through once an
 * operator has explicitly turned this on.
 */
let warnedMissingKey = false;

export async function verifyTurnstileToken(
  token: string | undefined,
  remoteIp?: string,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (!warnedMissingKey) {
      log.warn('TURNSTILE_SECRET_KEY not set — anti-bot check skipped on public forms');
      warnedMissingKey = true;
    }
    return true;
  }

  if (!token) return false;

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);

    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      log.warn('turnstile siteverify HTTP error', { status: res.status });
      return false;
    }
    const data = (await res.json()) as TurnstileSiteverifyResponse;
    return data.success === true;
  } catch (err) {
    log.warn('turnstile siteverify call failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
