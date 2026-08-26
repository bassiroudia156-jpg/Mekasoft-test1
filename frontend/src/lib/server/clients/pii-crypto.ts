// Application-layer encryption for optional PII fields on Client (currently
// just `idNumber` — a national ID number, see prisma/schema.prisma).
//
// Mirrors the AES-256-GCM primitive already used for payment provider
// credentials (lib/server/subscriptions/credentials.ts, keyed by the same
// ENCRYPTION_KEY, built on the protected crypto.ts), but degrades instead
// of hard-refusing writes: idNumber is an *optional* field on an otherwise-
// required "create client" flow, so a fork that hasn't configured
// ENCRYPTION_KEY yet must still be able to create clients. Same philosophy
// as "optional providers boot conditionally" in CLAUDE.md (Cloudinary /
// Resend / Redis) — missing config degrades a feature, it never blocks the
// core flow.
//
// 2026-08-24 — added by the security-audit fix pass (control #5:
// idNumber was stored in plaintext).
import { encrypt, decrypt } from '@/lib/server/crypto';
import { log } from '@/lib/server/observability/log';

let warnedMissingKey = false;

function encryptionKey(): string | null {
  return process.env.ENCRYPTION_KEY || null;
}

/** `iv:tag:data`, all base64 — the exact shape crypto.ts's `encrypt()`
 * produces. Used to tell an already-encrypted value apart from a legacy
 * plaintext row (written before this helper existed, or written while
 * ENCRYPTION_KEY was unset) so decryption never has to guess. */
function looksEncrypted(value: string): boolean {
  const parts = value.split(':');
  return parts.length === 3 && parts.every((p) => p.length > 0 && /^[A-Za-z0-9+/]+=*$/.test(p));
}

/** Encrypts a PII value for storage. Falls back to storing the plaintext
 * (with a one-time warning) when ENCRYPTION_KEY isn't configured — never
 * blocks the write; see file header. */
export function encryptPii(plaintext: string): string {
  const key = encryptionKey();
  if (!key) {
    if (!warnedMissingKey) {
      log.warn('ENCRYPTION_KEY not set — storing client PII (idNumber) in plaintext');
      warnedMissingKey = true;
    }
    return plaintext;
  }
  return encrypt(plaintext, key);
}

/** Decrypts a stored PII value. Never throws: a legacy plaintext row, a
 * missing key, or a rotated key all degrade to "return the stored value
 * as-is" rather than a 500 on an unrelated read. */
export function decryptPii(stored: string): string {
  const key = encryptionKey();
  if (!key || !looksEncrypted(stored)) return stored;
  try {
    return decrypt(stored, key);
  } catch (err) {
    log.warn('client PII decrypt failed — returning stored value as-is', {
      error: err instanceof Error ? err.message : String(err),
    });
    return stored;
  }
}
