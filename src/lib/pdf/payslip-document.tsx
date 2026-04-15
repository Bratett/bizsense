import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import type { PayslipData } from '@/actions/payroll'

import { formatGhs } from '@/lib/format'

// ─── Styles ──────────────────────────────────────────────────────────────────

const colors = {
  text: '#1f2937',
  textLight: '#6b7280',
  accent: '#15803d',
  border: '#e5e7eb',
  bg: '#f9fafb',
  netBg: '#f0fdf4',
  netBorder: '#86efac',
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
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  headerLeft: { flex: 1 },
  headerRight: { alignItems: 'flex-end' },
  businessName: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: colors.accent,
    marginBottom: 3,
  },
  businessDetail: {
    fontSize: 9,
    color: colors.textLight,
    marginBottom: 1,
  },
  payslipLabel: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: colors.accent,
    letterSpacing: 1,
  },
  periodText: {
    fontSize: 9,
    color: colors.textLight,
    marginTop: 3,
    textAlign: 'right',
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginVertical: 12,
  },
  // Employee details section
  sectionLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: colors.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  employeeGrid: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 14,
  },
  employeeCol: { flex: 1 },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  detailLabel: {
    fontSize: 9,
    color: colors.textLight,
    width: 80,
  },
  detailValue: {
    fontSize: 9,
    flex: 1,
  },
  detailValueBold: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    flex: 1,
  },
  // Tables (earnings / deductions)
  tableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  tableHeaderText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: colors.textLight,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  tableRowLabel: { fontSize: 9, color: colors.text, flex: 1 },
  tableRowValue: { fontSize: 9, textAlign: 'right' },
  tableTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 1,
  },
  tableTotalLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    flex: 1,
  },
  tableTotalValue: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
  },
  twoCol: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 14,
  },
  tableBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
  },
  // Net pay
  netPayBox: {
    borderWidth: 2,
    borderColor: colors.netBorder,
    backgroundColor: colors.netBg,
    borderRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  netPayLabel: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: colors.accent,
  },
  netPayValue: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: colors.accent,
  },
  // Employer contributions (informational)
  infoBox: {
    backgroundColor: colors.bg,
    borderRadius: 3,
    padding: 10,
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  infoLabel: { fontSize: 9, color: colors.textLight, flex: 1 },
  infoValue: { fontSize: 9, textAlign: 'right' },
  infoNote: {
    fontSize: 8,
    color: colors.textLight,
    fontStyle: 'italic',
    marginTop: 4,
  },
  // Payment details
  paymentBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
    padding: 10,
    marginBottom: 14,
  },
  // Footer
  footer: {
    marginTop: 'auto',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 8,
    color: colors.textLight,
  },
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('en-GH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function fmtPeriod(start: string, end: string): string {
  const d = new Date(start + 'T00:00:00Z')
  return d.toLocaleDateString('en-GH', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    + ` (${fmtDate(start)} – ${fmtDate(end)})`
}

function fmtPeriodShort(start: string): string {
  const d = new Date(start + 'T00:00:00Z')
  return d.toLocaleDateString('en-GH', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  mtn_momo: 'MTN MoMo',
  telecel: 'Telecel Cash',
  airteltigo: 'AirtelTigo Money',
  bank: 'Bank Transfer',
}

// ─── Document component ───────────────────────────────────────────────────────

export function PayslipDocument({ data }: { data: PayslipData }) {
  const { business, staff, period, line } = data

  const grossNum = Number(line.grossSalary)
  const otherNum = Number(line.otherDeductions)
  const ssnitEmpNum = Number(line.ssnitEmployee)
  const payeNum = Number(line.payeTax)
  const netNum = Number(line.netSalary)
  const ssnitEmprNum = Number(line.ssnitEmployer)
  const totalCostNum = Number(line.totalCostToEmployer)

  // Bonus = negative otherDeductions
  const hasBonus = otherNum < 0
  const bonusAmt = Math.abs(otherNum)
  const hasOtherDeduction = otherNum > 0

  const totalGrossEarnings = hasBonus ? grossNum + bonusAmt : grossNum
  const totalDeductions = ssnitEmpNum + payeNum + (hasOtherDeduction ? otherNum : 0)

  const today = new Date().toLocaleDateString('en-GH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* ── Header ── */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.businessName}>{business.name}</Text>
            {business.address && (
              <Text style={styles.businessDetail}>{business.address}</Text>
            )}
            {business.phone && (
              <Text style={styles.businessDetail}>Tel: {business.phone}</Text>
            )}
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.payslipLabel}>PAYSLIP</Text>
            <Text style={styles.periodText}>
              Pay Period: {fmtPeriod(period.start, period.end)}
            </Text>
            <Text style={styles.periodText}>Date Issued: {today}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* ── Employee Details ── */}
        <Text style={styles.sectionLabel}>Employee Details</Text>
        <View style={styles.employeeGrid}>
          <View style={styles.employeeCol}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Name</Text>
              <Text style={styles.detailValueBold}>{staff.fullName}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Role</Text>
              <Text style={styles.detailValue}>{staff.roleTitle ?? '—'}</Text>
            </View>
          </View>
          <View style={styles.employeeCol}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>SSNIT No.</Text>
              <Text style={styles.detailValue}>{staff.ssnitNumber ?? 'Not provided'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>TIN</Text>
              <Text style={styles.detailValue}>{staff.tin ?? 'Not provided'}</Text>
            </View>
          </View>
        </View>

        {/* ── Earnings & Deductions (side by side) ── */}
        <View style={styles.twoCol}>
          {/* Earnings */}
          <View style={styles.tableBox}>
            <View style={styles.tableHeader}>
              <Text style={styles.tableHeaderText}>Earnings</Text>
              <Text style={styles.tableHeaderText}>GHS</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableRowLabel}>Basic Salary</Text>
              <Text style={styles.tableRowValue}>{formatGhs(grossNum)}</Text>
            </View>
            {hasBonus && (
              <View style={styles.tableRow}>
                <Text style={styles.tableRowLabel}>Bonus / Extra Pay</Text>
                <Text style={styles.tableRowValue}>{formatGhs(bonusAmt)}</Text>
              </View>
            )}
            <View style={styles.tableTotalRow}>
              <Text style={styles.tableTotalLabel}>Total Gross Earnings</Text>
              <Text style={styles.tableTotalValue}>{formatGhs(totalGrossEarnings)}</Text>
            </View>
          </View>

          {/* Deductions */}
          <View style={styles.tableBox}>
            <View style={styles.tableHeader}>
              <Text style={styles.tableHeaderText}>Deductions</Text>
              <Text style={styles.tableHeaderText}>GHS</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableRowLabel}>SSNIT (Employee 5.5%)</Text>
              <Text style={styles.tableRowValue}>{formatGhs(ssnitEmpNum)}</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableRowLabel}>PAYE Tax</Text>
              <Text style={styles.tableRowValue}>{formatGhs(payeNum)}</Text>
            </View>
            {hasOtherDeduction && (
              <View style={styles.tableRow}>
                <Text style={styles.tableRowLabel}>Other Deductions</Text>
                <Text style={styles.tableRowValue}>{formatGhs(otherNum)}</Text>
              </View>
            )}
            <View style={styles.tableTotalRow}>
              <Text style={styles.tableTotalLabel}>Total Deductions</Text>
              <Text style={styles.tableTotalValue}>{formatGhs(totalDeductions)}</Text>
            </View>
          </View>
        </View>

        {/* ── Net Pay ── */}
        <View style={styles.netPayBox}>
          <Text style={styles.netPayLabel}>NET SALARY</Text>
          <Text style={styles.netPayValue}>{formatGhs(netNum)}</Text>
        </View>

        {/* ── Employer Contributions (informational) ── */}
        <View style={styles.infoBox}>
          <Text style={[styles.sectionLabel, { marginBottom: 6 }]}>
            Employer Contributions (Informational — not deducted from employee)
          </Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>SSNIT (Employer 13%)</Text>
            <Text style={styles.infoValue}>{formatGhs(ssnitEmprNum)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Total Cost to Employer</Text>
            <Text style={styles.infoValue}>{formatGhs(totalCostNum)}</Text>
          </View>
        </View>

        {/* ── Payment Details (only if paid) ── */}
        {line.isPaid && (
          <View style={styles.paymentBox}>
            <Text style={[styles.sectionLabel, { marginBottom: 6 }]}>Payment Details</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Method</Text>
              <Text style={styles.infoValue}>
                {METHOD_LABELS[line.paymentMethod ?? ''] ?? (line.paymentMethod ?? '—')}
              </Text>
            </View>
            {line.paymentReference && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Reference</Text>
                <Text style={styles.infoValue}>{line.paymentReference}</Text>
              </View>
            )}
            {line.paidAt && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Date Paid</Text>
                <Text style={styles.infoValue}>
                  {new Date(line.paidAt).toLocaleDateString('en-GH', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {`This payslip is generated by BizSense. For queries, contact ${business.name}${business.phone ? ` (${business.phone})` : ''}.`}
          </Text>
          <Text style={[styles.footerText, { marginTop: 2 }]}>
            {`${fmtPeriodShort(period.start)} payslip`}
          </Text>
        </View>

      </Page>
    </Document>
  )
}
