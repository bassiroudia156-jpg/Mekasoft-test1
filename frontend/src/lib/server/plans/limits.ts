// Freemium plan config (2026-08-18) — single source of truth for what each
// plan includes. The core CRM (clients/vehicles/interventions/invoicing)
// stays usable on every plan; FREE just caps volume. Routes call
// `getPlanLimits(org.plan)` and compare against a live count — never
// hardcode a number outside this file.
//
// No payment collection is wired yet (that's the next phase) — plan
// changes are SUPERADMIN-only for now, see
// app/api/admin/organizations/[id]/plan/route.ts.
//
// Deliberately NOT `import 'server-only'` — pure config/data with no
// secrets or DB access, imported from both server routes (guard.ts) and a
// plain CLI script (scripts/set-org-plan.ts, which runs outside Next's
// bundler and would throw on the server-only guard, same reason
// admin/audit.ts doesn't have one either). Still lives under lib/server/
// by convention (it's the source of truth guard.ts enforces against) — the
// public pricing page keeps its own local copy of the same numbers rather
// than importing across that boundary, matching how it already declared
// its feature-list constants before this change.

export const PLANS = ['FREE', 'PRO', 'BUSINESS'] as const;
export type Plan = (typeof PLANS)[number];

export function isPlan(value: string): value is Plan {
  return (PLANS as readonly string[]).includes(value);
}

export interface PlanFeatures {
  /** "Partager sur WhatsApp" on invoices/devis. */
  whatsappShare: boolean;
  /** Garage logo rendered on invoice PDFs (org.logoUrl). */
  invoiceBranding: boolean;
  /** Monthly PDF activity report. */
  monthlyReport: boolean;
  /** CSV data export (clients/vehicles/interventions/invoices/payments). */
  dataExport: boolean;
  /** Per-member roles (ADMIN vs MEMBER) actually matter — moot below
   * BUSINESS since those plans are capped at 1 user anyway. */
  rolesAndPermissions: boolean;
}

export interface PlanLimits {
  /** `null` = unlimited. */
  maxClients: number | null;
  maxVehicles: number | null;
  maxInterventionsPerMonth: number | null;
  maxUsers: number | null;
  features: PlanFeatures;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: {
    maxClients: 3,
    maxVehicles: 3,
    maxInterventionsPerMonth: 5,
    maxUsers: 1,
    features: {
      whatsappShare: false,
      invoiceBranding: false,
      monthlyReport: false,
      dataExport: false,
      rolesAndPermissions: false,
    },
  },
  PRO: {
    maxClients: null,
    maxVehicles: null,
    maxInterventionsPerMonth: null,
    maxUsers: 1,
    features: {
      whatsappShare: true,
      invoiceBranding: true,
      monthlyReport: false,
      dataExport: false,
      rolesAndPermissions: false,
    },
  },
  BUSINESS: {
    maxClients: null,
    maxVehicles: null,
    maxInterventionsPerMonth: null,
    maxUsers: 5,
    features: {
      whatsappShare: true,
      invoiceBranding: true,
      monthlyReport: true,
      dataExport: true,
      rolesAndPermissions: true,
    },
  },
};

/** Falls back to FREE for any unrecognized/legacy value rather than
 * throwing — a bad `plan` string should degrade to the safest tier, never
 * to unlimited. */
export function getPlanLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[isPlan(plan) ? plan : 'FREE'];
}

export interface PlanPricing {
  label: string;
  /** FCFA/month. 0 for FREE. */
  priceFcfa: number;
  /** Struck-through "before" price shown next to `priceFcfa`, or null when
   * the plan has no discount to display (FREE). */
  originalPriceFcfa: number | null;
}

export const PLAN_PRICING: Record<Plan, PlanPricing> = {
  FREE: { label: 'Gratuit', priceFcfa: 0, originalPriceFcfa: null },
  PRO: { label: 'Pro', priceFcfa: 9_900, originalPriceFcfa: 12_000 },
  BUSINESS: { label: 'Business', priceFcfa: 19_900, originalPriceFcfa: 25_000 },
};
