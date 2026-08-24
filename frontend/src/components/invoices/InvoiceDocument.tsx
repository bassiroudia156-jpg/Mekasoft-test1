// Shared printable-document markup — the exact same layout appears
// identically in 3 raw Banani screens (InvoicePrintPreview,
// InvoicePrintFromList, InvoiceDetailsFromEmail), extracted once (decision
// #9, phase-6-invoices.md). Used by both /invoices/[id] (embedded preview)
// and /invoices/[id]/print (full print page + @media print).
//
// 2026-08-24, explicit user request — the line-items table used to render
// a single row (`description`, the intervention's free-text work summary)
// with the whole subtotal as its amount, never naming which spare parts
// were actually used. `parts`/`laborAmount` are read live off the
// invoice's underlying `intervention.parts` relation (see /api/invoices/
// [id] route.ts) — safe to treat as a stable snapshot in practice because
// parts POST/DELETE now refuse once an intervention is invoiced (see
// those routes' INTERVENTION_ALREADY_INVOICED guard). Optional so this
// stays backward compatible: when omitted, falls back to the original
// single-description-row rendering (the emailed PDF attachment, built
// inside the PROTECTED outbox/dispatcher.ts, still calls the pdf.tsx
// equivalent without these fields).
export interface InvoiceDocumentData {
  reference: string;
  issueDate: string;
  dueDate: string;
  paymentTerms: string;
  organization: { name: string; phone: string | null; city: string | null };
  client: { name: string; phone: string; email: string | null };
  description: string;
  laborAmount?: number;
  parts?: { name: string; quantity: number; unit: string; unitPrice: number; total: number }[];
  subtotal: number;
  taxRatePct: number;
  taxAmount: number;
  amount: number;
  notes: string | null;
}

function fcfa(n: number): string {
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR');
}

export default function InvoiceDocument({ data }: { data: InvoiceDocumentData }) {
  return (
    <div className="print-document bg-background border border-border rounded-md w-full max-w-[720px] overflow-x-auto">
      <div className="border-b border-border px-10 py-8 flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="text-2xl font-bold font-headings text-foreground mb-1">FACTURE</div>
          <div className="text-xs text-muted-foreground">
            N° {data.reference} · Émise le {fmtDate(data.issueDate)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-base font-bold text-foreground">{data.organization.name}</div>
          {data.organization.city && (
            <div className="text-xs text-muted-foreground mt-1">{data.organization.city}</div>
          )}
          {data.organization.phone && (
            <div className="text-xs text-muted-foreground">{data.organization.phone}</div>
          )}
        </div>
      </div>

      <div className="px-10 py-6 grid grid-cols-1 sm:grid-cols-3 gap-8 border-b border-border">
        <div>
          <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
            Facturé à
          </div>
          <div className="text-sm font-bold text-foreground">{data.client.name}</div>
          <div className="text-xs text-muted-foreground mt-1">{data.client.phone}</div>
          {data.client.email && (
            <div className="text-xs text-muted-foreground">{data.client.email}</div>
          )}
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
            Date d&apos;échéance
          </div>
          <div className="text-sm font-bold text-foreground">{fmtDate(data.dueDate)}</div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
            Conditions de paiement
          </div>
          <div className="text-sm font-bold text-foreground">{data.paymentTerms}</div>
        </div>
      </div>

      <div className="px-10 py-6 border-b border-border">
        {data.parts ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-2 font-medium">Désignation</th>
                <th className="text-center py-2 font-medium">Qté</th>
                <th className="text-right py-2 font-medium">P.U. (FCFA)</th>
                <th className="text-right py-2 font-medium">Total (FCFA)</th>
              </tr>
            </thead>
            <tbody>
              {!!data.laborAmount && (
                <tr className="border-b border-border/50">
                  <td className="py-2.5 text-foreground font-medium">Main-d&apos;œuvre</td>
                  <td className="py-2.5 text-center text-muted-foreground">—</td>
                  <td className="py-2.5 text-right text-muted-foreground">—</td>
                  <td className="py-2.5 text-right font-bold text-foreground">
                    {data.laborAmount.toLocaleString('fr-FR')}
                  </td>
                </tr>
              )}
              {data.parts.map((p, idx) => (
                <tr key={idx} className="border-b border-border/50 last:border-b-0">
                  <td className="py-2.5 text-foreground font-medium">{p.name}</td>
                  <td className="py-2.5 text-center text-muted-foreground">
                    {p.quantity} {p.unit}
                  </td>
                  <td className="py-2.5 text-right text-muted-foreground">
                    {p.unitPrice.toLocaleString('fr-FR')}
                  </td>
                  <td className="py-2.5 text-right font-bold text-foreground">
                    {p.total.toLocaleString('fr-FR')}
                  </td>
                </tr>
              ))}
              {!data.laborAmount && data.parts.length === 0 && (
                <tr>
                  <td className="py-2.5 text-foreground font-medium">{data.description}</td>
                  <td className="py-2.5 text-center text-muted-foreground">—</td>
                  <td className="py-2.5 text-right text-muted-foreground">—</td>
                  <td className="py-2.5 text-right font-bold text-foreground">
                    {data.subtotal.toLocaleString('fr-FR')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-2 font-medium">Description</th>
                <th className="text-right py-2 font-medium">Montant (FCFA)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-2.5 text-foreground font-medium">{data.description}</td>
                <td className="py-2.5 text-right font-bold text-foreground">
                  {data.subtotal.toLocaleString('fr-FR')}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <div className="px-10 py-6 border-b border-border">
        <div className="space-y-2 w-full sm:w-72 sm:ml-auto">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Sous-total HT</span>
            <span className="text-foreground">{fcfa(data.subtotal)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">TVA ({data.taxRatePct}%)</span>
            <span className="text-foreground">{fcfa(data.taxAmount)}</span>
          </div>
          <div className="flex justify-between text-sm font-bold border-t border-foreground pt-2">
            <span className="text-foreground">TOTAL TTC</span>
            <span className="text-foreground">{fcfa(data.amount)}</span>
          </div>
        </div>
      </div>

      {data.notes && (
        <div className="px-10 py-6 border-b border-border">
          <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
            Notes
          </div>
          <div className="text-xs text-muted-foreground">{data.notes}</div>
        </div>
      )}

      <div className="px-10 py-8">
        <div className="text-xs text-muted-foreground">
          Merci pour votre confiance. Veuillez effectuer le paiement selon les conditions ci-dessus.
        </div>
      </div>
    </div>
  );
}
