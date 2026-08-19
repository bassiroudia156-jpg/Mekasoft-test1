// Real receipt PDF for a SubscriptionPayment (garage → MekaSoft) — same
// `@react-pdf/renderer` pattern as `lib/server/payment-ledger/pdf.tsx`
// (garage → client receipts), a distinct domain with its own PDF rather than
// a shared generic one (different parties, different fields — no "invoice
// reference"/"client" here, but a provider + billing period instead).
import 'server-only';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';

export interface SubscriptionReceiptPdfData {
  paymentId: string;
  organizationName: string;
  plan: string;
  planLabel: string;
  provider: string;
  providerLabel: string;
  amount: number;
  currency: string;
  paidAt: string;
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
  brand: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  muted: { color: '#7a7568', fontSize: 9 },
  receiptTitle: { fontSize: 16, fontWeight: 700, color: '#0d3b6e', marginBottom: 4 },
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

function money(n: number, currency: string): string {
  return `${n.toLocaleString('fr-FR')} ${currency}`;
}

export function SubscriptionReceiptPdfDocument({ data }: { data: SubscriptionReceiptPdfData }) {
  return (
    <Document title={`Reçu ${data.paymentId}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.brand}>MekaSoft</Text>
            <Text style={styles.muted}>Abonnement — {data.organizationName}</Text>
          </View>
          <View>
            <Text style={styles.receiptTitle}>REÇU D&apos;ABONNEMENT</Text>
            <Text style={styles.bold}>{data.paymentId}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.row}>
            <View>
              <Text style={styles.label}>Forfait</Text>
              <Text style={styles.bold}>{data.planLabel}</Text>
            </View>
            <View>
              <Text style={styles.label}>Date de paiement</Text>
              <Text style={styles.bold}>{data.paidAt}</Text>
            </View>
          </View>
          <View style={styles.row}>
            <View>
              <Text style={styles.label}>Moyen de paiement</Text>
              <Text style={styles.bold}>{data.providerLabel}</Text>
            </View>
            <View>
              <Text style={styles.label}>Période de facturation</Text>
              <Text style={styles.bold}>Mensuelle</Text>
            </View>
          </View>
        </View>

        <View style={styles.amountBlock}>
          <Text style={styles.bold}>Montant payé</Text>
          <Text style={styles.amountValue}>{money(data.amount, data.currency)}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderSubscriptionReceiptPdf(
  data: SubscriptionReceiptPdfData,
): Promise<Buffer> {
  return renderToBuffer(<SubscriptionReceiptPdfDocument data={data} />);
}
