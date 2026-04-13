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
import type { TrialBalanceReport, TrialBalanceLine } from '@/lib/reports/trialBalance'

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
  col1: { width: '10%' },
  col2: { width: '40%' },
  col3: { width: '20%' },
  col4: { width: '15%', textAlign: 'right' },
  col5: { width: '15%', textAlign: 'right' },
  bold: { fontFamily: 'Helvetica-Bold' },
  totals: { flexDirection: 'row', borderTop: '1pt solid #111827', paddingTop: 4, marginTop: 4 },
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

        {data.lines.map((l) => (
          <View key={l.accountId} style={pdfStyles.row}>
            <Text style={pdfStyles.col1}>{l.accountCode}</Text>
            <Text style={pdfStyles.col2}>{l.accountName}</Text>
            <Text style={pdfStyles.col3}>{l.accountType}</Text>
            <Text style={pdfStyles.col4}>
              {l.cumulativeDebits > 0 ? l.cumulativeDebits.toFixed(2) : ''}
            </Text>
            <Text style={pdfStyles.col5}>
              {l.cumulativeCredits > 0 ? l.cumulativeCredits.toFixed(2) : ''}
            </Text>
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
      Code: l.accountCode,
      'Account Name': l.accountName,
      Type: l.accountType,
      'Debits (GHS)': l.cumulativeDebits.toFixed(2),
      'Credits (GHS)': l.cumulativeCredits.toFixed(2),
    }))
    rows.push({
      Code: 'TOTAL',
      'Account Name': '',
      Type: '',
      'Debits (GHS)': data.totalDebits.toFixed(2),
      'Credits (GHS)': data.totalCredits.toFixed(2),
    })
    downloadCsv(`trial-balance-${data.asOfDate}.csv`, rows)
  }

  const handlePdf = async () => {
    setPdfLoading(true)
    try {
      const blob = await generateReportPdf(TBDocument, data)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
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
          <p className="mt-1 text-xs text-red-600">Run the data integrity check immediately.</p>
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
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="py-3 pl-4 w-20">Code</TableHead>
                <TableHead className="py-3">Account Name</TableHead>
                <TableHead className="py-3">Type</TableHead>
                <TableHead className="py-3 pr-4 text-right">Debits (GHS)</TableHead>
                <TableHead className="py-3 pr-4 text-right">Credits (GHS)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.lines.map((line) => (
                <TableRow key={line.accountId} className="hover:bg-muted/30">
                  <TableCell className="py-2 pl-4 text-sm font-mono text-muted-foreground">
                    {line.accountCode}
                  </TableCell>
                  <TableCell className="py-2 text-sm text-foreground/80">
                    {line.accountName}
                  </TableCell>
                  <TableCell className="py-2 text-xs capitalize text-muted-foreground/60">
                    {line.accountType}
                  </TableCell>
                  <TableCell className="py-2 pr-4 text-right text-sm tabular-nums text-foreground/80">
                    {line.cumulativeDebits > 0 ? line.cumulativeDebits.toFixed(2) : ''}
                  </TableCell>
                  <TableCell className="py-2 pr-4 text-right text-sm tabular-nums text-foreground/80">
                    {line.cumulativeCredits > 0 ? line.cumulativeCredits.toFixed(2) : ''}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <tfoot>
              <TableRow
                className={`border-t-2 font-bold ${isBalanced ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}
              >
                <TableCell className="py-3 pl-4 text-sm"></TableCell>
                <TableCell className="py-3 text-sm text-foreground">TOTAL</TableCell>
                <TableCell></TableCell>
                <TableCell
                  className={`py-3 pr-4 text-right text-sm tabular-nums ${isBalanced ? 'text-green-700' : 'text-red-600'}`}
                >
                  {data.totalDebits.toFixed(2)}
                </TableCell>
                <TableCell
                  className={`py-3 pr-4 text-right text-sm tabular-nums ${isBalanced ? 'text-green-700' : 'text-red-600'}`}
                >
                  {data.totalCredits.toFixed(2)}
                </TableCell>
              </TableRow>
            </tfoot>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
