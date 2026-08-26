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

  it('PRO has unlimited volume but stays capped at 1 user and no BUSINESS-only features', () => {
    expect(PLAN_LIMITS.PRO.maxClients).toBeNull();
    expect(PLAN_LIMITS.PRO.maxVehicles).toBeNull();
    expect(PLAN_LIMITS.PRO.maxInterventionsPerMonth).toBeNull();
    expect(PLAN_LIMITS.PRO.maxUsers).toBe(1);
    expect(PLAN_LIMITS.PRO.features.monthlyReport).toBe(false);
    expect(PLAN_LIMITS.PRO.features.dataExport).toBe(false);
    expect(PLAN_LIMITS.PRO.features.rolesAndPermissions).toBe(false);
    expect(PLAN_LIMITS.PRO.features.invoiceBranding).toBe(true);
  });

  it('BUSINESS unlocks every feature flag and a 5-user cap', () => {
    expect(Object.values(PLAN_LIMITS.BUSINESS.features).every(Boolean)).toBe(true);
    expect(PLAN_LIMITS.BUSINESS.maxUsers).toBe(5);
    expect(PLAN_LIMITS.BUSINESS.maxClients).toBeNull();
    expect(PLAN_LIMITS.BUSINESS.maxVehicles).toBeNull();
    expect(PLAN_LIMITS.BUSINESS.maxInterventionsPerMonth).toBeNull();
  });

  it('FREE unlocks no premium feature flag', () => {
    expect(Object.values(PLAN_LIMITS.FREE.features).every((v) => v === false)).toBe(true);
  });

  it('PlanFeatures no longer includes whatsappShare (2026-08-21 — pulled pending a real send implementation)', () => {
    expect(PLAN_LIMITS.PRO.features).not.toHaveProperty('whatsappShare');
    expect(PLAN_LIMITS.BUSINESS.features).not.toHaveProperty('whatsappShare');
  });

  it('pricing: labels are Gratuit/Pro/Business, no plan has a struck-through price by default', () => {
    // 2026-08-21: no plan ships a permanent fake "before" price — a
    // strikethrough should only ever come from a real admin discount
    // (PlanPricing DB override) or an applied coupon, never as a default.
    expect(PLAN_PRICING.FREE.originalPriceFcfa).toBeNull();
    expect(PLAN_PRICING.PRO.originalPriceFcfa).toBeNull();
    expect(PLAN_PRICING.BUSINESS.originalPriceFcfa).toBeNull();
    expect(PLAN_PRICING.PRO.label).toBe('Pro');
    expect(PLAN_PRICING.BUSINESS.label).toBe('Business');
    expect(PLAN_PRICING.BUSINESS.priceFcfa).toBeGreaterThan(PLAN_PRICING.PRO.priceFcfa);
  });
});
