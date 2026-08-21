// Feature-by-feature comparison table — 2026-08-21, added below the 3
// pricing cards (landing page's #tarifs section + the authenticated
// /subscriptions/plans page) per user request, reproducing a reference
// screenshot the user provided. One deliberate deviation from that
// screenshot: no "Partage WhatsApp" row (that feature was pulled pending a
// real implementation — see PRO_FEATURES's comment in page.tsx) and no
// struck-through "before" price in the header (2026-08-21, same session:
// "n'oublie pas d'enlève les prix barrés" — no plan shows a fake default
// discount here either).
//
// No 'use client' directive — this is a static, presentational table with
// no hooks/browser APIs, so it can be dropped into both a server component
// (page.tsx, the landing page) and a client component
// (subscriptions/plans/page.tsx) unchanged.
//
// Mirrors lib/server/plans/limits.ts's PLAN_LIMITS/PLAN_PRICING numbers —
// kept as a local copy rather than imported, same convention as the
// pricing cards on both consuming pages (that module lives under
// lib/server/ as the enforcement source of truth; this is display copy of
// the same numbers, not the enforcement itself).
import Icon from '@/components/ui/Icon';

type Cell =
  | { kind: 'included'; note?: string }
  | { kind: 'excluded'; note?: string }
  | { kind: 'text'; value: string };

const yes = (note?: string): Cell => (note ? { kind: 'included', note } : { kind: 'included' });
const no = (note?: string): Cell => (note ? { kind: 'excluded', note } : { kind: 'excluded' });
const text = (value: string): Cell => ({ kind: 'text', value });

interface Row {
  label: string;
  free: Cell;
  pro: Cell;
  business: Cell;
}

const ROWS: Row[] = [
  { label: 'Création de garage', free: yes(), pro: yes(), business: yes() },
  { label: 'Clients', free: text('3 max'), pro: text('Illimités'), business: text('Illimités') },
  {
    label: 'Véhicules',
    free: text('3 max'),
    pro: text('Illimités'),
    business: text('Illimités'),
  },
  {
    label: 'Interventions',
    free: text('5/mois'),
    pro: text('Illimitées'),
    business: text('Illimitées'),
  },
  { label: 'Devis & factures', free: yes('dans les limites'), pro: yes(), business: yes() },
  { label: 'Paiements', free: yes('dans les limites'), pro: yes(), business: yes() },
  { label: 'Téléchargement PDF', free: yes(), pro: yes(), business: yes() },
  {
    label: 'Multi-utilisateurs',
    free: no('1 seul'),
    pro: no('1 seul'),
    business: yes("jusqu'à 5"),
  },
  { label: 'Rôles & permissions', free: no(), pro: no(), business: yes() },
  { label: 'Rapport mensuel', free: no(), pro: no(), business: yes() },
  // "(CSV)" not "(PDF/Excel)" — matches the actual export route
  // (lib/server/export/csv.ts), not the reference screenshot's wording.
  { label: 'Export de données (CSV)', free: no(), pro: no(), business: yes() },
  { label: 'Logo du garage sur les factures', free: no(), pro: yes(), business: yes() },
];

const COLUMNS = [
  { key: 'free' as const, label: 'Gratuit' },
  { key: 'pro' as const, label: 'Pro' },
  { key: 'business' as const, label: 'Business' },
];

function CellView({ cell }: { cell: Cell }) {
  if (cell.kind === 'text') {
    return <span className="text-sm text-foreground">{cell.value}</span>;
  }
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Icon
        i={cell.kind === 'included' ? 'check' : 'x'}
        size={16}
        className={cell.kind === 'included' ? 'text-primary' : 'text-muted-foreground/50'}
      />
      {cell.note && <span className="text-[11px] text-muted-foreground">({cell.note})</span>}
    </div>
  );
}

export default function PricingComparisonTable() {
  return (
    <div className="mt-8 lg:mt-12">
      <h3 className="text-center text-lg lg:text-xl font-bold font-headings text-foreground mb-5 lg:mb-6">
        Comparer les forfaits en détail
      </h3>
      {/* Contained horizontal scroll on narrow screens — the table itself
          never forces the page to scroll sideways. Sticky first column so
          the feature label stays visible while scrolling the plan
          columns. */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="bg-surface border-b border-border">
              <th className="sticky left-0 bg-surface text-left font-medium text-muted-foreground px-4 py-3 whitespace-nowrap">
                Fonctionnalité
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className="text-center font-bold font-headings text-foreground px-4 py-3 whitespace-nowrap"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, i) => (
              <tr key={row.label} className={i % 2 === 1 ? 'bg-surface/50' : undefined}>
                <th
                  scope="row"
                  className={`sticky left-0 text-left font-normal text-foreground px-4 py-3 whitespace-nowrap ${
                    i % 2 === 1 ? 'bg-surface/50' : 'bg-background'
                  }`}
                >
                  {row.label}
                </th>
                {COLUMNS.map((col) => (
                  <td key={col.key} className="text-center px-4 py-3">
                    <div className="flex justify-center">
                      <CellView cell={row[col.key]} />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile hint — at 375px the table only fits "Fonctionnalité" +
          "Gratuit" before the scroll container clips it, with no visual
          affordance otherwise that Pro/Business are reachable by swiping. */}
      <p className="lg:hidden flex items-center justify-center gap-1 text-[11px] text-muted-foreground mt-2">
        Faites glisser pour voir tous les forfaits
        <Icon i="arrow-right" size={12} />
      </p>
    </div>
  );
}
