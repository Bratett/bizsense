'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { formatGhs } from '@/lib/format'
import { downloadCsv, generateReportPdf } from '@/lib/reports/export'
import type { CashFlowStatement, CashFlowSection } from '@/lib/reports/cashFlow'

// ─── PDF document ─────────────────────────────────────────────────────────────

const pdfStyles = StyleSheet.create({
  page:        { padding: 32, fontFamily: 'Helvetica', fontSize: 10 },
  title:       { fontSize: 16, marginBottom: 4 },
  subtitle:    { fontSize: 9, color: '#6B7280', marginBottom: 16 },
  sectionHead: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 12, marginBottom: 2 },
  row:         { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  bold:        { fontFamily: 'Helvetica-Bold' },
  separator:   { borderBottom: '1pt solid #E5E7EB', marginVertical: 4 },
  total:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, marginTop: 2 },
  grandTotal:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, marginTop: 6, borderTop: '2pt solid #111827' },
  note:        { fontSize: 8, color: '#6B7280', marginTop: 4 },
})

function PDFSection({ section }: { section: CashFlowSection }) {
  return (
    <>
      <Text style={pdfStyles.sectionHead}>{section.label.toUpperCase()}</Text>
      {section.lines.map((l, i) => (
        <View key={i} style={pdfStyles.row}>
          <Text>{l.description}</Text>
          <Text>{formatGhs(l.amount)}</Text>
        </View>
      ))}
      {section.lines.length === 0 && (
        <View style={pdfStyles.row}><Text style={{ color: '#9CA3AF' }}>No activity</Text><Text>{formatGhs(0)}</Text></View>
      )}
      <View style={pdfStyles.separator} />
      <View style={pdfStyles.total}>
        <Text style={pdfStyles.bold}>Net {section.label}</Text>
        <Text style={pdfStyles.bold}>{formatGhs(section.netAmount)}</Text>
      </View>
    </>
  )
}

function CFDocument({ data }: { data: CashFlowStatement }) {
  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <Text style={pdfStyles.title}>Cash Flow Statement</Text>
        <Text style={pdfStyles.subtitle}>{data.period.from} to {data.period.to}</Text>

        <PDFSection section={data.operating} />
        <PDFSection section={data.investing} />
        <PDFSection section={data.financing} />

        <View style={{ ...pdfStyles.grandTotal, marginTop: 16 }}>
          <Text style={pdfStyles.bold}>Net Change in Cash</Text>
          <Text style={pdfStyles.bold}>{formatGhs(data.netChange)}</Text>
        </View>
        <View style={pdfStyles.row}>
          <Text>Opening Cash Balance</Text>
          <Text>{formatGhs(data.openingCashBalance)}</Text>
        </View>
        <View style={pdfStyles.row}>
          <Text>Closing Cash Balance</Text>
          <Text>{formatGhs(data.closingCashBalance)}</Text>
        </View>

        <Text style={pdfStyles.note}>
          Balance Sheet cash total (as at {data.period.to}): {formatGhs(data.closingCashCrossCheck)}
          {data.isReconciled
            ? ' — Reconciled ✓'
            : ` — Discrepancy of ${formatGhs(Math.abs(data.closingCashBalance - data.closingCashCrossCheck))}`
          }
        </Text>
      </Page>
    </Document>
  )
}

// ─── Section component ────────────────────────────────────────────────────────

function CashSection({ section }: { section: CashFlowSection }) {
  return (
    <>
      <tr className="bg-gray-50">
        <td colSpan={2} className="py-2 pl-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
          {section.label}
        </td>
      </tr>
      {section.lines.length === 0 && (
        <tr>
          <td className="py-2 pl-6 text-sm text-gray-400 italic" colSpan={2}>No activity in this period</td>
        </tr>
      )}
      {section.lines.map((line, i) => (
        <tr key={i}>
          <td className="py-1.5 pl-6 text-sm text-gray-700">{line.description}</td>
          <td className={`py-1.5 pr-4 text-right text-sm font-medium tabular-nums ${
            line.amount >= 0 ? 'text-green-700' : 'text-red-600'
          }`}>
            {formatGhs(line.amount)}
          </td>
        </tr>
      ))}
      <tr className="border-t border-gray-200 font-semibold">
        <td className="py-2 pl-4 text-sm text-gray-700">Net {section.label}</td>
        <td className={`py-2 pr-4 text-right text-sm tabular-nums ${
          section.netAmount >= 0 ? 'text-gray-900' : 'text-red-600'
        }`}>
          {formatGhs(section.netAmount)}
        </td>
      </tr>
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CashFlowReport({ data }: { data: CashFlowStatement }) {
  const [pdfLoading, setPdfLoading] = useState(false)

  const difference = Math.abs(data.closingCashBalance - data.closingCashCrossCheck)

  // ── CSV export ────────────────────────────────────────────────────────────
  const handleCsv = () => {
    const rows: Record<string, string | number>[] = []

    const addSection = (section: CashFlowSection) => {
      rows.push({ Section: section.label, Description: '', 'Amount (GHS)': '' })
      for (const l of section.lines) {
        rows.push({ Section: '', Description: l.description, 'Amount (GHS)': l.amount.toFixed(2) })
      }
      rows.push({ Section: `Net ${section.label}`, Description: '', 'Amount (GHS)': section.netAmount.toFixed(2) })
    }

    addSection(data.operating)
    addSection(data.investing)
    addSection(data.financing)

    rows.push({ Section: 'Net Change in Cash',    Description: '', 'Amount (GHS)': data.netChange.toFixed(2) })
    rows.push({ Section: 'Opening Cash Balance',  Description: '', 'Amount (GHS)': data.openingCashBalance.toFixed(2) })
    rows.push({ Section: 'Closing Cash Balance',  Description: '', 'Amount (GHS)': data.closingCashBalance.toFixed(2) })
    rows.push({ Section: 'Balance Sheet Cash (cross-check)', Description: '', 'Amount (GHS)': data.closingCashCrossCheck.toFixed(2) })

    downloadCsv(`cash-flow-${data.period.from}-to-${data.period.to}.csv`, rows)
  }

  // ── PDF export ────────────────────────────────────────────────────────────
  const handlePdf = async () => {
    setPdfLoading(true)
    try {
      const blob = await generateReportPdf(CFDocument, data)
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `cash-flow-${data.period.from}-to-${data.period.to}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Unclassified amount banner */}
      {data.unclassifiedAmount > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {formatGhs(data.unclassifiedAmount)} of cash movements could not be classified because
          one or more accounts do not have a cash flow category assigned.{' '}
          <Link href="/settings/chart-of-accounts" className="font-medium underline hover:text-amber-900">
            Assign categories →
          </Link>
        </div>
      )}

      {/* Export controls */}
      <div className="flex justify-end gap-2">
        <button
          onClick={handleCsv}
          className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Download CSV
        </button>
        <button
          onClick={handlePdf}
          disabled={pdfLoading}
          className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {pdfLoading ? 'Generating…' : 'Download PDF'}
        </button>
      </div>

      {/* Report table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full">
          <tbody className="divide-y divide-gray-100">

            <CashSection section={data.operating} />
            <CashSection section={data.investing} />
            <CashSection section={data.financing} />

            {/* Net change */}
            <tr className="border-t-2 border-gray-300 bg-gray-50">
              <td className="py-3 pl-4 text-sm font-bold text-gray-900">Net Change in Cash</td>
              <td className={`py-3 pr-4 text-right text-sm font-bold tabular-nums ${
                data.netChange >= 0 ? 'text-green-700' : 'text-red-600'
              }`}>
                {formatGhs(data.netChange)}
              </td>
            </tr>

            {/* Opening balance */}
            <tr>
              <td className="py-2 pl-4 text-sm text-gray-700">Opening Cash Balance</td>
              <td className="py-2 pr-4 text-right text-sm tabular-nums text-gray-900">
                {formatGhs(data.openingCashBalance)}
              </td>
            </tr>

            {/* Closing balance (arithmetic) */}
            <tr className="font-semibold">
              <td className="py-2.5 pl-4 text-sm text-gray-900">Closing Cash Balance</td>
              <td className="py-2.5 pr-4 text-right text-sm tabular-nums text-gray-900">
                {formatGhs(data.closingCashBalance)}
              </td>
            </tr>

          </tbody>
        </table>
      </div>

      {/* Reconciliation check */}
      <div className={`rounded-lg border px-4 py-3 text-sm ${
        data.isReconciled
          ? 'border-green-200 bg-green-50 text-green-800'
          : 'border-amber-200 bg-amber-50 text-amber-800'
      }`}>
        <div className="mb-1 text-xs text-gray-500">
          Balance Sheet cash total (as at {data.period.to}): {formatGhs(data.closingCashCrossCheck)}
        </div>
        {data.isReconciled ? (
          <span>✓ Reconciled with Balance Sheet</span>
        ) : (
          <span>
            ⚠ {formatGhs(difference)} discrepancy — check for unclassified accounts.{' '}
            <Link href={`/reports/balance-sheet?date=${data.period.to}`} className="font-medium underline">
              View Balance Sheet
            </Link>
          </span>
        )}
      </div>
    </div>
  )
}
