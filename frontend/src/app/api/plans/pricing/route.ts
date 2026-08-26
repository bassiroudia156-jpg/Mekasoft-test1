// GET /api/plans/pricing — public, read-only live pricing for all plans.
//
// Audit fix (2026-08-21): lib/server/plans/pricing.ts's own file comment
// (and admin/pricing/page.tsx's header comment) both claim that changing a
// price via /admin/pricing "immediately affects what /subscriptions/plans,
// the landing page, and new checkouts show" — true only for the actual
// charge amount (checkout routes already call getPlanPricing()). The
// client-rendered pricing surfaces (/subscriptions/plans,
// /subscriptions/checkout, UpgradeSubscriptionModal) all hardcoded a
// static local copy of PLAN_PRICING instead, so an admin override
// silently diverged from what customers were actually shown — a
// "price shown != price charged" gap. This route is the public read path
// those client components now fetch instead of the hardcoded copy (the
// landing page is a Server Component and calls getPlanPricing() directly
// — no client fetch needed there).
//
// No auth, no CSRF (read-only GET) — pricing is public marketing
// information, same trust level as the landing page itself and
// GET /api/subscriptions/anonymous-checkout's availableProviders.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse } from 'next/server';
import { getAllPlanPricing } from '@/lib/server/plans/pricing';

export async function GET(): Promise<NextResponse> {
  const pricing = await getAllPlanPricing();
  return NextResponse.json(
    { pricing },
    { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } },
  );
}
