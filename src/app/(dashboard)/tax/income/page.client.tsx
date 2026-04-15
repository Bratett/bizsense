'use client'

import { AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react'
import type { IncomeTaxEstimate } from '@/lib/reports/incomeTax'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtGHS(n: number): string {
  return `GHS ${Math.abs(n).toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  estimate: IncomeTaxEstimate
  asOfDate: string
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function IncomeTaxPage({ estimate, asOfDate }: Props) {
  const isProfit = estimate.annualNetProfit > 0
  const isLoss = estimate.annualNetProfit < 0

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl p-4 md:p-8">
        <PageHeader
          title={`Income Tax Estimate — ${estimate.financialYear}`}
          subtitle={`Year to date as at ${formatDate(asOfDate)}`}
        />

        {/* ── Main estimate card ──────────────────────────────────────── */}
        <Card className="p-6">
          <div className="space-y-4">
            {/* Net profit row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isProfit ? (
                  <TrendingUp className="h-5 w-5 text-green-600" />
                ) : isLoss ? (
                  <TrendingDown className="h-5 w-5 text-red-500" />
                ) : (
                  <div className="h-5 w-5" />
                )}
                <span className="text-sm font-medium text-muted-foreground">
                  Annual Net Profit (YTD)
                </span>
              </div>
              <span
                className={`text-lg font-semibold tabular-nums ${
                  isProfit ? 'text-green-600' : isLoss ? 'text-red-500' : 'text-foreground'
                }`}
              >
                {isLoss && '('}
                {fmtGHS(estimate.annualNetProfit)}
                {isLoss && ')'}
              </span>
            </div>

            <div className="border-t" />

            {/* Rate row */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Corporate income tax rate</span>
              <span>25%</span>
            </div>

            {/* Estimated tax row */}
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
              <span className="font-semibold">Estimated Tax @ 25%</span>
              <span className="text-xl font-bold tabular-nums text-primary">
                {fmtGHS(estimate.estimatedTax)}
              </span>
            </div>

            {estimate.estimatedTax === 0 && !isLoss && (
              <p className="text-center text-sm text-muted-foreground">
                No tax estimated — break-even or no profit recorded yet.
              </p>
            )}

            {isLoss && (
              <p className="text-center text-sm text-muted-foreground">
                No tax is payable on a loss year.
              </p>
            )}
          </div>
        </Card>

        {/* ── Disclaimer card ──────────────────────────────────────────── */}
        <Card className="mt-4 border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                Estimate Only
              </p>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                {estimate.disclaimer}
              </p>
            </div>
          </div>
        </Card>

        {/* ── GRA guidance ─────────────────────────────────────────────── */}
        <Card className="mt-4 border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
          <p className="text-sm font-medium text-blue-900 dark:text-blue-200">GRA Filing Dates</p>
          <p className="mt-1 text-sm text-blue-800 dark:text-blue-300">
            Corporate income tax is payable four months after your financial year end.
          </p>
          <p className="mt-1 text-sm text-blue-800 dark:text-blue-300">
            For a January–December year, the due date is 30 April of the following year.
          </p>
          <p className="mt-1 text-sm text-blue-800 dark:text-blue-300">
            Consult your accountant for accurate assessment and filing via the GRA Taxpayers Portal.
          </p>
        </Card>
      </div>
    </main>
  )
}
