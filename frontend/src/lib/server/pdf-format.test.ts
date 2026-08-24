// Regression coverage for the 2026-08-24 receipt-PDF bug: "39 000" was
// rendering as "39/000" inside every @react-pdf/renderer document because
// toLocaleString('fr-FR') groups with U+202F, a character react-pdf's base
// Helvetica font can't display. Pins that groupThousands() never produces
// that character, only a plain ASCII space (U+0020).
import { describe, it, expect } from 'vitest';
import { groupThousands, formatMoneyForPdf } from './pdf-format';

// Written as an explicit escape (not a literal character) so there's no
// ambiguity in source between this and a plain space.
const NARROW_NO_BREAK_SPACE = ' ';

describe('groupThousands', () => {
  it('groups thousands with a plain ASCII space, not U+202F', () => {
    expect(groupThousands(39_000)).toBe('39 000');
    expect(groupThousands(39_000)).not.toContain(NARROW_NO_BREAK_SPACE);
  });

  it('handles multi-group numbers', () => {
    expect(groupThousands(1_234_567)).toBe('1 234 567');
  });

  it('leaves numbers under 1000 ungrouped', () => {
    expect(groupThousands(999)).toBe('999');
    expect(groupThousands(0)).toBe('0');
  });

  it('rounds non-integer input (money values are always integers, but defends anyway)', () => {
    expect(groupThousands(39_000.6)).toBe('39 001');
  });

  it('keeps the sign on negative numbers, groups the magnitude', () => {
    expect(groupThousands(-5_000)).toBe('-5 000');
  });
});

describe('formatMoneyForPdf', () => {
  it('defaults the currency suffix to FCFA', () => {
    expect(formatMoneyForPdf(39_000)).toBe('39 000 FCFA');
  });

  it('accepts a custom currency label', () => {
    expect(formatMoneyForPdf(12_500, 'XOF')).toBe('12 500 XOF');
  });
});
