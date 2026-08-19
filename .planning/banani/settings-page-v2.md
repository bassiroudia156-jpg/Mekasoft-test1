# Settings Page v2 — Banani → Next.js/Tailwind

## Source
- Banani screen ID: `83o75a2tYyMD/screens/SettingsPage.jsx`
- Fetched: 2026-08-19

## System map (existing, real — not being rebuilt)
- Route: `frontend/src/app/settings/page.tsx`, auth-gated via `useUser()`.
- Data: `GET /api/organizations` (org identity fields) + `GET /api/subscriptions` (real Subscription status, built 2026-08-19).
- Mutations: `EditProfileModal`, `ChangePasswordModal`, `UpgradeSubscriptionModal` (checkout), `POST /api/subscriptions/portal` (Stripe portal).
- Nav out: `/settings/shop` (Atelier edit), Google OAuth start, NEW `/subscriptions/plans`.

## What changes vs. what stays
Banani's mock only shows a generic 3-card settings shell (Compte/Sécurité/Atelier) + one upsell banner — it has no concept of the real Abonnement status, Rapport mensuel, or Export de données sections this app already ships (those don't exist in a generic mockup). Per explicit user instruction: **keep all current functional sections**, apply the new visual language only.

- **Sécurité rows**: Banani boxes each row (`bg-muted/20 border border-muted rounded-md p-3`) instead of the current plain `border-b` divider list. Applying this — real visual upgrade, zero functional change (same 3 rows: password, 2FA info, Google link).
- **Compte / Atelier**: Banani's treatment already matches the existing `FormSection` + labeled-value-block pattern pixel-for-pixel. No change needed.
- **Card shell radius**: Banani's mock uses `rounded-lg` (10px) for this screen; the project's `FormSection` primitive (reused everywhere: onboarding, client/vehicle forms) uses `rounded-md` (6px) as an app-wide convention. Keeping `rounded-md` — project consistency wins over one screen's one-off value (CLAUDE.md: project rules override Banani output on conflict).
- **Upgrade banner**: Banani's big gradient "Passez à un forfait supérieur" banner replaces the current small inline "Passer à…" button, but ONLY for orgs with no `Subscription` row at all (true FREE, nothing purchased yet). Once a real `Subscription` exists (any status, including a lapsed/GRACE one), keep the existing real status card (provider/renewal-date/grace-warning) — Banani's mock has no "already subscribed" state, so this is designed here per the skill's own allowance. The banner's "Voir les forfaits" button navigates to the new `/subscriptions/plans` page instead of opening the modal directly (matches Banani's actual flow: Settings → dedicated plans page → checkout).

## Component reuse
- REUSE `FormSection`, `Button`, `Icon`, `Sidebar`, `PageHeader`, `ManagerProfilePanel`, `ChangePasswordModal`, `EditProfileModal`, `UpgradeSubscriptionModal` — all already wired, zero rebuild.
- REUSE the project's `PageHeader` bar instead of Banani's raw `TopBar` — every other authenticated page in the app uses `PageHeader`, not `TopBar` (see `PageHeader.tsx`'s own comment). Switching just this page to `TopBar`-style would break app-wide header consistency for no benefit.
- NEW: none — this is a restyle of existing markup, not new components.

## Responsive plan
- Base (375px): single column, already the case (`max-w-2xl` stack). Boxed security rows stack label+button vertically if they don't fit — verify at 375px.
- lg (1024px+): unchanged, matches Banani's desktop mock (single centered column, not the 2-col grid Banani's raw markup implies — that grid only has one child in the source anyway).

## Open questions for user
None outstanding — the 2 real forks (FAQ content, receipt PDF) were resolved via AskUserQuestion before this plan was written; they belong to the plans/confirmation pages, not this one.
