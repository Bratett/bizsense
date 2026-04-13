'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { formatGhs } from '@/lib/format'
import { downloadCsv, generateReportPdf } from '@/lib/reports/export'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { ExpenseReport, ExpenseReportLine } from '@/lib/reports/expenses'

// ─── PDF document ─────────────────────────────────────────────────────────────

const pdfStyles = StyleSheet.create({
  page: { padding: 32, fontFamily: 'Helvetica', fontSize: 9 },
  title: { fontSize: 16, marginBottom: 4 },
  subtitle: { fontSize: 9, color: '#6B7280', marginBottom: 16 },
  header: {
    flexDirection: 'row',
    borderBottom: '1pt solid #E5E7EB',
    paddingBottom: 4,
    marginBottom: 4,
  },
  row: { flexDirection: 'row', paddingVertical: 2, borderBottom: '0.5pt solid #F3F4F6' },
  col1: { width: '35%' },
  col2: { width: '12%' },
  col3: { width: '8%', textAlign: 'right' },
  col4: { width: '15%', textAlign: 'right' },
  col5: { width: '15%', textAlign: 'right' },
  col6: { width: '15%', textAlign: 'right' },
  bold: { fontFamily: 'Helvetica-Bold' },
})

function ExpenseDocument({ data }: { data: ExpenseReport }) {
  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <Text style={pdfStyles.title}>Expense Report</Text>
        <Text style={pdfStyles.subtitle}>
          {data.period.from} to {data.period.to}
        </Text>
        <View style={pdfStyles.header}>
          <Text style={[pdfStyles.col1, pdfStyles.bold]}>Category</Text>
          <Text style={[pdfStyles.col2, pdfStyles.bold]}>Code</Text>
          <Text style={[pdfStyles.col3, pdfStyles.bold]}>Count</Text>
          <Text style={[pdfStyles.col4, pdfStyles.bold]}>This Period</Text>
          {data.hasPrior && <Text style={[pdfStyles.col5, pdfStyles.bold]}>Prior Period</Text>}
          {data.hasPrior && <Text style={[pdfStyles.col6, pdfStyles.bold]}>Change %</Text>}
        </View>
        {data.lines.map((l) => (
          <View key={l.accountId} style={pdfStyles.row}>
            <Text style={pdfStyles.col1}>{l.category}</Text>
            <Text style={pdfStyles.col2}>{l.accountCode}</Text>
            <Text style={pdfStyles.col3}>{l.transactionCount}</Text>
            <Text style={pdfStyles.col4}>{l.totalAmount.toFixed(2)}</Text>
            {data.hasPrior && <Text style={pdfStyles.col5}>{(l.priorAmount ?? 0).toFixed(2)}</Text>}
            {data.hasPrior && (
              <Text style={pdfStyles.col6}>
                {l.changePercent == null
                  ? '—'
                  : `${l.changePercent >= 0 ? '+' : ''}${l.changePercent.toFixed(1)}%`}
              </Text>
            )}
          </View>
        ))}
        <View style={[pdfStyles.row, { borderTop: '1pt solid #111827', marginTop: 4 }]}>
          <Text style={[pdfStyles.col1, pdfStyles.bold]}>TOTAL</Text>
          <Text style={pdfStyles.col2}></Text>
          <Text style={pdfStyles.col3}></Text>
          <Text style={[pdfStyles.col4, pdfStyles.bold]}>{data.grandTotal.toFixed(2)}</Text>
          {data.hasPrior && (
            <Text style={[pdfStyles.col5, pdfStyles.bold]}>
              {(data.priorTotal ?? 0).toFixed(2)}
            </Text>
          )}
          {data.hasPrior && <Text style={pdfStyles.col6}></Text>}
        </View>
      </Page>
    </Document>
  )
}

// ─── Change % badge ────────────────────────────────────────────────────────────

function ChangeBadge({ pct }: { pct: number | null | undefined }) {
  if (pct === null || pct === undefined) return <span className="text-gray-400">—</span>
  const up = pct > 0
  return (
    <span className={`tabular-nums ${up ? 'text-amber-600' : 'text-green-600'}`}>
      {up ? '+' : ''}
      {pct.toFixed(1)}%
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ExpenseReportTable({ data }: { data: ExpenseReport }) {
  const [pdfLoading, setPdfLoading] = useState(false)
  const hasPrior = data.hasPrior

  const handleCsv = () => {
    const rows = data.lines.map((l: ExpenseReportLine) => {
      const base: Record<string, string | number> = {
        Category: l.category,
        'Account Code': l.accountCode,
        Count: l.transactionCount,
        'This Period (GHS)': l.totalAmount.toFixed(2),
      }
      if (hasPrior) {
        base['Prior Period (GHS)'] = (l.priorAmount ?? 0).toFixed(2)
        base['Change %'] = l.changePercent === null ? '' : `${l.changePercent?.toFixed(1)}%`
      }
      return base
    })
    downloadCsv(`expenses-${data.period.from}-to-${data.period.to}.csv`, rows)
  }

  const handlePdf = async () => {
    setPdfLoading(true)
    try {
      const blob = await generateReportPdf(ExpenseDocument, data)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `expenses-${data.period.from}-to-${data.period.to}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={handleCsv}>
          Download CSV
        </Button>
        <Button variant="outline" onClick={handlePdf} disabled={pdfLoading}>
          {pdfLoading ? 'Generating…' : 'Download PDF'}
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {data.lines.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground/60">
              No expenses recorded in this period.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="py-3 pl-4">Category</TableHead>
                  <TableHead className="py-3">Code</TableHead>
                  <TableHead className="py-3 pr-4 text-right">Count</TableHead>
                  <TableHead className="py-3 pr-4 text-right">
                    {hasPrior ? 'This Period' : 'Amount (GHS)'}
                  </TableHead>
                  {hasPrior && (
                    <TableHead className="py-3 pr-4 text-right text-amber-600">
                      Prior Period
                    </TableHead>
                  )}
                  {hasPrior && <TableHead className="py-3 pr-4 text-right">Change</TableHead>}
                  <TableHead className="py-3 pr-4 text-right">Receipts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.lines.map((line) => (
                  <TableRow key={line.accountId} className="hover:bg-muted/30">
                    <TableCell className="py-2.5 pl-4 text-sm font-medium text-foreground/80">
                      {line.category}
                    </TableCell>
                    <TableCell className="py-2.5 text-sm font-mono text-muted-foreground/60">
                      {line.accountCode}
                    </TableCell>
                    <TableCell className="py-2.5 pr-4 text-right text-sm tabular-nums text-muted-foreground">
                      {line.transactionCount}
                    </TableCell>
                    <TableCell className="py-2.5 pr-4 text-right text-sm tabular-nums text-foreground">
                      {formatGhs(line.totalAmount)}
                    </TableCell>
                    {hasPrior && (
                      <TableCell className="py-2.5 pr-4 text-right text-sm tabular-nums text-amber-600">
                        {line.priorAmount !== undefined ? formatGhs(line.priorAmount) : '—'}
                      </TableCell>
                    )}
                    {hasPrior && (
                      <TableCell className="py-2.5 pr-4 text-right text-sm">
                        <ChangeBadge pct={line.changePercent} />
                      </TableCell>
                    )}
                    <TableCell className="py-2.5 pr-4 text-right text-sm">
                      <Link
                        href={`/expenses?category=${encodeURIComponent(line.accountCode)}`}
                        className="text-green-700 hover:underline"
                      >
                        View
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <tfoot>
                <TableRow className="border-t-2 bg-muted/50 font-semibold">
                  <TableCell className="py-3 pl-4 text-sm text-foreground" colSpan={3}>
                    Grand Total
                  </TableCell>
                  <TableCell className="py-3 pr-4 text-right text-sm tabular-nums text-foreground">
                    {formatGhs(data.grandTotal)}
                  </TableCell>
                  {hasPrior && (
                    <TableCell className="py-3 pr-4 text-right text-sm tabular-nums text-amber-600">
                      {data.priorTotal !== undefined ? formatGhs(data.priorTotal) : '—'}
                    </TableCell>
                  )}
                  {hasPrior && <TableCell></TableCell>}
                  <TableCell></TableCell>
                </TableRow>
              </tfoot>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
