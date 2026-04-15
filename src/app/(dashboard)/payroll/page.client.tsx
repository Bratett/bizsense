'use client'

import Link from 'next/link'
import { Wallet } from 'lucide-react'
import type { PayrollRunSummary } from '@/actions/payroll'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'

function formatGHS(value: string | null): string {
  if (!value) return '—'
  return `GHS ${parseFloat(value).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPeriod(periodStart: string, periodEnd: string): string {
  const start = new Date(periodStart + 'T00:00:00Z')
  return start.toLocaleDateString('en-GH', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'approved') {
    return (
      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
        Approved — payment pending
      </Badge>
    )
  }
  if (status === 'paid') {
    return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Paid</Badge>
  }
  return <Badge variant="secondary">Draft — pending approval</Badge>
}

export default function PayrollList({ initialRuns }: { initialRuns: PayrollRunSummary[] }) {
  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="Payroll"
          subtitle={`${initialRuns.length} payroll run${initialRuns.length !== 1 ? 's' : ''}`}
          actions={
            <Button render={<Link href="/payroll/new" />} size="lg">
              Start Payroll Run
            </Button>
          }
        />

        {initialRuns.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              icon={<Wallet className="h-8 w-8" />}
              title="No payroll runs yet"
              subtitle="Start your first payroll run to pay staff and record payroll liabilities."
            />
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {initialRuns.map((run) => (
              <li key={run.id}>
                <Link
                  href={`/payroll/${run.id}`}
                  className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100 transition hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900">
                      {formatPeriod(run.periodStart, run.periodEnd)}
                    </p>
                    <p className="mt-0.5 text-sm text-gray-500">
                      {run.staffCount} staff member{run.staffCount !== 1 ? 's' : ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-6">
                    <div className="text-right sm:text-left">
                      <p className="text-xs text-gray-400">Gross</p>
                      <p className="text-sm font-medium text-gray-700">
                        {formatGHS(run.totalGross)}
                      </p>
                    </div>
                    <div className="text-right sm:text-left">
                      <p className="text-xs text-gray-400">Net</p>
                      <p className="text-sm font-medium text-gray-700">{formatGHS(run.totalNet)}</p>
                    </div>
                    <StatusBadge status={run.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
