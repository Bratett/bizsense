'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { initiatePayrollRun } from '@/actions/payroll'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'

function getDefaultPeriod(): { periodStart: string; periodEnd: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() // 0-based
  const firstDay = new Date(Date.UTC(year, month, 1))
  const lastDay = new Date(Date.UTC(year, month + 1, 0))
  return {
    periodStart: firstDay.toISOString().slice(0, 10),
    periodEnd: lastDay.toISOString().slice(0, 10),
  }
}

function getMonthYear(periodStart: string): string {
  const d = new Date(periodStart + 'T00:00:00Z')
  return d.toLocaleDateString('en-GH', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function buildPeriod(yearMonth: string): { periodStart: string; periodEnd: string } {
  const [year, month] = yearMonth.split('-').map(Number)
  const firstDay = new Date(Date.UTC(year, month - 1, 1))
  const lastDay = new Date(Date.UTC(year, month, 0))
  return {
    periodStart: firstDay.toISOString().slice(0, 10),
    periodEnd: lastDay.toISOString().slice(0, 10),
  }
}

export default function NewPayrollRun() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const defaults = getDefaultPeriod()
  const defaultYearMonth = defaults.periodStart.slice(0, 7) // YYYY-MM
  const [yearMonth, setYearMonth] = useState(defaultYearMonth)

  const period = buildPeriod(yearMonth)

  const handleStart = () => {
    setError(null)
    startTransition(async () => {
      try {
        const { runId } = await initiatePayrollRun(period)
        router.push(`/payroll/${runId}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.')
      }
    })
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-xl">
        <PageHeader title="Start Payroll Run" backHref="/payroll" />

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="mt-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Payroll Period
          </h2>
          <p className="mb-4 text-sm text-gray-600">
            Select the month to generate payroll for. BizSense will compute PAYE and SSNIT for all
            active staff members using the current GRA schedule.
          </p>
          <div>
            <label htmlFor="period-month" className="mb-1 block text-sm font-medium text-gray-700">
              Month
            </label>
            <input
              id="period-month"
              type="month"
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-base ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              value={yearMonth}
              onChange={(e) => setYearMonth(e.target.value)}
            />
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Period: {period.periodStart} → {period.periodEnd}
          </p>
        </div>

        <div className="mt-6 flex gap-3 pb-8">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => router.push('/payroll')}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button className="flex-1 h-13" onClick={handleStart} disabled={isPending}>
            {isPending ? 'Generating…' : `Generate Payroll — ${getMonthYear(period.periodStart)}`}
          </Button>
        </div>
      </div>
    </main>
  )
}
