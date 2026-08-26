import { describe, it, expect } from 'vitest';
import { mapChariowStatus, resolveChariowPhone, timingSafeEqualStrings } from './chariow';

describe('mapChariowStatus (Chariow.md §3.3 — order matters)', () => {
  it('maps settle/complete/paid/success to succeeded', () => {
    expect(mapChariowStatus('settled')).toBe('succeeded');
    expect(mapChariowStatus('complete')).toBe('succeeded');
    expect(mapChariowStatus('paid')).toBe('succeeded');
    expect(mapChariowStatus('success')).toBe('succeeded');
  });

  it('maps failed/error to failed', () => {
    expect(mapChariowStatus('failed')).toBe('failed');
    expect(mapChariowStatus('error')).toBe('failed');
  });

  it('maps cancel/abandon/refund to abandoned', () => {
    expect(mapChariowStatus('cancelled')).toBe('abandoned');
    expect(mapChariowStatus('abandoned')).toBe('abandoned');
    expect(mapChariowStatus('refunded')).toBe('abandoned');
  });

  it('THE critical case: "unpaid" must map to pending, NOT succeeded (substring trap)', () => {
    // "unpaid".includes("paid") === true — a naive implementation that
    // tests the "paid" pattern before "unpaid" would credit an unpaid sale.
    // This is the exact incident Chariow.md §3.3 warns about.
    expect(mapChariowStatus('unpaid')).toBe('pending');
  });

  it('maps an unrecognized status to pending (fail-safe default)', () => {
    expect(mapChariowStatus('something_new')).toBe('pending');
  });

  it('is case-insensitive', () => {
    expect(mapChariowStatus('SETTLED')).toBe('succeeded');
    expect(mapChariowStatus('UNPAID')).toBe('pending');
  });
});

describe('resolveChariowPhone', () => {
  it('splits a Senegalese E.164 number into national digits + ISO2', () => {
    const result = resolveChariowPhone('+221771234567');
    expect(result).toEqual({ number: '771234567', country_code: 'SN' });
  });

  it('splits a French E.164 number into national digits + ISO2', () => {
    const result = resolveChariowPhone('+33763627155');
    expect(result).toEqual({ number: '763627155', country_code: 'FR' });
  });

  it('returns null for garbage input', () => {
    expect(resolveChariowPhone('not-a-phone')).toBeNull();
  });
});

describe('timingSafeEqualStrings', () => {
  it('returns true for identical strings', () => {
    expect(timingSafeEqualStrings('secret123', 'secret123')).toBe(true);
  });

  it('returns false for different strings of the same length', () => {
    expect(timingSafeEqualStrings('secret123', 'secret456')).toBe(false);
  });

  it('returns false (not throw) for different-length strings', () => {
    expect(timingSafeEqualStrings('short', 'a-much-longer-secret')).toBe(false);
  });
});
