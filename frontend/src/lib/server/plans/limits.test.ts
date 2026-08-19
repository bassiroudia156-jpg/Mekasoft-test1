import { describe, it, expect } from 'vitest';
import { getPlanLimits, isPlan, PLAN_LIMITS, PLAN_PRICING } from './limits';

describe('plans/limits', () => {
  it('isPlan recognizes exactly FREE/PRO/BUSINESS', () => {
    expect(isPlan('FREE')).toBe(true);
    expect(isPlan('PRO')).toBe(true);
    expect(isPlan('BUSINESS')).toBe(true);
    expect(isPlan('ENTERPRISE')).toBe(false);
    expect(isPlan('')).toBe(false);
  });

  it('getPlanLimits falls back to FREE for an unrecognized value', () => {
    expect(getPlanLimits('NOT_A_PLAN')).toBe(PLAN_LIMITS.FREE);
  });

  it('getPlanLimits returns the matching plan for valid values', () => {
    expect(getPlanLimits('PRO')).toBe(PLAN_LIMITS.PRO);
    expect(getPlanLimits('BUSINESS')).toBe(PLAN_LIMITS.BUSINESS);
  });

  it('FREE has finite caps on every volume limit', () => {
    expect(PLAN_LIMITS.FREE.maxClients).toBe(3);
    expect(PLAN_LIMITS.FREE.maxVehicles).toBe(3);
    expect(PLAN_LIMITS.FREE.maxInterventionsPerMonth).toBe(5);
    expect(PLAN_LIMITS.FREE.maxUsers).toBe(1);
  });

  it('BUSINESS unlocks every feature flag', () => {
    expect(Object.values(PLAN_LIMITS.BUSINESS.features).every(Boolean)).toBe(true);
  });

  it('FREE unlocks no premium feature flag', () => {
    expect(Object.values(PLAN_LIMITS.FREE.features).every((v) => v === false)).toBe(true);
  });

  it('pricing: PRO and BUSINESS both show a struck-through original price, FREE does not', () => {
    expect(PLAN_PRICING.FREE.originalPriceFcfa).toBeNull();
    expect(PLAN_PRICING.PRO.originalPriceFcfa).toBeGreaterThan(PLAN_PRICING.PRO.priceFcfa);
    expect(PLAN_PRICING.BUSINESS.originalPriceFcfa).toBeGreaterThan(
      PLAN_PRICING.BUSINESS.priceFcfa,
    );
  });
});
