'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';

export interface ExportMenuProps {
  /** FREE | PRO | BUSINESS — null while the org/plan is still loading. */
  plan: string | null;
}

// Mirrors lib/server/plans/limits.ts's PLAN_LIMITS — same local-copy
// convention as the landing page / profile page (that module lives under
// lib/server/, this is client-rendered display copy).
const EXPORT_RESOURCES = [
  { key: 'clients', label: 'Clients' },
  { key: 'vehicles', label: 'Véhicules' },
  { key: 'interventions', label: 'Interventions' },
  { key: 'invoices', label: 'Factures' },
  { key: 'payments', label: 'Paiements' },
] as const;

// Replaces the dashboard's free-text search box (2026-08-19, per user
// request) — Rapport mensuel / Export de données used to live on their own
// page (/export, reached via a dedicated Sidebar button before that too),
// but a one-off download doesn't need a whole nav destination, so both moved
// into this dropdown right where "Nouvelle intervention" already lives.
// Business-only feature (server-side enforced on both endpoints — see
// api/export/[resource] and api/reports/monthly/pdf) — the trigger button
// itself always renders regardless of plan so a Business org's access never
// flickers away, but the dropdown swaps its content for an upsell line on
// lower plans instead of live download links.
export default function ExportMenu({ plan }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const isBusiness = plan === 'BUSINESS';
  const isLoading = plan === null;

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div ref={rootRef} className="relative w-full lg:w-auto">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full lg:w-auto inline-flex items-center justify-center gap-2 rounded-sm border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-input"
      >
        <Icon i="download" size={14} />
        Export
        <Icon
          i={open ? 'chevron-up' : 'chevron-down'}
          size={12}
          className="text-muted-foreground"
        />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-full sm:w-80 rounded-md border border-border bg-surface shadow-lg p-3 flex flex-col gap-3">
          {/* Rapport mensuel */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Icon i="file-chart-column" size={14} className="text-primary shrink-0" />
              <span className="text-sm font-semibold text-foreground">Rapport mensuel</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Recettes, interventions, nouveaux clients et meilleurs clients du mois, en PDF.
            </p>
            {isLoading ? (
              <Skeleton className="h-6 w-40" />
            ) : isBusiness ? (
              <a
                href="/api/reports/monthly/pdf"
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-1.5 self-start rounded-sm border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-input"
              >
                <Icon i="download" size={12} />
                Télécharger le rapport de ce mois-ci
              </a>
            ) : (
              <p className="text-xs text-muted-foreground italic">Réservé au plan Business.</p>
            )}
          </div>

          <div className="border-t border-border" />

          {/* Export de données */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Icon i="database" size={14} className="text-primary shrink-0" />
              <span className="text-sm font-semibold text-foreground">Export de données</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Clients, véhicules, interventions, factures et paiements, en CSV.
            </p>
            {isLoading ? (
              <Skeleton className="h-6 w-40" />
            ) : isBusiness ? (
              <div className="flex flex-wrap gap-1.5">
                {EXPORT_RESOURCES.map((r) => (
                  <a
                    key={r.key}
                    href={`/api/export/${r.key}`}
                    onClick={() => setOpen(false)}
                    className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-input"
                  >
                    <Icon i="download" size={11} />
                    {r.label}
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">Réservé au plan Business.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
