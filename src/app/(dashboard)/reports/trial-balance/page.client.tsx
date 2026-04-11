'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { formatGhs } from '@/lib/format'
import { downloadCsv, generateReportPdf } from '@/lib/reports/export'
import type { TrialBalanceReport, TrialBalanceLine } from '@/lib/reports/trialBalance'

// ─── PDF document ─────────────────────────────────────────────────────────────

const pdfStyles = StyleSheet.create({
  page:     { padding: 32, fontFamily: 'Helvetica', fontSize: 9 },
  title:    { fontSize: 16, marginBottom: 4 },
  subtitle: { fontSize: 9, color: '#6B7280', marginBottom: 16 },
  header:   { flexDirection: 'row', borderBottom: '1pt solid #E5E7EB', paddingBottom: 4, marginBottom: 4 },
  row:      { flexDirection: 'row', paddingVertical: 2, borderBottom: '0.5pt solid #F3F4F6' },
  col1:     { width: '10%' },
  col2:     { width: '40%' },
  col3:     { width: '20%' },
  col4:     { width: '15%', textAlign: 'right' },
  col5:     { width: '15%', textAlign: 'right' },
  bold:     { fontFamily: 'Helvetica-Bold' },
  totals:   { flexDirection: 'row', borderTop: '1pt solid #111827', paddingTop: 4, marginTop: 4 },
})

function TBDocument({ data }: { data: TrialBalanceReport }) {
  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <Text style={pdfStyles.title}>Trial Balance</Text>
        <Text style={pdfStyles.subtitle}>As at {data.asOfDate}</Text>

        <View style={pdfStyles.header}>
          <Text style={[pdfStyles.col1, pdfStyles.bold]}>Code</Text>
          <Text style={[pdfStyles.col2, pdfStyles.bold]}>Account</Text>
          <Text style={[pdfStyles.col3, pdfStyles.bold]}>Type</Text>
          <Text style={[pdfStyles.col4, pdfStyles.bold]}>Debits</Text>
          <Text style={[pdfStyles.col5, pdfStyles.bold]}>Credits</Text>
        </View>

        {data.lines.map(l => (
          <View key={l.accountId} style={pdfStyles.row}>
            <Text style={pdfStyles.col1}>{l.accountCode}</Text>
            <Text style={pdfStyles.col2}>{l.accountName}</Text>
            <Text style={pdfStyles.col3}>{l.accountType}</Text>
            <Text style={pdfStyles.col4}>{l.cumulativeDebits > 0 ? l.cumulativeDebits.toFixed(2) : ''}</Text>
            <Text style={pdfStyles.col5}>{l.cumulativeCredits > 0 ? l.cumulativeCredits.toFixed(2) : ''}</Text>
          </View>
        ))}

        <View style={pdfStyles.totals}>
          <Text style={[pdfStyles.col1]}></Text>
          <Text style={[pdfStyles.col2, pdfStyles.bold]}>TOTAL</Text>
          <Text style={pdfStyles.col3}></Text>
          <Text style={[pdfStyles.col4, pdfStyles.bold]}>{data.totalDebits.toFixed(2)}</Text>
          <Text style={[pdfStyles.col5, pdfStyles.bold]}>{data.totalCredits.toFixed(2)}</Text>
        </View>
      </Page>
    </Document>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TrialBalanceTable({ data }: { data: TrialBalanceReport }) {
  const [pdfLoading, setPdfLoading] = useState(false)

  const handleCsv = () => {
    const rows = data.lines.map((l: TrialBalanceLine) => ({
      'Code':          l.accountCode,
      'Account Name':  l.accountName,
      'Type':          l.accountType,
      'Debits (GHS)':  l.cumulativeDebits.toFixed(2),
      'Credits (GHS)': l.cumulativeCredits.toFixed(2),
    }))
    rows.push({
      'Code':          'TOTAL',
      'Account Name':  '',
      'Type':          '',
      'Debits (GHS)':  data.totalDebits.toFixed(2),
      'Credits (GHS)': data.totalCredits.toFixed(2),
    })
    downloadCsv(`trial-balance-${data.asOfDate}.csv`, rows)
  }

  const handlePdf = async () => {
    setPdfLoading(true)
    try {
      const blob = await generateReportPdf(TBDocument, data)
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `trial-balance-${data.asOfDate}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setPdfLoading(false)
    }
  }

  const isBalanced = data.isBalanced

  return (
    <div className="space-y-4">
      {/* Balance status banner */}
      {isBalanced ? (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          ✓ Trial Balance is in balance — {formatGhs(data.totalDebits)}
        </div>
      ) : (
        <div className="rounded-lg border-2 border-red-400 bg-red-50 px-4 py-4">
          <p className="text-sm font-bold text-red-700">
            ⚠ IMBALANCE DETECTED — {formatGhs(data.imbalanceAmount)} discrepancy
          </p>
          <p className="mt-1 text-xs text-red-600">
            Run the data integrity check immediately.
          </p>
          <Link
            href="/ledger?unbalanced=true"
            className="mt-2 inline-flex items-center rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
          >
            Run Integrity Check
          </Link>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <button
          onClick={handleCsv}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Download CSV
        </button>
        <button
          onClick={handlePdf}
          disabled={pdfLoading}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {pdfLoading ? 'Generating…' : 'Download PDF'}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="py-3 pl-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 w-20">Code</th>
                <th className="py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Account Name</th>
                <th className="py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Type</th>
                <th className="py-3 pr-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Debits (GHS)</th>
                <th className="py-3 pr-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Credits (GHS)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.lines.map(line => (
                <tr key={line.accountId} className="hover:bg-gray-50">
                  <td className="py-2 pl-4 text-sm font-mono text-gray-500">{line.accountCode}</td>
                  <td className="py-2 text-sm text-gray-700">{line.accountName}</td>
                  <td className="py-2 text-xs capitalize text-gray-400">{line.accountType}</td>
                  <td className="py-2 pr-4 text-right text-sm tabular-nums text-gray-700">
                    {line.cumulativeDebits > 0 ? line.cumulativeDebits.toFixed(2) : ''}
                  </td>
                  <td className="py-2 pr-4 text-right text-sm tabular-nums text-gray-700">
                    {line.cumulativeCredits > 0 ? line.cumulativeCredits.toFixed(2) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={`border-t-2 font-bold ${isBalanced ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
                <td className="py-3 pl-4 text-sm"></td>
                <td className="py-3 text-sm text-gray-900">TOTAL</td>
                <td></td>
                <td className={`py-3 pr-4 text-right text-sm tabular-nums ${isBalanced ? 'text-green-700' : 'text-red-600'}`}>
                  {data.totalDebits.toFixed(2)}
                </td>
                <td className={`py-3 pr-4 text-right text-sm tabular-nums ${isBalanced ? 'text-green-700' : 'text-red-600'}`}>
                  {data.totalCredits.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
