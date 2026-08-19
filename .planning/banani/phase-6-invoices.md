# Phase 6 — Invoices — Banani → izikit

## Source
13 raw screens (domain H), re-extracted 2026-08-17 from the cached bulk dump:
`InvoicesList`, `NewInvoice`, `InvoiceCreatedSuccess`, `InvoicePrintPreview`, `NewInvoiceFresh`, `InvoicesListAfterCreation`, `InvoicesListContextMenu`, `InvoicePdfDownloaded`, `InvoicePrintFromList`, `InvoiceResendEmail`, `InvoiceEmailSent`, `InvoicesListAfterEmailSent`, `InvoiceDetailsFromEmail`.

No `InvoiceRow` shared component was factored out by Banani (unlike `InterventionRow`/`ClientRow`/`VehicleRow`) — the row JSX is duplicated identically across 4 raw screens. Extracted one anyway per the project's own rule-of-three principle, independent of Banani's factoring choices.

## Structure map — 4 canonical pages + 1 shared document component

1. **`/invoices`** (list) — `InvoicesList`, with `AfterCreation`/`AfterEmailSent` collapsing into the real `ToastContext` (not Banani's bespoke inline banners — same "use the real toast, not the mock" precedent as every prior phase) and `ContextMenu` becoming a real per-row dropdown (`InvoiceRowMenu`) since Banani designed 5 concrete actions for it (Télécharger PDF / Imprimer / Renvoyer par email / Voir les détails / Supprimer) — this is not the "no dead UI, skip the menu" case from Phase 4's vehicle row, which had nothing designed.
2. **`/invoices/new`** (create) — `NewInvoice` + `NewInvoiceFresh` (same form, empty vs. intervention-preselected state), internal success view = `InvoiceCreatedSuccess`.
3. **`/invoices/[id]`** (detail) — `InvoiceDetailsFromEmail`, embeds the shared `InvoiceDocument` preview + a 2-entry history timeline (created/email-sent) + status/client/financial-summary cards.
4. **`/invoices/[id]/print`** (print preview) — `InvoicePrintPreview` + `InvoicePrintFromList` (identical), `window.print()` + `@media print`, same pattern as Phase 5's devis page — but "Télécharger PDF" now hits a **real** PDF endpoint (`@react-pdf/renderer`, per decision #4 from the original planning pass, finally landing this phase).
5. **Resend email** (`InvoiceResendEmail` + `InvoiceEmailSent`) — one `Modal` with two internal views (`form`/`sent`), same pattern as `TeamManagementModal`, reachable from both the list's row menu and the detail page's "Renvoyer" button.

## Domain model

```prisma
model Invoice {
  id             String @id @default(cuid())
  organizationId String
  reference      String // FAC-YYYY-### sequential per org per calendar year
  interventionId String @unique // one invoice per intervention
  clientId       String

  description  String // snapshot of intervention.work at issue time — invoices must not silently change if the intervention is edited later
  subtotal     Int // FCFA HT, snapshot of the intervention's own subtotal
  taxRatePct   Int    @default(18)
  taxAmount    Int
  amount       Int // FCFA TTC

  paymentTerms String   @default("Net 30 jours")
  issueDate    DateTime @default(now())
  dueDate      DateTime
  status       String   @default("Émise") // Émise | Payée | En attente
  notes        String?

  emailSentAt DateTime? // set by the outbox dispatcher once actually enqueued to the mailer, not at emit time
  emailSentTo String?

  @@unique([organizationId, reference])
}
```

`Intervention` gains a `Restrict`-side reverse `invoice Invoice?` (an intervention already invoiced can't be invoiced again — enforced by the `interventionId` unique constraint, 409 on conflict).

`EmailJob` gains nullable `attachmentFilename` / `attachmentContent` (base64) / `attachmentContentType` — the first real email attachment use case in this app.

## Decisions (stated assumptions, no blocking fork)

1. **Real PDF generation lands this phase.** `@react-pdf/renderer` added (`renderToBuffer`), a `renderInvoicePdf()` builder in `lib/server/invoices/pdf.tsx`, and `GET /api/invoices/[id]/pdf` streams `application/pdf`. This was pre-approved in `IMPLEMENTATION-PLAN.md` decision #4 before Phase 0 started.
2. **Email attachments are new shared infra**, added minimally and additively: `SendEmailInput.attachments?`, `EmailJob` gains 3 nullable columns, `EmailQueue.enqueue()`/`drainOne()` thread them through unchanged for existing callers (verification/reset/invite emails never pass `attachments`, so their behavior is untouched). `lib/server/email.ts` isn't in CLAUDE.md's protected list, but it's shared infra other auth flows depend on — kept the diff surgical (one new optional field, no restructuring) for exactly that reason.
3. **Invoice creation auto-sends the email** (per Banani's own copy: "La facture sera automatiquement envoyée au client une fois créée") — skipped silently if the client has no email on file (same "optional providers are inert" philosophy as the rest of the app), not blocking creation.
4. **Invoice email is written in French**, not English. Phase 3's `teamInviteEmail()` followed the starter's English-by-default convention (`auth/email-templates.ts` D-15) — but MekaSoft's actual customers are French-speaking, and an invoice is a customer-facing financial document, not a developer-facing one. This is a product-correctness call on new code, not a re-litigation of Phase 3's existing template.
5. **One invoice per intervention** (`@@unique(interventionId)`) — matches the create flow's "pick client → pick one of their uninvoiced interventions" design; re-invoicing isn't designed anywhere in the 109 screens.
6. **Invoice creation picker reuses `GET /api/clients/[id]`'s already-fetched `interventions[]`** (capped at 10 most recent, extended with an `invoiced: boolean` flag) rather than adding new query params to `/api/interventions` — avoids new route surface for a need the existing endpoint already almost satisfies.
7. **Status is manually set**, same "Marquer comme payé" convenience-action pattern as Intervention (Phase 5) — a `Modal` + `RadioCard` picker over the 3 values. No automatic overdue-detection (would need a cron; out of scope, Banani's mock data never explains what distinguishes "Émise" from "En attente" either).
8. **"Supprimer" (row context menu) is a real hard delete** with a confirm `Modal`, mirroring Phase 4's vehicle-delete UX — Banani designed this action concretely (unlike the vehicle row's bare "..." with nothing behind it in Phase 4), so it gets wired for real rather than dropped.
9. **`InvoiceDocument`** extracted as a shared `components/invoices/` component — the exact same printable-document markup appears identically in 3 raw Banani screens (`InvoicePrintPreview`, `InvoicePrintFromList`, `InvoiceDetailsFromEmail`), reused by both `/invoices/[id]` and `/invoices/[id]/print`.

## Implementation checklist
- [x] Schema: `Invoice` model, `EmailJob` attachment columns, migration
- [x] `lib/server/invoices/{reference.ts, totals.ts, email-templates.ts, pdf.tsx}`
- [x] `lib/server/email.ts` — attachment support (additive)
- [x] `lib/server/queues/email-queue.ts` — thread attachments through
- [x] `lib/server/outbox/types.ts` + `dispatcher.ts` — `email.invoice` event/case
- [x] Routes: `GET/POST /api/invoices`, `GET/PATCH/DELETE /api/invoices/[id]`, `POST /api/invoices/[id]/resend`, `GET /api/invoices/[id]/pdf`; `clients/[id]` extended with `invoiced` flag on interventions
- [x] Pages: `/invoices`, `/invoices/new`, `/invoices/[id]`, `/invoices/[id]/print`
- [x] Components: `InvoiceRow`, `InvoiceRowMenu`, `InvoiceDocument`, resend `Modal`
- [x] `pnpm typecheck` / `lint` / `format` / `test` / `build`
- [x] Live E2E script against real Neon DB (incl. a real PDF byte-sanity check and an attachment-present check on the enqueued EmailJob row)
