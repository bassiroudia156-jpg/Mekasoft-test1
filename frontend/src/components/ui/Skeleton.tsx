import { type HTMLAttributes } from 'react';
import clsx from 'clsx';
import Card from './Card';

// Generic skeleton block (2026-08-20, admin dashboard build — "je veux que
// sur le Dashboard admin que tous les éléments aillent des skeletons loader
// plutôt que les loaders classiques"). A single pulsing bg-muted div;
// callers compose width/height/rounded via className the same way every
// other primitive in this kit takes a className override (see Card).
// Respects prefers-reduced-motion the same way AnimatedNumber/confetti do —
// the pulse stops but the block itself still renders as a loading
// placeholder (unlike a spinner, a static skeleton block is not motion, so
// nothing needs to disappear).
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx('animate-pulse rounded-sm bg-muted motion-reduce:animate-none', className)}
      {...props}
    />
  );
}

/** A `Card`-shaped skeleton (label row + big value + sub line) — matches
 * StatCard's layout so the loading state doesn't jump when real data lands. */
export function SkeletonStatCard() {
  return (
    <div className="bg-surface border border-border rounded-md p-5 flex flex-col gap-3 flex-1">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-7 rounded-sm" />
      </div>
      <Skeleton className="h-9 w-28" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

/** A table-shaped skeleton — `rows` rows × `cols` cells, for admin list
 * pages (Utilisateurs, Garages, Promotions, Journal…) while the first page
 * of data loads. */
export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={clsx('h-4', c === 0 ? 'w-8' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Garage-app-side skeletons (2026-08-20 — "sur toutes les pages je veux
// pas l'icône de chargement classique qui est rond […] chaque élément doit
// avoir un skeleton loader"). Same primitives as the admin set above,
// extended to the operator-facing pages: list rows shaped to match their
// real *Row component 1-for-1 (own bg-surface/border-b, exact column
// widths) so the real data swaps in with zero layout shift, plus a few
// composed shapes (chart, document, form, profile card) for the pages
// that aren't tables.
// ───────────────────────────────────────────────────────────────────────

/** Matches RevenueChart's Card shell — header (label + total) + 7 bars. */
export function SkeletonChart() {
  const heights = [55, 80, 40, 95, 65, 85, 30];
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-7 w-24" />
        </div>
        <Skeleton className="h-6 w-20 rounded-sm" />
      </div>
      <div className="flex items-end gap-2 h-28">
        {heights.map((h, i) => (
          <div key={i} className="flex flex-col items-center gap-1 flex-1">
            <div className="w-full rounded-sm bg-muted flex items-end" style={{ height: '96px' }}>
              <Skeleton className="w-full rounded-sm" style={{ height: `${h}%` }} />
            </div>
            <Skeleton className="h-3 w-6" />
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Matches ClientRow (components/clients/ClientRow.tsx) exactly. */
export function SkeletonClientRow() {
  return (
    <div className="flex items-center gap-4 px-5 py-3 border-b border-border bg-surface">
      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="w-40 shrink-0">
        <Skeleton className="h-3 w-28" />
      </div>
      <Skeleton className="h-5 w-20 rounded-full shrink-0" />
      <div className="w-28 shrink-0 flex justify-end">
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="w-24 shrink-0 flex justify-end">
        <Skeleton className="h-3 w-14" />
      </div>
      <Skeleton className="h-5 w-20 rounded-full shrink-0" />
      <Skeleton className="h-8 w-14 rounded shrink-0" />
    </div>
  );
}

/** Matches VehicleRow (components/vehicles/VehicleRow.tsx) exactly. */
export function SkeletonVehicleRow() {
  return (
    <div className="flex items-center gap-4 px-5 py-3 border-b border-border bg-surface">
      <div className="flex-1 min-w-0">
        <Skeleton className="h-3.5 w-36" />
      </div>
      <div className="w-28 shrink-0 flex justify-center">
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="flex-1 min-w-0">
        <Skeleton className="h-3 w-28" />
      </div>
      <div className="w-32 shrink-0 flex justify-end">
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="w-24 shrink-0 flex justify-end">
        <Skeleton className="h-3 w-14" />
      </div>
      <Skeleton className="h-5 w-20 rounded-full shrink-0" />
      <div className="w-14 shrink-0 flex justify-end">
        <Skeleton className="h-6 w-6 rounded" />
      </div>
    </div>
  );
}

/** Matches InterventionRow (components/interventions/InterventionRow.tsx). */
export function SkeletonInterventionRow() {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 border-b border-border bg-surface">
      <Skeleton className="h-3 w-10 shrink-0" />
      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="flex-1 min-w-0">
        <Skeleton className="h-3 w-40" />
      </div>
      <div className="w-36 shrink-0">
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="w-32 shrink-0 flex justify-end">
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-5 w-28 rounded-full shrink-0" />
      <Skeleton className="h-8 w-12 rounded shrink-0" />
    </div>
  );
}

/** Matches InvoiceRow (components/invoices/InvoiceRow.tsx). */
export function SkeletonInvoiceRow() {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 border-b border-border bg-surface">
      <Skeleton className="h-3 w-16 shrink-0" />
      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="w-28 shrink-0">
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="w-32 shrink-0 flex justify-end">
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-5 w-24 rounded-full shrink-0" />
      <Skeleton className="h-8 w-12 rounded shrink-0" />
      <Skeleton className="h-6 w-6 rounded shrink-0" />
    </div>
  );
}

/** Matches PaymentRow (components/payments/PaymentRow.tsx). */
export function SkeletonPaymentRow() {
  return (
    <div className="flex items-center gap-4 px-5 py-3 border-b border-border bg-surface">
      <Skeleton className="h-3 w-14 shrink-0" />
      <Skeleton className="h-3 w-14 shrink-0" />
      <div className="flex-1 min-w-0">
        <Skeleton className="h-3.5 w-32" />
      </div>
      <div className="w-32 shrink-0 flex justify-end">
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="w-28 shrink-0">
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="w-24 shrink-0">
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-5 w-20 rounded-full shrink-0" />
      <div className="w-8 shrink-0 flex justify-end">
        <Skeleton className="h-6 w-6 rounded" />
      </div>
    </div>
  );
}

/** Team-member row skeleton — matches TeamManagementModal's member list. */
export function SkeletonMemberRow() {
  return (
    <div className="flex items-center justify-between p-4 rounded-lg border border-border">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Skeleton className="w-10 h-10 rounded-full shrink-0" />
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
      <Skeleton className="h-6 w-20 rounded-md shrink-0" />
    </div>
  );
}

/** Left-column "identity card" skeleton — avatar + name + a few stat
 * lines, matching clients/[id]'s left column while the record loads. */
export function SkeletonProfileCard() {
  return (
    <div className="bg-surface border border-border rounded-md p-5 flex flex-col items-center gap-3 text-center">
      <Skeleton className="w-20 h-20 rounded-full" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-3 w-24" />
      <div className="w-full flex flex-col gap-2 mt-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-4/6" />
      </div>
    </div>
  );
}

/** Generic label/value block skeleton — the right-hand column of a detail
 * page (or any card with a handful of fields) while it loads. */
export function SkeletonInfoCard({ rows = 4 }: { rows?: number }) {
  return (
    <div className="bg-surface border border-border rounded-md p-5 flex flex-col gap-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}

/** Document-style skeleton — interventions/[id], invoices/[id], the print
 * pages and the devis page all render a centered max-w card; this covers
 * all of them (a header row of chips + a body card with a small table and
 * a total line). */
export function SkeletonDocument() {
  return (
    <div className="max-w-5xl mx-auto p-6 flex flex-col gap-6 w-full">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="bg-surface border border-border rounded-md p-6 flex flex-col gap-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
          <div className="flex flex-col gap-2 items-end">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <SkeletonTable rows={4} cols={4} />
        <div className="flex justify-end">
          <Skeleton className="h-6 w-32" />
        </div>
      </div>
    </div>
  );
}

/** Form-shaped skeleton — settings/shop and any modal form (EditVehicleModal…)
 * while the record it edits is still loading. */
export function SkeletonForm({ fields = 5 }: { fields?: number }) {
  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-10 w-full rounded-sm" />
        </div>
      ))}
    </div>
  );
}

/** Pulsing placeholder for an active-processing state (payment
 * verification polling…) — the app never uses a spinning icon for loading
 * (2026-08-20 user request: "je veux pas l'icône de chargement classique
 * qui est rond"), so "something is happening" reads through the pulse
 * instead of a rotation. */
export function SkeletonProcessing() {
  return (
    <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
      <Skeleton className="h-7 w-7 rounded-full bg-primary/30" />
    </div>
  );
}
