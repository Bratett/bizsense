'use client'

import { useState } from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { formatGhs } from '@/lib/format'
import { downloadCsv, generateReportPdf } from '@/lib/reports/export'
import type { VatReport, VatReportLine } from '@/lib/reports/vat'

// ─── PDF document ─────────────────────────────────────────────────────────────

const pdfStyles = StyleSheet.create({
  page:        { padding: 32, fontFamily: 'Helvetica', fontSize: 10 },
  title:       { fontSize: 16, marginBottom: 4 },
  subtitle:    { fontSize: 9, color: '#6B7280', marginBottom: 4 },
  vatReg:      { fontSize: 9, color: '#6B7280', marginBottom: 16 },
  sectionHead: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 12, marginBottom: 3, color: '#111827' },
  row:         { flexDirection: 'row', paddingVertical: 2 },
  bold:        { fontFamily: 'Helvetica-Bold' },
  separator:   { borderBottom: '1pt solid #E5E7EB', marginVertical: 4 },
  total:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, marginTop: 2 },
  col1:        { width: '15%' },
  col2:        { width: '20%' },
  col3:        { flex: 1 },
  colAmt:      { width: '18%', textAlign: 'right' },
  netPos:      { marginTop: 16, borderTop: '2pt solid #111827', paddingTop: 8 },
  netRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  note:        { fontSize: 8, color: '#92400E', marginTop: 12, borderLeft: '2pt solid #F59E0B', paddingLeft: 8 },
})

function VatDocument({ data }: { data: VatReport }) {
  const isRefund = data.netVatPayable < 0

  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <Text style={pdfStyles.title}>VAT Report</Text>
        <Text style={pdfStyles.subtitle}>
          Period: {data.period.from} to {data.period.to}
        </Text>
        {data.vatRegistrationNumber && (
          <Text style={pdfStyles.vatReg}>VAT Reg: {data.vatRegistrationNumber}</Text>
        )}

        {/* Output VAT */}
        <Text style={pdfStyles.sectionHead}>OUTPUT VAT — Tax Collected from Customers</Text>
        <View style={[pdfStyles.row, { borderBottom: '1pt solid #E5E7EB', paddingBottom: 3 }]}>
          <Text style={[pdfStyles.col1, pdfStyles.bold]}>Date</Text>
          <Text style={[pdfStyles.col2, pdfStyles.bold]}>Reference</Text>
          <Text style={[pdfStyles.col3, pdfStyles.bold]}>Description</Text>
          <Text style={[pdfStyles.colAmt, pdfStyles.bold]}>Net Supply</Text>
          <Text style={[pdfStyles.colAmt, pdfStyles.bold]}>VAT</Text>
        </View>
        {data.outputVat.lines.map((l, i) => (
          <View key={i} style={pdfStyles.row}>
            <Text style={pdfStyles.col1}>{l.entryDate}</Text>
            <Text style={pdfStyles.col2}>{l.reference}</Text>
            <Text style={pdfStyles.col3}>{l.description}</Text>
            <Text style={pdfStyles.colAmt}>{formatGhs(l.netSupplyAmount)}</Text>
            <Text style={pdfStyles.colAmt}>{formatGhs(l.vatAmount)}</Text>
          </View>
        ))}
        <View style={pdfStyles.separator} />
        <View style={pdfStyles.total}>
          <Text style={pdfStyles.bold}>Total Taxable Supplies</Text>
          <Text style={pdfStyles.bold}>{formatGhs(data.outputVat.totalNetSupply)}</Text>
        </View>
        <View style={pdfStyles.total}>
          <Text style={pdfStyles.bold}>Total Output VAT</Text>
          <Text style={pdfStyles.bold}>{formatGhs(data.outputVat.totalVat)}</Text>
        </View>

        {/* Input VAT */}
        <Text style={pdfStyles.sectionHead}>INPUT VAT — Tax Paid on Purchases</Text>
        <View style={[pdfStyles.row, { borderBottom: '1pt solid #E5E7EB', paddingBottom: 3 }]}>
          <Text style={[pdfStyles.col1, pdfStyles.bold]}>Date</Text>
          <Text style={[pdfStyles.col2, pdfStyles.bold]}>Reference</Text>
          <Text style={[pdfStyles.col3, pdfStyles.bold]}>Description</Text>
          <Text style={[pdfStyles.colAmt, pdfStyles.bold]}>Net Purchase</Text>
          <Text style={[pdfStyles.colAmt, pdfStyles.bold]}>VAT</Text>
        </View>
        {data.inputVat.lines.map((l, i) => (
          <View key={i} style={pdfStyles.row}>
            <Text style={pdfStyles.col1}>{l.entryDate}</Text>
            <Text style={pdfStyles.col2}>{l.reference}</Text>
            <Text style={pdfStyles.col3}>{l.description}</Text>
            <Text style={pdfStyles.colAmt}>{formatGhs(l.netSupplyAmount)}</Text>
            <Text style={pdfStyles.colAmt}>{formatGhs(l.vatAmount)}</Text>
          </View>
        ))}
        <View style={pdfStyles.separator} />
        <View style={pdfStyles.total}>
          <Text style={pdfStyles.bold}>Total Input VAT</Text>
          <Text style={pdfStyles.bold}>{formatGhs(data.inputVat.totalVat)}</Text>
        </View>
        <Text style={pdfStyles.note}>{data.inputVat.graPurchasesNote}</Text>

        {/* Net VAT Position */}
        <View style={pdfStyles.netPos}>
          <Text style={pdfStyles.sectionHead}>NET VAT POSITION</Text>
          <View style={pdfStyles.netRow}>
            <Text>Output VAT (payable to GRA)</Text>
            <Text>{formatGhs(data.outputVat.totalVat)}</Text>
          </View>
          <View style={pdfStyles.netRow}>
            <Text>Less: Input VAT Recoverable</Text>
            <Text>({formatGhs(data.inputVat.totalVat)})</Text>
          </View>
          <View style={[pdfStyles.separator]} />
          <View style={pdfStyles.netRow}>
            <Text style={pdfStyles.bold}>
              {isRefund ? 'VAT Refund Due from GRA' : 'Net VAT Payable to GRA'}
            </Text>
            <Text style={pdfStyles.bold}>
              {formatGhs(Math.abs(data.netVatPayable))}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}

// ─── Line row ─────────────────────────────────────────────────────────────────

function LineRow({ line, netLabel }: { line: VatReportLine; netLabel: string }) {
  return (
    <tr>
      <td className="py-2 pl-4 text-sm tabular-nums text-gray-500">{line.entryDate}</td>
      <td className="py-2 text-sm text-gray-500">{line.reference || '—'}</td>
      <td className="py-2 text-sm text-gray-700">{line.description || '—'}</td>
      <td className="py-2 pr-4 text-right text-sm tabular-nums text-gray-900">
        {formatGhs(line.netSupplyAmount)}
      </td>
      <td className="py-2 pr-4 text-right text-sm tabular-nums font-medium text-gray-900">
        {formatGhs(line.vatAmount)}
      </td>
    </tr>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function VatReportClient({
  data,
  period,
}: {
  data:   VatReport
  period: { type: 'range'; from: string; to: string }
}) {
  const [pdfLoading, setPdfLoading] = useState(false)
  const isRefund = data.netVatPayable < 0

  // ── CSV export ─────────────────────────────────────────────────────────────
  const handleCsv = () => {
    const rows: Record<string, string | number>[] = []

    for (const l of data.outputVat.lines) {
      rows.push({
        Date:               l.entryDate,
        Reference:          l.reference,
        Description:        l.description,
        Type:               'Output VAT',
        'Net Amount (GHS)': l.netSupplyAmount.toFixed(2),
        'VAT Amount (GHS)': l.vatAmount.toFixed(2),
      })
    }
    rows.push({
      Date:               '',
      Reference:          '',
      Description:        'Total Output VAT',
      Type:               '',
      'Net Amount (GHS)': data.outputVat.totalNetSupply.toFixed(2),
      'VAT Amount (GHS)': data.outputVat.totalVat.toFixed(2),
    })

    for (const l of data.inputVat.lines) {
      rows.push({
        Date:               l.entryDate,
        Reference:          l.reference,
        Description:        l.description,
        Type:               'Input VAT',
        'Net Amount (GHS)': l.netSupplyAmount.toFixed(2),
        'VAT Amount (GHS)': l.vatAmount.toFixed(2),
      })
    }
    rows.push({
      Date:               '',
      Reference:          '',
      Description:        'Total Input VAT',
      Type:               '',
      'Net Amount (GHS)': data.inputVat.totalNetPurchase.toFixed(2),
      'VAT Amount (GHS)': data.inputVat.totalVat.toFixed(2),
    })
    rows.push({
      Date:               '',
      Reference:          '',
      Description:        isRefund ? 'VAT Refund Due from GRA' : 'Net VAT Payable to GRA',
      Type:               '',
      'Net Amount (GHS)': '',
      'VAT Amount (GHS)': Math.abs(data.netVatPayable).toFixed(2),
    })

    downloadCsv(`vat-report-${period.from}-to-${period.to}.csv`, rows)
  }

  // ── PDF export ─────────────────────────────────────────────────────────────
  const handlePdf = async () => {
    setPdfLoading(true)
    try {
      const blob = await generateReportPdf(VatDocument, data)
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `vat-report-${period.from}-to-${period.to}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Export buttons */}
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

      {/* ── Section 1: Output VAT ────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
            Output VAT — Tax Collected from Customers
          </h2>
        </div>

        {data.outputVat.lines.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-400">
            No VAT-bearing sales in this period.
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="py-2 pl-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 w-28">Date</th>
                <th className="py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 w-28">Invoice Ref</th>
                <th className="py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Description</th>
                <th className="py-2 pr-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 w-32">Net Supply (GHS)</th>
                <th className="py-2 pr-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 w-28">VAT (GHS)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.outputVat.lines.map((l, i) => (
                <LineRow key={i} line={l} netLabel="Net Supply" />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50">
                <td colSpan={3} className="py-2.5 pl-4 text-sm font-semibold text-gray-700">
                  Total Taxable Supplies
                </td>
                <td className="py-2.5 pr-4 text-right text-sm font-semibold tabular-nums text-gray-900">
                  {formatGhs(data.outputVat.totalNetSupply)}
                </td>
                <td className="py-2.5 pr-4 text-right text-sm font-semibold tabular-nums text-gray-900">
                  {formatGhs(data.outputVat.totalVat)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* ── Section 2: Input VAT ─────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
            Input VAT — Tax Paid on Purchases
          </h2>
        </div>

        {data.inputVat.lines.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-400">
            No VAT-bearing expenses in this period.
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="py-2 pl-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 w-28">Date</th>
                <th className="py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 w-28">Reference</th>
                <th className="py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Description</th>
                <th className="py-2 pr-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 w-32">Net Purchase (GHS)</th>
                <th className="py-2 pr-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 w-28">VAT (GHS)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.inputVat.lines.map((l, i) => (
                <LineRow key={i} line={l} netLabel="Net Purchase" />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50">
                <td colSpan={3} className="py-2.5 pl-4 text-sm font-semibold text-gray-700">
                  Total Purchases (Incl. VAT)
                </td>
                <td className="py-2.5 pr-4 text-right text-sm font-semibold tabular-nums text-gray-900">
                  {formatGhs(data.inputVat.totalNetPurchase + data.inputVat.totalVat)}
                </td>
                <td className="py-2.5 pr-4 text-right text-sm font-semibold tabular-nums text-gray-900">
                  {formatGhs(data.inputVat.totalVat)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}

        {/* Amber banner — always shown */}
        <div className="border-t border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠ Input VAT from supplier purchases is not yet included in this report. Only VAT from
          recorded expenses is shown. Speak to your accountant for a complete VAT return.
        </div>
      </div>

      {/* ── Section 3: Net VAT Position ──────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
            Net VAT Position
          </h2>
        </div>

        <div className="divide-y divide-gray-100 px-4">
          <div className="flex items-center justify-between py-3">
            <span className="text-sm text-gray-600">Output VAT (payable to GRA)</span>
            <span className="text-sm tabular-nums text-gray-900">
              {formatGhs(data.outputVat.totalVat)}
            </span>
          </div>
          <div className="flex items-center justify-between py-3">
            <span className="text-sm text-gray-600">Less: Input VAT Recoverable</span>
            <span className="text-sm tabular-nums text-gray-500">
              ({formatGhs(data.inputVat.totalVat)})
            </span>
          </div>
          <div className="flex items-center justify-between py-3.5">
            <span className={`text-sm font-bold ${isRefund ? 'text-green-700' : 'text-gray-900'}`}>
              {isRefund ? 'VAT Refund Due from GRA' : 'Net VAT Payable to GRA'}
            </span>
            <span
              className={`text-base font-bold tabular-nums ${
                isRefund ? 'text-green-700' : 'text-gray-900'
              }`}
            >
              {formatGhs(Math.abs(data.netVatPayable))}
            </span>
          </div>
        </div>

        {/* GRA Filing Guidance */}
        <div className="border-t border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This report is prepared for your reference. To file your VAT return, log in to{' '}
          <span className="font-medium">GRA e-Services (ets.gra.gov.gh)</span> and enter these
          figures in your quarterly VAT return. Your accountant can assist with submission.
        </div>
      </div>
    </div>
  )
}
