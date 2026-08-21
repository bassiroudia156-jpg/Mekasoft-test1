import { describe, it, expect } from 'vitest';
import { getPlanLimits, isPlan, PLAN_LIMITS, PLAN_PRICING } from './limits';

describe('plans/limits', () => {
  it('isPlan recognizes exactly FREE/PRO — BUSINESS retired 2026-08-20', () => {
    expect(isPlan('FREE')).toBe(true);
    expect(isPlan('PRO')).toBe(true);
    expect(isPlan('BUSINESS')).toBe(false);
    expect(isPlan('ENTERPRISE')).toBe(false);
    expect(isPlan('')).toBe(false);
  });

  it('getPlanLimits falls back to FREE for an unrecognized value (including a stray legacy BUSINESS)', () => {
    expect(getPlanLimits('NOT_A_PLAN')).toBe(PLAN_LIMITS.FREE);
    expect(getPlanLimits('BUSINESS')).toBe(PLAN_LIMITS.FREE);
  });

  it('getPlanLimits returns the matching plan for valid values', () => {
    expect(getPlanLimits('PRO')).toBe(PLAN_LIMITS.PRO);
  });

  it('FREE has finite caps on every volume limit', () => {
    expect(PLAN_LIMITS.FREE.maxClients).toBe(3);
    expect(PLAN_LIMITS.FREE.maxVehicles).toBe(3);
    expect(PLAN_LIMITS.FREE.maxInterventionsPerMonth).toBe(5);
    expect(PLAN_LIMITS.FREE.maxUsers).toBe(1);
  });

  it('PRO/"Premium" unlocks every feature flag and a 5-user cap (merged in from the retired BUSINESS tier)', () => {
    expect(Object.values(PLAN_LIMITS.PRO.features).every(Boolean)).toBe(true);
    expect(PLAN_LIMITS.PRO.maxUsers).toBe(5);
    expect(PLAN_LIMITS.PRO.maxClients).toBeNull();
    expect(PLAN_LIMITS.PRO.maxVehicles).toBeNull();
    expect(PLAN_LIMITS.PRO.maxInterventionsPerMonth).toBeNull();
  });

  it('FREE unlocks no premium feature flag', () => {
    expect(Object.values(PLAN_LIMITS.FREE.features).every((v) => v === false)).toBe(true);
  });

  it('pricing: PRO shows the "Premium" display label, neither plan has a fake struck-through price', () => {
    // 2026-08-21: the permanent "12 000 → 9 900" anchor was removed per user
    // request — a struck-through price should only ever come from a real
    // admin discount (PlanPricing DB override) or an applied coupon, never
    // as a default.
    expect(PLAN_PRICING.FREE.originalPriceFcfa).toBeNull();
    expect(PLAN_PRICING.PRO.originalPriceFcfa).toBeNull();
    expect(PLAN_PRICING.PRO.label).toBe('Premium');
  });
});
