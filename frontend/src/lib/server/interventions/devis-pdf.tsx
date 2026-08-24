// Real PDF generation for devis (quotes) — @react-pdf/renderer, same
// engine + reasoning as invoices/pdf.tsx (pure-JS, no headless-Chromium
// cold start on Vercel). This was the one document phase-6-invoices.md's
// decision #1 landed for invoices but never followed up on for devis — the
// devis print page (interventions/[id]/devis/page.tsx) has been faking
// "Télécharger PDF" via window.print() ever since (Phase 5), which only
// offers "Save as PDF" through the browser's own print dialog rather than
// an actual one-click download. Mirrors the printable layout of that page,
// built from react-pdf's own primitives (View/Text/StyleSheet), not
// Tailwind — independent renderer of the same data shape.
import 'server-only';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { groupThousands, formatMoneyForPdf } from '../pdf-format';

export interface DevisPdfData {
  reference: string;
  createdAt: string;
  clientName: string;
  clientPhone: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleYear: number | null;
  vehicleRegistration: string;
  vehicleMileage: number | null;
  work: string;
  parts: { name: string; quantity: number; unitPrice: number; total: number }[];
  laborAmount: number;
  partsAmount: number;
  subtotal: number;
  taxRatePct: number;
  taxAmount: number;
  amount: number;
}

// Same token values as globals.css's @theme (react-pdf can't read CSS
// custom properties — see invoices/pdf.tsx's file comment for the same
// caveat, and globals.css's own comment about keeping these three in sync).
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
  devisTitle: { fontSize: 16, fontWeight: 700, color: '#152A4E', marginBottom: 4 },
  muted: { color: '#7a7568', fontSize: 9 },
  orgName: { fontSize: 14, fontWeight: 700, marginBottom: 2 },
  bold: { fontWeight: 700 },
  twoColRow: { flexDirection: 'row', gap: 32, marginBottom: 16 },
  col: { flexDirection: 'column', flex: 1 },
  label: { fontSize: 8, textTransform: 'uppercase', color: '#7a7568', marginBottom: 4 },
  section: { marginBottom: 16 },
  workBox: {
    backgroundColor: '#eceae4',
    borderRadius: 4,
    padding: 10,
  },
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
  colDesc: { width: '46%' },
  colQty: { width: '14%', textAlign: 'center' },
  colUnit: { width: '20%', textAlign: 'right' },
  colAmount: { width: '20%', textAlign: 'right' },
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

// 2026-08-24 — same garbled-thousands-separator fix as invoices/pdf.tsx
// (n.toLocaleString('fr-FR') breaks inside react-pdf's base Helvetica).
const fcfa = formatMoneyForPdf;

export function DevisPdfDocument({ data }: { data: DevisPdfData }) {
  const vehicleLabel =
    `${data.vehicleBrand} ${data.vehicleModel}${data.vehicleYear ? ` ${data.vehicleYear}` : ''}`.trim();
  const vehicleSub = `Plaque : ${data.vehicleRegistration}${
    data.vehicleMileage ? ` · ${groupThousands(data.vehicleMileage)} km` : ''
  }`;

  return (
    <Document title={`Devis ${data.reference}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.devisTitle}>DEVIS DE RÉPARATION</Text>
            <Text style={styles.muted}>
              N° {data.reference} · Émis le {data.createdAt}
            </Text>
          </View>
          <View>
            <Text style={styles.orgName}>MekaSoft Garage</Text>
            <Text style={styles.muted}>Dakar, Sénégal</Text>
          </View>
        </View>

        <View style={styles.twoColRow}>
          <View style={styles.col}>
            <Text style={styles.label}>Client</Text>
            <Text style={styles.bold}>{data.clientName}</Text>
            <Text style={styles.muted}>{data.clientPhone}</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>Véhicule</Text>
            <Text style={styles.bold}>{vehicleLabel}</Text>
            <Text style={styles.muted}>{vehicleSub}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Travaux à effectuer</Text>
          <View style={styles.workBox}>
            <Text>{data.work}</Text>
          </View>
        </View>

        {data.parts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.label}>Pièces de rechange</Text>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.colDesc, styles.bold]}>Désignation</Text>
              <Text style={[styles.colQty, styles.bold]}>Qté</Text>
              <Text style={[styles.colUnit, styles.bold]}>P.U. (FCFA)</Text>
              <Text style={[styles.colAmount, styles.bold]}>Total (FCFA)</Text>
            </View>
            {data.parts.map((p, idx) => (
              <View key={idx} style={styles.tableRow}>
                <Text style={styles.colDesc}>{p.name}</Text>
                <Text style={styles.colQty}>{p.quantity}</Text>
                <Text style={styles.colUnit}>{groupThousands(p.unitPrice)}</Text>
                <Text style={styles.colAmount}>{groupThousands(p.total)}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.label}>Récapitulatif</Text>
          <View style={styles.totalsBlock}>
            <View style={styles.totalsRow}>
              <Text>Main-d&apos;œuvre</Text>
              <Text>{fcfa(data.laborAmount)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text>Pièces</Text>
              <Text>{fcfa(data.partsAmount)}</Text>
            </View>
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
          <Text style={styles.bold}>Validité du devis</Text>
          <Text style={styles.muted}>
            Ce devis est valable 30 jours à compter de sa date d&apos;émission.
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderDevisPdf(data: DevisPdfData): Promise<Buffer> {
  return renderToBuffer(<DevisPdfDocument data={data} />);
}
