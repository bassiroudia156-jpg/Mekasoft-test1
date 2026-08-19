# Subscription Plans Page — Banani → Next.js/Tailwind

## Source
- Banani screen ID: `83o75a2tYyMD/screens/UpgradePlansPage.jsx` ("Upgrade Plans Page" — 3-tier pricing grid + FAQ)
- Fetched: 2026-08-19

## System map
- NEW route: `frontend/src/app/subscriptions/plans/page.tsx` (auth-gated, `useUser()`).
- Data: `GET /api/organizations` (current `org.plan`) + `GET /api/subscriptions` (`availableProviders`).
- Mutation: none directly — opens `UpgradeSubscriptionModal` (already builds/posts `POST /api/subscriptions/checkout`).
- Entry point: Settings page's upgrade banner ("Voir les forfaits").
- Exit: back to `/settings`; checkout redirects off-site to the provider, then to `/subscriptions/return`.

## Real-data substitution (per user decision)
Banani's mock ships 3 fictional tiers (Basique 29 / Professionnel 79 / Entreprise 199 FCFA) with placeholder features and a FAQ claiming a 14-day free trial. None of that matches this app's real freemium model. Substituting:
- Card 1 (was "Basique") → **Gratuit**, `PLAN_PRICING.FREE` (0 FCFA), `FREE_FEATURES` (mirrors landing page's local copy: 3 clients/3 véhicules/5 interventions per month/devis+factures/suivi paiements). No action button — nothing to buy, informational only.
- Card 2 (was "Professionnel", "Populaire" badge) → **Pro**, `PLAN_PRICING.PRO` (9 900 FCFA, struck ~~12 000~~), `PRO_FEATURES`. Keeps the "Populaire" badge + `border-primary` highlight — Pro genuinely is the recommended middle tier.
- Card 3 (was "Entreprise") → **Business**, `PLAN_PRICING.BUSINESS` (19 900 FCFA, struck ~~25 000~~), `BUSINESS_FEATURES`.
- Current plan gets a "Plan actuel" badge instead of an action button (Banani's mock has no concept of "already on this plan").
- Paid-plan buttons ("Choisir Pro" / "Choisir Business") open the existing `UpgradeSubscriptionModal` pre-set via `defaultPlan` — NOT a rebuilt per-card provider picker. The modal already handles plan×provider selection, checkout POST, and redirect; duplicating that inline would fork logic that's already tested.
- FAQ: replaced with real content (user-confirmed) — reuses the landing page's free-tier answer plus 2 new subscription-specific entries (mobile money can't auto-renew → relance emails/WhatsApp + 3-day grace before downgrade; cancellation is instant for Stripe via the portal, manual "just don't renew" for Moneroo/Chariow).

## Component reuse
- REUSE `Sidebar`, `PageHeader`, `Icon`, `Button`, `UpgradeSubscriptionModal`.
- NEW: the page itself only — no new primitives needed, the 3-card grid is page-specific markup (not repeated elsewhere yet — below rule-of-three, stays inline).

## Token mapping
Same `@theme` tokens as the rest of the app (Banani's `sharedFiles/style.css` in this fetch is identical to what's already in `globals.css` — Phase 0 already adopted this exact palette/font). No new mapping needed.

## Responsive plan
- Base (375px): single column stack, full-width cards, plan price + FCFA/mois on its own line (same wrap-avoidance fix already applied to the landing page's pricing cards).
- md (768px+): `grid-cols-3` (Banani's desktop grid), Pro card visually raised via `border-primary` (no vertical offset — keep it simple, avoid the "featured card floats above others" trick since it complicates the 375px stack).

## Interactions / state
- Loading: page renders immediately, cards are static copy; only `org.plan`/`availableProviders` are fetched, both fail silently (buttons still work, current-plan badge just won't be perfectly accurate mid-fetch — acceptable, matches Settings page's own fetch-failure handling).
- `availableProviders` empty (nothing configured) → modal already shows "Aucun moyen de paiement configuré" — no separate handling needed on this page.

## Open questions for user
Resolved via AskUserQuestion (2026-08-19): FAQ → real content (not Banani's 14-day-trial placeholder).
