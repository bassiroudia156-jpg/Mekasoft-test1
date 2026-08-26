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
//
// 2026-08-21: BUSINESS restored per explicit user decision (reverting the
// 2026-08-20 "merge into Pro" — see git history on this file for that
// interim state). Back to the original 3-tier FREE/PRO/BUSINESS split, with
// two deliberate deltas from the pre-merge version:
//   - `whatsappShare` dropped entirely from PlanFeatures/PLAN_LIMITS — the
//     wa.me text-share on the invoice page was pulled out at the same time
//     (see app/invoices/[id]/page.tsx) because the user is building a real
//     WhatsApp-send (likely via the Twilio wiring already used for
//     subscription reminders) in a future update and doesn't want the
//     stopgap advertised as a paid differentiator until then.
//   - No struck-through "original" price on PRO/BUSINESS (see
//     PLAN_PRICING below) — same "no fake discount anchor" reasoning that
//     already applied to PRO before this revert.
export const PLANS = ['FREE', 'PRO', 'BUSINESS'] as const;
export type Plan = (typeof PLANS)[number];

export function isPlan(value: string): value is Plan {
  return (PLANS as readonly string[]).includes(value);
}

export interface PlanFeatures {
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
   * the plan has no discount to display. Left null for every plan by
   * default (2026-08-21, see header comment) — the strikethrough UI itself
   * stays fully wired for a *real* discount (an admin-set value here, or a
   * coupon via /api/coupons/validate), just never on by default. */
  originalPriceFcfa: number | null;
}

export const PLAN_PRICING: Record<Plan, PlanPricing> = {
  FREE: { label: 'Gratuit', priceFcfa: 0, originalPriceFcfa: null },
  PRO: { label: 'Pro', priceFcfa: 9_900, originalPriceFcfa: null },
  BUSINESS: { label: 'Business', priceFcfa: 19_900, originalPriceFcfa: null },
};
