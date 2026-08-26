// Real PDF generation for invoices — @react-pdf/renderer, per
// IMPLEMENTATION-PLAN.md decision #4 (pure-JS, no headless-Chromium
// cold-start problem on Vercel). Mirrors the printable layout used by the
// web InvoiceDocument component (components/invoices/InvoiceDocument.tsx)
// but built from react-pdf's own primitives (View/Text/StyleSheet), not
// Tailwind — the two are independent renderers of the same data shape.
import 'server-only';
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { groupThousands, formatMoneyForPdf } from '../pdf-format';

export interface InvoicePdfData {
  reference: string;
  issueDate: string;
  dueDate: string;
  paymentTerms: string;
  organizationName: string;
  organizationPhone: string | null;
  organizationCity: string | null;
  /** Pro+ only — the caller is responsible for passing `null`/omitting
   * this when the org's plan doesn't include invoiceBranding, even if
   * `Organization.logoUrl` happens to be set (e.g. downgraded plan).
   * Optional (not just nullable) — outbox/dispatcher.ts (PROTECTED, not
   * modified by this change) calls renderInvoicePdf for the emailed
   * attachment without this field; omitting it renders without a logo,
   * same as before this feature existed. */
  organizationLogoUrl?: string | null;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  description: string;
  /**
   * 2026-08-24, explicit user request — itemize the parts actually used
   * instead of one line with the intervention's free-text work summary.
   * Both optional so this stays backward compatible with the one call
   * site that can't be touched: the PROTECTED outbox/dispatcher.ts's
   * emailed-attachment build (atomic-claim/backoff invariants live there,
   * unrelated to this data shape — see CLAUDE.md's protected-files list).
   * When either is omitted, renders the original single-description-row
   * table exactly as before.
   */
  laborAmount?: number;
  parts?: { name: string; quantity: number; unit: string; unitPrice: number; total: number }[];
  subtotal: number;
  taxRatePct: number;
  taxAmount: number;
  amount: number;
}

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 10, color: '#0d1b2a', fontFamily: 'Helvetica' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#d4d0c8',
    paddingBottom: 16,
    marginBottom: 16,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 40, height: 40, objectFit: 'contain' },
  orgName: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  muted: { color: '#7a7568', fontSize: 9 },
  invoiceTitle: { fontSize: 16, fontWeight: 700, color: '#152A4E', marginBottom: 4 },
  bold: { fontWeight: 700 },
  datesRow: { flexDirection: 'row', gap: 24, marginBottom: 16 },
  dateBlock: { flexDirection: 'column' },
  label: { fontSize: 8, textTransform: 'uppercase', color: '#7a7568', marginBottom: 2 },
  section: { marginBottom: 16 },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#d4d0c8',
    paddingBottom: 6,
    marginBottom: 6,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eceae4',
    paddingVertical: 6,
  },
  colDesc: { width: '50%' },
  colQty: { width: '16.66%', textAlign: 'right' },
  colUnit: { width: '16.66%', textAlign: 'right' },
  colAmount: { width: '16.66%', textAlign: 'right' },
  totalsBlock: { marginTop: 12, alignItems: 'flex-end' },
  totalsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 4,
    width: 220,
    justifyContent: 'space-between',
  },
  totalsFinalRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#0d1b2a',
    width: 220,
    justifyContent: 'space-between',
  },
  footer: { marginTop: 32, borderTopWidth: 1, borderTopColor: '#d4d0c8', paddingTop: 12 },
});

// 2026-08-24 bug fix — was `n.toLocaleString('fr-FR')`, which garbles
// inside react-pdf's base Helvetica font (see pdf-format.ts's file
// comment). formatMoneyForPdf/groupThousands never produce that character.
const fcfa = formatMoneyForPdf;

export function InvoicePdfDocument({ data }: { data: InvoicePdfData }) {
  return (
    <Document title={`Facture ${data.reference}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            {/* @react-pdf/renderer's Image has no alt prop (not a DOM <img>) — this project has no jsx-a11y rule registered anyway. */}
            {data.organizationLogoUrl && (
              <Image src={data.organizationLogoUrl} style={styles.logo} />
            )}
            <View>
              <Text style={styles.orgName}>{data.organizationName}</Text>
              {data.organizationCity && <Text style={styles.muted}>{data.organizationCity}</Text>}
              {data.organizationPhone && <Text style={styles.muted}>{data.organizationPhone}</Text>}
            </View>
          </View>
          <View>
            <Text style={styles.invoiceTitle}>FACTURE</Text>
            <Text style={styles.bold}>{data.reference}</Text>
          </View>
        </View>

        <View style={styles.datesRow}>
          <View style={styles.dateBlock}>
            <Text style={styles.label}>Date d&apos;émission</Text>
            <Text style={styles.bold}>{data.issueDate}</Text>
          </View>
          <View style={styles.dateBlock}>
            <Text style={styles.label}>Date d&apos;échéance</Text>
            <Text style={styles.bold}>{data.dueDate}</Text>
          </View>
          <View style={styles.dateBlock}>
            <Text style={styles.label}>Conditions</Text>
            <Text style={styles.bold}>{data.paymentTerms}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Facturation</Text>
          <Text style={styles.bold}>{data.clientName}</Text>
          <Text>{data.clientPhone}</Text>
          {data.clientEmail && <Text>{data.clientEmail}</Text>}
        </View>

        <View>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.colDesc, styles.bold]}>Désignation</Text>
            <Text style={[styles.colQty, styles.bold]}>Quantité</Text>
            <Text style={[styles.colUnit, styles.bold]}>P.U. HT</Text>
            <Text style={[styles.colAmount, styles.bold]}>Montant</Text>
          </View>
          {data.parts ? (
            <>
              {!!data.laborAmount && (
                <View style={styles.tableRow}>
                  <Text style={styles.colDesc}>Main-d&apos;œuvre</Text>
                  <Text style={styles.colQty}>—</Text>
                  <Text style={styles.colUnit}>—</Text>
                  <Text style={styles.colAmount}>{groupThousands(data.laborAmount)}</Text>
                </View>
              )}
              {data.parts.map((p, idx) => (
                <View key={idx} style={styles.tableRow}>
                  <Text style={styles.colDesc}>{p.name}</Text>
                  <Text style={styles.colQty}>
                    {p.quantity} {p.unit}
                  </Text>
                  <Text style={styles.colUnit}>{groupThousands(p.unitPrice)}</Text>
                  <Text style={styles.colAmount}>{groupThousands(p.total)}</Text>
                </View>
              ))}
              {!data.laborAmount && data.parts.length === 0 && (
                <View style={styles.tableRow}>
                  <Text style={styles.colDesc}>{data.description}</Text>
                  <Text style={styles.colQty}>1</Text>
                  <Text style={styles.colUnit}>{groupThousands(data.subtotal)}</Text>
                  <Text style={styles.colAmount}>{groupThousands(data.subtotal)}</Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.tableRow}>
              <Text style={styles.colDesc}>{data.description}</Text>
              <Text style={styles.colQty}>1</Text>
              <Text style={styles.colUnit}>{groupThousands(data.subtotal)}</Text>
              <Text style={styles.colAmount}>{groupThousands(data.subtotal)}</Text>
            </View>
          )}

          <View style={styles.totalsBlock}>
            <View style={styles.totalsRow}>
              <Text>Sous-total HT</Text>
              <Text>{fcfa(data.subtotal)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text>TVA ({data.taxRatePct}%)</Text>
              <Text>{fcfa(data.taxAmount)}</Text>
            </View>
            <View style={styles.totalsFinalRow}>
              <Text style={styles.bold}>Total TTC</Text>
              <Text style={styles.bold}>{fcfa(data.amount)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.bold}>Conditions de paiement</Text>
          <Text style={styles.muted}>
            Merci pour votre confiance. Veuillez effectuer le paiement selon les conditions
            ci-dessus.
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return renderToBuffer(<InvoicePdfDocument data={data} />);
}
