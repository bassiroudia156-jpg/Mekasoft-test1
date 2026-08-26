# Subscription Confirmation (Upgrade Confirmation) — Banani → Next.js/Tailwind

## Source
- Banani screen ID: `83o75a2tYyMD/screens/UpgradeConfirmation.jsx` ("Upgrade Confirmation — Professional Plan")
- Fetched: 2026-08-19

## System map
- Existing route: `frontend/src/app/subscriptions/return/page.tsx` (built 2026-08-18/19) — polls `POST /api/subscriptions/verify` after a hosted-checkout redirect. Currently has 5 minimal states (checking/succeeded/failed/timeout/missing_payment); only `succeeded` gets the Banani-style richer treatment (the other 4 aren't in Banani's mock — designed here, kept as-is structurally, restyled to match the same visual language).
- Data gap to close: the `succeeded` state currently only shows a generic "Abonnement activé" message. Banani's mock wants plan name, tarif, "prochaine facture"/statut, included features, order number, activation date, billing period, and a receipt download — none of which the current `verify` response carries.

## Backend extension (small, non-protected route)
`POST /api/subscriptions/verify` (`frontend/src/app/api/subscriptions/verify/route.ts`) response gains fields, always present once `payment` is loaded (not just on success):
```
{ status, plan, provider, amount, currency, currentPeriodEnd? }
```
`currentPeriodEnd` only populated when `credited` — re-fetches the `Subscription` row's `currentPeriodEnd` right after `activateSubscription()` in the STRIPE/MONEROO/CHARIOW branches. This is additive (existing `{status}`-only consumers keep working); no test depends on the response NOT having extra fields.

## Real receipt PDF (user decision: build it now)
- NEW `lib/server/subscriptions/receipt-pdf.tsx` — `renderSubscriptionReceiptPdf()`, mirrors `lib/server/payment-ledger/pdf.tsx`'s exact `@react-pdf/renderer` pattern/styles (same page shell, header row, label/value rows, amount block) — MekaSoft-branded receipt for a `SubscriptionPayment` (garage → MekaSoft), distinct domain from the existing garage→client receipt.
- NEW `GET /api/subscriptions/[paymentId]/receipt/pdf` — mirrors `app/api/payments/[id]/receipt/pdf/route.ts`: `requireCallerOrg('MEMBER')`, `findFirst` scoped to `organizationId`, 404 if missing or `status !== 'SUCCEEDED'`, streams `application/pdf`.

## Confirmation UI (succeeded state rewrite)
- Success banner: kept, same icon/copy as now.
- Plan details card: plan label + `PLAN_PRICING[plan].priceFcfa`, provider label, "Prochain renouvellement" (STRIPE, auto) vs "Renouvellement manuel — vous recevrez un rappel avant expiration" (MONEROO/CHARIOW) instead of Banani's unconditional "Prochaine facture" (which implies auto-charge — false for mobile money).
- Included features: reuses the same `FREE/PRO/BUSINESS_FEATURES`-shaped local copy as the plans page for the purchased plan.
- Order details row: N° de commande = `paymentId` (short form), date d'activation = client-rendered `new Date().toLocaleDateString('fr-FR')` (the exact activation timestamp isn't returned by verify — "now" is accurate enough since this page only renders right after activation), période = "Mensuelle".
- "À faire maintenant" checklist — adapted to real app actions, not Banani's generic 3 steps: (1) Pro+: "Ajoutez votre logo" → link `/settings/shop`; (2) Business only: "Invitez votre équipe" → instructs opening the profile panel (no dedicated URL — `TeamManagementModal` opens from `ManagerProfilePanel`, not a route); (3) both: "Partagez vos factures sur WhatsApp" → informational.
- Actions: "Aller au tableau de bord" (primary, `/dashboard`) + "Télécharger le reçu" (real, hits the new PDF route in a new tab) replacing Banani's static button.

## Component reuse
- REUSE `Button`, `Icon` — already imported in the page.
- No Sidebar/PageHeader here (unauthenticated-feeling return/landing page, consistent with the page's existing centered-card design — not a dashboard screen).

## Responsive plan
- Base (375px): single column, all Banani's 2-3 column detail grids (plan info / features, N° commande / date / période) collapse to stacked rows — this page already has a `max-w-sm` centered shell; the added detail card widens to `max-w-lg` for the succeeded state only, still single-column at 375px, `sm:grid-cols-2`/`sm:grid-cols-3` for the detail rows at 640px+.

## Interactions / state
- The other 4 states (checking/failed/timeout/missing_payment) are unchanged in logic, restyled only if needed for visual consistency (same icon-in-circle + heading + body pattern already used — already consistent with the success state's new card treatment).

## Open questions for user
Resolved via AskUserQuestion (2026-08-19): build the real receipt PDF now (not deferred).
