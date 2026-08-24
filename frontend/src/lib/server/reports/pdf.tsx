// Monthly report PDF — same @react-pdf/renderer approach as
// invoices/pdf.tsx (pure-JS, no headless-Chromium cold start on Vercel).
import 'server-only';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import type { MonthlyReportData } from './monthly';
import { formatMoneyForPdf } from '../pdf-format';

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 10, color: '#0d1b2a', fontFamily: 'Helvetica' },
  headerRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#d4d0c8',
    paddingBottom: 16,
    marginBottom: 20,
  },
  orgName: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  reportTitle: { fontSize: 13, color: '#152A4E', fontWeight: 700 },
  muted: { color: '#7a7568', fontSize: 9 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  kpiCard: {
    width: '31%',
    borderWidth: 1,
    borderColor: '#d4d0c8',
    borderRadius: 6,
    padding: 12,
  },
  kpiLabel: { fontSize: 8, textTransform: 'uppercase', color: '#7a7568', marginBottom: 4 },
  kpiValue: { fontSize: 18, fontWeight: 700 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 8,
    color: '#0d1b2a',
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
  colName: { width: '70%' },
  colAmount: { width: '30%', textAlign: 'right' },
  bold: { fontWeight: 700 },
  footer: { marginTop: 32, borderTopWidth: 1, borderTopColor: '#d4d0c8', paddingTop: 12 },
});

// 2026-08-24 bug fix — was `n.toLocaleString('fr-FR')`, which garbles
// inside react-pdf's base Helvetica font (see pdf-format.ts's file
// comment).
const fcfa = formatMoneyForPdf;

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function MonthlyReportDocument({ data }: { data: MonthlyReportData }) {
  return (
    <Document title={`Rapport ${capitalize(data.periodLabel)} — ${data.organizationName}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <Text style={styles.orgName}>{data.organizationName}</Text>
          <Text style={styles.reportTitle}>
            Rapport d&apos;activité — {capitalize(data.periodLabel)}
          </Text>
        </View>

        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Recettes encaissées</Text>
            <Text style={styles.kpiValue}>{fcfa(data.revenueFcfa)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Interventions terminées</Text>
            <Text style={styles.kpiValue}>{data.interventionsCompleted}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Interventions créées</Text>
            <Text style={styles.kpiValue}>{data.interventionsCreated}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Nouveaux clients</Text>
            <Text style={styles.kpiValue}>{data.newClients}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Nouveaux véhicules</Text>
            <Text style={styles.kpiValue}>{data.newVehicles}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Factures en retard</Text>
            <Text style={styles.kpiValue}>{data.unpaidInvoices}</Text>
          </View>
        </View>

        <View>
          <Text style={styles.sectionTitle}>Meilleurs clients du mois</Text>
          {data.topClients.length === 0 ? (
            <Text style={styles.muted}>Aucun paiement encaissé ce mois-ci.</Text>
          ) : (
            <>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.colName, styles.bold]}>Client</Text>
                <Text style={[styles.colAmount, styles.bold]}>Montant</Text>
              </View>
              {data.topClients.map((c) => (
                <View key={c.name} style={styles.tableRow}>
                  <Text style={styles.colName}>{c.name}</Text>
                  <Text style={styles.colAmount}>{fcfa(c.revenueFcfa)}</Text>
                </View>
              ))}
            </>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.muted}>Généré automatiquement par MekaSoft.</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderMonthlyReportPdf(data: MonthlyReportData): Promise<Buffer> {
  return renderToBuffer(<MonthlyReportDocument data={data} />);
}
