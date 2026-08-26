# MekaSoft — Banani → izikit implementation plan

Source: [Tableau Atelier](https://app.banani.co/flow/83o75a2tYyMD) (109 screens fetched 2026-08-16). See [`STATUS.md`](./STATUS.md) for the flat screen checklist.

## What MekaSoft is

A **garage / auto-repair-shop back-office SaaS** ("atelier" = workshop, in French). A garage owner and their team track: clients (individuals + companies), vehicles, repair jobs ("interventions") with parts used, invoices, and payments received via cash / mobile money / bank transfer / cheque. The garage itself is a paying tenant of MekaSoft (see `UpgradePlansPage` — a pricing/upgrade screen), so this is **B2B multi-tenant SaaS**: each garage is a tenant, garage staff are its team members.

This is a materially different domain from what the starter ships out of the box (generic user-owned Orders/Withdrawals, e.g. a marketplace or cagnotte). Almost every domain model is net-new; the auth/CSRF/rate-limit/outbox/notification/email/upload/admin **infrastructure** is reused as-is.

## Design system deltas

Banani's `/style.css` is a Tailwind v4 `@theme` block — directly compatible with the starter's zero-config Tailwind v4 (`frontend/src/app/globals.css` is currently just `@import 'tailwindcss';`). Drop the block in as-is:

| Token | Value | Notes |
|---|---|---|
| `--color-primary` | `#0d3b6e` (navy) | brand color |
| `--color-accent` | `#e85c1a` (orange) | CTA / highlight |
| `--color-background` | `#f5f4f0` | warm off-white |
| `--color-surface` | `#fdfaf7` | card/panel bg |
| `--color-success` / `--color-warning` | `#1a7a4a` / `#c97a17` | status pills (intervention/invoice/payment states) |
| `--font-body` / `--font-headings` | **IBM Plex Sans** | ⚠️ delta — `layout.tsx` currently loads **Inter**. Swap via `next/font/google` (`IBM_Plex_Sans`), both weights available. |
| `--radius` scale | 3/6/10/16px (`sm`→`xl`) | smaller radii than typical Tailwind defaults — keep as-is for fidelity |

**Icons**: Lucide (`Icon i="wrench"` wrapper pattern) — add `lucide-react` to `frontend/package.json` (not currently a dependency). Banani's `@global/Icon` and `@global/UserAvatar` are editor-provided primitives we rebuild once in `src/components/ui/Icon.tsx` (thin wrapper resolving `i` string → `lucide-react` named import) and `src/components/ui/UserAvatar.tsx` (initials fallback).

**Shared components to port** (from Banani `sharedFiles`, all currently mock-data stubs → wire to real API data in Phase 3+):
`Sidebar`, `TopBar`, `StatCard`, `InterventionRow`, `RevenueChart`, `FormField`, `QuickActions`, `ClientRow`, `ManagerProfilePanel`, `FilterButton`, `VehicleRow`, `InterventionFilters`, `PartsRow` → all become `src/components/<domain>/*.tsx` or `src/components/ui/*.tsx` per the skill's primitive/composed split.

## Domain model — Prisma additions

Existing generic models (`User`, `Organization`, `OrganizationMember`, `Notification`, `EmailJob`, `FileUpload`, `AdminAction`, `OutboxEvent`, `WebhookLog`) are kept **as-is**, no renames (per CLAUDE.md). `Organization` = the garage/atelier (multi-tenancy is currently opt-in and unused — this project activates it). `OrganizationMember.role` (`OWNER`/`ADMIN`/`MEMBER`) = the team roles shown in `TeamManagementModal`.

**Net-new models** (all `organizationId`-scoped, gated via `requireOrgRole()`):

| Model | Key fields | Backs screens |
|---|---|---|
| `Client` | `type` (INDIVIDUAL\|COMPANY), `name`, `phone`, `email`, `status` (actif\|inactif), `organizationId` | domain E |
| `Vehicle` | `brand`, `model`, `registration`, `mileage`, `lastServiceAt`, `status`, `clientId`, `organizationId` | domain F |
| `Intervention` | `reference` (INT-###), `clientId`, `vehicleId`, `work`, `status` (En cours\|Terminé\|En attente\|Non payé), `amount`, `organizationId` | domain G |
| `Part` | `reference`, `name`, `supplier`, `quantity`, `unit`, `unitPrice`, `total`, `inStock`, `interventionId` | domain G (AddParts) |
| `Invoice` | `reference` (FAC-YYYY-###), `interventionId`, `clientId`, `amount`, `issueDate`, `dueDate`, `status` (Émise\|Payée\|En attente), `organizationId` | domain H |
| `Payment` | `reference` (PAY-YYYY-###), `invoiceId`, `clientId`, `amount`, `date`, `method` (Espèces\|MobileMoney\|Virement\|Chèque), `status`, `registeredById`, `organizationId` | domain I |

All money fields **integer FCFA** (no decimals) per CLAUDE.md invariant. `Organization` gains `logoUrl String?` (Cloudinary, reuse `uploads-cloudinary`), shop address/phone fields for `EditShopSettingsPage`, and `onboardingCompletedAt DateTime?` to drive the onboarding gate.

**Existing `Order`/`Withdrawal`/Bictorys checkout infra**: Banani's payment screens (`RegisterPayment*`) are 100% **manual bookkeeping** — staff records that a client paid, no online checkout/webhook involved. So `Order`/`Withdrawal` are **not** the right primitive for client payments (new `Invoice`/`Payment` models above cover that). The one place an *online* payment could apply is `UpgradePlansPage` (the garage paying MekaSoft itself) — flagged in open questions below.

## Phased roadmap

| Phase | Scope | New routes | New models |
|---|---|---|---|
| **0 — Design foundation** | Tailwind tokens, IBM Plex Sans swap, `lucide-react`, `Icon`/`UserAvatar`/`Button`/`Card`/`Badge`/`Field`/`Modal` primitives, port 13 shared components | — | — |
| **1 — Auth** | Restyle existing login/forgot/reset flow to MekaSoft branding (combined login+recovery panel) | *(reuses `/api/auth/login`, `/forgot-password`, `/reset-password` — already shipped)* | — |
| **2 — Onboarding + org bootstrap** | 4-step wizard creates `Organization` + first `OrganizationMember` (OWNER) | `POST /api/organizations` (new), `PATCH /api/organizations/[id]/onboarding` | `Organization` field additions |
| **3 — Team management** | Invite flow (email via Resend), role changes | `POST /api/organizations/[id]/invite`, `POST /api/organizations/[id]/members/[id]/role` | invite token (new small model or `VerificationCode`-style reuse) |
| **4 — Clients & Vehicles** | CRUD + list/detail/filters | `api/clients`, `api/clients/[id]`, `api/vehicles`, `api/vehicles/[id]` | `Client`, `Vehicle` |
| **5 — Interventions & Parts** | Create/list/detail, parts picker, devis print | `api/interventions`, `api/interventions/[id]`, `api/interventions/[id]/parts` | `Intervention`, `Part` |
| **6 — Invoices** | Generate from intervention, list/detail, PDF/email resend | `api/invoices`, `api/invoices/[id]`, `api/invoices/[id]/resend` | `Invoice` |
| **7 — Payments** | Manual payment registration per method, tie to invoice status | `api/payments`, `api/invoices/[id]/payments` | `Payment` |
| **8 — Settings & billing** | Shop settings, profile edit, password change (reuse), Upgrade Plans | `api/organizations/[id]` (PATCH) | `Organization` billing fields |
| **9 — Marketing/legal** | Public landing, privacy, terms, support form | `api/support` (new, outbox→email) | — |

PDF generation (devis print, invoice download) needs a new dependency — recommend `@react-pdf/renderer` (pure-JS, works in a serverless Node runtime, no headless-Chromium cold-start problem on Vercel) over a browser-automation approach.

## Decisions (confirmed 2026-08-16)

All 7 open questions resolved — recommended default taken in every case:

1. **Multi-tenancy** — confirmed. `Organization` = atelier, `OrganizationMember` = équipe.
2. **Client payments** — manual only (`Invoice`/`Payment`, no online checkout for client-facing payments). Bictorys/`Order` stays reserved for MekaSoft's own subscription revenue.
3. **`UpgradePlansPage`** — **deferred**. Phase 8 ships shop settings + profile only; recurring/subscription billing is out of scope for this pass (starter's Bictorys adapter is single-charge only today — would need its own design pass).
4. **PDF generation** — `@react-pdf/renderer` (add as new dependency in Phase 6).
5. **Google OAuth** — kept as an optional extra button on the login screen (additive, zero risk, infra already wired).
6. **Interventions lists** — `InterventionsList` / `AllInterventions` / `InterventionsDashboard` collapse into **one page** with filters, consistent with how Clients/Vehicles/Invoices lists already work.
7. **Phase order** — proceed in plan order, 0 → 9, with 8 trimmed to settings/profile only (billing removed per #3).

**Net effect on the roadmap**: Phase 8 is now "Settings" (shop settings, profile edit, password change) — the billing half of the old Phase 8 (`UpgradePlansPage`) becomes a **Phase 10 — deferred**, not scheduled, revisit when there's an appetite for recurring billing design work.

Phase 0 (design foundation) is unblocked and ready to start.

## Phase 1 decisions (confirmed 2026-08-16)

Banani's own screens forked in two places for the login flow; resolved before coding:

1. **Login layout** — the hero split-screen (`LoginWithRecovery_next1`: big branding panel + stats strip) is canonical for `/login`, not the compact layout seen in `LoginPageAfterLogout`/`LoginAfterPasswordChange`. Contextual success banners (password changed, logged out) render as an alert inside the hero layout instead of switching layouts.
2. **Recovery UX** — login and password-recovery forms live on one page (`/login`), matching `LoginWithRecovery` pixel-for-pixel (two stacked sections, dashed divider). `/forgot-password` is kept only as a redirect to `/login` for old links. `/reset-password` stays a separate route (reached via the emailed link/code, not by navigating from `/login`).
3. **Logout confirmation** — added, matching `LogoutConfirmationScreen`/`LogoutConfirmationFromContextMenu` (both Banani trigger points collapse into one `LogoutConfirmModal` reused from `ManagerProfilePanel`). Confirm → `logout()` → `/login?logged_out=1` (reuses the same banner slot as decision #1, rather than building a separate full-page `LoggedOutScreen`).

No Banani mockup exists for signup/verify-email/reset-password (the flow assumes team members join by invitation, Phase 3) — restyled with the same `AuthBrandPanel` shell for visual consistency, API contracts unchanged from the existing reference implementation. The Banani "remember me" checkbox was dropped — no backend session-length toggle exists (`auth.ts` is protected), and the existing login reference never had one either.

## Phase 2 decisions (confirmed 2026-08-16)

**Correction to the original plan**: `OnboardingStep3` ("Équipe") is *not* an invite-by-email flow — it's a single-select "how many people work here?" question (Moi uniquement / 2-5 / 6-10 / Plus de 10), persisted as `Organization.teamSizeHint` for analytics. This removes the dependency on Phase 3's invite mechanism that the original roadmap sketch assumed; onboarding needed no changes deferred to later phases.

Same "pick the complete layout" precedent as Phase 1: `OnboardingWelcome`(`_next1`)'s two-panel hero-with-stepper only covers steps 1-2, so `OnboardingStep1-4`'s single-panel centered layout (progress bar, complete across all 4 steps) is canonical.

Wizard mechanics: steps 1-2 are local form state only (no API call). The actual `POST /api/organizations` fires on the step 3 → step 4 transition — step 4 is a pure success screen with no further input, so the org must exist by the time it renders. `GET /api/organizations` gates both `/onboarding` (redirect to `/dashboard` if the user already has an org — V1 is single-org-per-user, no switcher UI) and `/dashboard` (show the "no organization" banner if not).

**One genuine fork, resolved**: Banani's `DashboardFirstLaunch` banner says "configure your garage from Settings" for users who skipped onboarding — but Settings (Phase 8) doesn't exist yet. Decision: keep the skip path faithful to Banani (org-less dashboard, dismissible banner), but the banner's CTA temporarily points back at `/onboarding` (resume at step 2) instead of a not-yet-built `/settings`. **Follow-up for Phase 8**: repoint this banner to the real shop-settings page once it ships.

Necessary scope addition beyond the original one-line roadmap sketch: a minimal `/dashboard` shell (ported from `DashboardFirstLaunch` — Sidebar/TopBar/empty hero/zeroed StatCards/QuickActions) had to ship in this phase since onboarding has nowhere to redirect to otherwise. It stays empty-state until Phase 4/5 supply real data to compute KPIs and intervention rows from.

First-time signup (`/verify-email` success) now redirects to `/onboarding` instead of `/dashboard` — better acquisition UX than dropping brand-new users on an empty dashboard. Returning users (`/login`) still land on `/dashboard` directly; its own org-check banner covers anyone who skipped onboarding earlier.

## Phase 3 decisions (confirmed 2026-08-16)

**Blocking infra fix, done first**: the repo's migration history mixed manual numeric folder names (`0_init`…`4_phase3_admin_orders`) with Prisma's default timestamp format (Phase 2's migration). Lexicographic sort put the timestamped migration *before* `2_organizations` — a fresh `migrate deploy` would have failed on a clean database. Fixed permanently by renaming the 5 originals to fake-early timestamps and updating Neon's `_prisma_migrations` tracking table to match (user confirmed the "fix once, permanently" option over a per-migration patch or `db push`).

**Correction to the original plan**: `AddTeamMemberModal`'s 3 "roles" (Administrateur/Mécanicien/Comptable) are cosmetic job titles, not permission levels — `require-org-role.ts` (protected) only knows OWNER/ADMIN/MEMBER. Added a separate `jobTitle` field on both `OrganizationMember` and `OrganizationInvite`; the actual `role` is derived (Administrateur→ADMIN, Mécanicien/Comptable→MEMBER).

Same "no Banani mockup" gap as signup/verify-email/reset-password: the accept-invite screen isn't designed anywhere in the 109 screens (Banani only shows the inviter's side — the sent confirmation). Built with the same `AuthBrandPanel` shell for consistency.

Invite acceptance auto-logs the new member in (same UX as `/verify-email`) rather than requiring a separate `/login` round-trip — the invite link itself is the trust proof, exactly like an email-verification code.

`TeamManagementModal`/`AddTeamMemberModal`/`TeamMemberInvitationSent` collapsed into one component with internal view state (list/add/sent), same pattern already established for `/login`'s combined sections — avoids prop-drilling between three separate modal components.

## Phase 4 decisions (2026-08-16)

No genuine fork this phase — Banani's Client/Vehicle screens were internally consistent, unlike the earlier login/onboarding layout explorations. Decisions below were stated as assumptions, not asked:

- **Client = one model, not two.** `AddNewClient`'s Particulier/Entreprise toggle is client-side state on one form; `Client.type` discriminates which fields are required (`INDIVIDUAL`: firstName+lastName; `COMPANY`: companyName), matching how `AddNewIndividualClient`/`AddNewClient_next1` are really the same screen in two states.
- **"Propriétaire du véhicule" (Client lui-même / Entreprise cliente)** — kept as a simple `Vehicle.ownerType` field, independent of `Client.type`. No separate company-vs-contact entity relationship was designed, so this is just a data field on the vehicle, not a structural link.
- **List stats reflect the whole organization**, not the current search filter — `Tous/Actifs/Inactifs` counts and `Km moyen` are separate aggregate queries scoped only to `organizationId`, matching how Banani's static mock never varies its stats with the search box.
- **No client/vehicle edit UI this phase** — Banani never designed dedicated edit screens (only creation forms + a bare "Modifier" button on `ClientProfileIbrahima` with no target). Omitted the button rather than wire it to nothing — "no dead UI", same principle applied to the dropped "remember me" checkbox in Phase 1.
- **Vehicle registration is unique per organization**, not globally — two different garages can each have their own "DK-4821-A" without conflict.

## Phase 5 decisions (2026-08-17)

No blocking fork this phase either — all decisions below were stated as assumptions and implemented directly (matching Phase 4's precedent), full detail in [`phase-5-interventions.md`](./phase-5-interventions.md):

- **Parts editing is inline, not a separate route.** Banani's `AddParts` screen implies an intervention ID that doesn't exist yet during creation. Rather than fake a "draft intervention" or round-trip unsaved state through query params, the parts basket lives as local React state on `/interventions/new` (submitted atomically with the intervention) and as an inline section on `/interventions/[id]` (posts immediately per part, matching `AddAnotherPart`'s "confirm → add another" loop).
- **Single `status` field, 4 values** (`En cours`/`Terminé`/`En attente`/`Non payé`) — matches `InterventionRow`'s own prop shape and was already committed in this file's domain-model table before Phase 0 started, not re-litigated. "Marquer comme payé" is a convenience action setting `status` → `Terminé` from `Non payé`.
- **Print / PDF**: both "Lancer l'impression" and "Télécharger PDF" call the browser's native `window.print()` (`@media print` CSS hides the app chrome). Real server-side PDF generation stays scoped to Phase 6 per decision #4 above — faking a "PDF téléchargé" success toast was explicitly avoided (print vs. save-as-PDF vs. cancel are indistinguishable from the page), replaced with a neutral `afterprint`-triggered confirmation instead.
- **Vehicle/Client → Intervention FKs are `Restrict`.** Deleting a vehicle or client with intervention history now correctly fails (`DELETE /api/vehicles/[id]` → 409 `VEHICLE_HAS_INTERVENTIONS`) instead of the Phase-4-era cascade-warning text that was never actually true. Caught during E2E testing that Prisma 5.22 doesn't normalize `deleteMany()`'s RESTRICT violation to a typed error — fixed with a proactive `count()` check instead of catching the DB error.
- **`Client.totalSpent`** sums `Intervention.amount` (billed, not collected — `Payment`/`Invoice` don't exist until Phase 6/7). Revisit once real payment collection ships.
- **`SearchSelect`** extracted as a new `components/ui/` primitive (rule-of-three: client search in `/vehicles/new`, client + client-scoped vehicle search in `/interventions/new`); `/vehicles/new`'s existing inline implementation was left as-is (unrelated diff).

## Phase 6 decisions (2026-08-17)

No blocking fork this phase — all 9 decisions below were stated as assumptions and implemented directly, full detail in [`phase-6-invoices.md`](./phase-6-invoices.md):

- **Real PDF generation lands this phase**, per decision #4 from Phase 5/the original planning pass — `@react-pdf/renderer`'s `renderToBuffer()`, a `renderInvoicePdf()` builder shared by both `GET /api/invoices/[id]/pdf` and the outbox dispatcher's emailed attachment, so the two never drift.
- **Email attachments are new shared infra, added additively.** `SendEmailInput.attachments?`, `EmailJob` gained 3 nullable columns, `EmailQueue.enqueue()`/`drainOne()` thread them through unchanged for every existing caller (verification/reset/invite emails never pass `attachments`). `lib/server/email.ts` isn't in CLAUDE.md's protected list but is shared infra other auth flows depend on — kept the diff to one new optional field, no restructuring.
- **Invoice creation auto-sends the email** (Banani's own copy: "La facture sera automatiquement envoyée au client une fois créée") — silently skipped if the client has no email on file, same "optional providers are inert" philosophy as the rest of the app. Verified end-to-end up to the `OutboxEvent` row + a real rendered PDF; this dev environment has no Resend/Upstash credentials configured, so actual delivery wasn't (and structurally couldn't be) exercised — see the Phase 6 STATUS.md entry.
- **Invoice email is French**, not English — a deliberate, scoped deviation from Phase 3's `teamInviteEmail()` English-by-default convention (`auth/email-templates.ts` D-15). An invoice is a customer-facing financial document for MekaSoft's French-speaking clients, not developer-facing infrastructure; this doesn't re-litigate the existing English templates elsewhere.
- **One invoice per intervention** (`Invoice.interventionId` unique) — matches the create flow's "pick client → pick one of their uninvoiced interventions" design. A second `POST` for an already-invoiced intervention is checked proactively (not caught as a bare P2002) and returns 409 `INTERVENTION_ALREADY_INVOICED`.
- **The invoice-creation picker reuses `GET /api/clients/[id]`'s `interventions[]`**, extended with an `invoiced: boolean` flag, rather than adding new query params to `/api/interventions` — avoids new route surface for a need the existing endpoint almost satisfied already (same shape Phase 5's `?clientId=` locked-entry pattern established).
- **Status is manually set**, 3 values (`Émise`/`Payée`/`En attente`) via a `Modal`+`RadioCard` picker — same convenience-action pattern as `Intervention` (Phase 5). No automatic overdue-detection (would need a cron; Banani's own mock data never explains what distinguishes `Émise` from `En attente` either).
- **"Supprimer" is a real hard delete** with a confirm `Modal`, mirroring Phase 4's vehicle-delete UX — Banani designed this action concretely (5 real items in `InvoicesListContextMenu`, unlike Phase 4's bare vehicle-row "..." with nothing behind it), so it's wired for real rather than dropped.
- **`InvoiceDocument` extracted as a shared component** — the identical printable-document markup appears in 3 raw Banani screens (`InvoicePrintPreview`, `InvoicePrintFromList`, `InvoiceDetailsFromEmail`); reused by both `/invoices/[id]` and `/invoices/[id]/print`.
- **`InvoiceRowMenu` is a new self-contained dropdown**, not built on a shared `<Dropdown>` primitive — no such primitive existed yet in the codebase, and this is its first concrete use case (a second one would justify extracting one).

Incidental fix (not a Phase 6 feature, found while wiring `/invoices` into the app): `Sidebar.tsx`'s nav items had been plain `<a href="#">` since Phase 0 and never actually navigated anywhere. Now real `next/link`s; "Paiements" stays non-navigating since Phase 7 hasn't shipped that route yet.

## Phase 7 decisions (2026-08-17)

No blocking fork this phase — all 10 decisions below were stated as assumptions and implemented directly, full detail in [`phase-7-payments.md`](./phase-7-payments.md):

- **No partial payments.** `Payment.amount` always equals `invoice.amount` at registration — the Montant field in every fetched form is a read-only span with no edit affordance (unlike phone/payer-name fields, which show an `edit-2` pencil signaling they're editable), and no screen anywhere shows a "reste à payer" concept.
- **Registering a payment (any method, any resulting status) immediately marks the target invoice `Payée`** — literal reading of the unconditional confirmation copy shared by all 3 fetched confirmation variants, including the Bank Transfer one whose own payment defaults to `En attente`. Documented tension, not resolved: a real product might want to defer marking paid until a pending transfer/cheque clears; Banani's mock never distinguishes this.
- **`Payment.status` is derived at creation from `method`** (Espèces/Mobile Money → `Payé`; Virement bancaire → `En attente`; Chèque → driven by its own sub-form's "Statut" picker, defaulting to `À encaisser` → `En attente`), not manually edited later — no status-change UI was designed for the payment row (a bare `more-horizontal` icon, same "no dead UI" call as Phase 4's early vehicle row).
- **One form, `method` discriminated union, inline conditional sections** — not 4 separate routes. This was already the stated architecture in `STATUS.md`'s domain I inventory line, written before Phase 0 started.
- **Soft guard, not a DB constraint**: `POST /api/payments` rejects 409 `INVOICE_ALREADY_PAID` if the target invoice is already `Payée`. No `@@unique(invoiceId)` on `Payment` — unlike Phase 6's `Invoice.interventionId`, Banani never designed a duplicate-payment error state, and leaving room for a future correction/void flow without a migration is the more conservative call.
- **Real receipt PDF** (`renderReceiptPdf()`, same `@react-pdf/renderer` pattern as Phase 6's invoice PDF) behind `GET /api/payments/[id]/receipt/pdf` — the "Télécharger" button next to "Reçu généré" is concrete, designed UI.
- **`Taux de recouvrement`** computed as `totalPaid / (totalPaid + totalPending) × 100`, all-time. The "En hausse de 5% ce mois" trend sub-copy is **dropped** — no historical snapshot exists to compute a real delta, and fabricating one would violate the "no fake data" precedent applied throughout every prior phase.
- **`Retards de paiement`** = count of non-`Payée` invoices whose `dueDate` is more than 30 days in the past.
- **Receipt reference format** `REC-{invoice year}-{invoice seq}-PAY-{payment seq}` — matches Banani's own worked example exactly (`FAC-2025-087` + `PAY-2025-025` → `REC-2025-087-PAY-025`).
- **New `lib/server/payment-ledger/` folder, deliberately not `lib/server/payments/`** — that existing folder is CLAUDE.md's protected `PaymentProvider` (Bictorys online-charge gateway) surface; this `Payment` model is an unrelated manual back-office ledger concept with no gateway, webhook, or circuit breaker involved. Keeping them apart avoids a future reader conflating the two.

Incidental fixes (not Phase 7 features, found while wiring `/payments` in): `Field` gained a `'date'` type (payment date + cheque due-date pickers — additive, the existing fallback `<input type={type}>` branch already handled it once the union included it). `/invoices/[id]` gained an "Enregistrer un paiement" quick action. `Sidebar.tsx`'s "Paiements" item — the last `href: null` holdout since Phase 6 — now points at the real route.

## Post-Phase-7 fix — Login/recovery page split (2026-08-17)

Explicit user request, reversing Phase 1's "combined login + recovery, one page" decision — see `STATUS.md`'s dated section for the full verbatim request and verification detail. No decisions recorded here beyond that; it was a straight UI reorganization with no backend change.

## Phase 8 decisions (2026-08-17)

No blocking fork this phase — all 12 decisions below were stated as assumptions and implemented directly, full detail in [`phase-8-settings.md`](./phase-8-settings.md). Unlike prior phases, the primary finding wasn't a design ambiguity — it was that `ManagerProfilePanel` and `Sidebar` had shipped since early phases with hardcoded placeholder identity and dead callback props nothing ever supplied, making every password/profile-edit affordance a no-op in production. That's the bug this phase actually fixes; the 4 new Banani screens are secondary.

- **`ManagerProfilePanel`/`Sidebar` self-fetch identity via `useAuth()`, not props.** Mirrors the existing `TeamManagementModal`/`LogoutConfirmModal` internal-state pattern already inside `ManagerProfilePanel`. Zero call-site churn for `Sidebar`'s 16 usages — none of them ever passed the old `userName`/`userRole` props.
- **Org role/jobTitle piggyback on the existing `GET /api/auth/me` query** (one extra `select` on the caller's first `OrganizationMember` row) rather than a second endpoint — avoids adding a render-blocking network call to every page load just to label a sidebar role.
- **`ChangePasswordModal` copy corrected vs. Banani's literal text.** The real `PUT /api/auth/change-password` re-issues cookies for the *current* session — only other sessions die on their next request. Banani's mock says "Vous serez déconnecté" / primary action "Se reconnecter", which is false for this backend; confirmation copy says "vos autres sessions ont été déconnectées", primary action is "Retour au tableau de bord".
- **Password requirements checklist trimmed to what the backend actually enforces** — real policy is `AUTH_PASSWORD_MIN_LENGTH` (default 10) + a banned-list check + optional HIBP, no uppercase/digit/special-char rule exists server-side. Showing Banani's literal 4-item complexity checklist would advertise rules that aren't real.
- **`hasPassword` branch reuses `POST /api/auth/set-password`** for OAuth-only accounts — collapses the already-shipped generic `/settings` page's change/set-password branching into the modal, so no functionality is lost in the rewrite.
- **2FA row is informational only, no "Activer" button** — no 2FA infrastructure exists. Matches the "no dead UI" precedent (Phase 6 Sidebar fix, Phase 7 payment row-menu).
- **Upgrade-to-Pro banner dropped entirely**, not just de-buttoned — unlike the 2FA row it carries no real state about the user's account, just a dead CTA to domain K (`UpgradePlansPage`), explicitly deferred and not scheduled.
- **`/settings` is rewritten, not net-new.** A generic pre-Banani stub already lived at this route (plain gray Tailwind, no Sidebar/layout, password change + Google-link only). Both real, working flows are preserved and relocated: password change → `ChangePasswordModal`; Google-link → a third row in the new "Sécurité" section (no Banani screen shows it, but it's real shipped functionality with nowhere else to live).
- **Shop settings require `ADMIN`+ org role** — `requireCallerOrg('ADMIN')` on the `PATCH`, and both "Modifier l'atelier" entry points hide/redirect for `MEMBER` callers rather than showing a form that would 403 on submit.
- **`UserAvatar` gains an optional `src`.** It previously always rendered initials (a deliberate substitution for Banani's stock-photo mock) — extending it with a real `<img>` fallback-to-initials is required for the upload flow to mean anything, and is additive/safe (no existing caller passed `src`, including Google-OAuth users whose real `avatarUrl` had silently gone unused since Phase 1).
- **Email is read-only everywhere in this phase** — no re-verification flow exists for changing a verified login email; Banani's own `EditProfileModal` already renders it non-interactive.
- **Prénom/Nom split is a display convenience over the single `User.name` column** — join on submit, split on load by the first space. No schema change (mirrors how `Client` already stores one `name` while some forms collect first/last).

Incidental additions (not Phase 8 screens, needed to support the above): `frontend/src/lib/uploadFile.ts` (standalone multipart helper for `POST /api/upload` — deliberately not folded into the protected `lib/api.ts`, which always JSON-encodes and can't do `multipart/form-data`); `frontend/src/lib/roleLabel.ts` (shared `orgRoleLabel()` used by `Sidebar`/`ManagerProfilePanel`/`EditProfileModal`); `Sidebar` gained a `settings` nav entry (Settings previously had no permanent nav slot, unlike every other resource).

This closes out the Banani-implementation roadmap's scheduled phases (domain K `UpgradePlansPage`/Phase 10 remains explicitly deferred, not scheduled).

## Dashboard real-data fix decisions (2026-08-17)

Not a numbered phase — user re-selected 3 Banani screens post-Phase-8 and asked for the dashboard to stop showing its permanent Phase-2 placeholder. Full detail in [`dashboard-real-data.md`](./dashboard-real-data.md); the 10 decisions there are summarized in `STATUS.md`'s dated section. One thing worth calling out here since it recurs across nearly every phase of this project: `RevenueChart` (Phase 0), `InterventionFilters` (Phase 0), and `TopBar`'s "Nouvelle intervention" button (never given an `onClick` at its one call site) were all built early and never wired to anything — same root cause as the Sidebar `href="#"` (Phase 6), `ManagerProfilePanel`'s dead callback props (Phase 8), and the stale onboarding step 4 CTA fixed in this same pass. Components built ahead of the page that consumes them are the recurring failure mode in this codebase's history — worth double-checking for on any future phase that touches `components/dashboard/` or reuses an early-scaffolded primitive.
