import React from 'react'
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from '@react-pdf/renderer'
import type { InvoiceData } from './types'

// ─── Formatting helpers ─────────────────────────────────────────────────────

export function formatGHS(n: number): string {
  const formatted = Math.abs(n)
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return n < 0 ? `GHS -${formatted}` : `GHS ${formatted}`
}

function formatRate(rate: number): string {
  const pct = rate * 100
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const colors = {
  text: '#1f2937',
  textLight: '#6b7280',
  accent: '#15803d',
  border: '#e5e7eb',
  bg: '#f9fafb',
  white: '#ffffff',
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: colors.text,
  },
  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    alignItems: 'flex-end',
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
  invoiceLabel: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: colors.accent,
    marginBottom: 8,
  },
  logo: {
    width: 60,
    height: 60,
    marginBottom: 6,
  },
  // Divider
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginVertical: 12,
  },
  // Invoice details + Bill To
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  detailBlock: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: colors.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 10,
    marginBottom: 2,
  },
  detailValueBold: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  // Table
  table: {
    marginBottom: 16,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 6,
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
  tableCell: {
    fontSize: 9,
  },
  colIndex: { width: 24 },
  colDesc: { flex: 1 },
  colQty: { width: 40, textAlign: 'right' },
  colPrice: { width: 70, textAlign: 'right' },
  colDiscount: { width: 60, textAlign: 'right' },
  colTotal: { width: 75, textAlign: 'right' },
  fxNote: {
    fontSize: 8,
    color: colors.textLight,
    fontStyle: 'italic',
    marginTop: 4,
  },
  // Totals
  totalsContainer: {
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  totalsBlock: {
    width: 220,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  totalsLabel: {
    fontSize: 9,
    color: colors.textLight,
  },
  totalsValue: {
    fontSize: 9,
    textAlign: 'right',
  },
  totalsDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginVertical: 4,
  },
  grandTotalLabel: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
  },
  grandTotalValue: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
  },
  // Payment
  paymentSection: {
    backgroundColor: colors.bg,
    borderRadius: 4,
    padding: 10,
    marginBottom: 16,
  },
  paymentTitle: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: colors.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  paymentLabel: {
    fontSize: 9,
    color: colors.textLight,
  },
  paymentValue: {
    fontSize: 9,
  },
  // Footer
  footer: {
    marginTop: 'auto',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 9,
    color: colors.textLight,
    marginBottom: 2,
  },
  footerBold: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: colors.textLight,
  },
})

// ─── Document Component ─────────────────────────────────────────────────────

export function InvoiceDocument({ data }: { data: InvoiceData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ── Header ── */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            {data.business.logoUrl && (
              <Image src={data.business.logoUrl} style={styles.logo} />
            )}
            <Text style={styles.businessName}>{data.business.name}</Text>
            {data.business.address && (
              <Text style={styles.businessDetail}>{data.business.address}</Text>
            )}
            {data.business.phone && (
              <Text style={styles.businessDetail}>
                Tel: {data.business.phone}
              </Text>
            )}
            {data.business.email && (
              <Text style={styles.businessDetail}>{data.business.email}</Text>
            )}
            {data.business.tin && (
              <Text style={styles.businessDetail}>
                GRA TIN: {data.business.tin}
              </Text>
            )}
            {data.business.vatRegistered && data.business.vatNumber && (
              <Text style={styles.businessDetail}>
                VAT Reg: {data.business.vatNumber}
              </Text>
            )}
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.invoiceLabel}>{data.invoiceLabel}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* ── Invoice Details + Bill To ── */}
        <View style={styles.detailRow}>
          <View style={styles.detailBlock}>
            <Text style={styles.detailLabel}>Invoice Details</Text>
            <Text style={styles.detailValueBold}>
              Invoice #: {data.invoiceNumber}
            </Text>
            <Text style={styles.detailValue}>Date: {data.invoiceDate}</Text>
            <Text style={styles.detailValue}>Due: {data.invoiceDate}</Text>
          </View>
          <View style={styles.detailBlock}>
            <Text style={styles.detailLabel}>Bill To</Text>
            {data.customer ? (
              <>
                <Text style={styles.detailValueBold}>
                  {data.customer.name}
                </Text>
                {data.customer.phone && (
                  <Text style={styles.detailValue}>
                    {data.customer.phone}
                  </Text>
                )}
                {data.customer.location && (
                  <Text style={styles.detailValue}>
                    {data.customer.location}
                  </Text>
                )}
              </>
            ) : (
              <Text style={styles.detailValue}>Walk-in Customer</Text>
            )}
          </View>
        </View>

        {/* ── Line Items Table ── */}
        <View style={styles.table}>
          {/* Header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.colIndex]}>#</Text>
            <Text style={[styles.tableHeaderText, styles.colDesc]}>
              Description
            </Text>
            <Text style={[styles.tableHeaderText, styles.colQty]}>Qty</Text>
            <Text style={[styles.tableHeaderText, styles.colPrice]}>
              Unit Price
            </Text>
            <Text style={[styles.tableHeaderText, styles.colDiscount]}>
              Discount
            </Text>
            <Text style={[styles.tableHeaderText, styles.colTotal]}>
              Line Total
            </Text>
          </View>
          {/* Rows */}
          {data.lines.map((line) => (
            <View key={line.index} style={styles.tableRow}>
              <Text style={[styles.tableCell, styles.colIndex]}>
                {line.index}
              </Text>
              <Text style={[styles.tableCell, styles.colDesc]}>
                {line.description}
              </Text>
              <Text style={[styles.tableCell, styles.colQty]}>
                {line.quantity}
              </Text>
              <Text style={[styles.tableCell, styles.colPrice]}>
                {line.unitPriceCurrency === 'USD' ? 'USD ' : ''}
                {line.unitPrice.toFixed(2)}
              </Text>
              <Text style={[styles.tableCell, styles.colDiscount]}>
                {line.discountAmount > 0 ? formatGHS(line.discountAmount) : '-'}
              </Text>
              <Text style={[styles.tableCell, styles.colTotal]}>
                {formatGHS(line.lineTotal)}
              </Text>
            </View>
          ))}
          {/* FX note */}
          {data.hasUsdLines && data.fxRate && (
            <Text style={styles.fxNote}>
              Rate: 1 USD = GHS {data.fxRate.toFixed(2)}
            </Text>
          )}
        </View>

        {/* ── Totals ── */}
        <View style={styles.totalsContainer}>
          <View style={styles.totalsBlock}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal</Text>
              <Text style={styles.totalsValue}>{formatGHS(data.subtotal)}</Text>
            </View>

            {data.discountAmount > 0 && (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>
                  Discount{data.discountLabel ? ` (${data.discountLabel})` : ''}
                </Text>
                <Text style={styles.totalsValue}>
                  -{formatGHS(data.discountAmount)}
                </Text>
              </View>
            )}

            {data.taxBreakdown.length > 0 && (
              <>
                <View style={styles.totalsDivider} />
                <View style={styles.totalsRow}>
                  <Text style={styles.totalsLabel}>Taxable Amount</Text>
                  <Text style={styles.totalsValue}>
                    {formatGHS(data.taxableAmount)}
                  </Text>
                </View>
                {data.taxBreakdown.map((tax) => (
                  <View key={tax.componentCode} style={styles.totalsRow}>
                    <Text style={styles.totalsLabel}>
                      {tax.componentName} ({formatRate(tax.rate)})
                    </Text>
                    <Text style={styles.totalsValue}>
                      {formatGHS(tax.taxAmount)}
                    </Text>
                  </View>
                ))}
              </>
            )}

            <View style={styles.totalsDivider} />
            <View style={styles.totalsRow}>
              <Text style={styles.grandTotalLabel}>TOTAL</Text>
              <Text style={styles.grandTotalValue}>
                {formatGHS(data.totalAmount)}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Payment ── */}
        {data.payment && (
          <View style={styles.paymentSection}>
            <Text style={styles.paymentTitle}>Payment Details</Text>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Payment Method</Text>
              <Text style={styles.paymentValue}>
                {data.payment.paymentMethodLabel}
              </Text>
            </View>
            {data.payment.momoReference && (
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>MoMo Reference</Text>
                <Text style={styles.paymentValue}>
                  {data.payment.momoReference}
                </Text>
              </View>
            )}
            {data.payment.bankReference && (
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>Bank Reference</Text>
                <Text style={styles.paymentValue}>
                  {data.payment.bankReference}
                </Text>
              </View>
            )}
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Amount Paid</Text>
              <Text style={styles.paymentValue}>
                {formatGHS(data.payment.amountPaid)}
              </Text>
            </View>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Balance Due</Text>
              <Text style={styles.paymentValue}>
                {formatGHS(data.balanceDue)}
              </Text>
            </View>
          </View>
        )}

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <Text style={styles.footerBold}>Thank you for your business.</Text>
          <Text style={styles.footerText}>
            {data.footerBusinessName}
            {data.footerBusinessPhone ? ` | ${data.footerBusinessPhone}` : ''}
          </Text>
        </View>
      </Page>
    </Document>
  )
}
