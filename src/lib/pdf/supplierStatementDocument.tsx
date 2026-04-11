import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

// ─── Types ───────────────────────────────────────────────────────────────────

export type StatementRow = {
  date: string
  reference: string
  description: string
  debit: number    // GRN — amount you owe
  credit: number   // Payment — amount you paid
  balance: number  // running balance
}

export type SupplierStatementData = {
  business: {
    name: string
    address: string | null
    phone: string | null
    tin: string | null
  }
  supplier: {
    name: string
    phone: string | null
    location: string | null
  }
  dateRange: { from: string; to: string }
  rows: StatementRow[]
  outstandingBalance: number
  asAt: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatGHS(n: number): string {
  return Math.abs(n)
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const colors = {
  text: '#1f2937',
  textLight: '#6b7280',
  accent: '#15803d',
  border: '#e5e7eb',
  bg: '#f9fafb',
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: colors.text,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  businessName: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: colors.accent,
    marginBottom: 4,
  },
  businessDetail: {
    fontSize: 9,
    color: colors.textLight,
    marginBottom: 1,
  },
  statementLabel: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: colors.accent,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginVertical: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  detailBlock: { flex: 1 },
  detailLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: colors.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  detailValue: { fontSize: 10, marginBottom: 2 },
  detailValueBold: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  tableHeaderText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: colors.textLight,
    textTransform: 'uppercase',
  },
  tableCell: { fontSize: 9 },
  colDate: { width: 60 },
  colRef: { width: 70 },
  colDesc: { flex: 1 },
  colAmount: { width: 70, textAlign: 'right' },
  colBalance: { width: 80, textAlign: 'right' },
  footer: {
    marginTop: 'auto',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  footerBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  footerBalanceLabel: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: colors.text,
    marginRight: 16,
  },
  footerBalanceValue: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: colors.accent,
  },
  footerNote: {
    fontSize: 9,
    color: colors.textLight,
    textAlign: 'center',
    marginTop: 4,
  },
})

// ─── Document ────────────────────────────────────────────────────────────────

export function SupplierStatementDocument({ data }: { data: SupplierStatementData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ── Header ── */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.businessName}>{data.business.name}</Text>
            {data.business.address && (
              <Text style={styles.businessDetail}>{data.business.address}</Text>
            )}
            {data.business.phone && (
              <Text style={styles.businessDetail}>Tel: {data.business.phone}</Text>
            )}
            {data.business.tin && (
              <Text style={styles.businessDetail}>GRA TIN: {data.business.tin}</Text>
            )}
          </View>
          <View>
            <Text style={styles.statementLabel}>STATEMENT OF ACCOUNT</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* ── Details ── */}
        <View style={styles.detailRow}>
          <View style={styles.detailBlock}>
            <Text style={styles.detailLabel}>Supplier</Text>
            <Text style={styles.detailValueBold}>{data.supplier.name}</Text>
            {data.supplier.phone && (
              <Text style={styles.detailValue}>{data.supplier.phone}</Text>
            )}
            {data.supplier.location && (
              <Text style={styles.detailValue}>{data.supplier.location}</Text>
            )}
          </View>
          <View style={styles.detailBlock}>
            <Text style={styles.detailLabel}>Period</Text>
            <Text style={styles.detailValue}>From: {data.dateRange.from}</Text>
            <Text style={styles.detailValue}>To: {data.dateRange.to}</Text>
            <Text style={styles.detailValue}>As at: {data.asAt}</Text>
          </View>
        </View>

        {/* ── Table ── */}
        <View>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.colDate]}>Date</Text>
            <Text style={[styles.tableHeaderText, styles.colRef]}>Reference</Text>
            <Text style={[styles.tableHeaderText, styles.colDesc]}>Description</Text>
            <Text style={[styles.tableHeaderText, styles.colAmount]}>Debit (Owed)</Text>
            <Text style={[styles.tableHeaderText, styles.colAmount]}>Credit (Paid)</Text>
            <Text style={[styles.tableHeaderText, styles.colBalance]}>Balance</Text>
          </View>
          {data.rows.map((row, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.tableCell, styles.colDate]}>{row.date}</Text>
              <Text style={[styles.tableCell, styles.colRef]}>{row.reference}</Text>
              <Text style={[styles.tableCell, styles.colDesc]}>{row.description}</Text>
              <Text style={[styles.tableCell, styles.colAmount]}>
                {row.debit > 0 ? formatGHS(row.debit) : '—'}
              </Text>
              <Text style={[styles.tableCell, styles.colAmount]}>
                {row.credit > 0 ? formatGHS(row.credit) : '—'}
              </Text>
              <Text style={[styles.tableCell, styles.colBalance]}>
                {formatGHS(row.balance)}
              </Text>
            </View>
          ))}
        </View>

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <View style={styles.footerBalanceRow}>
            <Text style={styles.footerBalanceLabel}>
              Outstanding Balance as at {data.asAt}:
            </Text>
            <Text style={styles.footerBalanceValue}>
              GHS {formatGHS(data.outstandingBalance)}
            </Text>
          </View>
          <Text style={styles.footerNote}>
            This statement was generated by {data.business.name}. Please contact us if you have any queries.
          </Text>
        </View>
      </Page>
    </Document>
  )
}
