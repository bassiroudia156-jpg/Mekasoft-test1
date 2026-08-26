# Dashboard (real data) + Onboarding Step 4 fix — Banani → izikit/MekaSoft

## Source
User re-selected 3 screens in Banani before this session and asked to integrate them. Fetched 2026-08-17, flow "Tableau Atelier" (`83o75a2tYyMD`):

- `DashboardAfterOnboarding.jsx` — "Dashboard — Premier lancement après onboarding" (domain D `Dashboard`, empty-data variant)
- `OnboardingStep4Ready.jsx` — "Onboarding — Étape 4 : Prêt" (domain C, already implemented)
- `Dashboard.jsx` — "Dashboard — MekaSoft" (domain D `Dashboard`, populated variant)

## What's actually broken

`frontend/src/app/dashboard/page.tsx` currently IS `DashboardFirstLaunch` — a **permanently empty-state placeholder** shipped in Phase 2, before Clients/Vehicles/Interventions/Invoices/Payments existed, with a comment saying it "stays empty-state... until Phase 4/5 ship real data". Phases 4–8 have since shipped, but nobody came back to wire the populated `Dashboard` screen — the page still shows hardcoded zeros/dashes forever, regardless of real data. That's what the user is calling "le format téléphone": a single centered stacked-card empty-state, not the rich desktop KPI+chart+table layout Banani actually designed. `components/dashboard/RevenueChart.tsx` already exists (real props, no fake-default fallback needed) but has never been imported by any page — dead code since Phase 0.

`OnboardingStep4Ready` — cross-checked against the already-implemented `onboarding/page.tsx` step 4 — is a near-exact match already. The one real gap: "Ajouter mon premier client" still routes to `/dashboard` per a Phase-2-era comment ("becomes a real deep link once Clients ships") that was never revisited once `/clients/new` shipped in Phase 4. Same species of stale-placeholder bug as everything else fixed this session.

## Decisions

1. **Collapse `DashboardAfterOnboarding` + `Dashboard` into ONE real, data-driven page**, not two routes — matches this session's established precedent for Banani state-variant screens (loading/empty/populated = React state over real data, not separate pages). The empty-data variant *is* what real data naturally looks like before any intervention exists; no separate route needed.
2. **New `GET /api/dashboard/stats`** (not composed client-side from `/api/interventions` + `/api/payments`) — the KPIs need month-scoped and week-bucketed aggregates neither existing list endpoint computes (`Terminé` count scoped to *this month*, revenue *this week* bucketed by day with a real week-over-week trend). A dedicated aggregation endpoint avoids overloading either list route with dashboard-specific params.
3. **"Recettes du mois"** = `sum(Payment.amount) where status='Payé' and paymentDate >= monthStart` — same query shape already proven in `/api/payments`'s `paidThisMonth` stat (Phase 7). Real collected revenue via the Payment ledger, not invoiced/intervention amounts.
4. **"Terminé ce mois"** = `count(Intervention) where status='Terminé' and updatedAt >= monthStart` — `updatedAt` is the best available proxy for "when it was marked done" (no dedicated `completedAt` column exists). Documented assumption, not resolved with a schema change (out of scope for a data-wiring fix).
5. **Revenue chart = current ISO week (Mon→Sun), not a rolling 7 days** — matches Banani's fixed `Lun/Mar/.../Dim` weekday labels, which only make sense as a calendar week. Days later in the week that haven't happened yet show `0` (real, not fabricated — there's genuinely no data for them yet).
6. **Trend badge compares week-to-date vs. the same weekday range last week** (e.g. Mon–Wed this week vs. Mon–Wed last week), not full-week-to-date-partial-week. Badge is **hidden entirely** when last week's comparable sum is `0` (no meaningful percentage to show) — same "don't fabricate a trend" call as Phase 7's dropped "+5% ce mois" copy.
7. **Congrats banner** ("Bienvenue dans MekaSoft! Votre garage est prêt...") shows when `organizationId` is set AND zero interventions exist yet — derived from real data, not a fabricated "first visit" flag. Once the first intervention is created it naturally stops appearing and the real table takes over.
8. **`InterventionFilters` (Client/Véhicule/Date dropdown chips) is NOT wired into the dashboard.** It's dead code today (built Phase 0, never consumed anywhere) and Banani's own chips have no real select/dropdown behind them either — STATUS.md's domain D already catalogs `DashboardClientFilter`/`DashboardDateFilter` as separate, still-pending popover screens. Wiring fake dropdowns now would be the same "no dead UI" violation this session has fixed repeatedly elsewhere. The dashboard table is a **preview** (6 most recent interventions + "Voir toutes les interventions →" link to the fully-filterable `/interventions`), matching Banani's own "Affichage 6 sur 41" footer framing.
9. **`formatCompactAmount()` extracted to `lib/format-compact-fcfa.ts`** — `/api/payments`'s `formatCompact()` (client-side, in `app/payments/page.tsx`) is the second occurrence of this exact "2,4M / 170 K / 450" formatting logic (rule of three is a floor). Both pages now import the shared version.
10. **Onboarding step 4's "Ajouter mon premier client"** now routes to `/clients/new` (real destination, ships this fix); "Découvrir le tableau de bord" stays pointed at `/dashboard` (already correct).

## Implementation checklist
- [ ] `lib/format-compact-fcfa.ts` — extract + reuse in `payments/page.tsx`
- [ ] `GET /api/dashboard/stats` — new route, `requireCallerOrg('MEMBER')`
- [ ] `dashboard/page.tsx` — rewrite: real KPIs, `RevenueChart` wired, `QuickActions` wired to real routes (`/clients/new`, `/vehicles/new` — currently no `onClick` at all, another dead-button instance), conditional congrats-banner/empty-card/populated-table
- [ ] `onboarding/page.tsx` step 4 — fix stale `/dashboard` → `/clients/new` link
- [ ] Verification gate + live E2E against real dev server + Neon
- [ ] `STATUS.md` / `IMPLEMENTATION-PLAN.md` updates

## Open questions for user
None blocking — all resolved from code evidence + established precedent (see Decisions). Proceeding per "on continu".
