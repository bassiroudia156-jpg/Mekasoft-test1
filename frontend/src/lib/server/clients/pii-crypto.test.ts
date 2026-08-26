// lib/server/clients/pii-crypto.ts — security-audit fix (2026-08-24,
// control #5): Client.idNumber must not be stored in plaintext when a key
// is configured, and must never block client creation when it isn't.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateKey, decrypt } from '@/lib/server/crypto';
import { log } from '@/lib/server/observability/log';
import { encryptPii, decryptPii } from './pii-crypto';

const TEST_KEY = generateKey();
const originalKey = process.env.ENCRYPTION_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = originalKey;
  vi.restoreAllMocks();
});

describe('encryptPii / decryptPii — key configured', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  it('encrypts to the iv:tag:data shape, not the plaintext', () => {
    const stored = encryptPii('1234567890123');
    expect(stored).not.toBe('1234567890123');
    expect(stored.split(':')).toHaveLength(3);
  });

  it('round-trips through decryptPii', () => {
    const stored = encryptPii('CNI-SN-00219944');
    expect(decryptPii(stored)).toBe('CNI-SN-00219944');
  });

  it('is genuinely decryptable with the raw crypto.ts primitive (not a lookalike encoding)', () => {
    const stored = encryptPii('1234567890123');
    expect(decrypt(stored, TEST_KEY)).toBe('1234567890123');
  });

  it('decryptPii treats a pre-encryption legacy plaintext row as-is (no colons → not "encrypted-shaped")', () => {
    expect(decryptPii('LEGACY-PLAINTEXT-ID-99')).toBe('LEGACY-PLAINTEXT-ID-99');
  });

  it('decryptPii degrades to the stored value on a corrupted/foreign ciphertext instead of throwing', () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => undefined);
    const bogus = 'YWJj:ZGVm:Z2hp'; // well-formed shape, wrong tag/key → decrypt fails
    expect(() => decryptPii(bogus)).not.toThrow();
    expect(decryptPii(bogus)).toBe(bogus);
    expect(warn).toHaveBeenCalled();
  });
});

describe('encryptPii / decryptPii — ENCRYPTION_KEY not configured', () => {
  beforeEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it('encryptPii falls back to plaintext instead of throwing or blocking the write', () => {
    expect(encryptPii('1234567890123')).toBe('1234567890123');
  });

  it('decryptPii returns the stored plaintext unchanged', () => {
    expect(decryptPii('1234567890123')).toBe('1234567890123');
  });

  it('warns once via the shared logger, not per-call spam', () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => undefined);
    encryptPii('a');
    encryptPii('b');
    encryptPii('c');
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
