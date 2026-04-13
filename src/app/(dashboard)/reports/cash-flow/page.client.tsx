'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { formatGhs } from '@/lib/format'
import { downloadCsv, generateReportPdf } from '@/lib/reports/export'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import type { CashFlowStatement, CashFlowSection } from '@/lib/reports/cashFlow'

// ─── PDF document ─────────────────────────────────────────────────────────────

const pdfStyles = StyleSheet.create({
  page: { padding: 32, fontFamily: 'Helvetica', fontSize: 10 },
  title: { fontSize: 16, marginBottom: 4 },
  subtitle: { fontSize: 9, color: '#6B7280', marginBottom: 16 },
  sectionHead: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 12, marginBottom: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  bold: { fontFamily: 'Helvetica-Bold' },
  separator: { borderBottom: '1pt solid #E5E7EB', marginVertical: 4 },
  total: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    marginTop: 2,
  },
  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    marginTop: 6,
    borderTop: '2pt solid #111827',
  },
  note: { fontSize: 8, color: '#6B7280', marginTop: 4 },
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
        <View style={pdfStyles.row}>
          <Text style={{ color: '#9CA3AF' }}>No activity</Text>
          <Text>{formatGhs(0)}</Text>
        </View>
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
        <Text style={pdfStyles.subtitle}>
          {data.period.from} to {data.period.to}
        </Text>

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
            : ` — Discrepancy of ${formatGhs(Math.abs(data.closingCashBalance - data.closingCashCrossCheck))}`}
        </Text>
      </Page>
    </Document>
  )
}

// ─── Section component ────────────────────────────────────────────────────────

function CashSection({ section }: { section: CashFlowSection }) {
  return (
    <>
      <TableRow className="bg-muted/50">
        <TableCell
          colSpan={2}
          className="py-2 pl-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {section.label}
        </TableCell>
      </TableRow>
      {section.lines.length === 0 && (
        <TableRow>
          <TableCell className="py-2 pl-6 text-sm text-muted-foreground/60 italic" colSpan={2}>
            No activity in this period
          </TableCell>
        </TableRow>
      )}
      {section.lines.map((line, i) => (
        <TableRow key={i}>
          <TableCell className="py-1.5 pl-6 text-sm text-foreground/80">
            {line.description}
          </TableCell>
          <TableCell
            className={`py-1.5 pr-4 text-right text-sm font-medium tabular-nums ${
              line.amount >= 0 ? 'text-green-700' : 'text-red-600'
            }`}
          >
            {formatGhs(line.amount)}
          </TableCell>
        </TableRow>
      ))}
      <TableRow className="border-t font-semibold">
        <TableCell className="py-2 pl-4 text-sm text-foreground/80">Net {section.label}</TableCell>
        <TableCell
          className={`py-2 pr-4 text-right text-sm tabular-nums ${
            section.netAmount >= 0 ? 'text-foreground' : 'text-red-600'
          }`}
        >
          {formatGhs(section.netAmount)}
        </TableCell>
      </TableRow>
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
      rows.push({
        Section: `Net ${section.label}`,
        Description: '',
        'Amount (GHS)': section.netAmount.toFixed(2),
      })
    }

    addSection(data.operating)
    addSection(data.investing)
    addSection(data.financing)

    rows.push({
      Section: 'Net Change in Cash',
      Description: '',
      'Amount (GHS)': data.netChange.toFixed(2),
    })
    rows.push({
      Section: 'Opening Cash Balance',
      Description: '',
      'Amount (GHS)': data.openingCashBalance.toFixed(2),
    })
    rows.push({
      Section: 'Closing Cash Balance',
      Description: '',
      'Amount (GHS)': data.closingCashBalance.toFixed(2),
    })
    rows.push({
      Section: 'Balance Sheet Cash (cross-check)',
      Description: '',
      'Amount (GHS)': data.closingCashCrossCheck.toFixed(2),
    })

    downloadCsv(`cash-flow-${data.period.from}-to-${data.period.to}.csv`, rows)
  }

  // ── PDF export ────────────────────────────────────────────────────────────
  const handlePdf = async () => {
    setPdfLoading(true)
    try {
      const blob = await generateReportPdf(CFDocument, data)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
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
          {formatGhs(data.unclassifiedAmount)} of cash movements could not be classified because one
          or more accounts do not have a cash flow category assigned.{' '}
          <Link
            href="/settings/chart-of-accounts"
            className="font-medium underline hover:text-amber-900"
          >
            Assign categories →
          </Link>
        </div>
      )}

      {/* Export controls */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={handleCsv}>
          Download CSV
        </Button>
        <Button variant="outline" onClick={handlePdf} disabled={pdfLoading}>
          {pdfLoading ? 'Generating…' : 'Download PDF'}
        </Button>
      </div>

      {/* Report table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableBody>
              <CashSection section={data.operating} />
              <CashSection section={data.investing} />
              <CashSection section={data.financing} />

              {/* Net change */}
              <TableRow className="border-t-2 border-gray-300 bg-muted/50">
                <TableCell className="py-3 pl-4 text-sm font-bold text-foreground">
                  Net Change in Cash
                </TableCell>
                <TableCell
                  className={`py-3 pr-4 text-right text-sm font-bold tabular-nums ${
                    data.netChange >= 0 ? 'text-green-700' : 'text-red-600'
                  }`}
                >
                  {formatGhs(data.netChange)}
                </TableCell>
              </TableRow>

              {/* Opening balance */}
              <TableRow>
                <TableCell className="py-2 pl-4 text-sm text-foreground/80">
                  Opening Cash Balance
                </TableCell>
                <TableCell className="py-2 pr-4 text-right text-sm tabular-nums text-foreground">
                  {formatGhs(data.openingCashBalance)}
                </TableCell>
              </TableRow>

              {/* Closing balance (arithmetic) */}
              <TableRow className="font-semibold">
                <TableCell className="py-2.5 pl-4 text-sm text-foreground">
                  Closing Cash Balance
                </TableCell>
                <TableCell className="py-2.5 pr-4 text-right text-sm tabular-nums text-foreground">
                  {formatGhs(data.closingCashBalance)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Reconciliation check */}
      <div
        className={`rounded-lg border px-4 py-3 text-sm ${
          data.isReconciled
            ? 'border-green-200 bg-green-50 text-green-800'
            : 'border-amber-200 bg-amber-50 text-amber-800'
        }`}
      >
        <div className="mb-1 text-xs text-gray-500">
          Balance Sheet cash total (as at {data.period.to}): {formatGhs(data.closingCashCrossCheck)}
        </div>
        {data.isReconciled ? (
          <span>✓ Reconciled with Balance Sheet</span>
        ) : (
          <span>
            ⚠ {formatGhs(difference)} discrepancy — check for unclassified accounts.{' '}
            <Link
              href={`/reports/balance-sheet?date=${data.period.to}`}
              className="font-medium underline"
            >
              View Balance Sheet
            </Link>
          </span>
        )}
      </div>
    </div>
  )
}
