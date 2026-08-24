// Real receipt PDF generation — same `@react-pdf/renderer` pattern as
// Phase 6's `lib/server/invoices/pdf.tsx`. The "Télécharger" button next
// to "Reçu généré" (PaymentRegisteredConfirmation) is concrete, designed
// UI — not dead (decision #6, phase-7-payments.md).
//
// 2026-08-24, explicit user request — two problems with the original
// layout: (1) the amount rendered garbled ("39/000FCFA" instead of
// "39 000 FCFA") because toLocaleString('fr-FR') groups thousands with
// U+202F, a character react-pdf's base Helvetica font can't display — see
// lib/server/pdf-format.ts's file comment for the full root cause; (2)
// the info rows and the amount row weren't vertically centered, and the
// whole document read as a bare, unstyled list rather than a receipt.
// Redesigned: a proper 2-column info grid (all cells the same shape/
// alignment), a highlighted, vertically-centered amount block echoing the
// brand color, and a thank-you footer matching invoices/pdf.tsx's tone.
import 'server-only';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { formatMoneyForPdf } from '../pdf-format';

export interface ReceiptPdfData {
  receiptReference: string;
  paymentReference: string;
  paymentDate: string;
  invoiceReference: string;
  method: string;
  organizationName: string;
  organizationPhone: string | null;
  organizationCity: string | null;
  clientName: string;
  amount: number;
}

const BRAND = '#152A4E';

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 10, color: '#0d1b2a', fontFamily: 'Helvetica' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 2,
    borderBottomColor: BRAND,
    paddingBottom: 16,
    marginBottom: 24,
  },
  orgName: { fontSize: 18, fontWeight: 700, color: BRAND, marginBottom: 4 },
  muted: { color: '#7a7568', fontSize: 9, lineHeight: 1.5 },
  receiptTitleBlock: { alignItems: 'flex-end' },
  receiptTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: BRAND,
    letterSpacing: 1,
    marginBottom: 4,
  },
  receiptRef: { fontSize: 11, fontWeight: 700, color: '#0d1b2a' },
  section: { marginBottom: 24 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  infoCell: { width: '50%', marginBottom: 16 },
  label: {
    fontSize: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#7a7568',
    marginBottom: 3,
  },
  value: { fontSize: 11, fontWeight: 700, color: '#0d1b2a' },
  amountBlock: {
    padding: 18,
    borderRadius: 4,
    backgroundColor: '#eef1f8',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amountLabel: { fontSize: 11, fontWeight: 700, color: '#0d1b2a' },
  amountValue: { fontSize: 20, fontWeight: 700, color: BRAND },
  footer: { marginTop: 32, borderTopWidth: 1, borderTopColor: '#d4d0c8', paddingTop: 12 },
});

export function ReceiptPdfDocument({ data }: { data: ReceiptPdfData }) {
  return (
    <Document title={`Reçu ${data.receiptReference}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.orgName}>{data.organizationName}</Text>
            {data.organizationCity && <Text style={styles.muted}>{data.organizationCity}</Text>}
            {data.organizationPhone && <Text style={styles.muted}>{data.organizationPhone}</Text>}
          </View>
          <View style={styles.receiptTitleBlock}>
            <Text style={styles.receiptTitle}>REÇU</Text>
            <Text style={styles.receiptRef}>{data.receiptReference}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.infoGrid}>
            <View style={styles.infoCell}>
              <Text style={styles.label}>N° de paiement</Text>
              <Text style={styles.value}>{data.paymentReference}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.label}>Date</Text>
              <Text style={styles.value}>{data.paymentDate}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.label}>Facture</Text>
              <Text style={styles.value}>{data.invoiceReference}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.label}>Client</Text>
              <Text style={styles.value}>{data.clientName}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.label}>Méthode de paiement</Text>
              <Text style={styles.value}>{data.method}</Text>
            </View>
          </View>
        </View>

        <View style={styles.amountBlock}>
          <Text style={styles.amountLabel}>Montant reçu</Text>
          <Text style={styles.amountValue}>{formatMoneyForPdf(data.amount)}</Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.muted}>
            Merci pour votre confiance. Ce reçu atteste du paiement reçu à la date indiquée
            ci-dessus.
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderReceiptPdf(data: ReceiptPdfData): Promise<Buffer> {
  return renderToBuffer(<ReceiptPdfDocument data={data} />);
}
