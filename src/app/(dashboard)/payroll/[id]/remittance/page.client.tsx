'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import type { SsnitRemittanceReport } from '@/lib/reports/ssnitRemittance'
import type { PayeRemittanceReport } from '@/lib/reports/payeRemittance'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtGHS(n: number): string {
  return `GHS ${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPeriod(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00Z')
  const e = new Date(end + 'T00:00:00Z')
  const sLabel = s.toLocaleDateString('en-GH', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const eLabel = e.toLocaleDateString('en-GH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return `${sLabel} – ${eLabel}`
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function formatMonth(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GH', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function isPastDue(iso: string): boolean {
  return new Date(iso + 'T00:00:00Z') < new Date()
}

function downloadCsv(filename: string, rows: string[][]): void {
  const content = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  ssnitReport: SsnitRemittanceReport
  payeReport: PayeRemittanceReport
  businessName: string
  businessSsnitNumber: string | null
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RemittancePage({
  ssnitReport,
  payeReport,
  businessName,
  businessSsnitNumber,
}: Props) {
  const [activeTab, setActiveTab] = useState<'ssnit' | 'paye'>('ssnit')

  const periodLabel = formatPeriod(ssnitReport.period.start, ssnitReport.period.end)

  // ── SSNIT CSV download ───────────────────────────────────────────────────
  function handleSsnitCsv() {
    const header = [
      'Staff Name',
      'SSNIT No',
      'Gross Salary',
      'Employee (5.5%)',
      'Employer (13%)',
      'Total SSNIT',
    ]
    const rows = ssnitReport.lines.map((l) => [
      l.staffName,
      l.ssnitNumber ?? '',
      l.grossSalary.toFixed(2),
      l.ssnitEmployee.toFixed(2),
      l.ssnitEmployer.toFixed(2),
      l.totalSsnit.toFixed(2),
    ])
    rows.push([
      'TOTAL',
      '',
      ssnitReport.totalGross.toFixed(2),
      ssnitReport.totalEmployee.toFixed(2),
      ssnitReport.totalEmployer.toFixed(2),
      ssnitReport.totalRemittable.toFixed(2),
    ])
    downloadCsv(`ssnit-remittance-${ssnitReport.period.end}.csv`, [header, ...rows])
  }

  // ── PAYE CSV download ────────────────────────────────────────────────────
  function handlePayeCsv() {
    const header = ['Staff Name', 'TIN', 'Gross Salary', 'PAYE Withheld']
    const rows = payeReport.lines.map((l) => [
      l.staffName,
      l.tin ?? '',
      l.grossSalary.toFixed(2),
      l.payeTax.toFixed(2),
    ])
    rows.push(['TOTAL', '', payeReport.totalGross.toFixed(2), payeReport.totalPaye.toFixed(2)])
    downloadCsv(`paye-remittance-${payeReport.period.end}.csv`, [header, ...rows])
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl p-4 md:p-8">
        <PageHeader title="Remittance Summary" subtitle={periodLabel} />

        <Tabs defaultValue="ssnit" onValueChange={(v) => setActiveTab(v as 'ssnit' | 'paye')}>
          <TabsList className="mb-6">
            <TabsTrigger value="ssnit">SSNIT Remittance</TabsTrigger>
            <TabsTrigger value="paye">PAYE Remittance</TabsTrigger>
          </TabsList>

          {/* ── SSNIT Tab ────────────────────────────────────────────────── */}
          <TabsContent value="ssnit">
            <div className="space-y-6">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">SSNIT Remittance — {periodLabel}</h2>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Due:</span>
                    <span
                      className={`text-sm font-medium ${
                        isPastDue(ssnitReport.dueDate) ? 'text-amber-600' : 'text-green-600'
                      }`}
                    >
                      {formatDate(ssnitReport.dueDate)}
                      {isPastDue(ssnitReport.dueDate) && ' (overdue)'}
                    </span>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={handleSsnitCsv}>
                  <Download className="mr-2 h-4 w-4" />
                  Download CSV
                </Button>
              </div>

              {/* Table */}
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/50">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Staff Name</th>
                        <th className="px-4 py-3 text-left font-medium">SSNIT No</th>
                        <th className="px-4 py-3 text-right font-medium">Gross Salary</th>
                        <th className="px-4 py-3 text-right font-medium">Employee (5.5%)</th>
                        <th className="px-4 py-3 text-right font-medium">Employer (13%)</th>
                        <th className="px-4 py-3 text-right font-medium">Total SSNIT</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {ssnitReport.lines.map((line) => (
                        <tr key={line.staffId} className="hover:bg-muted/30">
                          <td className="px-4 py-3 font-medium">{line.staffName}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {line.ssnitNumber ?? (
                              <span className="italic text-muted-foreground/60">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">{fmtGHS(line.grossSalary)}</td>
                          <td className="px-4 py-3 text-right">{fmtGHS(line.ssnitEmployee)}</td>
                          <td className="px-4 py-3 text-right">{fmtGHS(line.ssnitEmployer)}</td>
                          <td className="px-4 py-3 text-right font-medium">
                            {fmtGHS(line.totalSsnit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t bg-muted/50">
                      <tr>
                        <td colSpan={2} className="px-4 py-3 font-semibold">
                          TOTAL SSNIT TO REMIT
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {fmtGHS(ssnitReport.totalGross)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {fmtGHS(ssnitReport.totalEmployee)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {fmtGHS(ssnitReport.totalEmployer)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-primary">
                          {fmtGHS(ssnitReport.totalRemittable)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>

              {/* Guidance box */}
              <Card className="border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                  How to pay SSNIT
                </p>
                <p className="mt-1 text-sm text-blue-800 dark:text-blue-300">
                  Pay <strong>{fmtGHS(ssnitReport.totalRemittable)}</strong> to SSNIT by{' '}
                  <strong>{formatDate(ssnitReport.dueDate)}</strong>.
                </p>
                <p className="mt-1 text-sm text-blue-800 dark:text-blue-300">
                  Reference: <strong>{businessName}</strong>
                  {businessSsnitNumber && (
                    <>
                      {' '}
                      — SSNIT Employer No: <strong>{businessSsnitNumber}</strong>
                    </>
                  )}
                </p>
                <p className="mt-1 text-sm text-blue-800 dark:text-blue-300">
                  SSNIT accepts payment via bank transfer or at SSNIT district offices.
                </p>
              </Card>
            </div>
          </TabsContent>

          {/* ── PAYE Tab ─────────────────────────────────────────────────── */}
          <TabsContent value="paye">
            <div className="space-y-6">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">PAYE Remittance — {periodLabel}</h2>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Due:</span>
                    <span
                      className={`text-sm font-medium ${
                        isPastDue(payeReport.dueDate) ? 'text-amber-600' : 'text-green-600'
                      }`}
                    >
                      {formatDate(payeReport.dueDate)}
                      {isPastDue(payeReport.dueDate) && ' (overdue)'}
                    </span>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={handlePayeCsv}>
                  <Download className="mr-2 h-4 w-4" />
                  Download CSV
                </Button>
              </div>

              {/* Table */}
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/50">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Staff Name</th>
                        <th className="px-4 py-3 text-left font-medium">TIN</th>
                        <th className="px-4 py-3 text-right font-medium">Gross Salary</th>
                        <th className="px-4 py-3 text-right font-medium">PAYE Withheld</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {payeReport.lines.map((line) => (
                        <tr key={line.staffId} className="hover:bg-muted/30">
                          <td className="px-4 py-3 font-medium">{line.staffName}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {line.tin ?? <span className="italic text-muted-foreground/60">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right">{fmtGHS(line.grossSalary)}</td>
                          <td className="px-4 py-3 text-right font-medium">
                            {fmtGHS(line.payeTax)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t bg-muted/50">
                      <tr>
                        <td colSpan={2} className="px-4 py-3 font-semibold">
                          TOTAL PAYE TO REMIT
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {fmtGHS(payeReport.totalGross)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-primary">
                          {fmtGHS(payeReport.totalPaye)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>

              {/* Guidance box */}
              <Card className="border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                  How to pay PAYE to GRA
                </p>
                <p className="mt-1 text-sm text-blue-800 dark:text-blue-300">
                  File and pay <strong>{fmtGHS(payeReport.totalPaye)}</strong> to GRA by the last
                  working day of <strong>{formatMonth(payeReport.period.end)}</strong>.
                </p>
                <p className="mt-1 text-sm text-blue-800 dark:text-blue-300">
                  File using the GRA Taxpayers Portal (taxpayers.gra.gov.gh) and pay via bank
                  transfer or at any GRA office.
                </p>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  )
}
