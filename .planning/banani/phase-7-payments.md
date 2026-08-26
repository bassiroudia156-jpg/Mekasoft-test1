# Phase 7 — Payments — Banani → izikit

## Source
11 raw screens (domain I), extracted 2026-08-17 from the cached bulk dump:
`PaymentsManagement`, `RegisterPayment` (+2 duplicate captures = same screen), `RegisterPaymentMobileMoneyDetails`, `RegisterPaymentBankTransferDetails`, `RegisterPayment_next3` ("Chèque Details"), `PaymentRegisteredConfirmation`, `RegisterPaymentBankTransferDetails_next1` ("Confirmation - Bank Transfer"), `PaymentsManagementAfterCancellation`, `PaymentRegisteredConfirmationMobileMoneyDetails`.

STATUS.md's own domain I inventory line (written before Phase 0 started) already commits to the architecture: *"`RegisterPayment` (+ `_next1`, `_next2` = duplicate captures, `_next3` = Espèces/Chèque branch) — one form, `method` discriminated union"* — this phase implements that, not a re-derivation.

## Structure map — 2 canonical pages

1. **`/payments`** (list) — `PaymentsManagement`, with `AfterCancellation` collapsing into the real `ToastContext` (same "use the real toast" precedent as every prior phase). Banani's row "..." button has no menu items designed behind it (a bare `more-horizontal` icon, same as Phase 4's early vehicle row before Intervention existed) — **no dead UI**, left as a non-interactive icon this phase.
2. **`/payments/new`** (create) — `RegisterPayment` (base = Espèces, no extra fields) with **inline conditional sections** for `RegisterPaymentBankTransferDetails` / `RegisterPaymentMobileMoneyDetails` / `RegisterPayment_next3` (Chèque) depending on the selected `method` radio — one form, one page, not 4 routes. `?invoiceId=` locks the entry point (mirrors Phase 5/6's `?clientId=`/`?interventionId=` precedent) — reachable from a new "Enregistrer un paiement" quick action on `/invoices/[id]`. Internal success view = `PaymentRegisteredConfirmation`, generalized to conditionally render whichever method-specific detail block applies (Bank Transfer and Mobile Money variants were both fetched; **no Chèque confirmation variant exists in the 109 screens** — extrapolated from the same generic shell, flagged below).

## Domain model

```prisma
model Payment {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  reference      String // PAY-YYYY-### sequential per org per calendar year

  invoiceId String
  invoice   Invoice @relation(fields: [invoiceId], references: [id], onDelete: Restrict)
  clientId  String
  client    Client  @relation(fields: [clientId], references: [id], onDelete: Restrict)

  amount      Int // FCFA — always invoice.amount at registration time; no partial payments designed
  method      String // Espèces | Virement bancaire | Mobile Money | Chèque
  status      String   @default("Payé") // Payé | En attente — derived at creation, immutable after (no edit UI designed)
  paymentDate DateTime @default(now())
  notes       String?

  generateReceipt  Boolean @default(true)
  receiptReference String? // REC-{invoice year}-{invoice seq}-PAY-{payment seq}, set only when generateReceipt

  // Virement bancaire
  bankName          String?
  bankAccountLast4  String?
  transferReference String?
  payerName         String?

  // Mobile Money
  mobileProvider  String? // Orange Money | Wave | Free Money
  mobilePhone     String?
  mobileReference String?

  // Chèque
  chequeNumber  String?
  chequeBank    String?
  chequeHolder  String?
  chequeDueDate DateTime?

  createdAt DateTime @default(now())

  @@unique([organizationId, reference])
  @@index([organizationId, status])
  @@index([organizationId, paymentDate])
  @@index([invoiceId])
  @@index([clientId])
}
```

`Invoice`/`Client`/`Organization` gain a `payments Payment[]` reverse relation.

**Not** in `lib/server/payments/` — that folder is CLAUDE.md's protected `PaymentProvider` (Bictorys online-charge gateway) surface. This `Payment` model is an unrelated concept (manual back-office ledger entry a garage staffer types in after receiving money — no gateway, no webhook, no circuit breaker). New helpers live in **`lib/server/payment-ledger/`** to keep the two concerns from blurring together for a future reader.

## Decisions (stated assumptions, no blocking fork)

1. **No partial payments.** `Payment.amount` always equals `invoice.amount` at registration time — the Montant field in every fetched form is a read-only span with no edit affordance (unlike phone/payer-name fields, which show an `edit-2` pencil icon signaling they're editable), and no screen anywhere shows a "reste à payer"/balance concept.
2. **Registering a payment (any method, any resulting status) immediately marks the target `Invoice.status → 'Payée'`** — literal reading of the unconditional confirmation copy shared by all 3 fetched confirmation variants ("La facture FAC-2025-087 a été marquée comme payée"), including the Bank Transfer variant whose own payment defaults to `'En attente'`. **Known tension, documented not resolved**: a real product might want to defer marking an invoice paid until a pending cheque/transfer actually clears — Banani's mock never distinguishes this, so V1 follows the literal copy. Revisit if a fork needs real accounting rigor.
3. **`Payment.status` is derived at creation, not manually edited later** (no status-change UI was designed for the payment row — a bare `more-horizontal` icon with nothing behind it, same "no dead UI" call as Phase 4's early vehicle row):
   - `Espèces` / `Mobile Money` → `'Payé'` (instant settlement)
   - `Virement bancaire` → `'En attente'` (needs bank-side confirmation; no status field shown in that sub-form)
   - `Chèque` → user-selected via the sub-form's own "Statut" dropdown (`À encaisser` → `'En attente'` / `Encaissé` → `'Payé'`), defaulting to `'En attente'` matching the mock's shown value
4. **One form, `method` discriminated union, inline conditional sections** — not 4 separate routes. Matches the architecture already stated in `STATUS.md`'s domain I line before Phase 0 started.
5. **Soft guard, not a DB constraint**: `POST /api/payments` rejects 409 `INVOICE_ALREADY_PAID` if the target invoice's `status` is already `'Payée'`. No `@@unique(invoiceId)` — unlike Phase 6's `Invoice.interventionId`, Banani never designed a duplicate-payment error state here, and leaving room for a future correction/void flow without a schema migration is the more conservative call.
6. **Real receipt PDF** (`renderReceiptPdf()`, same `@react-pdf/renderer` pattern as Phase 6's `renderInvoicePdf()`) behind `GET /api/payments/[id]/receipt/pdf` — the "Télécharger" button next to "Reçu généré" is concrete, designed UI, not dead. Only generated (button shown) when `generateReceipt` was checked at registration.
7. **`Taux de recouvrement`** computed as `totalPaid / (totalPaid + totalPending) × 100` across all-time `Payment` rows. The "En hausse de 5% ce mois" trend sub-copy is **dropped** — no historical snapshot exists to compute a real delta, and fabricating one would violate the "no fake data" precedent applied throughout every prior phase.
8. **`Retards de paiement`** = count of non-`'Payée'` invoices whose `dueDate` is more than 30 days in the past (matches the "> 30 jours d'écart" sub-copy).
9. **Receipt reference format**: `REC-{invoice year}-{invoice seq}-PAY-{payment seq}` — derived by stripping the `FAC-` prefix off the invoice's own reference and appending `-PAY-{payment seq}`. Matches Banani's own worked example exactly: `FAC-2025-087` + `PAY-2025-025` → `REC-2025-087-PAY-025`.
10. **Incidental cross-link**: `/invoices/[id]` gets an "Enregistrer un paiement" quick action (only shown when `status !== 'Payée'`), linking to `/payments/new?invoiceId=`. `Sidebar.tsx`'s "Paiements" nav item — left non-navigating in Phase 6 — finally gets its real `href` this phase.

## Implementation checklist
- [x] Schema: `Payment` model, migration
- [x] `lib/server/payment-ledger/{reference.ts, receipt.ts, status.ts, pdf.tsx}`
- [x] Routes: `GET/POST /api/payments`, `GET /api/payments/[id]`, `GET /api/payments/[id]/receipt/pdf`
- [x] Pages: `/payments` (list), `/payments/new` (create + inline method sections + internal success view)
- [x] Components: `PaymentRow`, method-specific form sections (inline, not separate components)
- [x] `Sidebar.tsx` — real `href="/payments"`
- [x] `/invoices/[id]` — "Enregistrer un paiement" quick action
- [x] `pnpm typecheck` / `lint` / `format` / `test` (590/590) / `build`
- [x] Live E2E script against the real Neon DB (22 checks, all passed)
