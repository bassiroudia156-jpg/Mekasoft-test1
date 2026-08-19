// Real receipt PDF generation — same `@react-pdf/renderer` pattern as
// Phase 6's `lib/server/invoices/pdf.tsx`. The "Télécharger" button next
// to "Reçu généré" (PaymentRegisteredConfirmation) is concrete, designed
// UI — not dead (decision #6, phase-7-payments.md).
import 'server-only';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';

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
  orgName: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  muted: { color: '#7a7568', fontSize: 9 },
  receiptTitle: { fontSize: 16, fontWeight: 700, color: '#152A4E', marginBottom: 4 },
  bold: { fontWeight: 700 },
  section: { marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontSize: 8, textTransform: 'uppercase', color: '#7a7568', marginBottom: 2 },
  amountBlock: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#0d1b2a',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  amountValue: { fontSize: 18, fontWeight: 700 },
});

function fcfa(n: number): string {
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

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
          <View>
            <Text style={styles.receiptTitle}>REÇU</Text>
            <Text style={styles.bold}>{data.receiptReference}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.row}>
            <View>
              <Text style={styles.label}>N° de paiement</Text>
              <Text style={styles.bold}>{data.paymentReference}</Text>
            </View>
            <View>
              <Text style={styles.label}>Date</Text>
              <Text style={styles.bold}>{data.paymentDate}</Text>
            </View>
          </View>
          <View style={styles.row}>
            <View>
              <Text style={styles.label}>Facture</Text>
              <Text style={styles.bold}>{data.invoiceReference}</Text>
            </View>
            <View>
              <Text style={styles.label}>Client</Text>
              <Text style={styles.bold}>{data.clientName}</Text>
            </View>
          </View>
          <View style={styles.row}>
            <View>
              <Text style={styles.label}>Méthode</Text>
              <Text style={styles.bold}>{data.method}</Text>
            </View>
          </View>
        </View>

        <View style={styles.amountBlock}>
          <Text style={styles.bold}>Montant reçu</Text>
          <Text style={styles.amountValue}>{fcfa(data.amount)}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderReceiptPdf(data: ReceiptPdfData): Promise<Buffer> {
  return renderToBuffer(<ReceiptPdfDocument data={data} />);
}
