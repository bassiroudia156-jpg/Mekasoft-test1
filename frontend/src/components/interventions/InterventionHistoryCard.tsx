'use client';

import { formatInterventionDate } from '@/lib/format-intervention-date';
import InterventionRow, { type InterventionStatus } from './InterventionRow';

export interface InterventionHistoryItem {
  id: string;
  reference: string;
  client: string;
  vehicle: string;
  work: string;
  amount: number;
  status: InterventionStatus;
  createdAt: string;
}

export interface InterventionHistoryCardProps {
  items: InterventionHistoryItem[];
  onView: (id: string) => void;
  emptyMessage?: string;
}

function formatFCFA(n: number): string {
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

// Phase C item #7 (2026-08-25) — extracted from clients/[id]/page.tsx's
// inline "Historique des interventions" block (was never a separate
// component, just JSX repeated wherever a page needed a per-entity
// intervention list). Now shared by the client profile and
// /vehicles/[id] (new) — both show the exact same shape, just scoped to a
// different foreign key server-side.
export default function InterventionHistoryCard({
  items,
  onView,
  emptyMessage = "Aucune intervention pour l'instant.",
}: InterventionHistoryCardProps) {
  return (
    <div className="bg-surface border border-border rounded-md overflow-hidden flex-1">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Historique des interventions
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground p-5">{emptyMessage}</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            {items.map((i) => (
              <InterventionRow
                key={i.id}
                id={i.reference}
                client={i.client}
                vehicle={i.vehicle}
                work={i.work}
                date={formatInterventionDate(i.createdAt)}
                amount={formatFCFA(i.amount)}
                status={i.status}
                onView={() => onView(i.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
