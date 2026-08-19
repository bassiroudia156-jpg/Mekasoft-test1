# Phase 5 — Interventions & Parts — Banani → izikit

## Source
16 raw screens (domain G), fetched from the cached bulk dump (`mcp-banani-banani_get_selected_designs-1786889291840.txt`, originally pulled 2026-08-16), re-extracted 2026-08-17:
`NewIntervention`, `NewInterventionWithParts`, `NewInterventionFromVehicle`, `InterventionsList`, `AllInterventions`, `InterventionsDashboard`, `AddParts`, `PartsAddedConfirmation`, `AddAnotherPart`, `AddAnotherPart_next1`, `PartsValidatedIntervention`, `InterventionCreatedSuccess`, `InterventionDetailsView`, `PrintDevis`, `PrintDevisDownloaded`, `PrintSent`.
Shared components already ported in Phase 0 and verified pixel-faithful (no changes needed): `InterventionRow.tsx`, `PartsRow.tsx`, `InterventionFilters.tsx`.

## Structure map — 4 canonical pages

1. **`/interventions`** (list) — ported from `InterventionsList` (not `AllInterventions`/`InterventionsDashboard` — three-way fork already resolved in the original planning pass: "collapse into one page with filters, consistent with Clients/Vehicles". `InterventionsList`'s own layout already matches the established Clients/Vehicles pattern exactly (PageHeader + search/status-filter bar + table + pagination footer), so it's the direct match.
2. **`/interventions/new`** (create) — ported from `NewIntervention` + `NewInterventionWithParts` (parts-added state) + `NewInterventionFromVehicle` (locked entry point) + `PartsValidatedIntervention` (parts-confirmed variant) + `InterventionCreatedSuccess` (internal success view, same "internal view state" pattern as `/clients/new` and `/vehicles/new`).
3. **`/interventions/[id]`** (detail) — ported from `InterventionDetailsView`, with an inline parts-add mini-flow (`AddParts`/`AddAnotherPart`/`AddAnotherPart_next1`/`PartsAddedConfirmation` collapsed into one inline section with success-toast states, not a separate route — see decision #1 below).
4. **`/interventions/[id]/devis`** (print preview) — ported from `PrintDevis` + `PrintDevisDownloaded` + `PrintSent`, one page with internal toast states for "download" and "print sent".

## Component breakdown

- **REUSE** `InterventionRow`, `InterventionFilters`, `PartsRow` — already built Phase 0, unchanged.
- **REUSE** `PageHeader`, `FormSection`, `FilterButton`, `Field`, `Button`, `Badge`, `Modal`, `RadioCard` — all existing primitives cover this phase's needs.
- **NEW** `components/ui/SearchSelect.tsx` — search-as-you-type combobox primitive. Third occurrence of this exact pattern (client search in `/vehicles/new`, now client search *and* client-scoped vehicle search in `/interventions/new`) — rule-of-three extraction. `/vehicles/new`'s existing inline implementation is left as-is (unrelated diff, not worth touching for this phase).
- **NEW** `lib/server/interventions/reference.ts` — `INT-###` sequential reference generator, retry-on-conflict.
- **NEW** `lib/server/interventions/totals.ts` — shared `computeTotals(labor, parts, taxRatePct)` → `{subtotal, tax, total}`, used by both the create and add-parts routes so the stored `amount` is always computed the same way.

## Domain model — Prisma additions

```prisma
model Intervention {
  id             String   @id @default(cuid())
  organizationId String
  organization   Organization @relation(...)
  reference      String   // INT-### sequential per org
  clientId       String
  client         Client   @relation(fields: [clientId], references: [id], onDelete: Restrict)
  vehicleId      String
  vehicle        Vehicle  @relation(fields: [vehicleId], references: [id], onDelete: Restrict)
  work           String   // description of work
  category       String?
  priority       String   @default("Normal")
  notes          String?
  laborAmount    Int      @default(0) // FCFA
  partsAmount    Int      @default(0) // FCFA, denormalized sum of Part.total
  taxRatePct     Int      @default(18)
  amount         Int      @default(0) // FCFA, TTC total, denormalized (drives InterventionRow display)
  status         String   @default("En cours") // En cours | Terminé | En attente | Non payé
  createdAt / updatedAt
  @@unique([organizationId, reference])
  @@index([organizationId, status])
  @@index([organizationId, createdAt])
  @@index([clientId]) @@index([vehicleId])
}

model Part {
  id             String @id @default(cuid())
  interventionId String
  intervention   Intervention @relation(fields: [interventionId], references: [id], onDelete: Cascade)
  reference      String?
  name           String
  supplier       String?
  quantity       Int    @default(1)
  unit           String @default("pcs")
  unitPrice      Int    // FCFA
  total          Int    // FCFA, quantity * unitPrice, denormalized
  inStock        Boolean @default(true)
  createdAt DateTime @default(now())
  @@index([interventionId])
}
```

`Client.status`/`Vehicle.status` relations to `Intervention` are `onDelete: Restrict` — deleting a client/vehicle that has intervention history is now correctly blocked (the existing `DELETE /api/vehicles/[id]` comment already flagged this as a "revisit once Intervention exists").

## Token / component mapping
No new design tokens — this phase reuses 100% of the MekaSoft `@theme` block from Phase 0. New icons used: `pencil`, `archive`, `printer`, `download`, `circle-check`, `chevron-right` (all verified present in `lucide-react` under their v1.31 names).

## Responsive plan
Same policy as every prior phase: unprefixed classes = 375px base (stacked sections, full-width buttons, table rows scroll horizontally inside `overflow-x-auto`), `lg:` brings back Banani's desktop 2/3-column grid on `/interventions/[id]` and the 4-field grids on `/interventions/new`. The print-preview page (`/interventions/[id]/devis`) is desktop/print-oriented by nature (a physical A4-ish document) but still must not horizontally overflow at 375px — wrapped in the same `overflow-x-auto` shell as the other tables.

## Decisions (stated assumptions — no blocking fork, consistent with Phase 4's precedent)

1. **Parts editing is inline, not a separate route.** Banani designs `AddParts` as its own full screen, but that screen's data model implies an intervention ID that doesn't exist yet during creation. Rather than invent a fake "draft intervention" or round-trip unsaved form state through query params/sessionStorage, parts editing lives as an inline expandable section on both `/interventions/new` (local array, submitted atomically with `POST /api/interventions`) and `/interventions/[id]` (posts immediately to `POST /api/interventions/[id]/parts`, matching the `AddAnotherPart` "confirm → add another" loop as inline toast states). Visual output matches Banani's `NewInterventionWithParts`/`PartsValidatedIntervention` (parts summary embedded in the Devis section) either way.
2. **Reference numbering**: `INT-###` sequential per organization, computed as `count + 1` inside the create transaction with a retry-once on unique-constraint conflict (same low-concurrency assumption as everywhere else in this single-tenant-per-request app).
3. **Print / PDF**: "Lancer l'impression" wires to the browser's native `window.print()` with `@media print` CSS (hides sidebar/header, shows only the document). "Télécharger PDF" also triggers `window.print()` for now — real server-side PDF generation (`@react-pdf/renderer`) is explicitly scoped to Phase 6 in `IMPLEMENTATION-PLAN.md` (decision #4 from the original planning pass), not re-litigated here.
4. **Single `status` field, 4 values** (`En cours`/`Terminé`/`En attente`/`Non payé`) — matches `InterventionRow`'s own prop shape exactly and was already committed in `IMPLEMENTATION-PLAN.md`'s domain-model table before Phase 0 started. "Marquer comme payé" (from `InterventionDetailsView`'s Paiement card) is a convenience action that sets `status` → `Terminé` when currently `Non payé`. "Modifier le statut" opens a small `Modal` + `RadioCard` picker (reusing the existing primitive) over the same 4 values.
5. **Vehicle picker is client-scoped**: once a client is selected, the vehicle `SearchSelect` only offers that client's own vehicles (`GET /api/clients/[id]` already returns `vehicles[]`) — an obvious data invariant Banani's static mock doesn't encode but real usage requires.
6. **`?vehicleId=` entry point** (`NewInterventionFromVehicle` — client+vehicle pre-locked) is supported by the route/page code (new `GET /api/vehicles/[id]` added) but has no wired trigger UI yet in this phase, matching Phase 4's "no dead UI" principle applied in reverse: the capability exists and is correct, nothing links to it yet because no vehicle-detail page exists to host that button. The one wired entry point this phase is `/clients/[id]`'s existing "Nouvelle intervention" button (currently mis-pointed at `/vehicles/new?clientId=` — a Phase-4 placeholder bug) → now correctly points at `/interventions/new?clientId=`.
7. **Client total-spent / last-visit**: `Client.totalSpent` = sum of `Intervention.amount` for that client (payment status doesn't gate this — `Payment`/`Invoice` don't exist until Phase 6/7, so "spent" means "billed", not "collected"). `lastVisit` = most recent `Intervention.createdAt` for the client. Documented as a Phase-6/7 revisit point once real payment collection exists.

## Implementation checklist
- [x] Prisma schema + migration
- [x] `lib/server/interventions/reference.ts`, `totals.ts`
- [x] `SearchSelect` primitive
- [x] Routes: `interventions` (GET/POST), `interventions/[id]` (GET/PATCH), `interventions/[id]/parts` (POST), `interventions/[id]/parts/[partId]` (DELETE), `vehicles/[id]` (GET added), `vehicles/[id]` (DELETE FK-restrict handling), `clients/[id]` (real stats + history)
- [x] Pages: `/interventions`, `/interventions/new`, `/interventions/[id]`, `/interventions/[id]/devis`
- [x] Fix `/clients/[id]` "Nouvelle intervention" button + render real history
- [x] Print CSS (`@media print`) in `globals.css`
- [x] 375/768/1280 responsive pass (structural, same curl-based verification as prior phases — no headless browser in this sandbox)
- [x] `pnpm typecheck` / `lint` / `format` / `test` / `build`
- [x] Live E2E script against real Neon DB
